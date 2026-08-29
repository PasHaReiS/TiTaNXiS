"""v135.38 — Unified template system tests.

Modules under test:
  - /api/rsvp-templates  (NEW: CRUD + archive + /send)
  - /api/event-templates (full PATCH + archive filter)
  - /api/telegram-templates (archived default filter + PATCH archived)
"""
import os
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 45


@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}, timeout=TIMEOUT)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text[:300]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def created():
    """Track ids for cleanup: list of (collection_path, id)."""
    ids = []
    yield ids


@pytest.fixture(scope="module", autouse=True)
def cleanup(created, admin_headers):
    yield
    for path, tid in created:
        requests.delete(f"{API}/{path}/{tid}", headers=admin_headers, timeout=TIMEOUT)


# ------------------------------ RSVP templates ------------------------------
class TestRsvpTemplatesCrud:
    def test_unauth_401(self):
        r = requests.get(f"{API}/rsvp-templates", timeout=TIMEOUT)
        assert r.status_code in (401, 403), r.status_code

    def test_create_and_list(self, admin_headers, created):
        payload = {"name": "TEST_rsvp_tpl", "body": "TEST body içeriği", "channels": ["push", "telegram_dm"]}
        r = requests.post(f"{API}/rsvp-templates", json=payload, headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code in (200, 201), r.text[:400]
        item = r.json()["item"]
        created.append(("rsvp-templates", item["id"]))
        assert item["name"] == "TEST_rsvp_tpl"
        assert item["body"] == "TEST body içeriği"
        assert item["channels"] == ["push", "telegram_dm"]
        assert item["archived"] is False
        assert item["send_count"] == 0
        assert item["last_sent_at"] is None
        assert isinstance(item["id"], str)

        g = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT)
        assert g.status_code == 200
        ids = [x["id"] for x in g.json()["items"]]
        assert item["id"] in ids

    def test_channels_default_when_empty(self, admin_headers, created):
        r = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_ch", "body": "x"},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code in (200, 201), r.text[:300]
        item = r.json()["item"]
        created.append(("rsvp-templates", item["id"]))
        assert sorted(item["channels"]) == ["push", "telegram_dm"]

    def test_patch_fields_persist(self, admin_headers, created):
        r = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_patch", "body": "old"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = r.json()["item"]["id"]
        created.append(("rsvp-templates", tid))
        p = requests.patch(f"{API}/rsvp-templates/{tid}",
                           json={"name": "TEST_rsvp_patched", "body": "new body", "channels": ["push"]},
                           headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 200, p.text[:300]
        assert p.json()["item"]["name"] == "TEST_rsvp_patched"
        assert p.json()["item"]["channels"] == ["push"]
        # GET verify persistence
        items = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        row = next(x for x in items if x["id"] == tid)
        assert row["name"] == "TEST_rsvp_patched"
        assert row["body"] == "new body"
        assert row["channels"] == ["push"]

    def test_patch_empty_name_rejected(self, admin_headers, created):
        r = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_empty", "body": "b"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = r.json()["item"]["id"]
        created.append(("rsvp-templates", tid))
        p = requests.patch(f"{API}/rsvp-templates/{tid}", json={"name": "   "},
                           headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 400, p.status_code

    def test_archive_and_restore(self, admin_headers, created):
        r = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_arch", "body": "b"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = r.json()["item"]["id"]
        created.append(("rsvp-templates", tid))
        p = requests.patch(f"{API}/rsvp-templates/{tid}", json={"archived": True},
                           headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 200 and p.json()["item"]["archived"] is True
        active = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid not in [x["id"] for x in active]
        arch = requests.get(f"{API}/rsvp-templates?archived=true", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in arch]
        assert all(x.get("archived") is True for x in arch)
        # restore
        requests.patch(f"{API}/rsvp-templates/{tid}", json={"archived": False},
                       headers=admin_headers, timeout=TIMEOUT)
        active = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in active]

    def test_delete_removes(self, admin_headers):
        r = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_del", "body": "b"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = r.json()["item"]["id"]
        d = requests.delete(f"{API}/rsvp-templates/{tid}", headers=admin_headers, timeout=TIMEOUT)
        assert d.status_code == 200, d.text[:200]
        items = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid not in [x["id"] for x in items]
        assert requests.delete(f"{API}/rsvp-templates/{tid}", headers=admin_headers, timeout=TIMEOUT).status_code == 404
        assert requests.patch(f"{API}/rsvp-templates/{tid}", json={"name": "x"},
                              headers=admin_headers, timeout=TIMEOUT).status_code == 404


class TestRsvpTemplateSend:
    def test_bogus_template_404(self, admin_headers):
        r = requests.post(f"{API}/rsvp-templates/does-not-exist/send",
                          json={"event_id": "nope", "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 404, r.status_code

    def test_bogus_event_404(self, admin_headers, created):
        c = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_send404", "body": "b"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = c.json()["item"]["id"]
        created.append(("rsvp-templates", tid))
        r = requests.post(f"{API}/rsvp-templates/{tid}/send",
                          json={"event_id": "bogus-event-id", "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 404, f"{r.status_code} {r.text[:300]}"

    def test_send_real_event(self, admin_headers, created):
        events = requests.get(f"{API}/events", headers=admin_headers, timeout=TIMEOUT).json()
        if isinstance(events, dict):
            events = events.get("items") or events.get("events") or []
        if not events:
            pytest.skip("no events available")
        ev = events[0]
        c = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_send", "body": "hatırlatma"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = c.json()["item"]["id"]
        created.append(("rsvp-templates", tid))
        r = requests.post(f"{API}/rsvp-templates/{tid}/send",
                          json={"event_id": ev["id"], "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        d = r.json()
        for k in ("target_count", "push_sent", "push_failed", "telegram_sent", "telegram_failed"):
            assert k in d, d
            assert isinstance(d[k], int)
        # send_count incremented + last_sent_at stamped
        items = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        row = next(x for x in items if x["id"] == tid)
        assert row["send_count"] == 1, row
        assert row["last_sent_at"], row

        # include_maybe=True should target >= the default set
        r2 = requests.post(f"{API}/rsvp-templates/{tid}/send",
                           json={"event_id": ev["id"], "include_maybe": True},
                           headers=admin_headers, timeout=TIMEOUT)
        assert r2.status_code == 200, r2.text[:300]
        assert r2.json()["target_count"] >= d["target_count"]
        items = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert next(x for x in items if x["id"] == tid)["send_count"] == 2

    def test_alliance_scoped_event_targets_members(self, admin_headers, created):
        """BUG REPRO: alliance-scoped events must target users whose LINKED
        MEMBERS are in that alliance (users collection has no `alliance_name`).
        """
        events = requests.get(f"{API}/events", headers=admin_headers, timeout=TIMEOUT).json()
        if isinstance(events, dict):
            events = events.get("items") or []
        scoped = [e for e in events if (e.get("alliance_scope") or "").strip()]
        if not scoped:
            pytest.skip("no alliance-scoped event available")
        ev = scoped[0]
        c = requests.post(f"{API}/rsvp-templates", json={"name": "TEST_rsvp_scope", "body": "b"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = c.json()["item"]["id"]
        created.append(("rsvp-templates", tid))
        r = requests.post(f"{API}/rsvp-templates/{tid}/send",
                          json={"event_id": ev["id"], "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        # Zero RSVPs exist in this DB, so every scoped member should be a target.
        assert r.json()["target_count"] > 0, (
            f"alliance-scoped event {ev['name']!r} (scope={ev.get('alliance_scope')!r}) "
            f"targeted 0 users: {r.json()}"
        )


# ----------------------------- Event templates -----------------------------
class TestEventTemplates:
    def test_unauth_401(self):
        r = requests.get(f"{API}/event-templates", timeout=TIMEOUT)
        assert r.status_code in (401, 403), r.status_code

    def test_full_patch(self, admin_headers, created):
        c = requests.post(f"{API}/event-templates",
                          json={"template_name": "TEST_ev_tpl", "name": "TEST Etkinlik"},
                          headers=admin_headers, timeout=TIMEOUT)
        assert c.status_code in (200, 201), c.text[:400]
        tid = c.json()["id"]
        created.append(("event-templates", tid))
        payload = {
            "template_name": "TEST_ev_tpl_v2", "name": "TEST Etkinlik 2",
            "group_name": "SvS vs 99999", "multiplier": 2.5,
            "subtitle": "alt başlık", "banner_url": "https://example.com/b.png",
            "reminder_enabled": False, "attendance_enabled": False,
            "hidden_from_leaderboard": True, "show_breakdown": False,
        }
        p = requests.patch(f"{API}/event-templates/{tid}", json=payload, headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 200, p.text[:400]
        got = p.json()
        for k, v in payload.items():
            assert got[k] == v, f"{k}: {got.get(k)} != {v}"
        # GET verify persistence
        items = requests.get(f"{API}/event-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        row = next(x for x in items if x["id"] == tid)
        for k, v in payload.items():
            assert row[k] == v, f"persist {k}: {row.get(k)} != {v}"

    def test_empty_name_rejected(self, admin_headers, created):
        c = requests.post(f"{API}/event-templates",
                          json={"template_name": "TEST_ev_empty", "name": "n"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = c.json()["id"]
        created.append(("event-templates", tid))
        assert requests.patch(f"{API}/event-templates/{tid}", json={"template_name": "  "},
                              headers=admin_headers, timeout=TIMEOUT).status_code == 400
        assert requests.patch(f"{API}/event-templates/{tid}", json={"name": ""},
                              headers=admin_headers, timeout=TIMEOUT).status_code == 400
        assert requests.post(f"{API}/event-templates", json={"template_name": "", "name": ""},
                             headers=admin_headers, timeout=TIMEOUT).status_code == 400

    def test_archive_filter(self, admin_headers, created):
        c = requests.post(f"{API}/event-templates",
                          json={"template_name": "TEST_ev_arch", "name": "arch"},
                          headers=admin_headers, timeout=TIMEOUT)
        tid = c.json()["id"]
        created.append(("event-templates", tid))
        p = requests.patch(f"{API}/event-templates/{tid}", json={"archived": True},
                           headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 200 and p.json()["archived"] is True
        active = requests.get(f"{API}/event-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid not in [x["id"] for x in active]
        arch = requests.get(f"{API}/event-templates?archived=true", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in arch]
        assert all(x.get("archived") is True for x in arch)
        requests.patch(f"{API}/event-templates/{tid}", json={"archived": False},
                       headers=admin_headers, timeout=TIMEOUT)
        active = requests.get(f"{API}/event-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in active]

    def test_delete_404_on_bogus(self, admin_headers):
        assert requests.delete(f"{API}/event-templates/bogus-id", headers=admin_headers,
                               timeout=TIMEOUT).status_code == 404
        assert requests.patch(f"{API}/event-templates/bogus-id", json={"name": "x"},
                              headers=admin_headers, timeout=TIMEOUT).status_code == 404


# ---------------------------- Telegram templates ----------------------------
class TestTelegramTemplates:
    def test_unauth_401(self):
        r = requests.get(f"{API}/telegram-templates", timeout=TIMEOUT)
        assert r.status_code in (401, 403), r.status_code

    def test_archive_flow(self, admin_headers, created):
        c = requests.post(f"{API}/telegram-templates",
                          json={"name": "TEST_tg_tpl", "body": "TEST mesaj", "category": "duyuru"},
                          headers=admin_headers, timeout=TIMEOUT)
        assert c.status_code in (200, 201), c.text[:400]
        body = c.json()
        item = body.get("item", body)
        tid = item["id"]
        created.append(("telegram-templates", tid))
        assert item["category"] == "duyuru"

        active = requests.get(f"{API}/telegram-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in active]

        p = requests.patch(f"{API}/telegram-templates/{tid}", json={"archived": True},
                           headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 200, p.text[:300]
        active = requests.get(f"{API}/telegram-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid not in [x["id"] for x in active]
        arch = requests.get(f"{API}/telegram-templates?archived=true", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in arch]
        assert all(x.get("archived") is True for x in arch)

        requests.patch(f"{API}/telegram-templates/{tid}", json={"archived": False},
                       headers=admin_headers, timeout=TIMEOUT)
        active = requests.get(f"{API}/telegram-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert tid in [x["id"] for x in active]

    def test_patch_name_body_category(self, admin_headers, created):
        c = requests.post(f"{API}/telegram-templates",
                          json={"name": "TEST_tg_patch", "body": "old", "category": "diger"},
                          headers=admin_headers, timeout=TIMEOUT)
        item = c.json().get("item", c.json())
        tid = item["id"]
        created.append(("telegram-templates", tid))
        p = requests.patch(f"{API}/telegram-templates/{tid}",
                           json={"name": "TEST_tg_patched", "body": "new", "category": "savas_cagrisi"},
                           headers=admin_headers, timeout=TIMEOUT)
        assert p.status_code == 200, p.text[:300]
        items = requests.get(f"{API}/telegram-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        row = next(x for x in items if x["id"] == tid)
        assert row["name"] == "TEST_tg_patched"
        assert row["body"] == "new"
        assert row["category"] == "savas_cagrisi"
