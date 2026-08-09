"""Backend regression tests: stats, leaderboard, events, members, push, point-calc, auth."""
import os
import pytest
import requests

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""

BASE_URL = _load_base_url()
assert BASE_URL, "REACT_APP_BACKEND_URL not set"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "admin", "password": "Admin123"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------- Auth -------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"username": "admin", "password": "Admin123"}, timeout=30)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_me(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["username"] == "admin"
        assert j["role"] == "admin"


# ------- Core public endpoints -------
class TestPublic:
    def test_stats(self):
        r = requests.get(f"{BASE_URL}/api/stats", timeout=30)
        assert r.status_code == 200
        j = r.json()
        for k in ("member_count", "event_count", "total_power"):
            assert k in j, f"missing {k} in {j}"
            assert isinstance(j[k], (int, float))

    def test_leaderboard(self):
        r = requests.get(f"{BASE_URL}/api/leaderboard", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_events_active(self):
        r = requests.get(f"{BASE_URL}/api/events?archived=false", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_members_search(self):
        r = requests.get(f"{BASE_URL}/api/members?search=admin", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ------- Push notifications -------
class TestPush:
    def test_vapid_public_key(self):
        r = requests.get(f"{BASE_URL}/api/push/vapid-public-key", timeout=30)
        assert r.status_code == 200
        j = r.json()
        # accept dict with key or plain str
        assert ("public_key" in j) or ("key" in j) or isinstance(j, str), j

    def test_history(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/push/history", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list) or isinstance(body, dict)

    def test_templates(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/push/templates", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list) or isinstance(body, dict)

    def test_broadcast(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/push/broadcast", headers=auth_headers,
                         json={"title": "TEST_iter47", "body": "regression", "url": "/"}, timeout=30)
        assert r.status_code == 200, r.text


# ------- Point Calc -------
class TestPointCalc:
    def test_list(self):
        r = requests.get(f"{BASE_URL}/api/point-calc?kind=pre", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_get_delete(self, auth_headers):
        payload = {
            "kind": "pre",
            "name": "TEST_iter47_day",
            "order": 999,
            "title": "TEST",
        }
        r = requests.post(f"{BASE_URL}/api/point-calc", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        cid = created.get("id")
        assert cid, created
        assert created.get("name") == payload["name"]

        # GET list & confirm present
        lst = requests.get(f"{BASE_URL}/api/point-calc?kind=pre", timeout=30).json()
        assert any(x.get("id") == cid for x in lst), "created day not in list"

        # cleanup
        d = requests.delete(f"{BASE_URL}/api/point-calc/{cid}", headers=auth_headers, timeout=30)
        assert d.status_code in (200, 204)

    def test_export(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/point-calc/export?kind=pre", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "xlsx" in ct or "octet-stream" in ct, ct
        assert len(r.content) > 100
