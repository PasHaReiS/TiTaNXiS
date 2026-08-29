"""One-off cleanup of TEST_i52_* data created during iteration 52 UI testing."""
import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
tok = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin123"}).json()["token"]
H = {"Authorization": f"Bearer {tok}"}

for path, label in [("/telegram-templates", "tg"), ("/event-templates", "ev"), ("/rsvp-templates", "rsvp")]:
    r = requests.get(f"{API}{path}", headers=H)
    if r.status_code != 200:
        print(label, "list failed", r.status_code, r.text[:200])
        continue
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    for it in items:
        nm = f"{it.get('name', '')} {it.get('template_name', '')}"
        if "TEST_i52" in nm:
            d = requests.delete(f"{API}{path}/{it['id']}", headers=H)
            print("deleted", label, nm.strip(), d.status_code)

# leftover schedules
r = requests.get(f"{API}/rsvp-schedules", headers=H)
for s in r.json().get("items", []):
    if "TEST" in (s.get("template_name") or "") or not s.get("template_name"):
        print("deleting schedule", s["id"], s.get("template_name"),
              requests.delete(f"{API}/rsvp-schedules/{s['id']}", headers=H).status_code)
print("done")
