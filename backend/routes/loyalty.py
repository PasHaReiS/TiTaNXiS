"""Loyalty (Sadıklar) leaderboard — küçük self-contained rapor.
Phase 8 finalinin ilk parçası. Sadece db + require_edit değil, hiç auth
gerektirmez (public leaderboard)."""
from typing import Dict, List
from fastapi import APIRouter


def make_loyalty_router(db):
    router = APIRouter()

    @router.get("/loyalty/leaderboard")
    async def loyalty_leaderboard():
        events = await db.events.find(
            {"loyalty_enabled": True, "loyalty_threshold": {"$gt": 0},
             "hidden_from_leaderboard": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "loyalty_threshold": 1, "multiplier": 1, "date": 1},
        ).to_list(2000)
        if not events:
            return []
        ev_by_id = {e["id"]: e for e in events}
        ev_ids = list(ev_by_id.keys())
        pipeline = [
            {"$match": {"event_id": {"$in": ev_ids}}},
            {"$project": {
                "event_id": 1, "member_id": 1,
                "weighted": {"$multiply": ["$points", {"$ifNull": ["$multiplier", 1.0]}]},
            }},
            {"$group": {"_id": {"e": "$event_id", "m": "$member_id"}, "total": {"$sum": "$weighted"}}},
        ]
        rows = await db.points.aggregate(pipeline).to_list(50000)
        loyalty_by_member: Dict[str, int] = {}
        events_by_member: Dict[str, List[str]] = {}
        for r in rows:
            eid = r["_id"]["e"]
            mid = r["_id"]["m"]
            threshold = int(ev_by_id[eid].get("loyalty_threshold") or 0)
            if int(r["total"]) >= threshold and threshold > 0:
                loyalty_by_member[mid] = loyalty_by_member.get(mid, 0) + 1
                events_by_member.setdefault(mid, []).append(ev_by_id[eid].get("name") or "")
        if not loyalty_by_member:
            return []
        mids = list(loyalty_by_member.keys())
        members = await db.members.find(
            {"id": {"$in": mids}},
            {"_id": 0, "id": 1, "name": 1, "member_id": 1, "alliance_name": 1, "country": 1},
        ).to_list(len(mids))
        m_by_id = {m["id"]: m for m in members}
        result = []
        for mid, loy in sorted(loyalty_by_member.items(), key=lambda x: -x[1]):
            m = m_by_id.get(mid) or {}
            result.append({
                **m,
                "loyalty": loy,
                "events": events_by_member.get(mid, []),
            })
        return result

    return router
