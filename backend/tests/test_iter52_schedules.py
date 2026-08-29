"""iteration_52 — v135.39 RSVP test-send + rsvp-schedules CRUD + scheduler fire.

Under test: /app/backend/routes/rsvp_templates.py
  - POST /api/rsvp-templates/{tid}/test-send
  - POST/GET/DELETE /api/rsvp-schedules
  - check_and_fire_due_schedules() via the 60s background loop
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 60

_benv = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _benv.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _benv.get("DB_NAME")


@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}, timeout=TIMEOUT)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text[:300]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def created_tpls():
    return []


@pytest.fixture(scope="module")
def created_scheds():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(created_tpls, created_scheds, admin_headers):
    yield
    for sid in created_scheds:
        requests.delete(f"{API}/rsvp-schedules/{sid}", headers=admin_headers, timeout=TIMEOUT)
    for tid in created_tpls:
        requests.delete(f"{API}/rsvp-templates/{tid}", headers=admin_headers, timeout=TIMEOUT)


def _mk_tpl(admin_headers, created_tpls, name):
    r = requests.post(f"{API}/rsvp-templates", json={"name": name, "body": "TEST_iter52 hatirlatma"},
                      headers=admin_headers, timeout=TIMEOUT)
    assert r.status_code in (200, 201), r.text[:300]
    tid = r.json()["item"]["id"]
    created_tpls.append(tid)
    return tid


def _events(admin_headers):
    ev = requests.get(f"{API}/events", headers=admin_headers, timeout=TIMEOUT).json()
    if isinstance(ev, dict):
        ev = ev.get("items") or ev.get("events") or []
    return ev


def _tpl_row(admin_headers, tid):
    items = requests.get(f"{API}/rsvp-templates", headers=admin_headers, timeout=TIMEOUT).json()["items"]
    return next(x for x in items if x["id"] == tid)


# ---------------- test-send ----------------
class TestTestSend:
    def test_empty_body_targets_admin(self, admin_headers, created_tpls):
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_testsend")
        r = requests.post(f"{API}/rsvp-templates/{tid}/test-send", json={},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        print("test-send(self):", d)
        assert d["ok"] is True
        assert d["recipient"] == "admin", d
        for k in ("has_push_subscription", "has_telegram_chat", "push_sent",
                  "telegram_sent", "channels"):
            assert k in d, f"missing {k}: {d}"
        assert isinstance(d["channels"], list) and d["channels"]
        assert isinstance(d["has_push_subscription"], bool)
        assert isinstance(d["has_telegram_chat"], bool)

    def test_no_body_at_all(self, admin_headers, created_tpls):
        """Client may POST with no JSON body at all."""
        tid = created_tpls[0] if created_tpls else _mk_tpl(admin_headers, created_tpls, "TEST_iter52_nb")
        r = requests.post(f"{API}/rsvp-templates/{tid}/test-send",
                          headers=admin_headers, timeout=TIMEOUT)
        print("test-send(no body) status:", r.status_code, r.text[:200])
        assert r.status_code == 200, f"no-body POST rejected: {r.status_code} {r.text[:300]}"

    def test_explicit_other_user(self, admin_headers, created_tpls):
        from pymongo import MongoClient
        cli = MongoClient(MONGO_URL)
        try:
            others = list(cli[DB_NAME].users.find(
                {"username": {"$ne": "admin"}}, {"_id": 0, "id": 1, "username": 1}).limit(1))
        finally:
            cli.close()
        if not others:
            pytest.skip("no other user")
        other = others[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_ts_other")
        r = requests.post(f"{API}/rsvp-templates/{tid}/test-send",
                          json={"user_id": other["id"]}, headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        print("test-send(other):", d)
        assert d["recipient"] == other["username"], d

    def test_bogus_tid_404(self, admin_headers):
        r = requests.post(f"{API}/rsvp-templates/{uuid.uuid4()}/test-send", json={},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"

    def test_bogus_user_404(self, admin_headers, created_tpls):
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_ts_bogus")
        r = requests.post(f"{API}/rsvp-templates/{tid}/test-send",
                          json={"user_id": str(uuid.uuid4())}, headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"

    def test_unauth_401(self, created_tpls):
        tid = created_tpls[0] if created_tpls else "x"
        r = requests.post(f"{API}/rsvp-templates/{tid}/test-send", json={}, timeout=TIMEOUT)
        assert r.status_code in (401, 403), r.status_code

    def test_test_send_does_not_bump_send_count(self, admin_headers, created_tpls):
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_ts_count")
        before = _tpl_row(admin_headers, tid)["send_count"]
        requests.post(f"{API}/rsvp-templates/{tid}/test-send", json={},
                      headers=admin_headers, timeout=TIMEOUT)
        after = _tpl_row(admin_headers, tid)["send_count"]
        assert after == before, f"test-send bumped send_count {before}->{after}"


# ---------------- schedules CRUD ----------------
class TestSchedulesCrud:
    def test_create_computes_send_at(self, admin_headers, created_tpls, created_scheds):
        events = _events(admin_headers)
        assert events, "no events in env"
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_sched")
        r = requests.post(f"{API}/rsvp-schedules",
                          json={"template_id": tid, "event_id": ev["id"], "minutes_before": 60},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:400]
        item = r.json()["item"]
        created_scheds.append(item["id"])
        assert item["minutes_before"] == 60
        assert item["sent"] is False
        assert "_id" not in item
        ev_raw = ev.get("date")
        s = ev_raw.replace("Z", "+00:00")
        ev_dt = datetime.fromisoformat(s)
        if ev_dt.tzinfo is None:
            ev_dt = ev_dt.replace(tzinfo=timezone.utc)
        expected = (ev_dt - timedelta(minutes=60)).astimezone(timezone.utc)
        got = datetime.fromisoformat(item["send_at"])
        print(f"event.date={ev_raw} send_at={item['send_at']}")
        assert abs((got - expected).total_seconds()) < 2, (got, expected)

    @pytest.mark.parametrize("mb", [15, 30, 60, 120, 180, 360, 720, 1440])
    def test_all_allowed_minutes(self, admin_headers, created_tpls, created_scheds, mb):
        events = _events(admin_headers)
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, f"TEST_iter52_mb_{mb}")
        r = requests.post(f"{API}/rsvp-schedules",
                          json={"template_id": tid, "event_id": ev["id"], "minutes_before": mb},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 200, r.text[:300]
        created_scheds.append(r.json()["item"]["id"])

    @pytest.mark.parametrize("mb", [0, 7, 45, -60, 99999])
    def test_invalid_minutes_400(self, admin_headers, created_tpls, mb):
        events = _events(admin_headers)
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, f"TEST_iter52_bad_{mb}")
        r = requests.post(f"{API}/rsvp-schedules",
                          json={"template_id": tid, "event_id": ev["id"], "minutes_before": mb},
                          headers=admin_headers, timeout=TIMEOUT)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_bogus_ids_404(self, admin_headers, created_tpls):
        events = _events(admin_headers)
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_bogus_ids")
        r1 = requests.post(f"{API}/rsvp-schedules",
                           json={"template_id": str(uuid.uuid4()), "event_id": ev["id"], "minutes_before": 60},
                           headers=admin_headers, timeout=TIMEOUT)
        assert r1.status_code == 404, r1.status_code
        r2 = requests.post(f"{API}/rsvp-schedules",
                           json={"template_id": tid, "event_id": str(uuid.uuid4()), "minutes_before": 60},
                           headers=admin_headers, timeout=TIMEOUT)
        assert r2.status_code == 404, r2.status_code

    def test_unauth_401(self):
        assert requests.get(f"{API}/rsvp-schedules", timeout=TIMEOUT).status_code in (401, 403)
        assert requests.post(f"{API}/rsvp-schedules", json={"template_id": "a", "event_id": "b",
                                                            "minutes_before": 60},
                             timeout=TIMEOUT).status_code in (401, 403)

    def test_list_joins_and_delete(self, admin_headers, created_tpls, created_scheds):
        events = _events(admin_headers)
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_join")
        c = requests.post(f"{API}/rsvp-schedules",
                          json={"template_id": tid, "event_id": ev["id"], "minutes_before": 30},
                          headers=admin_headers, timeout=TIMEOUT)
        sid = c.json()["item"]["id"]

        lst = requests.get(f"{API}/rsvp-schedules", headers=admin_headers, timeout=TIMEOUT)
        assert lst.status_code == 200, lst.text[:200]
        row = next((x for x in lst.json()["items"] if x["id"] == sid), None)
        assert row, "created schedule missing from list"
        assert row["template_name"] == "TEST_iter52_join", row
        assert row["event_name"] == ev.get("name"), row
        assert row["event_date"] == ev.get("date"), row
        assert "_id" not in row

        d = requests.delete(f"{API}/rsvp-schedules/{sid}", headers=admin_headers, timeout=TIMEOUT)
        assert d.status_code == 200, d.text[:200]
        again = requests.get(f"{API}/rsvp-schedules", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert not any(x["id"] == sid for x in again), "schedule not deleted"
        assert requests.delete(f"{API}/rsvp-schedules/{sid}", headers=admin_headers,
                               timeout=TIMEOUT).status_code == 404

    def test_include_sent_false_filter(self, admin_headers, created_tpls, created_scheds):
        """Mark one schedule sent=true directly in Mongo, then verify the filter."""
        from pymongo import MongoClient
        events = _events(admin_headers)
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_incsent")
        sid = requests.post(f"{API}/rsvp-schedules",
                            json={"template_id": tid, "event_id": ev["id"], "minutes_before": 120},
                            headers=admin_headers, timeout=TIMEOUT).json()["item"]["id"]
        created_scheds.append(sid)
        cli = MongoClient(MONGO_URL)
        try:
            cli[DB_NAME].rsvp_reminder_schedules.update_one({"id": sid}, {"$set": {"sent": True}})
            with_sent = requests.get(f"{API}/rsvp-schedules?include_sent=true",
                                     headers=admin_headers, timeout=TIMEOUT).json()["items"]
            without = requests.get(f"{API}/rsvp-schedules?include_sent=false",
                                   headers=admin_headers, timeout=TIMEOUT).json()["items"]
            assert any(x["id"] == sid for x in with_sent), "sent row missing with include_sent=true"
            assert not any(x["id"] == sid for x in without), "sent row leaked with include_sent=false"
        finally:
            cli.close()

    def test_delete_template_cascades_schedules(self, admin_headers, created_tpls):
        events = _events(admin_headers)
        ev = events[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_cascade")
        sid = requests.post(f"{API}/rsvp-schedules",
                            json={"template_id": tid, "event_id": ev["id"], "minutes_before": 15},
                            headers=admin_headers, timeout=TIMEOUT).json()["item"]["id"]
        assert requests.delete(f"{API}/rsvp-templates/{tid}", headers=admin_headers,
                               timeout=TIMEOUT).status_code == 200
        rows = requests.get(f"{API}/rsvp-schedules", headers=admin_headers, timeout=TIMEOUT).json()["items"]
        assert not any(x["id"] == sid for x in rows), "schedule not cascaded on template delete"


# ---------------- scheduler fire loop ----------------
class TestSchedulerFire:
    def test_due_schedule_fires(self, admin_headers, created_tpls):
        """Insert an overdue schedule straight into Mongo and wait for the 60s loop."""
        from pymongo import MongoClient
        events = _events(admin_headers)
        unscoped = [e for e in events if (e.get("alliance_scope") or "").strip().lower() in ("", "all")]
        ev = (unscoped or events)[0]
        tid = _mk_tpl(admin_headers, created_tpls, "TEST_iter52_fire")
        send_count_before = _tpl_row(admin_headers, tid)["send_count"]

        sid = str(uuid.uuid4())
        doc = {
            "id": sid,
            "template_id": tid,
            "event_id": ev["id"],
            "minutes_before": 60,
            "include_maybe": False,
            "send_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
            "sent": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        cli = MongoClient(MONGO_URL)
        col = cli[DB_NAME].rsvp_reminder_schedules
        col.insert_one(dict(doc))
        try:
            fired = None
            deadline = time.time() + 100
            while time.time() < deadline:
                time.sleep(5)
                row = col.find_one({"id": sid}, {"_id": 0})
                if row and row.get("sent") is True:
                    fired = row
                    break
            assert fired, "schedule never fired within 100s (loop not running?)"
            print("fired row:", fired)
            assert fired.get("fired_at"), fired
            assert "target_count" in fired, fired
            after = _tpl_row(admin_headers, tid)["send_count"]
            if fired.get("target_count", 0) > 0:
                assert after == send_count_before + 1, (send_count_before, after, fired)
            else:
                assert after == send_count_before
        finally:
            col.delete_one({"id": sid})
            cli.close()
