"""Members admin ops — bulk country/rank/alliance updates + audit history.

`record_member_changes` + `enrich_points_batch` callable olarak inject
edilir; böylece bu modül server.py'nin dev helper zincirine mengene olmaz.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


_VALID_RANKS = {"R1", "R2", "R3", "R4", "R5"}


class BulkCountryBody(BaseModel):
    member_ids: List[str]
    country: Optional[str] = None  # ISO 3166-1 alpha-2 uppercase; null/empty = clear


class BulkRankBody(BaseModel):
    member_ids: List[str]
    rank: str  # one of R1..R5


class BulkAllianceBody(BaseModel):
    member_ids: List[str]
    alliance_name: str
    alliance_category: Optional[str] = None  # "Main" | "Academy"


def make_members_admin_router(db, require_edit, record_member_changes, enrich_points_batch):
    router = APIRouter()

    @router.get("/members/{member_id}/history")
    async def member_history(member_id: str):
        m = await db.members.find_one({"id": member_id}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        points = await db.points.find({"member_id": member_id}, {"_id": 0}).sort("date", -1).to_list(1000)
        # v141 — skip enrichment call when there are no points to save a no-op round-trip.
        if points:
            await enrich_points_batch(points)
        total = sum(int(p["points"]) * float(p.get("multiplier", 1.0)) for p in points)
        return {"member": m, "points": points, "total": int(total),
                "event_count": len(set(p["event_id"] for p in points))}

    @router.get("/members/{member_id}/changes")
    async def list_member_changes(member_id: str, limit: int = 50):
        """Return chronological audit entries (newest first) for a member."""
        limit = max(1, min(int(limit or 50), 500))
        docs = await db.member_changes.find(
            {"member_id": member_id}, {"_id": 0}
        ).sort("changed_at", -1).to_list(limit)
        return docs

    @router.post("/members/bulk-country")
    async def bulk_set_country(body: BulkCountryBody, user: dict = Depends(require_edit)):
        """Bulk-assign (or clear) the ``country`` field on many members at once."""
        ids = [i for i in (body.member_ids or []) if i]
        if not ids:
            raise HTTPException(400, "Üye seçilmedi")
        country = (body.country or "").strip().upper() or None
        if country and len(country) != 2:
            raise HTTPException(400, "country ISO 3166-1 alpha-2 (2 harfli) olmalı")
        before_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "country": 1}).to_list(len(ids))
        before_map = {d["id"]: d for d in before_docs}
        update_op = {"$set": {"country": country}} if country else {"$unset": {"country": ""}}
        res = await db.members.update_many({"id": {"$in": ids}}, update_op)
        for mid in ids:
            await record_member_changes(mid, before_map.get(mid, {}), {"country": country}, user)
        return {"matched": res.matched_count, "modified": res.modified_count, "country": country}

    @router.post("/members/bulk-rank")
    async def bulk_set_rank(body: BulkRankBody, user: dict = Depends(require_edit)):
        """Bulk-assign a rank (R1..R5) to many members at once."""
        ids = [i for i in (body.member_ids or []) if i]
        if not ids:
            raise HTTPException(400, "Üye seçilmedi")
        rank = (body.rank or "").strip().upper()
        if rank not in _VALID_RANKS:
            raise HTTPException(400, f"rank must be one of {sorted(_VALID_RANKS)}")
        before_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "rank": 1}).to_list(len(ids))
        before_map = {d["id"]: d for d in before_docs}
        res = await db.members.update_many({"id": {"$in": ids}}, {"$set": {"rank": rank}})
        for mid in ids:
            await record_member_changes(mid, before_map.get(mid, {}), {"rank": rank}, user)
        return {"matched": res.matched_count, "modified": res.modified_count, "rank": rank}

    @router.post("/members/bulk-alliance")
    async def bulk_set_alliance(body: BulkAllianceBody, user: dict = Depends(require_edit)):
        """Bulk-transfer members to a different alliance (case-sensitive by design)."""
        ids = [i for i in (body.member_ids or []) if i]
        if not ids:
            raise HTTPException(400, "Üye seçilmedi")
        alliance = (body.alliance_name or "").strip()
        if not alliance:
            raise HTTPException(400, "alliance_name boş olamaz")
        update_set = {"alliance_name": alliance}
        if body.alliance_category in ("Main", "Academy"):
            update_set["alliance_category"] = body.alliance_category
        before_docs = await db.members.find(
            {"id": {"$in": ids}},
            {"_id": 0, "id": 1, "alliance_name": 1, "alliance_category": 1},
        ).to_list(len(ids))
        before_map = {d["id"]: d for d in before_docs}
        res = await db.members.update_many({"id": {"$in": ids}}, {"$set": update_set})
        for mid in ids:
            await record_member_changes(mid, before_map.get(mid, {}), update_set, user)
        return {"matched": res.matched_count, "modified": res.modified_count, "alliance_name": alliance}

    return router
