"""iteration_51 — RSVP template targeting fix verification.

Under test: POST /api/rsvp-templates/{id}/send in /app/backend/routes/rsvp_templates.py
  - alliance-scoped event targeting via users->members join
  - alliance_scope 'all'/'' == no filter
  - send_count/last_sent_at only bumped when target_count > 0
  - opt-out via notification_prefs.reminder == False
"""
import os
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 60


@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}, timeout=TIMEOUT)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text[:300]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def created():
    ids = []
    yield ids


@pytest.fixture(scope="module", autouse=True)
def cleanup(created, admin_headers):
    yield
    for tid in created:
        requests.delete(f"{API}/rsvp-templates/{tid}", headers=admin_headers, timeout=TIMEOUT)


def _mk_tpl(admin_headers, created, name):
    r = requests.post(f"{API}/rsvp-templates", json={"name": name, "body": "TEST hatirlatma"},
                      headers=admin_headers, timeout=TIMEOUT)
    assert r.status_code in (200, 201), r.text[:300]
    tid = r.json()["item"]["id"]
    created.append(tid)
    return tid


def _row(admin_headers, tid):
    items = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
    return next(x for x in items if x["id"] == tid)


def _events(admin_headers):
    ev = requests.get(f"{API}/events", headers=admin_headers, timeout=TIMEOUT).json()
    if isinstance(ev, dict):
        ev = ev.get("items") or ev.get("events") or []
    return ev


