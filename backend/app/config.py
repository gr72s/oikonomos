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

API_PREFIX = "/api"
