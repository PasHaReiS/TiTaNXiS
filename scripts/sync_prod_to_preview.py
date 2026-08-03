"""Sync data from production API to preview MongoDB."""
import os, sys, requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

PROD = "https://gow-panel.com"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

report = {}

def get(path):
    r = requests.get(f"{PROD}{path}", timeout=30)
    r.raise_for_status()
    return r.json()

# 1) Simple list collections — direct GET returns docs to insert
LIST_ENDPOINTS = [
    ("members", "/api/members"),
    ("events", "/api/events"),
    ("commanders", "/api/commanders"),
    ("points", "/api/points"),
]

for coll, path in LIST_ENDPOINTS:
    docs = get(path)
    # Strip enrichment fields that would collide with re-computation from members/events on this side
    if coll == "points":
        for d in docs:
            d.pop("member_name", None)
            d.pop("member_rank", None)
            d.pop("event_name", None)
            d.pop("event_multiplier", None)
    db[coll].delete_many({})
    if docs:
        db[coll].insert_many(docs, ordered=False)
    report[coll] = len(docs)

# 2) alliance_colors — API returns { name: color }, DB stores docs
ac_map = get("/api/alliance-colors")
db.alliance_colors.delete_many({})
if ac_map:
    docs = [{"name": n, "color": c} for n, c in ac_map.items()]
    db.alliance_colors.insert_many(docs, ordered=False)
report["alliance_colors"] = len(ac_map)

# 3) calculations + unit_costs — per-category (mh_* soldier training tiers)
CALC_CATEGORIES = [
    "asker_egitim_t11", "asker_egitim_t8", "asker_egitim_t7", "asker_egitim_t6",
]
db.calculations.delete_many({})
calc_total = 0
for cat in CALC_CATEGORIES:
    r = requests.get(f"{PROD}/api/calculations", params={"category": cat, "limit": 200}, timeout=30)
    r.raise_for_status()
    items = r.json() or []
    if items:
        db.calculations.insert_many(items, ordered=False)
        calc_total += len(items)
report["calculations"] = calc_total

db.unit_costs.delete_many({})
uc_total = 0
for cat in CALC_CATEGORIES:
    r = requests.get(f"{PROD}/api/unit-costs/{cat}", timeout=30)
    r.raise_for_status()
    doc = r.json() or {}
    # Only store if non-zero payload (production actually has data for this category)
    if any(doc.get(k) for k in ("yemek", "odun", "celik", "benzin", "sure_saniye")):
        db.unit_costs.insert_one({**doc, "category": cat})
        uc_total += 1
report["unit_costs"] = uc_total

print("Sync report:")
total_docs = 0
for k, v in report.items():
    print(f"  {k:20s} {v:6d}")
    total_docs += v
print(f"  {'TOTAL':20s} {total_docs:6d}  across {len(report)} collections")
