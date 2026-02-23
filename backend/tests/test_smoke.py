from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("OIKONOMOS_DATA_DIR", str(tmp_path / ".oikonomos"))
    monkeypatch.setenv("OIKONOMOS_DEFAULT_ADMIN_EMAIL", "admin@test.local")
    monkeypatch.setenv("OIKONOMOS_DEFAULT_ADMIN_PASSWORD", "Secret123!")
    with TestClient(app) as test_client:
        yield test_client


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@test.local", "password": "Secret123!"},
    )
    assert response.status_code == 200
    token = response.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_init_endpoint_requires_auth_and_returns_expected_paths(client: TestClient) -> None:
    unauthorized = client.get("/api/system/init")
    assert unauthorized.status_code == 401

    response = client.get("/api/system/init", headers=auth_headers(client))
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataDir"].endswith(".oikonomos")
    assert Path(payload["databasePath"]).name == "data.db"
