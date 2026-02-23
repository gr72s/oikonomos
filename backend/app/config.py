from __future__ import annotations

import os
from pathlib import Path


DEFAULT_DATA_DIR_NAME = ".oikonomos"


def get_data_dir() -> Path:
    override = os.environ.get("OIKONOMOS_DATA_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / DEFAULT_DATA_DIR_NAME


def get_db_path() -> Path:
    return get_data_dir() / "data.db"


def get_jwt_secret() -> str:
    return os.environ.get("OIKONOMOS_JWT_SECRET", "oikonomos-dev-secret-change-this")


def get_jwt_algorithm() -> str:
    return "HS256"


def get_access_token_ttl_minutes() -> int:
    return int(os.environ.get("OIKONOMOS_ACCESS_TOKEN_TTL_MINUTES", "15"))


def get_refresh_token_ttl_days() -> int:
    return int(os.environ.get("OIKONOMOS_REFRESH_TOKEN_TTL_DAYS", "30"))


def get_default_admin_email() -> str:
    return os.environ.get("OIKONOMOS_DEFAULT_ADMIN_EMAIL", "admin@oikonomos.local").strip().lower()


def get_default_admin_password() -> str:
    return os.environ.get("OIKONOMOS_DEFAULT_ADMIN_PASSWORD", "ChangeMe123!")


API_PREFIX = "/api"
