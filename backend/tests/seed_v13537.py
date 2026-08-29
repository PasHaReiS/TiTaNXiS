"""Seed/cleanup helper for v135.37 frontend testing.

usage: python seed_v13537.py seed   -> creates TEST event + 1 certificate, prints ids
       python seed_v13537.py clean  -> deletes anything named TEST_UI_v13537*
"""
import sys
import json
import re
import requests
from pathlib import Path
from dotenv import dotenv_values

API = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
c = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
U = re.search(r'(?im)^\s*-\s*\*\*Username\*\*\s*:\s*`([^`]+)`', c).group(1)
P = re.search(r'(?im)^\s*-\s*\*\*Password\*\*\s*:\s*`([^`]+)`', c).group(1)
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"username": U, "password": P}, timeout=30)
r.raise_for_status()
s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})

MARK = "TEST_UI_v13537"

if sys.argv[1] == "seed":
    ev = s.post(f"{API}/events", json={"name": f"{MARK}_Event", "date": "2026-07-06T18:00:00Z"}, timeout=30).json()
    eid = ev.get("id")
    members = s.get(f"{API}/members", timeout=60).json()
    items = members if isinstance(members, list) else members.get("items", [])
    mid = items[0]["id"]
    res = s.post(f"{API}/certificates/issue", json={
        "event_id": eid, "title": f"{MARK}_Sertifika", "member_ids": [mid], "theme": "amber",
    }, timeout=60).json()
    print(json.dumps({"event_id": eid, "cert": res["created"][0]}, ensure_ascii=False))
else:
    certs = s.get(f"{API}/certificates?limit=500", timeout=30).json()["items"]
    n = 0
    for ct in certs:
        if MARK in (ct.get("title") or "") or MARK in (ct.get("event_name") or "") or "UI_EDITED_v13537" in (ct.get("title") or ""):
            s.delete(f"{API}/certificates/{ct['id']}", timeout=30)
            n += 1
    evs = s.get(f"{API}/events?include_archived=true&limit=500", timeout=60).json()
    evlist = evs if isinstance(evs, list) else evs.get("items", [])
    e = 0
    for ev in evlist:
        if MARK in (ev.get("name") or ""):
            s.delete(f"{API}/events/{ev['id']}", timeout=30)
            e += 1
    print(json.dumps({"certs_deleted": n, "events_deleted": e}))
