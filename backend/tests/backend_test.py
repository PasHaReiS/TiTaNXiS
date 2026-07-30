"""
Backend API Tests for Oyun Loncası Yönetim Uygulaması
Tests all endpoints under /api prefix. DB should be pre-seeded.
"""
import os
import pytest
import requests
from urllib.parse import quote

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def s(admin_token):
    sess = requests.Session()
    sess.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}",
    })
    return sess


# ---------- Root / Stats ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_stats(s):
    r = s.get(f"{API}/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ["member_count", "event_count", "total_points", "event_avg"]:
        assert k in d
    assert d["member_count"] == 156, f"expected 156 members, got {d['member_count']}"
    assert d["event_count"] == 6, f"expected 6 active events, got {d['event_count']}"
    assert isinstance(d["total_points"], int)


# ---------- Members ----------
def test_members_list_156_and_rank_distribution(s):
    r = s.get(f"{API}/members")
    assert r.status_code == 200
    members = r.json()
    assert len(members) == 156
    dist = {}
    for m in members:
        dist[m["rank"]] = dist.get(m["rank"], 0) + 1
    expected = {"GOW": 94, "R5": 1, "R4": 8, "R3": 20, "R2": 18, "R1": 15}
    assert dist == expected, f"rank dist mismatch: {dist}"


def test_members_search(s):
    r = s.get(f"{API}/members", params={"search": "Selenay"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert any("selenay" in m["name"].lower() for m in data)


def test_member_crud(s):
    payload = {"name": "TEST_Member_X", "member_id": "999888777", "rank": "R2", "title": "TestTitle", "level": 30}
    r = s.post(f"{API}/members", json=payload)
    assert r.status_code == 200
    created = r.json()
    assert created["name"] == payload["name"]
    mid = created["id"]

    # GET single
    r = s.get(f"{API}/members/{mid}")
    assert r.status_code == 200 and r.json()["name"] == payload["name"]

    # PATCH
    r = s.patch(f"{API}/members/{mid}", json={"level": 45, "title": "Updated"})
    assert r.status_code == 200
    assert r.json()["level"] == 45
    assert r.json()["title"] == "Updated"

    # DELETE
    r = s.delete(f"{API}/members/{mid}")
    assert r.status_code == 200

    # GET now 404
    r = s.get(f"{API}/members/{mid}")
    assert r.status_code == 404


# ---------- Events ----------
def test_events_active(s):
    r = s.get(f"{API}/events", params={"archived": "false"})
    assert r.status_code == 200
    events = r.json()
    assert len(events) == 6, f"expected 6 active events, got {len(events)}"


def test_events_archived(s):
    r = s.get(f"{API}/events", params={"archived": "true"})
    assert r.status_code == 200
    assert len(r.json()) == 8


def test_event_crud_and_archive_group(s):
    # Create
    payload = {"name": "TEST_Event", "group_name": "TEST_Group", "multiplier": 2.5, "date": "2026-03-01T00:00:00+00:00", "subtitle": "Test"}
    r = s.post(f"{API}/events", json=payload)
    assert r.status_code == 200
    ev = r.json()
    eid = ev["id"]

    # Update
    r = s.patch(f"{API}/events/{eid}", json={"multiplier": 3.0})
    assert r.status_code == 200 and r.json()["multiplier"] == 3.0

    # archive-group
    r = s.post(f"{API}/events/archive-group", params={"group_name": "TEST_Group"})
    assert r.status_code == 200
    assert r.json()["modified"] >= 1

    # Verify archived
    r = s.get(f"{API}/events", params={"archived": "true"})
    assert any(e["id"] == eid for e in r.json())

    # Delete
    r = s.delete(f"{API}/events/{eid}")
    assert r.status_code == 200


# ---------- Points ----------
def test_points_list_enriched(s):
    r = s.get(f"{API}/points", params={"limit": 10})
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) > 0
    for d in docs:
        assert d.get("member_name") and d.get("event_name")


def test_points_crud_single_and_bulk(s):
    # Get a valid member and event
    m = s.get(f"{API}/members").json()[0]
    e = s.get(f"{API}/events", params={"archived": "false"}).json()[0]

    # Single
    r = s.post(f"{API}/points", json={"member_id": m["id"], "event_id": e["id"], "points": 12345, "multiplier": 1.5, "note": "TEST_note"})
    assert r.status_code == 200
    pt = r.json()
    assert pt["member_name"] == m["name"]
    assert pt["event_name"] == e["name"]
    pid = pt["id"]

    # Bulk
    members = s.get(f"{API}/members").json()[:3]
    ids = [x["id"] for x in members]
    r = s.post(f"{API}/points/bulk", json={"member_ids": ids, "event_id": e["id"], "points": 500, "multiplier": 2.0, "note": "TEST_bulk"})
    assert r.status_code == 200
    body = r.json()
    assert body["created"] == 3
    bulk_ids = [p["id"] for p in body["points"]]

    # Delete
    for delid in [pid] + bulk_ids:
        r = s.delete(f"{API}/points/{delid}")
        assert r.status_code == 200


# ---------- Leaderboard ----------
def test_leaderboard_sorted_and_positions(s):
    r = s.get(f"{API}/leaderboard")
    assert r.status_code == 200
    lb = r.json()
    assert len(lb) > 0
    prev = None
    for i, row in enumerate(lb):
        assert row["position"] == i + 1
        if prev is not None:
            assert row["total_points"] <= prev
        prev = row["total_points"]


def test_leaderboard_group_filter(s):
    group = "SvS vs 10007"
    r = s.get(f"{API}/leaderboard", params={"group_name": group})
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) > 0


# ---------- Member history ----------
def test_member_history(s):
    m = s.get(f"{API}/members").json()[0]
    r = s.get(f"{API}/members/{m['id']}/history")
    assert r.status_code == 200
    d = r.json()
    assert d["member"]["id"] == m["id"]
    assert "points" in d and "total" in d and "event_count" in d


# ---------- Commanders ----------
def test_commanders_list_and_filter(s):
    r = s.get(f"{API}/commanders")
    assert r.status_code == 200
    assert len(r.json()) > 0

    r = s.get(f"{API}/commanders", params={"category": "tetikci"})
    assert r.status_code == 200
    for c in r.json():
        assert c["category"] == "tetikci"


def test_commander_crud(s):
    r = s.post(f"{API}/commanders", json={"name": "TEST_Cmdr", "category": "tetikci", "description": "test"})
    assert r.status_code == 200
    cid = r.json()["id"]

    r = s.patch(f"{API}/commanders/{cid}", json={"description": "updated"})
    assert r.status_code == 200 and r.json()["description"] == "updated"

    r = s.delete(f"{API}/commanders/{cid}")
    assert r.status_code == 200


# ---------- Export CSV ----------
def test_export_csv(s):
    r = s.get(f"{API}/export/csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.text
    header = text.splitlines()[0]
    assert "Sıra" in header and "İsim" in header and "Rütbe" in header
    assert "Toplam Puan" in header


# ---------- Event Groups ----------
def test_event_groups(s):
    r = s.get(f"{API}/event-groups")
    assert r.status_code == 200
    groups = r.json()
    assert len(groups) >= 1
    for g in groups:
        assert "name" in g and "count" in g and "active" in g
    svs = next((g for g in groups if g["name"] == "SvS vs 10007"), None)
    assert svs is not None
    assert svs["count"] == 14
    assert svs["active"] == 6


# ---------- Multiplier History ----------
def test_multiplier_history(s):
    r = s.get(f"{API}/multiplier-history")
    assert r.status_code == 200
    d = r.json()
    assert "history" in d and "grouped" in d
    assert isinstance(d["grouped"], dict)
    assert len(d["history"]) > 0
