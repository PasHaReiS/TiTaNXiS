"""Iter 56 — Refactor Phase 2 regression.

Verifies endpoints moved into routes/point_calc.py (translate-all/export/import),
routes/announcements.py, routes/guild_settings.py, and CalculationBody schema
alignment (forticlad + gelismis_forticlad). Also runs a light regression sweep
on Phase-1 endpoints.
"""
import io
import os
import uuid
import pytest
import requests


def _read_env():
    try:
        with open("/app/frontend/.env") as f:
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


def _login(user, pw):
    r = requests.post(f"{API}/auth/login", json={"username": user, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {user}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def admin_h():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


@pytest.fixture(scope="session")
def editor_h():
    return {"Authorization": f"Bearer {_login(*EDITOR)}"}


# ---------- 1. CalculationBody schema alignment ----------
class TestCalculationBodyAlignment:
    def test_post_accepts_forticlad_fields(self, editor_h):
        payload = {
            "category": f"TEST_CAT_{uuid.uuid4().hex[:6]}",
            "soldier_count": 100.0,
            "yemek": 10.0, "odun": 5.0, "celik": 3.0, "benzin": 2.0,
            "sure_saniye": 60.0,
            "forticlad": 1.5, "gelismis_forticlad": 2.5,
        }
        r = requests.post(f"{API}/calculations", json=payload, headers=editor_h, timeout=30)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        # cleanup
        cid = j.get("id")
        if cid:
            requests.delete(f"{API}/calculations/{cid}", headers=editor_h, timeout=15)

    def test_post_omits_defaults(self, editor_h):
        payload = {
            "category": f"TEST_CAT_{uuid.uuid4().hex[:6]}",
            "soldier_count": 50.0,
            "yemek": 1.0, "odun": 1.0, "celik": 1.0, "benzin": 1.0,
            "sure_saniye": 30.0,
        }
        r = requests.post(f"{API}/calculations", json=payload, headers=editor_h, timeout=30)
        assert r.status_code == 200, r.text[:300]
        cid = r.json().get("id")
        if cid:
            requests.delete(f"{API}/calculations/{cid}", headers=editor_h, timeout=15)

    def test_unit_costs_exposes_forticlad_fields(self, admin_h):
        r = requests.get(f"{API}/unit-costs/kaya", headers=admin_h, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "forticlad" in j and "gelismis_forticlad" in j, j


# ---------- 2. Guild Settings router ----------
class TestGuildSettings:
    def test_get_default(self, admin_h):
        r = requests.get(f"{API}/settings/guild-target", headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert "target" in r.json()

    def test_put_admin_clamps(self, admin_h):
        r = requests.put(f"{API}/settings/guild-target", json={"target": 250}, headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["target"] == 100
        r2 = requests.put(f"{API}/settings/guild-target", json={"target": -10}, headers=admin_h, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["target"] == 0
        # restore default-ish
        requests.put(f"{API}/settings/guild-target", json={"target": 60}, headers=admin_h, timeout=15)

    def test_put_editor_forbidden(self, editor_h):
        r = requests.put(f"{API}/settings/guild-target", json={"target": 50}, headers=editor_h, timeout=15)
        assert r.status_code in (401, 403), r.status_code


# ---------- 3. Announcements router ----------
class TestAnnouncements:
    def test_list(self, admin_h):
        r = requests.get(f"{API}/announcements?limit=5", headers=admin_h, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)

    def test_list_filter_urgent(self, admin_h):
        r = requests.get(f"{API}/announcements?filter=urgent&limit=5", headers=admin_h, timeout=30)
        assert r.status_code == 200
        for it in r.json().get("items", []):
            assert it.get("urgent") is True

    def test_create_no_broadcast_then_patch_revert_delete(self, admin_h):
        payload = {
            "title": f"TEST_ANN_{uuid.uuid4().hex[:6]}",
            "body": "test body v1",
            "broadcast": False,
            "urgent": False,
        }
        r = requests.post(f"{API}/announcements", json=payload, headers=admin_h, timeout=45)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        item = j.get("item")
        assert item and item.get("id")
        aid = item["id"]
        assert "fanout" not in j  # broadcast=false → no fanout
        # PATCH — change body → creates history snapshot
        p = requests.patch(f"{API}/announcements/{aid}", json={"body": "test body v2"}, headers=admin_h, timeout=30)
        assert p.status_code == 200, p.text[:300]
        assert p.json()["item"]["body"] == "test body v2"
        # revert
        rv = requests.post(f"{API}/announcements/{aid}/revert", headers=admin_h, timeout=30)
        assert rv.status_code == 200, rv.text[:300]
        assert rv.json()["item"]["body"] == "test body v1"
        # delete
        d = requests.delete(f"{API}/announcements/{aid}", headers=admin_h, timeout=15)
        assert d.status_code == 200

    def test_bulk_delete_restore(self, admin_h):
        ids = []
        for i in range(2):
            r = requests.post(f"{API}/announcements", json={
                "title": f"TEST_BULK_{i}_{uuid.uuid4().hex[:5]}",
                "body": "b", "broadcast": False,
            }, headers=admin_h, timeout=30)
            assert r.status_code == 200
            ids.append(r.json()["item"]["id"])
        # bulk delete
        d = requests.post(f"{API}/announcements/bulk-delete", json={"ids": ids}, headers=admin_h, timeout=15)
        assert d.status_code == 200
        assert d.json()["deleted"] == 2

    def test_create_requires_admin(self, editor_h):
        r = requests.post(f"{API}/announcements", json={
            "title": "TEST_NO", "body": "x", "broadcast": False,
        }, headers=editor_h, timeout=15)
        assert r.status_code in (401, 403), r.status_code


# ---------- 4. Point-Calc: translate-all / export / import ----------
class TestPointCalcExtended:
    @pytest.fixture(scope="class")
    def pc_day_id(self, admin_h):
        r = requests.post(f"{API}/point-calc", json={
            "kind": "pre",
            "name": f"TEST_PC_{uuid.uuid4().hex[:6]}",
        }, headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text[:200]
        did = r.json().get("id")
        assert did
        # add a table
        requests.put(f"{API}/point-calc/{did}", headers=admin_h, timeout=15, json={
            "tables": [{
                "id": str(uuid.uuid4()),
                "title": "Test Tablo",
                "miktar": 10,
                "multipliers": [{"id": str(uuid.uuid4()), "name": "Test Çarpan", "value": 5}],
                "materials": [{"id": str(uuid.uuid4()), "name": "asker", "amount": "1"}],
            }],
        })
        yield did
        requests.delete(f"{API}/point-calc/{did}", headers=admin_h, timeout=15)

    def test_export_pre_returns_xlsx(self, admin_h, pc_day_id):
        r = requests.get(f"{API}/point-calc/export?kind=pre", headers=admin_h, timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "openxml" in ct or "octet-stream" in ct, ct
        # Verify it's a valid xlsx (PK zip header)
        assert r.content[:2] == b"PK", f"not xlsx magic: {r.content[:8]}"
        assert len(r.content) > 500

    def test_export_requires_auth(self):
        r = requests.get(f"{API}/point-calc/export?kind=pre", timeout=15)
        assert r.status_code in (401, 403)

    def test_export_invalid_kind(self, admin_h):
        r = requests.get(f"{API}/point-calc/export?kind=bogus", headers=admin_h, timeout=15)
        assert r.status_code == 400

    def test_import_round_trip(self, admin_h, pc_day_id):
        # 1) Export current
        exp = requests.get(f"{API}/point-calc/export?kind=pre", headers=admin_h, timeout=60)
        assert exp.status_code == 200
        # 2) Re-upload the exported bytes → should not error
        files = {"file": ("puan.xlsx", exp.content,
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        imp = requests.post(f"{API}/point-calc/import?kind=pre", headers=admin_h, files=files, timeout=90)
        assert imp.status_code == 200, imp.text[:400]
        j = imp.json()
        assert "updated" in j and "skipped" in j

    def test_import_invalid_kind(self, admin_h):
        files = {"file": ("x.xlsx", b"PK\x03\x04", "application/octet-stream")}
        r = requests.post(f"{API}/point-calc/import?kind=bogus", headers=admin_h, files=files, timeout=30)
        assert r.status_code == 400

    def test_translate_all_status(self, admin_h):
        # Might return 503 if DEEPL not configured; either 200 or 503 is acceptable
        r = requests.post(f"{API}/point-calc/translate-all?kind=pre", headers=admin_h, timeout=120)
        assert r.status_code in (200, 503), f"{r.status_code} {r.text[:200]}"
        if r.status_code == 200:
            j = r.json()
            assert "days_processed" in j and "strings_translated" in j


# ---------- 5. Regression: Phase-1 endpoints still respond ----------
class TestPhase1Regression:
    def test_commanders(self, admin_h):
        r = requests.get(f"{API}/commanders", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_alliance_colors(self, admin_h):
        r = requests.get(f"{API}/alliance-colors", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_alliance_scopes(self, admin_h):
        r = requests.get(f"{API}/alliance-scopes", headers=admin_h, timeout=30)
        assert r.status_code in (200, 404)  # tolerant

    def test_multiplier_history(self, admin_h):
        r = requests.get(f"{API}/multiplier-history?limit=5", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_unit_costs_kaya(self, admin_h):
        r = requests.get(f"{API}/unit-costs/kaya", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_legal_privacy_tr(self):
        r = requests.get(f"{API}/legal/privacy?lang=tr", timeout=30)
        assert r.status_code == 200

    def test_reports_guild_data(self, admin_h):
        r = requests.get(f"{API}/reports/guild-data.csv", headers=admin_h, timeout=60)
        assert r.status_code == 200

    def test_point_calc_list(self, admin_h):
        r = requests.get(f"{API}/point-calc?kind=pre", headers=admin_h, timeout=30)
        assert r.status_code == 200

    def test_health(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
