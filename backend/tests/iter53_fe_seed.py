"""Seed / clean two rsvp schedule rows for the FE retry-chip test (iteration 53)."""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

_fenv = dotenv_values("/app/frontend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or _fenv.get("REACT_APP_BACKEND_URL")).rstrip("/") + "/api"
_benv = dotenv_values("/app/backend/.env")
MARK = "TEST_iter53_fe"


def _h():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}, timeout=60)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json().get('token') or r.json().get('access_token')}"}


async def seed():
    h = _h()
    tr = requests.post(f"{API}/rsvp-templates", json={"name": f"{MARK}_tpl", "body": f"{MARK} body"},
                       headers=h, timeout=60)
    tr.raise_for_status()
    tid = tr.json()["item"]["id"]
    ev = requests.get(f"{API}/events", headers=h, timeout=60).json()
    items = ev if isinstance(ev, list) else ev.get("items", [])
    eid = items[0]["id"]
    now = datetime.now(timezone.utc)
    c = AsyncIOMotorClient(_benv["MONGO_URL"])
    d = c[_benv["DB_NAME"]]
    retry_id = f"{MARK}-retry-{uuid.uuid4().hex[:6]}"
    aband_id = f"{MARK}-aband-{uuid.uuid4().hex[:6]}"
    await d.rsvp_reminder_schedules.insert_many([
        {"id": retry_id, "template_id": tid, "event_id": eid, "minutes_before": 30,
         "include_maybe": False, "send_at": (now - timedelta(minutes=2)).isoformat(),
         "sent": False, "attempts": 2, "next_retry_at": (now + timedelta(minutes=45)).isoformat(),
         "last_error": "404: event not found", "created_at": now.isoformat(), "marker": MARK},
        {"id": aband_id, "template_id": tid, "event_id": eid, "minutes_before": 60,
         "include_maybe": False, "send_at": (now - timedelta(minutes=90)).isoformat(),
         "sent": True, "abandoned": True, "attempts": 3,
         "last_error": "404: template not found", "created_at": now.isoformat(), "marker": MARK},
    ])
    c.close()
    print("RETRY_ID=" + retry_id)
    print("ABANDONED_ID=" + aband_id)
    print("TPL_ID=" + tid)


async def clean():
    h = _h()
    c = AsyncIOMotorClient(_benv["MONGO_URL"])
    d = c[_benv["DB_NAME"]]
    r = await d.rsvp_reminder_schedules.delete_many({"marker": MARK})
    print("deleted schedules:", r.deleted_count)
    c.close()
    tl = requests.get(f"{API}/rsvp-templates", headers=h, timeout=60).json()
    for t in tl.get("items", tl if isinstance(tl, list) else []):
        if str(t.get("name", "")).startswith(MARK):
            print("delete tpl", t["id"], requests.delete(f"{API}/rsvp-templates/{t['id']}", headers=h, timeout=60).status_code)


asyncio.run(seed() if sys.argv[1] == "seed" else clean())
