"""
Auth + RBAC tests for Oyun Loncası.
Covers: /api/auth/*, /api/users/*, and permission enforcement on write endpoints.
"""
import os
import pytest
import requests
import uuid
import jwt as pyjwt
from datetime import datetime, timezone, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"

ADMIN_USER = "admin"
ADMIN_PWD = "admin123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PWD})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _rand(prefix="TEST_"):
    return f"{prefix}{uuid.uuid4().hex[:8]}"


@pytest.fixture
def viewer_user(admin_headers):
    """Create a role=user, can_edit=false. Cleanup after."""
    uname = _rand("test_viewer_")
    pwd = "viewer123"
    r = requests.post(f"{API}/users", headers=admin_headers,
                      json={"username": uname, "password": pwd, "role": "user", "can_edit": False})
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    tok = requests.post(f"{API}/auth/login", json={"username": uname, "password": pwd}).json()["token"]
    yield {"id": uid, "username": uname, "password": pwd, "token": tok,
           "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}
    requests.delete(f"{API}/users/{uid}", headers=admin_headers)


@pytest.fixture
def editor_user(admin_headers):
    """Create a role=user, can_edit=true. Cleanup after."""
    uname = _rand("test_editor_")
    pwd = "editor123"
    r = requests.post(f"{API}/users", headers=admin_headers,
                      json={"username": uname, "password": pwd, "role": "user", "can_edit": True})
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    tok = requests.post(f"{API}/auth/login", json={"username": uname, "password": pwd}).json()["token"]
    yield {"id": uid, "username": uname, "password": pwd, "token": tok,
           "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}
    requests.delete(f"{API}/users/{uid}", headers=admin_headers)


# ---------- /api/auth/login ----------
class TestLogin:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PWD})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 20
        assert d["user"]["username"] == "admin"
        assert d["user"]["role"] == "admin"
        assert d["user"]["can_edit"] is True

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": "wrong"})
        assert r.status_code == 401

    def test_login_unknown_user(self):
        r = requests.post(f"{API}/auth/login", json={"username": "no_such_user_xyz", "password": "whatever"})
        assert r.status_code == 401


# ---------- /api/auth/me ----------
class TestMe:
    def test_me_with_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["username"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer nonsense.token.here"})
        assert r.status_code == 401

    def test_me_expired_token(self):
        # Craft an expired token using same secret
        secret = "d0ea8a9095fdf27b539a5d9c81420f14d24eb43778e3ba20d13ecd8ada4441ff"
        payload = {"sub": "fake", "username": "admin", "role": "admin",
                   "exp": datetime.now(timezone.utc) - timedelta(days=1)}
        tok = pyjwt.encode(payload, secret, algorithm="HS256")
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 401


# ---------- JWT token structure ----------
class TestJWTStructure:
    def test_token_contains_expected_claims(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PWD})
        tok = r.json()["token"]
        # decode without verification just to check claims
        decoded = pyjwt.decode(tok, options={"verify_signature": False})
        assert decoded["username"] == "admin"
        assert decoded["role"] == "admin"
        assert "sub" in decoded
        assert "exp" in decoded
        # 7 day exp
        exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = exp - now
        assert timedelta(days=6, hours=20) < delta < timedelta(days=7, hours=4)


# ---------- Change password ----------
class TestChangePassword:
    def test_wrong_old_password(self, viewer_user):
        r = requests.post(f"{API}/auth/change-password", headers=viewer_user["headers"],
                          json={"old_password": "wrongpwd", "new_password": "newpass1"})
        assert r.status_code == 400

    def test_short_new_password(self, viewer_user):
        r = requests.post(f"{API}/auth/change-password", headers=viewer_user["headers"],
                          json={"old_password": viewer_user["password"], "new_password": "abc"})
        assert r.status_code == 400

    def test_change_password_success(self, viewer_user):
        new_pwd = "newpass456"
        r = requests.post(f"{API}/auth/change-password", headers=viewer_user["headers"],
                          json={"old_password": viewer_user["password"], "new_password": new_pwd})
        assert r.status_code == 200
        # login with new
        r2 = requests.post(f"{API}/auth/login", json={"username": viewer_user["username"], "password": new_pwd})
        assert r2.status_code == 200
        # old should fail
        r3 = requests.post(f"{API}/auth/login", json={"username": viewer_user["username"], "password": viewer_user["password"]})
        assert r3.status_code == 401


