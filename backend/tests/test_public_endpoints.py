"""Backend endpoint verification via PUBLIC URL (Oyun Loncası)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://oyun-loncasi.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def auth(api, token):
    api.headers.update({"Authorization": f"Bearer {token}"})
    return api


# Root
def test_root(api):
    r = api.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("message") == "Oyun Loncası API"
    assert j.get("status") == "ok"


# Auth
def test_login_returns_admin(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d.get("token"), str) and len(d["token"]) > 20
    assert d["user"]["username"] == "admin"
    assert d["user"]["role"] == "admin"


def test_login_bad_creds(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "admin", "password": "wrong-bad"}, timeout=15)
    assert r.status_code in (400, 401, 403)


def test_auth_me(auth):
    r = auth.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    u = r.json()
    assert u["username"] == "admin" and u["role"] == "admin"


# Domain endpoints
@pytest.mark.parametrize("path", [
    "/api/stats",
    "/api/members",
    "/api/leaderboard",
    "/api/commanders",
    "/api/alliances",
])
def test_endpoint_ok(auth, path):
    r = auth.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


def test_members_is_list(auth):
    r = auth.get(f"{BASE_URL}/api/members", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_leaderboard_is_list(auth):
    r = auth.get(f"{BASE_URL}/api/leaderboard", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_commanders_is_list(auth):
    r = auth.get(f"{BASE_URL}/api/commanders", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_alliances_is_list(auth):
    r = auth.get(f"{BASE_URL}/api/alliances", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
