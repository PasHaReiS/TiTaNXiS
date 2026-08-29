"""Helper: snapshot event ids before FE series test / cleanup newly created ones after."""
import json
import os
import sys

import requests
from dotenv import dotenv_values

_fenv = dotenv_values("/app/frontend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or _fenv.get("REACT_APP_BACKEND_URL")).rstrip("/") + "/api"
SNAP = "/tmp/iter53_events_before.json"


def _headers():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}, timeout=60)
    r.raise_for_status()
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


def _ids(h):
    r = requests.get(f"{API}/events", headers=h, timeout=60)
    r.raise_for_status()
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    return [e["id"] for e in items], items


def main():
    mode = sys.argv[1]
    h = _headers()
    ids, items = _ids(h)
    if mode == "before":
        json.dump(ids, open(SNAP, "w"))
        print(f"snapshot {len(ids)} events")
    else:
        before = set(json.load(open(SNAP)))
        new = [e for e in items if e["id"] not in before]
        print(f"new events: {len(new)}")
        for e in new:
            print("  ", e["id"], e.get("name"), e.get("date"))
        for e in new:
            rr = requests.delete(f"{API}/events/{e['id']}", headers=h, timeout=60)
            print("  delete", e["id"], rr.status_code)


main()
