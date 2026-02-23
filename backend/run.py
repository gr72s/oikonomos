from __future__ import annotations

import os

import uvicorn


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    host = os.environ.get("OIKONOMOS_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("OIKONOMOS_BACKEND_PORT", "8000"))
    reload_enabled = _env_bool("OIKONOMOS_BACKEND_RELOAD", True)

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload_enabled,
    )
