"""Helper: create a temp event+cert for frontend verify-page testing; prints token.
Usage: python seed_verify_cert.py create | python seed_verify_cert.py cleanup
"""
import json
import os
import re
import sys
import uuid
from pathlib import Path

import requests
from dotenv import dotenv_values

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE}/api"
STATE_FILE = Path("/tmp/verify_seed.json")

content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
u = re.search(r'(?im)^\s*-\s*\*\*Username\*\*\s*:\s*`([^`]+)`', content).group(1)
p = re.search(r'(?im)^\s*-\s*\*\*Password\*\*\s*:\s*`([^`]+)`', content).group(1)
s = requests.Session()
tok = s.post(f"{API}/auth/login", json={"username": u, "password": p}, timeout=30).json()["token"]
s.headers.update({"Authorization": f"Bearer {tok}"})


def create():
    ev = s.post(f"{API}/events", json={
        "name": f"TEST_VerifySeed_{uuid.uuid4().hex[:5]}",
        "date": "2026-07-03T18:00:00Z",
    }, timeout=60).json()
    members = s.get(f"{API}/members", timeout=60).json()
    members = members if isinstance(members, list) else members.get("items", [])
    mid = members[0]["id"]
    r = s.post(f"{API}/certificates/issue", json={
        "event_id": ev["id"], "title": "TEST_Doğrulama Şampiyonu",
        "member_ids": [mid], "theme": "amber",
    }, timeout=60).json()
    cert = r["created"][0]
    STATE_FILE.write_text(json.dumps({"event_id": ev["id"], "cert_id": cert["id"]}))
    print(json.dumps({"token": cert["verify_token"], "cert_id": cert["id"],
                      "member_name": cert["member_name"], "event_name": cert["event_name"],
                      "title": cert["title"]}))


def cleanup():
    st = json.loads(STATE_FILE.read_text())
    print(s.delete(f"{API}/certificates/{st['cert_id']}", timeout=30).status_code,
          s.delete(f"{API}/events/{st['event_id']}", timeout=30).status_code)


(create if sys.argv[1] == "create" else cleanup)()
