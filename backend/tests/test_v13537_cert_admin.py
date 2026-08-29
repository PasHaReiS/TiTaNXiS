"""v135.37 — Admin certificate list (GET /api/certificates), PATCH /api/certificates/{cid},
DELETE regression. Cleans up all created test data."""
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

STATE = {"cert_ids": [], "event_ids": []}


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    u = re.search(r'(?im)^\s*-\s*\*\*Username\*\*\s*:\s*`([^`]+)`', content)
    p = re.search(r'(?im)^\s*-\s*\*\*Password\*\*\s*:\s*`([^`]+)`', content)
    assert u and p, "admin creds not found"
    return {"username": u.group(1), "password": p.group(1)}


@pytest.fixture(scope="session")
def admin(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def anon():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin):
    yield
    for cid in STATE["cert_ids"]:
        admin.delete(f"{API}/certificates/{cid}", timeout=30)
    for eid in STATE["event_ids"]:
        admin.delete(f"{API}/events/{eid}", timeout=30)


class TestCertAdmin:
    # ---------- seed: event + certificate ----------
    def test_01_seed_event_and_cert(self, admin):
        ev_name = f"TEST_CertAdmin_{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/events", json={
            "name": ev_name, "date": "2026-07-05T18:00:00Z",
        }, timeout=30)
        assert r.status_code in (200, 201), r.text[:400]
        eid = r.json().get("id") or r.json().get("event", {}).get("id")
        assert eid
        STATE["event_ids"].append(eid)

        rm = admin.get(f"{API}/members", timeout=60)
        assert rm.status_code == 200
        items = rm.json() if isinstance(rm.json(), list) else rm.json().get("items", [])
        assert items, "no members to issue cert to"
        mid = items[0]["id"]
        STATE["member_name"] = items[0].get("name")

        r2 = admin.post(f"{API}/certificates/issue", json={
            "event_id": eid, "title": "TEST_Sertifika_A",
            "member_ids": [mid], "theme": "zumrut",
        }, timeout=60)
        assert r2.status_code == 200, r2.text[:400]
        created = r2.json()["created"]
        assert len(created) == 1
        assert created[0]["theme"] == "zumrut"
        assert created[0]["title"] == "TEST_Sertifika_A"
        STATE["cert_ids"].append(created[0]["id"])
        STATE["cert"] = created[0]
        STATE["event_name"] = ev_name

    # ---------- GET /certificates (admin list) ----------
    def test_02_list_requires_auth(self, anon):
        r = anon.get(f"{API}/certificates", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_03_list_returns_items_count_sorted(self, admin):
        r = admin.get(f"{API}/certificates", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "items" in data and "count" in data
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])
        assert all("_id" not in it for it in data["items"])
        issued = [it.get("issued_at") or "" for it in data["items"]]
        assert issued == sorted(issued, reverse=True), "not sorted issued_at desc"
        ids = [it["id"] for it in data["items"]]
        assert STATE["cert"]["id"] in ids, "newly issued cert missing from list"

    def test_04_search_by_title_case_insensitive(self, admin):
        r = admin.get(f"{API}/certificates", params={"search": "test_sertifika_a"}, timeout=30)
        assert r.status_code == 200
        ids = [it["id"] for it in r.json()["items"]]
        assert STATE["cert"]["id"] in ids

    def test_05_search_by_member_and_event(self, admin):
        for key in ("member_name", "event_name"):
            val = STATE.get(key)
            if not val:
                continue
            r = admin.get(f"{API}/certificates", params={"search": val}, timeout=30)
            assert r.status_code == 200, r.text[:200]
            ids = [it["id"] for it in r.json()["items"]]
            assert STATE["cert"]["id"] in ids, f"search by {key}={val} did not match"

    def test_06_search_no_match_returns_empty(self, admin):
        r = admin.get(f"{API}/certificates", params={"search": f"zzz_{uuid.uuid4().hex}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["count"] == 0

    # ---------- PATCH ----------
    def test_07_patch_title_and_theme(self, admin):
        cid = STATE["cert"]["id"]
        r = admin.patch(f"{API}/certificates/{cid}",
                        json={"title": "TEST_Sertifika_B", "theme": "buz"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        item = r.json()["item"]
        assert item["title"] == "TEST_Sertifika_B"
        assert item["theme"] == "buz"
        assert "_id" not in item
        # verify persistence via list
        lst = admin.get(f"{API}/certificates", params={"search": "TEST_Sertifika_B"}, timeout=30).json()
        match = [it for it in lst["items"] if it["id"] == cid]
        assert match and match[0]["title"] == "TEST_Sertifika_B" and match[0]["theme"] == "buz"

    def test_08_patch_invalid_theme_falls_back_amber(self, admin):
        cid = STATE["cert"]["id"]
        r = admin.patch(f"{API}/certificates/{cid}", json={"theme": "not_a_theme"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["item"]["theme"] == "amber"

    def test_09_patch_empty_body_400(self, admin):
        cid = STATE["cert"]["id"]
        r = admin.patch(f"{API}/certificates/{cid}", json={}, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_10_patch_blank_title_only_400(self, admin):
        cid = STATE["cert"]["id"]
        r = admin.patch(f"{API}/certificates/{cid}", json={"title": "   "}, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_11_patch_bogus_id_404(self, admin):
        r = admin.patch(f"{API}/certificates/{uuid.uuid4()}", json={"title": "X"}, timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}"

    def test_12_patch_unauthenticated(self, anon):
        cid = STATE["cert"]["id"]
        r = anon.patch(f"{API}/certificates/{cid}", json={"title": "HACK"}, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"
        # ensure unchanged
        assert r.status_code != 200

    # ---------- DELETE regression ----------
    def test_13_delete_unauthenticated(self, anon):
        r = anon.delete(f"{API}/certificates/{STATE['cert']['id']}", timeout=30)
        assert r.status_code in (401, 403)

    def test_14_delete_admin_and_verify_gone(self, admin):
        cid = STATE["cert"]["id"]
        r = admin.delete(f"{API}/certificates/{cid}", timeout=30)
        assert r.status_code == 200, r.text[:300]
        lst = admin.get(f"{API}/certificates", timeout=30).json()
        assert cid not in [it["id"] for it in lst["items"]]
        STATE["cert_ids"] = [c for c in STATE["cert_ids"] if c != cid]

    def test_15_delete_bogus_404(self, admin):
        r = admin.delete(f"{API}/certificates/{uuid.uuid4()}", timeout=30)
        assert r.status_code == 404

    # ---------- pre-existing data must be intact ----------
    def test_16_preexisting_certs_intact(self, admin):
        r = admin.get(f"{API}/certificates", timeout=30)
        assert r.status_code == 200
        titles = [it.get("title") for it in r.json()["items"]]
        assert any("Tebrikler" in (t or "") for t in titles), \
            f"pre-existing 'Tebrikler' certificates missing! titles={titles[:10]}"