class TestScopedTargeting:
    def test_gow_scoped_event_targets_members(self, admin_headers, created):
        events = _events(admin_headers)
        scoped = [e for e in events if (e.get("alliance_scope") or "").strip().lower() not in ("", "all")]
        if not scoped:
            pytest.skip("no alliance-scoped event available")
        ev = scoped[0]
        tid = _mk_tpl(admin_headers, created, "TEST_iter51_scope")
        r = requests.post(f"{API}/rsvp-templates/{tid}/send",
                          json={"event_id": ev["id"], "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        print(f"scoped event {ev.get('name')!r} scope={ev.get('alliance_scope')!r} -> {d}")
        assert d["target_count"] > 0, d
        # send_count bumped since targets existed
        row = _row(admin_headers, tid)
        assert row["send_count"] == 1, row
        assert row["last_sent_at"], row

    def test_unscoped_event_targets_at_least_scoped(self, admin_headers, created):
        events = _events(admin_headers)
        scoped = [e for e in events if (e.get("alliance_scope") or "").strip().lower() not in ("", "all")]
        unscoped = [e for e in events if (e.get("alliance_scope") or "").strip().lower() in ("", "all")]
        if not scoped or not unscoped:
            pytest.skip("need both scoped and unscoped events")
        tid = _mk_tpl(admin_headers, created, "TEST_iter51_both")
        s = requests.post(f"{API}/rsvp-templates/{tid}/send",
                          json={"event_id": scoped[0]["id"], "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT).json()
        u = requests.post(f"{API}/rsvp-templates/{tid}/send",
                          json={"event_id": unscoped[0]["id"], "include_maybe": False},
                          headers=admin_headers, timeout=TIMEOUT).json()
        print(f"scoped={s['target_count']} unscoped={u['target_count']}")
        assert u["target_count"] >= s["target_count"], (s, u)
        assert u["target_count"] > 0

    def test_scope_all_is_no_filter(self, admin_headers, created):
        """Create an event with alliance_scope='all' and confirm it targets everyone."""
        ev_payload = {"name": "TEST_iter51_all_event", "date": "2030-01-01",
                      "alliance_scope": "all"}
        c = requests.post(f"{API}/events", json=ev_payload, headers=admin_headers, timeout=TIMEOUT)
        if c.status_code not in (200, 201):
            pytest.skip(f"cannot create event: {c.status_code} {c.text[:200]}")
        ev = c.json()
        ev = ev.get("item", ev) if isinstance(ev, dict) else ev
        eid = ev.get("id")
        try:
            tid = _mk_tpl(admin_headers, created, "TEST_iter51_all")
            r = requests.post(f"{API}/rsvp-templates/{tid}/send",
                              json={"event_id": eid, "include_maybe": False},
                              headers=admin_headers, timeout=TIMEOUT)
            assert r.status_code == 200, r.text[:300]
            all_count = r.json()["target_count"]
            print(f"scope='all' target_count={all_count}")
            assert all_count > 0, r.json()
            # compare with a genuinely scoped event -> all >= scoped
            scoped = [e for e in _events(admin_headers)
                      if (e.get("alliance_scope") or "").strip().lower() not in ("", "all")]
            if scoped:
                s = requests.post(f"{API}/rsvp-templates/{tid}/send",
                                  json={"event_id": scoped[0]["id"], "include_maybe": False},
                                  headers=admin_headers, timeout=TIMEOUT).json()
                assert all_count >= s["target_count"], (all_count, s)
        finally:
            requests.delete(f"{API}/events/{eid}", headers=admin_headers, timeout=TIMEOUT)

    def test_send_count_not_bumped_when_zero_targets(self, admin_headers, created):
        """Event scoped to a non-existent alliance -> 0 targets -> no send_count bump."""
        c = requests.post(f"{API}/events",
                          json={"name": "TEST_iter51_noalliance", "date": "2030-01-02",
                                "alliance_scope": "ZZZ_NO_SUCH_ALLIANCE"},
                          headers=admin_headers, timeout=TIMEOUT)
        if c.status_code not in (200, 201):
            pytest.skip(f"cannot create event: {c.status_code} {c.text[:200]}")
        ev = c.json()
        ev = ev.get("item", ev) if isinstance(ev, dict) else ev
        eid = ev.get("id")
        try:
            tid = _mk_tpl(admin_headers, created, "TEST_iter51_zero")
            r = requests.post(f"{API}/rsvp-templates/{tid}/send",
                              json={"event_id": eid, "include_maybe": False},
                              headers=admin_headers, timeout=TIMEOUT)
            assert r.status_code == 200, r.text[:300]
            assert r.json()["target_count"] == 0, r.json()
            row = _row(admin_headers, tid)
            assert row["send_count"] == 0, f"send_count bumped on 0 targets: {row}"
            assert row["last_sent_at"] is None, f"last_sent_at stamped on 0 targets: {row}"
        finally:
            requests.delete(f"{API}/events/{eid}", headers=admin_headers, timeout=TIMEOUT)


class TestOptOut:
    def test_reminder_optout_excluded(self, admin_headers, created):
        """Set notification_prefs.reminder=False for admin, confirm target_count drops by 1."""
        events = _events(admin_headers)
        unscoped = [e for e in events if (e.get("alliance_scope") or "").strip().lower() in ("", "all")]
        if not unscoped:
            pytest.skip("no unscoped event")
        eid = unscoped[0]["id"]
        tid = _mk_tpl(admin_headers, created, "TEST_iter51_optout")

        base = requests.post(f"{API}/rsvp-templates/{tid}/send",
                             json={"event_id": eid, "include_maybe": False},
                             headers=admin_headers, timeout=TIMEOUT).json()["target_count"]

        prefs_url = f"{API}/auth/me/notification-prefs"
        orig = requests.get(prefs_url, headers=admin_headers, timeout=TIMEOUT)
        assert orig.status_code == 200, orig.text[:200]
        orig_prefs = orig.json()

        off = dict(orig_prefs)
        off["reminder"] = False
        w = requests.put(prefs_url, json=off, headers=admin_headers, timeout=TIMEOUT)
        assert w.status_code == 200, w.text[:200]
        assert w.json()["prefs"]["reminder"] is False

        try:
            after = requests.post(f"{API}/rsvp-templates/{tid}/send",
                                  json={"event_id": eid, "include_maybe": False},
                                  headers=admin_headers, timeout=TIMEOUT).json()["target_count"]
            print(f"optout: base={base} after={after}")
            assert after == base - 1, f"opt-out not honoured: base={base} after={after}"
        finally:
            requests.put(prefs_url, json=orig_prefs, headers=admin_headers, timeout=TIMEOUT)
            restored = requests.get(prefs_url, headers=admin_headers, timeout=TIMEOUT).json()
            assert restored.get("reminder") is orig_prefs.get("reminder")
