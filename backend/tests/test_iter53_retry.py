"""iteration_53 — v135.40 scheduler exponential-backoff retry policy.

Under test: /app/backend/routes/rsvp_templates.py :: check_and_fire_due_schedules()
  BACKOFF_MINUTES=[1,5,15], MAX_ATTEMPTS=3, abandoned flag, next_retry_at gating.
Tests call the coroutine directly against the live Mongo (motor) instead of
waiting on the 60s loop.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, "/app/backend")
from routes.rsvp_templates import (  # noqa: E402
    BACKOFF_MINUTES,
    MAX_ATTEMPTS,
    check_and_fire_due_schedules,
)

_fenv = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _fenv.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
TIMEOUT = 60

_benv = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or _benv.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _benv.get("DB_NAME")

MARK = "TEST_iter53"


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def _now():
    return datetime.now(timezone.utc)


@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}, timeout=TIMEOUT)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text[:300]
    return {"Authorization": f"Bearer {tok}"}


def run_async(coro_fn):
    """Run an async test body with a fresh motor client + cleanup (no pytest-asyncio)."""
    async def _wrap():
        client = AsyncIOMotorClient(MONGO_URL)
        d = client[DB_NAME]
        try:
            return await coro_fn(d)
        finally:
            await d.rsvp_reminder_schedules.delete_many({"marker": MARK})
            client.close()
    return asyncio.run(_wrap())


async def _insert_sched(db, **over):
    doc = {
        "id": f"{MARK}-{uuid.uuid4().hex[:8]}",
        "template_id": "BOGUS_TEMPLATE_ID",
        "event_id": "BOGUS_EVENT_ID",
        "minutes_before": 30,
        "include_maybe": False,
        "send_at": _iso(_now() - timedelta(minutes=5)),
        "sent": False,
        "created_at": _iso(_now()),
        "marker": MARK,
    }
    doc.update(over)
    await db.rsvp_reminder_schedules.insert_one(doc)
    return doc["id"]


async def _get(db, sid):
    return await db.rsvp_reminder_schedules.find_one({"id": sid}, {"_id": 0})


# ---- retry trajectory: attempt1 -> 1min, attempt2 -> 5min, attempt3 -> abandoned
def test_retry_trajectory_1_5_abandoned():
    run_async(_test_retry_trajectory_1_5_abandoned)


async def _test_retry_trajectory_1_5_abandoned(db):
    assert BACKOFF_MINUTES == [1, 5, 15] and MAX_ATTEMPTS == 3
    sid = await _insert_sched(db)

    # cycle 1
    await check_and_fire_due_schedules(db)
    row = await _get(db, sid)
    assert row["attempts"] == 1, row
    assert row.get("sent") is not True
    assert row.get("abandoned") is not True
    assert row.get("last_error"), "last_error must be recorded"
    nr = datetime.fromisoformat(row["next_retry_at"])
    delta_min = (nr - _now()).total_seconds() / 60
    assert 0 < delta_min <= 1.2, f"expected ~1min backoff, got {delta_min}"

    # cycle 2 (force retry due)
    await db.rsvp_reminder_schedules.update_one(
        {"id": sid}, {"$set": {"next_retry_at": _iso(_now() - timedelta(seconds=5))}})
    await check_and_fire_due_schedules(db)
    row = await _get(db, sid)
    assert row["attempts"] == 2, row
    assert row.get("sent") is not True
    nr = datetime.fromisoformat(row["next_retry_at"])
    delta_min = (nr - _now()).total_seconds() / 60
    assert 4 < delta_min <= 5.2, f"expected ~5min backoff, got {delta_min}"

    # cycle 3 -> abandoned
    await db.rsvp_reminder_schedules.update_one(
        {"id": sid}, {"$set": {"next_retry_at": _iso(_now() - timedelta(seconds=5))}})
    await check_and_fire_due_schedules(db)
    row = await _get(db, sid)
    assert row["attempts"] == 3, row
    assert row["sent"] is True, "abandoned rows must be marked sent so they stop being picked"
    assert row["abandoned"] is True
    assert "next_retry_at" not in row
    assert row.get("last_error")


# ---- next_retry_at gating
def test_future_next_retry_is_skipped():
    run_async(_test_future_next_retry_is_skipped)


async def _test_future_next_retry_is_skipped(db):
    sid = await _insert_sched(db, attempts=1, next_retry_at=_iso(_now() + timedelta(minutes=30)),
                              last_error="prev failure")
    await check_and_fire_due_schedules(db)
    row = await _get(db, sid)
    assert row["attempts"] == 1, "row with future next_retry_at must be SKIPPED"
    assert row.get("sent") is not True


def test_null_next_retry_is_picked_up():
    run_async(_test_null_next_retry_is_picked_up)


async def _test_null_next_retry_is_picked_up(db):
    sid = await _insert_sched(db, next_retry_at=None)
    await check_and_fire_due_schedules(db)
    row = await _get(db, sid)
    assert row["attempts"] == 1, "next_retry_at=None + past send_at must be picked up"


def test_future_send_at_is_skipped():
    run_async(_test_future_send_at_is_skipped)


async def _test_future_send_at_is_skipped(db):
    sid = await _insert_sched(db, send_at=_iso(_now() + timedelta(hours=2)))
    await check_and_fire_due_schedules(db)
    row = await _get(db, sid)
    assert row.get("attempts") in (None, 0), "future send_at must not fire"


# ---- success path: attempts=1, next_retry_at unset
def test_success_path_sets_attempts_1_and_unsets_retry(admin_headers):
    run_async(lambda d: _test_success_path_sets_attempts_1_and_unsets_retry(d, admin_headers))


async def _test_success_path_sets_attempts_1_and_unsets_retry(db, admin_headers):
    tr = requests.post(f"{API}/rsvp-templates", json={"name": f"{MARK}_tpl", "body": f"{MARK} body"},
                       headers=admin_headers, timeout=TIMEOUT)
    assert tr.status_code in (200, 201), tr.text[:300]
    tid = tr.json()["item"]["id"]
    ev = requests.get(f"{API}/events", timeout=TIMEOUT)
    assert ev.status_code == 200, ev.text[:200]
    evs = ev.json() if isinstance(ev.json(), list) else ev.json().get("items", [])
    assert evs, "need at least one event in DB"
    eid = evs[0]["id"]
    try:
        sid = await _insert_sched(db, template_id=tid, event_id=eid)
        fired = await check_and_fire_due_schedules(db)
        assert fired >= 1
        row = await _get(db, sid)
        assert row["sent"] is True, row
        assert row["attempts"] == 1
        assert row.get("abandoned") is not True
        assert "next_retry_at" not in row
        assert row.get("fired_at")
        assert "target_count" in row
    finally:
        requests.delete(f"{API}/rsvp-templates/{tid}", headers=admin_headers, timeout=TIMEOUT)


# ---- API surface exposes the new fields
def test_list_schedules_exposes_retry_fields(admin_headers):
    run_async(lambda d: _test_list_schedules_exposes_retry_fields(d, admin_headers))


async def _test_list_schedules_exposes_retry_fields(db, admin_headers):
    sid = await _insert_sched(db, attempts=2, next_retry_at=_iso(_now() + timedelta(minutes=10)),
                              last_error="boom")
    r = requests.get(f"{API}/rsvp-schedules?include_sent=true", headers=admin_headers, timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    items = r.json()["items"]
    row = next((x for x in items if x["id"] == sid), None)
    assert row, "inserted schedule missing from list"
    assert row["attempts"] == 2
    assert row["last_error"] == "boom"
    assert row.get("next_retry_at")
    assert "_id" not in row


# ---- v135.40 "Şablondan Seri": POST /events must honour recurrence_* (BUG)
def test_post_events_recurrence_spawns_series(admin_headers):
    """FE TemplateSeriesModal POSTs recurrence_interval+recurrence_count.
    EventCreate does not declare these fields, so Pydantic drops them and only
    ONE event is created (recurrence_created=1)."""
    body = {
        "name": f"{MARK}_series", "date": "2027-07-01T20:00:00.000Z", "multiplier": 1,
        "alliance_scope": "GOW", "recurrence_interval": "weekly", "recurrence_count": 4,
    }
    r = requests.post(f"{API}/events", json=body, headers=admin_headers, timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    ev = requests.get(f"{API}/events", headers=admin_headers, timeout=TIMEOUT).json()
    items = ev if isinstance(ev, list) else ev.get("items", [])
    mine = [e for e in items if e.get("name") == body["name"]]
    try:
        assert data.get("recurrence_created") == 4, f"recurrence_created={data.get('recurrence_created')}"
        assert len(mine) == 4, f"only {len(mine)} events created: {[e['date'] for e in mine]}"
        assert data.get("series_id"), "series_id not stamped"
    finally:
        for e in mine:
            requests.delete(f"{API}/events/{e['id']}", headers=admin_headers, timeout=TIMEOUT)
