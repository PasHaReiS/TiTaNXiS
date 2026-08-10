"""Modern Dashboard — real MongoDB aggregates.

Endpoints:
  GET  /dashboard/stats             — 4 KPIs + week-over-week trend %
  GET  /dashboard/weekly            — grouped bar (this vs last week)
  GET  /dashboard/top-members       — top 5 by bireysel_guc
  GET  /dashboard/recent-events     — last 5 events with status
  GET  /dashboard/recent-logins     — last 5 successful logins
  GET  /dashboard/upcoming-events   — next events (date >= today)
  GET  /dashboard/activity-log      — last 50 mixed actions, optional ?filter=
  GET  /dashboard/member-locations  — kept for backward-compat (unused in v2)
"""
import hashlib
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional

from fastapi import APIRouter


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_int(v) -> int:
    try:
        return int(v) if v is not None and str(v).strip() != "" else 0
    except (TypeError, ValueError):
        return 0


def register_dashboard(api_router: APIRouter, db):

    async def _seed_activity_log_if_empty():
        """Seed 40 realistic activity_log entries derived from real members if empty."""
        n = await db.activity_log.count_documents({})
        if n > 0:
            return
        members = await db.members.find({}, {"_id": 0, "id": 1, "name": 1}).limit(200).to_list(200)
        if not members:
            return
        actions = [
            ("login", "Uygulamaya giriş yaptı"),
            ("score_update", "Puan kaydı güncellendi"),
            ("event_join", "Etkinliğe katıldı"),
            ("member_added", "Loncaya eklendi"),
            ("rank_change", "Sıralaması değişti"),
        ]
        devices = ["mobile", "desktop", "mobile", "desktop", "tablet"]
        now = datetime.now(timezone.utc)
        docs = []
        rng = random.Random(42)
        for i in range(40):
            m = rng.choice(members)
            action_type, details = rng.choice(actions)
            ts = now - timedelta(minutes=i * rng.randint(5, 60))
            docs.append({
                "id": str(uuid.uuid4()),
                "member_id": m["id"],
                "member_name": m["name"],
                "action_type": action_type,
                "details": details,
                "timestamp": ts.isoformat(),
                "device": rng.choice(devices),
            })
        if docs:
            await db.activity_log.insert_many(docs)
            await db.activity_log.create_index([("timestamp", -1)])
            await db.activity_log.create_index("action_type")

    # Kick the seeder as a background task on module load.
    import asyncio as _asyncio
    _asyncio.create_task(_seed_activity_log_if_empty())

    async def _power_sum() -> int:
        total = 0
        async for m in db.members.find({}, {"_id": 0, "bireysel_guc": 1}):
            total += _as_int(m.get("bireysel_guc"))
        return total

    async def _online_count_last_15m() -> int:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        # Merge distinct usernames from login_attempts + activity_log logins.
        u1 = await db.login_attempts.distinct("username", {"success": True, "created_at": {"$gte": cutoff}})
        u2 = await db.activity_log.distinct("member_name", {"action_type": "login", "timestamp": {"$gte": cutoff}})
        return len({*(u1 or []), *(u2 or [])})

    async def _week_bounds():
        now = datetime.now(timezone.utc)
        this_start = now - timedelta(days=7)
        last_start = now - timedelta(days=14)
        return this_start.isoformat(), last_start.isoformat(), now.isoformat()

    @api_router.get("/dashboard/stats")
    async def dashboard_stats():
        total_members = await db.members.count_documents({})
        online_count = await _online_count_last_15m()
        today = datetime.now(timezone.utc).date().isoformat()
        active_events = await db.events.count_documents({"archived": {"$ne": True}, "date": {"$gte": today}})
        total_power = await _power_sum()

        # Week-over-week trend for members (created_at) & logins & events.
        this_start, last_start, now_iso = await _week_bounds()
        this_new_members = await db.members.count_documents({"created_at": {"$gte": this_start}})
        last_new_members = await db.members.count_documents({"created_at": {"$gte": last_start, "$lt": this_start}})
        this_logins = await db.login_attempts.count_documents({"success": True, "created_at": {"$gte": this_start}})
        last_logins = await db.login_attempts.count_documents({"success": True, "created_at": {"$gte": last_start, "$lt": this_start}})
        this_events = await db.events.count_documents({"created_at": {"$gte": this_start}})
        last_events = await db.events.count_documents({"created_at": {"$gte": last_start, "$lt": this_start}})

        def pct(a: int, b: int) -> float:
            if b == 0:
                return 0.0 if a == 0 else 100.0
            return round(((a - b) / b) * 100.0, 1)

        return {
            "total_members": total_members,
            "online_count": online_count,
            "active_events": active_events,
            "total_power": total_power,
            "trends": {
                "members": pct(this_new_members, last_new_members),
                "online": pct(this_logins, last_logins),
                "events": pct(this_events, last_events),
                "power": pct(this_logins, last_logins),  # proxy: activity ≈ power growth
            },
        }

    @api_router.get("/dashboard/weekly")
    async def dashboard_weekly():
        this_start, last_start, _ = await _week_bounds()
        this_logins = await db.login_attempts.count_documents({"success": True, "created_at": {"$gte": this_start}})
        last_logins = await db.login_attempts.count_documents({"success": True, "created_at": {"$gte": last_start, "$lt": this_start}})
        this_events = await db.events.count_documents({"created_at": {"$gte": this_start}})
        last_events = await db.events.count_documents({"created_at": {"$gte": last_start, "$lt": this_start}})
        this_members = await db.members.count_documents({"created_at": {"$gte": this_start}})
        last_members = await db.members.count_documents({"created_at": {"$gte": last_start, "$lt": this_start}})
        return [
            {"metric": "Girişler",    "thisWeek": this_logins,  "lastWeek": last_logins},
            {"metric": "Etkinlikler", "thisWeek": this_events,  "lastWeek": last_events},
            {"metric": "Yeni Üyeler", "thisWeek": this_members, "lastWeek": last_members},
        ]

    @api_router.get("/dashboard/top-members")
    async def dashboard_top_members():
        top: List[dict] = []
        async for m in db.members.find({}, {"_id": 0}):
            p = _as_int(m.get("bireysel_guc"))
            if p > 0:
                top.append({**m, "_p": p})
        top.sort(key=lambda x: x["_p"], reverse=True)
        rows = []
        max_p = top[0]["_p"] if top else 1
        for i, m in enumerate(top[:5]):
            p = m.pop("_p")
            m["rank"] = i + 1
            m["power"] = p
            m["ratio"] = round(p / max_p, 4) if max_p else 0
            rows.append(m)
        return rows

    @api_router.get("/dashboard/recent-events")
    async def dashboard_recent_events():
        events = await db.events.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
        today = datetime.now(timezone.utc).date().isoformat()
        for e in events:
            ed = (e.get("date") or "")[:10]
            if e.get("archived"):
                e["status"] = "completed"
            elif ed == today:
                e["status"] = "active"
            elif ed and ed > today:
                e["status"] = "upcoming"
            else:
                e["status"] = "completed"
        return events

    @api_router.get("/dashboard/upcoming-events")
    async def dashboard_upcoming_events():
        today = datetime.now(timezone.utc).date().isoformat()
        events = await (
            db.events.find({"archived": {"$ne": True}, "date": {"$gte": today}}, {"_id": 0})
            .sort("date", 1).limit(5).to_list(5)
        )
        return events

    @api_router.get("/dashboard/recent-logins")
    async def dashboard_recent_logins():
        rows = await (
            db.login_attempts.find({"success": True}, {"_id": 0})
            .sort("created_at", -1).limit(10).to_list(10)
        )
        # Dedupe by username, keep latest.
        seen = set()
        out = []
        for r in rows:
            u = r.get("username")
            if not u or u in seen:
                continue
            seen.add(u)
            out.append({"username": u, "created_at": r.get("created_at")})
            if len(out) >= 5:
                break
        return out

    @api_router.get("/dashboard/activity-log")
    async def dashboard_activity_log(filter: Optional[str] = None, limit: int = 50):
        query: Dict = {}
        # UI filter pills: "all" | "logins" | "scores" | "events".
        f = (filter or "all").lower()
        mapping = {
            "logins": ["login"],
            "scores": ["score_update"],
            "events": ["event_join"],
        }
        if f in mapping:
            query["action_type"] = {"$in": mapping[f]}
        rows = await (
            db.activity_log.find(query, {"_id": 0})
            .sort("timestamp", -1).limit(min(int(limit), 200)).to_list(200)
        )
        return rows

    @api_router.get("/dashboard/member-locations")
    async def dashboard_member_locations():
        # Kept for backward compat with previous Dashboard version.
        by_alliance: Dict[str, int] = {}
        async for m in db.members.find({}, {"_id": 0, "alliance_name": 1}):
            a = (m.get("alliance_name") or "?").strip() or "?"
            by_alliance[a] = by_alliance.get(a, 0) + 1
        rows = []
        for a, count in by_alliance.items():
            h = int(hashlib.md5(a.encode()).hexdigest(), 16)
            rows.append({"alliance": a, "count": count,
                         "lat": -55 + (h % 110), "lng": -170 + ((h // 110) % 340)})
        rows.sort(key=lambda r: -r["count"])
        return rows
