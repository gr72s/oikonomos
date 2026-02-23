from __future__ import annotations

import hashlib
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import (
    get_access_token_ttl_minutes,
    get_jwt_algorithm,
    get_jwt_secret,
    get_refresh_token_ttl_days,
)
from app.db import get_connection, now_utc_rfc3339, parse_rfc3339_utc, transaction
from app.models import ApiError, AuthTokensDto, CurrentUserDto, LoginInput


bearer_scheme = HTTPBearer(auto_error=False)


def _hash_refresh_token(refresh_token: str) -> str:
    return hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def _create_access_token(user_id: str, email: str) -> tuple[str, int]:
    ttl_minutes = get_access_token_ttl_minutes()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ttl_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, get_jwt_secret(), algorithm=get_jwt_algorithm())
    return token, ttl_minutes * 60


def _create_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def _store_refresh_token(conn: sqlite3.Connection, user_id: str, refresh_token: str) -> None:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=get_refresh_token_ttl_days())
    conn.execute(
        """
        INSERT INTO user_refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)
        """,
        (
            str(uuid.uuid4()),
            user_id,
            _hash_refresh_token(refresh_token),
            expires_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            now_utc_rfc3339(),
        ),
    )


def login_user(input_data: LoginInput) -> AuthTokensDto:
    email = str(input_data.email).strip().lower()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, is_active FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if row is None or int(row["is_active"]) != 1:
            raise ApiError("auth_invalid_credentials", "invalid email or password", status_code=401)
        if not verify_password(input_data.password, row["password_hash"]):
            raise ApiError("auth_invalid_credentials", "invalid email or password", status_code=401)

        access_token, expires_in = _create_access_token(row["id"], row["email"])
        refresh_token = _create_refresh_token()
        with transaction(conn):
            _store_refresh_token(conn, row["id"], refresh_token)

        return AuthTokensDto(
            accessToken=access_token,
            refreshToken=refresh_token,
            tokenType="Bearer",
            expiresIn=expires_in,
        )


def refresh_auth_tokens(refresh_token: str) -> AuthTokensDto:
    token_hash = _hash_refresh_token(refresh_token)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.is_active
            FROM user_refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()

        if row is None or int(row["is_active"]) != 1 or row["revoked_at"] is not None:
            raise ApiError("auth_unauthorized", "invalid refresh token", status_code=401)

        expires_at = parse_rfc3339_utc(row["expires_at"])
        if expires_at <= datetime.now(timezone.utc):
            raise ApiError("auth_token_expired", "refresh token expired", status_code=401)

        access_token, expires_in = _create_access_token(row["user_id"], row["email"])
        new_refresh_token = _create_refresh_token()
        with transaction(conn):
            conn.execute(
                "UPDATE user_refresh_tokens SET revoked_at = ? WHERE id = ?",
                (now_utc_rfc3339(), row["id"]),
            )
            _store_refresh_token(conn, row["user_id"], new_refresh_token)

        return AuthTokensDto(
            accessToken=access_token,
            refreshToken=new_refresh_token,
            tokenType="Bearer",
            expiresIn=expires_in,
        )


def logout_refresh_token(refresh_token: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE user_refresh_tokens
            SET revoked_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL
            """,
            (now_utc_rfc3339(), _hash_refresh_token(refresh_token)),
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUserDto:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError("auth_unauthorized", "missing bearer token", status_code=401)

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            get_jwt_secret(),
            algorithms=[get_jwt_algorithm()],
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError("auth_token_expired", "access token expired", status_code=401) from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError("auth_unauthorized", "invalid access token", status_code=401) from exc

    if payload.get("type") != "access":
        raise ApiError("auth_unauthorized", "invalid access token", status_code=401)

    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise ApiError("auth_unauthorized", "invalid access token", status_code=401)

    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, email, is_active FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if row is None or int(row["is_active"]) != 1:
        raise ApiError("auth_forbidden", "user not active", status_code=403)

    return CurrentUserDto(id=row["id"], email=row["email"])
