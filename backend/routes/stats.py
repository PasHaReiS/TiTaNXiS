"""Global stats — anasayfa özet kartlarının veri kaynağı."""
from fastapi import APIRouter


def make_stats_router(db):
    router = APIRouter()

    @router.get("/stats")
    async def get_stats():
        member_count = await db.members.count_documents({})
        event_count = await db.events.count_documents({"archived": False})
        pipeline = [
            {"$project": {"weighted": {"$multiply": ["$points", {"$ifNull": ["$multiplier", 1.0]}]}}},
            {"$group": {"_id": None, "total": {"$sum": "$weighted"}}},
        ]
        result = await db.points.aggregate(pipeline).to_list(1)
        total = int(result[0]["total"]) if result else 0
        avg = int(total / event_count) if event_count > 0 else 0
        power_pipe = [{"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$bireysel_guc", 0]}}}}]
        power_res = await db.members.aggregate(power_pipe).to_list(1)
        total_power = int(power_res[0]["total"]) if power_res else 0
        return {
            "member_count": member_count,
            "event_count": event_count,
            "total_points": total,
            "event_avg": avg,
            "total_power": total_power,
        }

    return router
