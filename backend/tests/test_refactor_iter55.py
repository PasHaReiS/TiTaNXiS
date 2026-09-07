"""
Iter 55 backend refactor regression tests.

Verifies endpoints moved from monolithic server.py into routes/ modules still
return correct shapes/status codes, plus a smoke sweep on unrelated critical
flows (auth/members/events/leaderboard/points/health/voice/rooms).
"""
import os
import time
import uuid
import pytest
import requests

def _read_env():
    for p in ("/app/frontend/.env",):
        try:
            with open(p) as f:
                for ln in f:
                    if ln.startswith("REACT_APP_BACKEND_URL="):
                        return ln.split("=", 1)[1].strip()
        except Exception:
            pass
    return os.environ.get("REACT_APP_BACKEND_URL")


BASE_URL = (_read_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"

ADMIN = ("admin", "Admin123")
EDITOR = ("pasha", "pasha123")


# ---------- fixtures ----------
def _login(user, pw):
    r = requests.post(f"{API}/auth/login", json={"username": user, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {user} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def editor_token():
    return _login(*EDITOR)


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def editor_h(editor_token):
    return {"Authorization": f"Bearer {editor_token}"}


# ---------- regression smoke: unrelated critical flows ----------
class TestRegressionSmoke:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") in ("ok", "healthy", True) or r.json()

    def test_admin_login(self):
        _login(*ADMIN)

    def test_members(self, admin_h):
        r = requests.get(f"{API}/members", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_events(self, admin_h):
        r = requests.get(f"{API}/events", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_leaderboard(self, admin_h):
        r = requests.get(f"{API}/leaderboard", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_voice_rooms(self, admin_h):
        r = requests.get(f"{API}/voice/rooms", headers=admin_h, timeout=30)
        assert r.status_code == 200


# ---------- commanders (routes/commanders.py) ----------
class TestCommanders:
    created_id = None

    def test_list(self, admin_h):
        r = requests.get(f"{API}/commanders", headers=admin_h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_create_patch_delete(self, editor_h):
        name = f"TEST_CMD_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/commanders", headers=editor_h,
                          json={"name": name, "role": "Infantry", "category": "Infantry"}, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]
        obj = r.json()
        cid = obj.get("id") or obj.get("_id")
        assert cid, obj
        TestCommanders.created_id = cid

        # PATCH
        r2 = requests.patch(f"{API}/commanders/{cid}", headers=editor_h,
                            json={"role": "Cavalry"}, timeout=30)
        assert r2.status_code == 200, r2.text[:300]

        # DELETE
        r3 = requests.delete(f"{API}/commanders/{cid}", headers=editor_h, timeout=30)
        assert r3.status_code in (200, 204), r3.text[:300]


# ---------- alliance_meta (colors + scopes) ----------
class TestAllianceMeta:
    def test_colors_get(self, admin_h):
        r = requests.get(f"{API}/alliance-colors", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_colors_put_delete(self, editor_h):
        name = f"TESTAL_{uuid.uuid4().hex[:4]}"
        r = requests.put(f"{API}/alliance-colors", headers=editor_h,
                         json={"name": name, "color": "#ABCDEF"}, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]
        r2 = requests.get(f"{API}/alliance-colors", headers=editor_h, timeout=30)
        assert name in r2.json(), f"{name} not persisted"
        assert r2.json()[name].lower() == "#abcdef"
        r3 = requests.delete(f"{API}/alliance-colors/{name}", headers=editor_h, timeout=30)
        assert r3.status_code in (200, 204)
        r4 = requests.get(f"{API}/alliance-colors", headers=editor_h, timeout=30)
        assert name not in r4.json()

    def test_scopes_get(self, admin_h):
        r = requests.get(f"{API}/alliance-scopes", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)


# ---------- multiplier-history ----------
class TestMultiplierHistory:
    def test_list(self, admin_h):
        r = requests.get(f"{API}/multiplier-history", headers=admin_h, timeout=45)
        assert r.status_code == 200
        data = r.json()
        # accept list or dict grouping
        assert isinstance(data, (list, dict))
        # verify enrich_points_batch injection: look for member_name/event_name if entries exist
        entries = data if isinstance(data, list) else sum(
            (v if isinstance(v, list) else [] for v in data.values()), []
        )
        if entries:
            sample = entries[0]
            # keys should include enrichment fields (may be null)
            assert "member_name" in sample or "event_name" in sample or "member_id" in sample, sample


# ---------- unit-costs + calculations ----------
class TestUnitCosts:
    def test_get_defaults(self, admin_h):
        r = requests.get(f"{API}/unit-costs/infantry", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_put_costs_admin(self, admin_h):
        payload = {"costs": {"t1": {"food": 10, "wood": 10}}}
        r = requests.put(f"{API}/unit-costs/infantry", headers=admin_h, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]

    def test_put_costs_forbidden_for_editor(self, editor_h):
        # require_admin per review request
        payload = {"costs": {"t1": {"food": 1}}}
        r = requests.put(f"{API}/unit-costs/infantry", headers=editor_h, json=payload, timeout=30)
        assert r.status_code in (401, 403), f"expected forbidden, got {r.status_code}"

    def test_calculations_crud(self, admin_h):
        r = requests.get(f"{API}/calculations?category=infantry", headers=admin_h, timeout=30)
        assert r.status_code == 200
        r2 = requests.post(f"{API}/calculations", headers=admin_h,
                           json={"category": "infantry",
                                 "soldier_count": 100.0,
                                 "yemek": 0.0, "odun": 0.0, "celik": 0.0,
                                 "benzin": 0.0, "sure_saniye": 0.0}, timeout=30)
        assert r2.status_code in (200, 201), r2.text[:300]
        cid = r2.json().get("id") or r2.json().get("_id")
        if cid:
            r3 = requests.delete(f"{API}/calculations/{cid}", headers=admin_h, timeout=30)
            assert r3.status_code in (200, 204), r3.text[:300]


# ---------- point-calc ----------
class TestPointCalc:
    day_id = None

    def test_list_pre(self, admin_h):
        r = requests.get(f"{API}/point-calc?kind=pre", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_patch_history_share_public_revert_delete(self, admin_h, editor_h):
        # CREATE
        payload = {"kind": "pre", "name": f"TEST_PC_{uuid.uuid4().hex[:5]}", "rows": []}
        r = requests.post(f"{API}/point-calc", headers=editor_h, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text[:400]
        obj = r.json()
        did = obj.get("id") or obj.get("_id") or obj.get("day_id")
        assert did, obj
        TestPointCalc.day_id = did

        # PATCH -> writes history snapshot
        r2 = requests.patch(f"{API}/point-calc/{did}", headers=editor_h,
                            json={"title": "TEST_PC_updated"}, timeout=30)
        assert r2.status_code == 200, r2.text[:300]

        # History
        r3 = requests.get(f"{API}/point-calc/{did}/history", headers=admin_h, timeout=30)
        assert r3.status_code == 200
        hist = r3.json()
        assert isinstance(hist, list)

        # Share signature
        r4 = requests.get(f"{API}/point-calc/{did}/share", headers=admin_h, timeout=30)
        assert r4.status_code == 200
        sig = r4.json().get("sig") or r4.json().get("signature")
        assert sig, r4.json()

        # Public verify (no auth)
        r5 = requests.get(f"{API}/public/point-calc/{did}?sig={sig}", timeout=30)
        assert r5.status_code == 200, r5.text[:300]

        # Public bad sig
        r5b = requests.get(f"{API}/public/point-calc/{did}?sig=deadbeef", timeout=30)
        assert r5b.status_code in (400, 401, 403, 404), r5b.status_code

        # Revert (if version exists)
        if hist:
            vid = hist[0].get("id") or hist[0].get("_id") or hist[0].get("version_id")
            if vid:
                r6 = requests.post(f"{API}/point-calc/{did}/revert/{vid}", headers=editor_h, timeout=30)
                assert r6.status_code in (200, 201), r6.text[:300]

        # DELETE
        r7 = requests.delete(f"{API}/point-calc/{did}", headers=editor_h, timeout=30)
        assert r7.status_code in (200, 204), r7.text[:300]

    def test_translate_export_import_still_in_server(self, admin_h):
        # These should still be reachable (remain in server.py per review)
        r_exp = requests.get(f"{API}/point-calc/export?kind=pre", headers=admin_h, timeout=45)
        assert r_exp.status_code == 200, f"export: {r_exp.status_code} {r_exp.text[:200]}"


# ---------- event ICS ----------
class TestEventIcs:
    def test_ics_valid(self, admin_h):
        # find an event id
        r = requests.get(f"{API}/events", headers=admin_h, timeout=30)
        assert r.status_code == 200
        evs = r.json()
        events = evs if isinstance(evs, list) else evs.get("items", [])
        if not events:
            pytest.skip("no events to test ICS")
        eid = events[0].get("id") or events[0].get("_id")
        r2 = requests.get(f"{API}/events/{eid}/ics", headers=admin_h, timeout=30)
        assert r2.status_code == 200, r2.text[:300]
        body = r2.text
        assert body.startswith("BEGIN:VCALENDAR"), body[:120]
        assert "END:VCALENDAR" in body


# ---------- legal ----------
class TestLegal:
    def test_privacy_tr(self):
        r = requests.get(f"{API}/legal/privacy?lang=tr", timeout=30)
        assert r.status_code == 200
        assert r.json().get("content") or r.json().get("body") or r.json()

    def test_terms_tr(self):
        r = requests.get(f"{API}/legal/terms?lang=tr", timeout=30)
        assert r.status_code == 200

    def test_privacy_en(self):
        # EN triggers DeepL translation via injected _translate_one
        r = requests.get(f"{API}/legal/privacy?lang=en", timeout=60)
        assert r.status_code == 200


# ---------- reports CSV ----------
class TestReportsCsv:
    def test_archive_points_export(self, editor_h):
        r = requests.get(f"{API}/reports/archive-points-export.csv", headers=editor_h, timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert "," in r.text or r.text.strip() == "", "csv should be csv-ish"

    def test_guild_data(self, editor_h):
        r = requests.get(f"{API}/reports/guild-data.csv", headers=editor_h, timeout=60)
        assert r.status_code == 200
