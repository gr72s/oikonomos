from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

import bcrypt

from app.config import get_data_dir, get_db_path, get_default_admin_email, get_default_admin_password
from app.models import ApiError


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_user_id ON user_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_expires_at ON user_refresh_tokens(expires_at);
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Asset', 'Liability')),
    purpose TEXT NOT NULL CHECK(purpose IN ('Investment', 'Productivity', 'LifeSupport', 'Spiritual')),
    balance_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(type != 'Liability' OR balance_cents <= 0)
);
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    parent_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS payees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    default_category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    from_account_id TEXT NULL REFERENCES accounts(id) ON DELETE SET NULL,
    to_account_id TEXT NULL REFERENCES accounts(id) ON DELETE SET NULL,
    payee_id TEXT NULL REFERENCES payees(id) ON DELETE SET NULL,
    category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL,
    accrual_type TEXT NOT NULL CHECK(accrual_type IN ('Flow', 'Depreciation', 'Adjustment')),
    is_asset_purchase INTEGER NOT NULL DEFAULT 0,
    note TEXT NULL,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);
CREATE TABLE IF NOT EXISTS amortization_schedules (
    id TEXT PRIMARY KEY,
    asset_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    strategy TEXT NOT NULL CHECK(strategy IN ('Linear', 'Accelerated')),
    total_periods INTEGER NOT NULL CHECK(total_periods > 0),
    residual_cents INTEGER NOT NULL CHECK(residual_cents >= 0),
    start_date TEXT NOT NULL,
    source_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Completed', 'Cancelled')),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS amortization_postings (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES amortization_schedules(id) ON DELETE CASCADE,
    period_ym TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    generated_at TEXT NOT NULL,
    UNIQUE(schedule_id, period_ym)
);
CREATE TABLE IF NOT EXISTS balance_snapshots (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    actual_balance_cents INTEGER NOT NULL,
    system_balance_cents INTEGER NOT NULL,
    delta_cents INTEGER NOT NULL,
    captured_at TEXT NOT NULL,
    adjustment_tx_id TEXT NULL REFERENCES transactions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at ON transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_transactions_accrual_type_occurred_at ON transactions(accrual_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_amortization_postings_schedule_period ON amortization_postings(schedule_id, period_ym);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_account_captured ON balance_snapshots(account_id, captured_at DESC);
"""


def now_utc_rfc3339() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_rfc3339_utc(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ApiError("invalid_input", "time must be RFC3339") from exc
    if parsed.tzinfo is None:
        raise ApiError("invalid_input", "time must include timezone")
    return parsed.astimezone(timezone.utc)


def normalize_timestamp(value: Optional[str]) -> str:
    if value is None:
        return now_utc_rfc3339()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ApiError("invalid_input", "time must be RFC3339, e.g. 2026-02-22T12:00:00Z") from exc

    if parsed.tzinfo is None:
        raise ApiError("invalid_input", "time must include timezone in RFC3339")
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_period(period_ym: str) -> tuple[date, str, str]:
    parts = period_ym.split("-")
    if len(parts) != 2:
        raise ApiError("invalid_input", f"invalid periodYm: {period_ym}")

    try:
        year = int(parts[0])
        month = int(parts[1])
        start = date(year, month, 1)
    except ValueError as exc:
        raise ApiError("invalid_input", f"invalid periodYm: {period_ym}") from exc

    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)

    return (
        start,
        f"{start.isoformat()}T00:00:00Z",
        f"{next_month.isoformat()}T00:00:00Z",
    )


def parse_date_ymd(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError("invalid_input", f"{field_name} must be YYYY-MM-DD") from exc


def ensure_data_dir() -> Path:
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_connection() -> sqlite3.Connection:
    ensure_data_dir()
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_default_admin_user(conn: sqlite3.Connection) -> None:
    email = get_default_admin_email()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing is not None:
        return

    password_hash = bcrypt.hashpw(
        get_default_admin_password().encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    now = now_utc_rfc3339()
    conn.execute(
        """
        INSERT INTO users (id, email, password_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
        """,
        (str(uuid.uuid4()), email, password_hash, now, now),
    )


def initialize_database() -> None:
    ensure_data_dir()
    with get_connection() as conn:
        conn.executescript(SCHEMA_SQL)
        ensure_default_admin_user(conn)


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[None]:
    conn.execute("BEGIN")
    try:
        yield
        conn.commit()
    except Exception:
        conn.rollback()
        raise
