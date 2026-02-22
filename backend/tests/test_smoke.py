from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("OIKONOMOS_DATA_DIR", str(tmp_path / ".oikonomos"))
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_init_endpoint_returns_expected_paths(client: TestClient) -> None:
    response = client.get("/api/system/init")
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataDir"].endswith(".oikonomos")
    assert Path(payload["databasePath"]).name == "data.db"
