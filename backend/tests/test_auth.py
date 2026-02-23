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
    monkeypatch.setenv("OIKONOMOS_JWT_SECRET", "test-secret")
    monkeypatch.setenv("OIKONOMOS_ACCESS_TOKEN_TTL_MINUTES", "15")
    monkeypatch.setenv("OIKONOMOS_REFRESH_TOKEN_TTL_DAYS", "30")
    with TestClient(app) as test_client:
        yield test_client


def test_login_success(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@test.local", "password": "Secret123!"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["accessToken"]
    assert payload["refreshToken"]
    assert payload["tokenType"] == "Bearer"
    assert payload["expiresIn"] > 0


def test_login_invalid_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@test.local", "password": "wrong"},
    )
    assert response.status_code == 401


def test_protected_endpoint_requires_auth(client: TestClient) -> None:
    response = client.get("/api/accounts")
    assert response.status_code == 401


def test_refresh_rotates_token_and_logout_revokes(client: TestClient) -> None:
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.local", "password": "Secret123!"},
    )
    assert login.status_code == 200
    old_refresh = login.json()["refreshToken"]

    refreshed = client.post("/api/auth/refresh", json={"refreshToken": old_refresh})
    assert refreshed.status_code == 200
    new_refresh = refreshed.json()["refreshToken"]
    assert new_refresh != old_refresh

    old_again = client.post("/api/auth/refresh", json={"refreshToken": old_refresh})
    assert old_again.status_code == 401

    logout = client.post("/api/auth/logout", json={"refreshToken": new_refresh})
    assert logout.status_code == 200

    after_logout = client.post("/api/auth/refresh", json={"refreshToken": new_refresh})
    assert after_logout.status_code == 401


def test_me_returns_current_user(client: TestClient) -> None:
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.local", "password": "Secret123!"},
    )
    token = login.json()["accessToken"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    payload = me.json()
    assert payload["email"] == "admin@test.local"
    assert payload["id"]