# ---------- /api/users listing perms ----------
class TestUsersList:
    def test_admin_can_list(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any(u["username"] == "admin" for u in r.json())
        # no password_hash leaked
        for u in r.json():
            assert "password_hash" not in u

    def test_guest_gets_401(self):
        r = requests.get(f"{API}/users")
        assert r.status_code == 401

    def test_viewer_gets_403(self, viewer_user):
        r = requests.get(f"{API}/users", headers=viewer_user["headers"])
        assert r.status_code == 403

    def test_editor_gets_403(self, editor_user):
        r = requests.get(f"{API}/users", headers=editor_user["headers"])
        assert r.status_code == 403


# ---------- POST /api/users ----------
class TestUserCreate:
    def test_duplicate_username(self, admin_headers):
        uname = _rand("test_dup_")
        r = requests.post(f"{API}/users", headers=admin_headers,
                          json={"username": uname, "password": "pass123", "role": "user"})
        assert r.status_code == 200
        uid = r.json()["id"]
        try:
            r2 = requests.post(f"{API}/users", headers=admin_headers,
                               json={"username": uname, "password": "pass123", "role": "user"})
            assert r2.status_code == 400
        finally:
            requests.delete(f"{API}/users/{uid}", headers=admin_headers)

    def test_short_password(self, admin_headers):
        r = requests.post(f"{API}/users", headers=admin_headers,
                          json={"username": _rand(), "password": "12345", "role": "user"})
        assert r.status_code == 400

    def test_short_username(self, admin_headers):
        r = requests.post(f"{API}/users", headers=admin_headers,
                          json={"username": "ab", "password": "pass123", "role": "user"})
        assert r.status_code == 400

    def test_non_admin_cannot_create(self, editor_user):
        r = requests.post(f"{API}/users", headers=editor_user["headers"],
                          json={"username": _rand(), "password": "pass123", "role": "user"})
        assert r.status_code == 403


# ---------- PATCH /api/users/{id} ----------
class TestUserPatch:
    def test_toggle_can_edit_and_role(self, admin_headers, viewer_user):
        r = requests.patch(f"{API}/users/{viewer_user['id']}", headers=admin_headers,
                           json={"can_edit": True})
        assert r.status_code == 200
        assert r.json()["can_edit"] is True
        r2 = requests.patch(f"{API}/users/{viewer_user['id']}", headers=admin_headers,
                            json={"role": "admin"})
        assert r2.status_code == 200
        assert r2.json()["role"] == "admin"

    def test_non_admin_forbidden(self, viewer_user):
        r = requests.patch(f"{API}/users/{viewer_user['id']}", headers=viewer_user["headers"],
                           json={"can_edit": True})
        assert r.status_code == 403


# ---------- reset-password ----------
class TestResetPassword:
    def test_reset_sets_must_change(self, admin_headers, viewer_user):
        new_pwd = "reset123"
        r = requests.post(f"{API}/users/{viewer_user['id']}/reset-password",
                          headers=admin_headers, json={"new_password": new_pwd})
        assert r.status_code == 200
        # Verify login works with new password and must_change_password=true
        r2 = requests.post(f"{API}/auth/login",
                           json={"username": viewer_user["username"], "password": new_pwd})
        assert r2.status_code == 200
        assert r2.json()["user"]["must_change_password"] is True

    def test_reset_non_admin_forbidden(self, viewer_user):
        r = requests.post(f"{API}/users/{viewer_user['id']}/reset-password",
                          headers=viewer_user["headers"], json={"new_password": "abcdef"})
        assert r.status_code == 403


# ---------- DELETE /api/users ----------
class TestUserDelete:
    def test_admin_cannot_delete_self(self, admin_headers):
        me = requests.get(f"{API}/auth/me", headers=admin_headers).json()
        r = requests.delete(f"{API}/users/{me['id']}", headers=admin_headers)
        assert r.status_code == 400

    def test_delete_removes_user(self, admin_headers):
        uname = _rand("test_todel_")
        r = requests.post(f"{API}/users", headers=admin_headers,
                          json={"username": uname, "password": "pass123", "role": "user"})
        uid = r.json()["id"]
        r2 = requests.delete(f"{API}/users/{uid}", headers=admin_headers)
        assert r2.status_code == 200
        # login should now fail
        r3 = requests.post(f"{API}/auth/login", json={"username": uname, "password": "pass123"})
        assert r3.status_code == 401

    def test_non_admin_cannot_delete(self, viewer_user, editor_user):
        r = requests.delete(f"{API}/users/{viewer_user['id']}", headers=editor_user["headers"])
        assert r.status_code == 403


# ---------- Write-endpoint RBAC ----------
class TestWriteEndpointRBAC:
    """Standard user without can_edit=403, with can_edit=200, admin=200, guest=401."""

    def _member_payload(self):
        return {"name": _rand("TEST_m_"), "member_id": str(uuid.uuid4().int)[:9], "rank": "R2", "level": 5}

    def test_members_post_guest(self):
        r = requests.post(f"{API}/members", json=self._member_payload())
        assert r.status_code == 401

    def test_members_post_viewer(self, viewer_user):
        r = requests.post(f"{API}/members", headers=viewer_user["headers"], json=self._member_payload())
        assert r.status_code == 403

    def test_members_post_editor_and_delete(self, editor_user, admin_headers):
        r = requests.post(f"{API}/members", headers=editor_user["headers"], json=self._member_payload())
        assert r.status_code == 200
        mid = r.json()["id"]
        # editor can PATCH & DELETE
        r2 = requests.patch(f"{API}/members/{mid}", headers=editor_user["headers"], json={"level": 10})
        assert r2.status_code == 200
        r3 = requests.delete(f"{API}/members/{mid}", headers=editor_user["headers"])
        assert r3.status_code == 200

    def test_members_post_admin(self, admin_headers):
        payload = self._member_payload()
        r = requests.post(f"{API}/members", headers=admin_headers, json=payload)
        assert r.status_code == 200
        # cleanup
        requests.delete(f"{API}/members/{r.json()['id']}", headers=admin_headers)

    # Events
    def test_events_write_rbac(self, viewer_user, editor_user, admin_headers):
        payload = {"name": _rand("TEST_ev_"), "group_name": "TEST_G", "multiplier": 1.0,
                   "date": "2026-04-01T00:00:00+00:00"}
        # guest
        assert requests.post(f"{API}/events", json=payload).status_code == 401
        # viewer
        assert requests.post(f"{API}/events", headers=viewer_user["headers"], json=payload).status_code == 403
        # editor
        r = requests.post(f"{API}/events", headers=editor_user["headers"], json=payload)
        assert r.status_code == 200
        eid = r.json()["id"]
        # patch by viewer
        assert requests.patch(f"{API}/events/{eid}", headers=viewer_user["headers"], json={"multiplier": 2.0}).status_code == 403
        # patch by editor
        assert requests.patch(f"{API}/events/{eid}", headers=editor_user["headers"], json={"multiplier": 2.0}).status_code == 200
        # archive-group requires can_edit
        assert requests.post(f"{API}/events/archive-group", params={"group_name": "TEST_G"}).status_code == 401
        assert requests.post(f"{API}/events/archive-group", params={"group_name": "TEST_G"},
                             headers=viewer_user["headers"]).status_code == 403
        assert requests.post(f"{API}/events/archive-group", params={"group_name": "TEST_G"},
                             headers=editor_user["headers"]).status_code == 200
        # delete
        requests.delete(f"{API}/events/{eid}", headers=admin_headers)

    def test_points_and_scores_rbac(self, viewer_user, editor_user, admin_headers):
        m = requests.get(f"{API}/members").json()[0]
        e = requests.get(f"{API}/events", params={"archived": "false"}).json()[0]
        payload = {"member_id": m["id"], "event_id": e["id"], "points": 100, "multiplier": 1.0, "note": "TEST"}
        assert requests.post(f"{API}/points", json=payload).status_code == 401
        assert requests.post(f"{API}/points", headers=viewer_user["headers"], json=payload).status_code == 403
        r = requests.post(f"{API}/points", headers=editor_user["headers"], json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        requests.delete(f"{API}/points/{pid}", headers=admin_headers)
        # /scores alias
        assert requests.post(f"{API}/scores", json=payload).status_code == 401
        assert requests.post(f"{API}/scores", headers=viewer_user["headers"], json=payload).status_code == 403
        r2 = requests.post(f"{API}/scores", headers=admin_headers, json=payload)
        assert r2.status_code == 200
        requests.delete(f"{API}/scores/{r2.json()['id']}", headers=admin_headers)

    def test_commanders_rbac(self, viewer_user, editor_user, admin_headers):
        payload = {"name": _rand("TEST_cmd_"), "category": "tetikci"}
        assert requests.post(f"{API}/commanders", json=payload).status_code == 401
        assert requests.post(f"{API}/commanders", headers=viewer_user["headers"], json=payload).status_code == 403
        r = requests.post(f"{API}/commanders", headers=editor_user["headers"], json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        assert requests.patch(f"{API}/commanders/{cid}", headers=viewer_user["headers"], json={"description": "x"}).status_code == 403
        assert requests.delete(f"{API}/commanders/{cid}", headers=viewer_user["headers"]).status_code == 403
        assert requests.delete(f"{API}/commanders/{cid}", headers=admin_headers).status_code == 200

    def test_seed_requires_admin(self, viewer_user, editor_user):
        # We don't actually want to force reseed; test 401/403 with no side-effect
        assert requests.post(f"{API}/seed").status_code == 401
        assert requests.post(f"{API}/seed", headers=viewer_user["headers"]).status_code == 403
        assert requests.post(f"{API}/seed", headers=editor_user["headers"]).status_code == 403


# ---------- GET public endpoints (no auth) ----------
class TestPublicGets:
    @pytest.mark.parametrize("path", [
        "/leaderboard", "/stats", "/members", "/events",
        "/commanders", "/scores", "/points", "/event-groups",
    ])
    def test_public_get(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} returned {r.status_code}"


# ---------- Admin seed verification ----------
class TestAdminSeed:
    def test_admin_user_exists(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        users = r.json()
        admin = next((u for u in users if u["username"] == "admin"), None)
        assert admin is not None
        assert admin["role"] == "admin"
        assert admin["can_edit"] is True

    def test_admin_password_verifies(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
        assert r.status_code == 200
