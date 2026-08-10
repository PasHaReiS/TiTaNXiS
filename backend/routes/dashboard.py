"""Premium Dashboard route: aggregates real MongoDB data for the landing page.

Endpoints:
  GET /dashboard/stats             — 5 KPI numbers
  GET /dashboard/activity-chart    — 14-day (logins + cumulative power) rows
  GET /dashboard/recent-events     — last 5 events with derived status
  GET /dashboard/top-members       — top 5 by bireysel_guc
  GET /dashboard/activity-feed     — last 10 mixed actions
  GET /dashboard/member-locations  — pseudo-geo dots derived from alliance names
"""
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Dict

from fastapi import APIRouter


def register_dashboard(api_router: APIRouter, db):
    @api_router.get("/dashboard/stats")
    async def dashboard_stats():
        total_members = await db.members.count_documents({})
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        online_usernames = await db.login_attempts.distinct(
            "username", {"success": True, "created_at": {"$gte": cutoff}}
        )
        today = datetime.now(timezone.utc).date().isoformat()
        active_events = await db.events.count_documents(
            {"archived": {"$ne": True}, "date": {"$gte": today}}
        )
        powers: List[int] = []
        async for m in db.members.find({}, {"_id": 0, "bireysel_guc": 1}):
            v = m.get("bireysel_guc")
            try:
                iv = int(v) if v is not None and str(v).strip() != "" else 0
            except (TypeError, ValueError):
                iv = 0
            if iv > 0:
                powers.append(iv)
        max_power = max(powers) if powers else 0
        avg_power = int(sum(powers) / len(powers)) if powers else 0
        return {
            "total_members": total_members,
            "online_now": len(online_usernames),
            "active_events": active_events,
            "max_power": max_power,
            "avg_power": avg_power,
        }

    @api_router.get("/dashboard/activity-chart")
    async def dashboard_activity_chart():
        now = datetime.now(timezone.utc)
        # Sum weighted points per date to build a cumulative power-earned curve.
        by_day: Dict[str, float] = {}
        async for p in db.points.find({}, {"_id": 0, "points": 1, "multiplier": 1, "date": 1}):
            d = (p.get("date") or "")[:10]
            if not d:
                continue
            try:
                v = int(p.get("points", 0) or 0) * float(p.get("multiplier", 1.0) or 1.0)
            except (TypeError, ValueError):
                v = 0
            by_day[d] = by_day.get(d, 0) + v
        sorted_dates = sorted(by_day.keys())
        cum_by_day: Dict[str, float] = {}
        acc = 0.0
        for d in sorted_dates:
            acc += by_day[d]
            cum_by_day[d] = acc

        # Successful logins per day for the last 14 days.
        cutoff = (now - timedelta(days=14)).isoformat()
        logins_by_day: Dict[str, int] = {}
        async for la in db.login_attempts.find(
            {"success": True, "created_at": {"$gte": cutoff}}, {"_id": 0, "created_at": 1}
        ):
            d = (la.get("created_at") or "")[:10]
            if d:
                logins_by_day[d] = logins_by_day.get(d, 0) + 1

        rows = []
        for i in range(13, -1, -1):
            date = (now - timedelta(days=i)).date().isoformat()
            cum = 0.0
            for d in sorted_dates:
                if d <= date:
                    cum = cum_by_day[d]
                else:
                    break
            rows.append({"date": date, "logins": logins_by_day.get(date, 0), "power": int(cum)})
        return rows

    @api_router.get("/dashboard/recent-events")
    async def dashboard_recent_events():
        events = await db.events.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
        today = datetime.now(timezone.utc).date().isoformat()
        for e in events:
            if e.get("archived"):
                status = "completed"
            else:
                ed = (e.get("date") or "")[:10]
                if ed == today:
                    status = "active"
                elif ed and ed > today:
                    status = "upcoming"
                else:
                    status = "completed"
            e["status"] = status
            e["participants"] = len(await db.points.distinct("member_id", {"event_id": e["id"]}))
        return events

    @api_router.get("/dashboard/top-members")
    async def dashboard_top_members():
        # Sort by bireysel_guc DESC; keep top 5 with a valid numeric power.
        top: List[dict] = []
        async for m in db.members.find({}, {"_id": 0}):
            v = m.get("bireysel_guc")
            try:
                iv = int(v) if v is not None and str(v).strip() != "" else 0
            except (TypeError, ValueError):
                iv = 0
            if iv > 0:
                top.append({**m, "_p": iv})
        top.sort(key=lambda x: x["_p"], reverse=True)
        result = []
        for i, m in enumerate(top[:5]):
            m.pop("_p", None)
            m["rank"] = i + 1
            m["trend"] = "neutral"
            result.append(m)
        return result

    @api_router.get("/dashboard/activity-feed")
    async def dashboard_activity_feed():
        feed: List[dict] = []
        async for l in db.login_attempts.find({"success": True}, {"_id": 0}).sort("created_at", -1).limit(15):
            feed.append({
                "kind": "login",
                "user": l.get("username", "?"),
                "at": l.get("created_at"),
                "text": f"@{l.get('username')} giriş yaptı",
            })
        async for m in db.members.find({}, {"_id": 0}).sort("created_at", -1).limit(10):
            feed.append({
                "kind": "member_join",
                "user": m.get("name", "?"),
                "at": m.get("created_at"),
                "text": f"{m.get('name')} lonca'ya katıldı",
            })
        async for p in db.points.find({}, {"_id": 0}).sort("date", -1).limit(10):
            feed.append({
                "kind": "score_update",
                "user": p.get("member_name", "?"),
                "at": p.get("date"),
                "text": f"{p.get('member_name', '?')} +{p.get('points', 0)} puan aldı",
            })
        feed.sort(key=lambda x: (x.get("at") or ""), reverse=True)
        return feed[:10]

    @api_router.get("/dashboard/member-locations")
    async def dashboard_member_locations():
        by_alliance: Dict[str, int] = {}
        async for m in db.members.find({}, {"_id": 0, "alliance_name": 1}):
            a = (m.get("alliance_name") or "?").strip() or "?"
            by_alliance[a] = by_alliance.get(a, 0) + 1
        rows = []
        for a, count in by_alliance.items():
            h = int(hashlib.md5(a.encode()).hexdigest(), 16)
            # -55..55 lat, -170..170 lng — spread the dots deterministically.
            lat = -55 + (h % 110)
            lng = -170 + ((h // 110) % 340)
            rows.append({"alliance": a, "count": count, "lat": lat, "lng": lng})
        rows.sort(key=lambda r: -r["count"])
        return rows
