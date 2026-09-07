"""Multiplier history — son 200 puanı çekip çarpan bazında gruplar.
`enrich_points_batch` callable dep olarak enjekte edilir.
"""
from fastapi import APIRouter


def make_multiplier_history_router(db, enrich_points_batch):
    router = APIRouter()

    @router.get("/multiplier-history")
    async def multiplier_history():
        points = await db.points.find({}, {"_id": 0}).sort("date", -1).to_list(200)
        await enrich_points_batch(points)
        by_mult = {}
        for p in points:
            m = str(p.get("multiplier", 1.0))
            by_mult.setdefault(m, []).append(p)
        return {"history": points, "grouped": by_mult}

    return router
