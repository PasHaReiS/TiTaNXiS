"""Points/Scores CRUD — puan girişleri + `/scores` alias'ları.

Bağımlı helper'lar callable olarak inject edilir:
- `enrich_points_batch(docs)`: many docs'a member/event enrichment
- `enrich_point(doc)`: single doc enrichment
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

log = logging.getLogger("points")


async def _fire_live(msg: dict) -> None:
    """v143.3 — Live WS broadcast helper (import lazy to avoid import cycles)."""
    try:
        from live_ws import live_ws as _lws
        await _lws.broadcast(msg)
    except Exception as e:
        log.warning(f"[live-ws] points broadcast failed: {e}")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Point(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    member_name: Optional[str] = None
    event_id: str
    event_name: Optional[str] = None
    points: int
    multiplier: float = 1.0
    note: Optional[str] = None
    date: str = Field(default_factory=_now_iso)


class PointCreate(BaseModel):
    member_id: str
    event_id: str
    points: int
    multiplier: Optional[float] = 1.0
    note: Optional[str] = None


class PointUpdate(BaseModel):
    points: Optional[int] = None
    multiplier: Optional[float] = None
    note: Optional[str] = None
    event_id: Optional[str] = None


class BulkPointCreate(BaseModel):
    member_ids: List[str]
    event_id: str
    points: int
    multiplier: Optional[float] = 1.0
    note: Optional[str] = None


def make_points_router(db, require_edit, enrich_point, enrich_points_batch):
    router = APIRouter()

    @router.get("/points")
    async def list_points(search: Optional[str] = None, limit: int = 1000):
        docs = await db.points.find({}, {"_id": 0}).sort("date", -1).to_list(limit)
        if docs:
            await enrich_points_batch(docs)
        if search:
            s = search.lower()
            docs = [
                d for d in docs
                if s in (d.get("member_name") or "").lower()
                or s in (d.get("event_name") or "").lower()
                or s in (d.get("note") or "").lower()
            ]
        return docs

    @router.post("/points")
    async def create_point(body: PointCreate, _: dict = Depends(require_edit)):
        p = Point(**body.model_dump())
        doc = p.model_dump()
        await enrich_point(doc)
        await db.points.insert_one(doc)
        doc.pop("_id", None)
        try:
            await db.activity_log.insert_one({
                "id": uuid.uuid4().hex,
                "member_id": doc.get("member_id"),
                "member_name": doc.get("member_name", "?"),
                "action_type": "score_update",
                "details": f"+{doc.get('points', 0)} puan aldı",
                "timestamp": _now_iso(),
                "device": "desktop",
            })
        except Exception:
            pass
        await _fire_live({"type": "points.updated", "member_id": doc.get("member_id"), "event_id": doc.get("event_id")})
        return doc

    @router.post("/points/bulk")
    async def bulk_points(body: BulkPointCreate, _: dict = Depends(require_edit)):
        docs_to_insert = []
        for mid in body.member_ids:
            p = Point(
                member_id=mid,
                event_id=body.event_id,
                points=body.points,
                multiplier=body.multiplier or 1.0,
                note=body.note,
            )
            docs_to_insert.append(p.model_dump())
        if docs_to_insert:
            await enrich_points_batch(docs_to_insert)
            await db.points.insert_many(docs_to_insert)
        for d in docs_to_insert:
            d.pop("_id", None)
        if docs_to_insert:
            await _fire_live({"type": "points.updated", "event_id": body.event_id})
        return {"created": len(docs_to_insert), "points": docs_to_insert}

    @router.delete("/points/{point_id}")
    async def delete_point(point_id: str, _: dict = Depends(require_edit)):
        before = await db.points.find_one({"id": point_id}, {"_id": 0, "member_id": 1, "event_id": 1})
        res = await db.points.delete_one({"id": point_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Puan kaydı bulunamadı")
        await _fire_live({"type": "points.updated",
                          "member_id": (before or {}).get("member_id"),
                          "event_id": (before or {}).get("event_id")})
        return {"ok": True}

    @router.patch("/points/{point_id}")
    async def update_point(point_id: str, body: PointUpdate, _: dict = Depends(require_edit)):
        update = {k: v for k, v in body.model_dump().items() if v is not None}
        if not update:
            raise HTTPException(400, "Değişiklik yok")
        if "event_id" in update:
            ev = await db.events.find_one({"id": update["event_id"]}, {"_id": 0, "name": 1})
            update["event_name"] = ev["name"] if ev else "Bilinmeyen"
        res = await db.points.update_one({"id": point_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Puan kaydı bulunamadı")
        doc = await db.points.find_one({"id": point_id}, {"_id": 0})
        await _fire_live({"type": "points.updated",
                          "member_id": (doc or {}).get("member_id"),
                          "event_id": (doc or {}).get("event_id")})
        return doc

    # ---------- Scores alias (aynı koleksiyon, aynı davranış) ----------
    @router.get("/scores")
    async def list_scores(search: Optional[str] = None, limit: int = 1000):
        return await list_points(search=search, limit=limit)

    @router.post("/scores")
    async def create_score(body: PointCreate, _: dict = Depends(require_edit)):
        return await create_point(body, _)

    @router.post("/scores/bulk")
    async def bulk_scores(body: BulkPointCreate, _: dict = Depends(require_edit)):
        return await bulk_points(body, _)

    @router.delete("/scores/{score_id}")
    async def delete_score(score_id: str, _: dict = Depends(require_edit)):
        return await delete_point(score_id, _)

    @router.patch("/scores/{score_id}")
    async def update_score(score_id: str, body: PointUpdate, _: dict = Depends(require_edit)):
        return await update_point(score_id, body, _)

    return router
