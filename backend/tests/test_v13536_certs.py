"""v135.36 — Auto certificates, public verify, announcement bulk actions, cert PNG."""
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

STATE = {}


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
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin):
    yield
    for cid in STATE.get("cert_ids", []):
        admin.delete(f"{API}/certificates/{cid}", timeout=30)
    for eid in STATE.get("event_ids", []):
        admin.delete(f"{API}/events/{eid}", timeout=30)
    ann = STATE.get("ann_ids", [])
    if ann:
        admin.post(f"{API}/announcements/bulk-delete", json={"ids": ann}, timeout=30)


# ---------- Auto certificate on archive ----------
class TestV13536:
    def test_01_create_event_with_auto_cert(self, admin):
        payload = {
            "name": f"TEST_AutoCert_{uuid.uuid4().hex[:6]}",
            "date": "2026-07-01T18:00:00Z",
            "auto_certificate": True,
            "auto_certificate_title": "X Şampiyonu",
            "auto_certificate_theme": "amber",
        }
        r = admin.post(f"{API}/events", json=payload, timeout=60)
        assert r.status_code in (200, 201), r.text[:400]
        ev = r.json()
        eid = ev.get("id") or ev.get("event", {}).get("id")
        assert eid
        STATE.setdefault("event_ids", []).append(eid)
        STATE["event_id"] = eid
        # verify persisted
        g = admin.get(f"{API}/events?archived=false", timeout=60)
        assert g.status_code == 200, g.text[:300]
        rows = g.json()
        doc = next((e for e in rows if e.get("id") == eid), None)
        assert doc, "created event not found in list"
        assert doc.get("auto_certificate") is True
        assert doc.get("auto_certificate_title") == "X Şampiyonu"

    def test_02_add_attendance(self, admin):
        r = admin.get(f"{API}/members", timeout=60)
        assert r.status_code == 200
        data = r.json()
        members = data if isinstance(data, list) else data.get("items", [])
        assert members, "no members in DB"
        mid = members[0]["id"]
        STATE["member_id"] = mid
        STATE["member_name"] = members[0].get("name")
        t = admin.post(
            f"{API}/events/{STATE['event_id']}/attendance/toggle",
            json={"member_id": mid, "attended": True}, timeout=30,
        )
        assert t.status_code == 200, t.text[:300]
        assert t.json().get("attended") is True

    def test_03_bulk_archive_issues_cert(self, admin):
        r = admin.post(f"{API}/events/bulk-archive",
                       json={"ids": [STATE["event_id"]], "archived": True}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("modified") == 1
        g = admin.get(f"{API}/certificates/member/{STATE['member_id']}", timeout=30)
        assert g.status_code == 200, g.text[:300]
        certs = [c for c in g.json()["items"] if c.get("event_id") == STATE["event_id"]]
        assert len(certs) == 1, f"expected 1 auto cert, got {len(certs)}"
        c = certs[0]
        STATE["cert_id"] = c["id"]
        STATE.setdefault("cert_ids", []).append(c["id"])
        STATE["verify_token"] = c.get("verify_token")
        assert c["title"] == "X Şampiyonu"
        assert c["issued_by"] == "auto"
        assert re.fullmatch(r"[0-9a-f]{12}", c.get("verify_token") or ""), c.get("verify_token")

    def test_04_rearchive_idempotent(self, admin):
        r1 = admin.post(f"{API}/events/bulk-archive",
                        json={"ids": [STATE["event_id"]], "archived": False}, timeout=60)
        assert r1.status_code == 200
        r2 = admin.post(f"{API}/events/bulk-archive",
                        json={"ids": [STATE["event_id"]], "archived": True}, timeout=60)
        assert r2.status_code == 200
        g = admin.get(f"{API}/certificates/member/{STATE['member_id']}", timeout=30)
        certs = [c for c in g.json()["items"] if c.get("event_id") == STATE["event_id"]]
        assert len(certs) == 1, f"duplicate certs after re-archive: {len(certs)}"

    def test_05_patch_archive_also_issues(self, admin):
        """PATCH /events/{id} archive hook — second event path."""
        payload = {
            "name": f"TEST_AutoCert2_{uuid.uuid4().hex[:6]}",
            "date": "2026-07-02T18:00:00Z",
            "auto_certificate": True,
            "auto_certificate_title": "Patch Şampiyonu",
        }
        r = admin.post(f"{API}/events", json=payload, timeout=60)
        assert r.status_code in (200, 201)
        eid = r.json().get("id")
        STATE.setdefault("event_ids", []).append(eid)
        admin.post(f"{API}/events/{eid}/attendance/toggle",
                   json={"member_id": STATE["member_id"], "attended": True}, timeout=30)
        p = admin.patch(f"{API}/events/{eid}", json={"archived": True}, timeout=60)
        assert p.status_code == 200, p.text[:300]
        g = admin.get(f"{API}/certificates/member/{STATE['member_id']}", timeout=30)
        certs = [c for c in g.json()["items"] if c.get("event_id") == eid]
        assert len(certs) == 1, f"PATCH archive did not auto-issue cert (got {len(certs)})"
        STATE.setdefault("cert_ids", []).append(certs[0]["id"])


    # ---------- Public verification ----------
    def test_06_verify_valid_token_no_auth(self):
        tok = STATE.get("verify_token")
        assert tok, "no verify token from earlier test"
        r = requests.get(f"{API}/certificates/verify/{tok}", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["valid"] is True
        assert d["title"] == "X Şampiyonu"
        assert d["member_name"] == STATE["member_name"]
        assert d["issued_by"] == "auto"
        assert d.get("event_name")

    def test_07_verify_bogus_token(self):
        r = requests.get(f"{API}/certificates/verify/BOGUSTOKENXX", timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"


    # ---------- Certificate PNG ----------
    def test_08_png_valid(self):
        cid = STATE.get("cert_id")
        assert cid
        r = requests.get(f"{API}/certificates/{cid}/image.png", timeout=90)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("image/png"), r.headers
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
        assert len(r.content) > 5000

    def test_09_png_bogus(self):
        r = requests.get(f"{API}/certificates/{uuid.uuid4().hex}/image.png", timeout=60)
        assert r.status_code == 404


    # ---------- Announcement bulk actions ----------
    def test_10_ann_create_and_archive(self, admin):
        ids = []
        for i in range(2):
            r = admin.post(f"{API}/announcements", json={
                "title": f"TEST_Bulk_{i}_{uuid.uuid4().hex[:5]}",
                "body": "test body",
                "broadcast": False,
            }, timeout=90)
            assert r.status_code in (200, 201), r.text[:300]
            aid = r.json()["item"]["id"]
            ids.append(aid)
            p = admin.patch(f"{API}/announcements/{aid}", json={"active": False}, timeout=30)
            assert p.status_code == 200, p.text[:300]
            assert p.json()["item"]["active"] is False
        STATE["ann_ids"] = ids

    def test_11_bulk_restore(self, admin):
        r = admin.post(f"{API}/announcements/bulk-restore",
                       json={"ids": STATE["ann_ids"]}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("restored") == 2
        for aid in STATE["ann_ids"]:
            g = admin.get(f"{API}/announcements?include_inactive=true", timeout=30)
            assert g.status_code == 200
        # verify persistence via patch-read
        for aid in STATE["ann_ids"]:
            p = admin.patch(f"{API}/announcements/{aid}", json={"active": False}, timeout=30)
            assert p.status_code == 200
            assert p.json()["item"]["active"] is False

    def test_12_bulk_delete(self, admin):
        r = admin.post(f"{API}/announcements/bulk-delete",
                       json={"ids": STATE["ann_ids"]}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("deleted") == 2
        p = admin.patch(f"{API}/announcements/{STATE['ann_ids'][0]}",
                        json={"active": True}, timeout=30)
        assert p.status_code == 404
        STATE["ann_ids"] = []

    def test_13_requires_admin(self):
        for path in ("bulk-delete", "bulk-restore"):
            r = requests.post(f"{API}/announcements/{path}", json={"ids": ["x"]}, timeout=30)
            assert r.status_code in (401, 403), f"{path} unauthenticated -> {r.status_code}"
