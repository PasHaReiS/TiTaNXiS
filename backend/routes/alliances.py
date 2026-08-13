"""Alliance management — list / rename / merge / delete alliances.

Alliances live inside `members.alliance_name`. Operations are implemented as
bulk updates on that field. All state-changing operations write to the shared
`ocr_audit` collection so /ocr/history shows them alongside OCR ingestions.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class RenameBody(BaseModel):
    old_name: str
    new_name: str


class MergeBody(BaseModel):
    source_names: list[str]
    target_name: str


class DeleteBody(BaseModel):
    name: str


def _clean(s: str) -> str:
    return (s or "").replace("[", "").replace("]", "").strip()


def make_alliances_router(db, require_edit):
    router = APIRouter()

    async def _audit(mode: str, actor: dict, payload: dict):
        """Best-effort audit log — never throws."""
        try:
            await db.ocr_audit.insert_one({
                "id": str(uuid.uuid4()),
                "mode": mode,
                "actor": (actor or {}).get("username") or (actor or {}).get("email") or "?",
                "created_at": datetime.now(timezone.utc).isoformat(),
                **payload,
            })
        except Exception:
            pass

    @router.get("/alliances/stats")
    async def list_alliances(_: dict = Depends(require_edit)):
        """Aggregate: per-alliance member count + total power."""
        pipeline = [
            {"$match": {"alliance_name": {"$nin": [None, ""]}}},
            {"$group": {
                "_id": "$alliance_name",
                "member_count": {"$sum": 1},
                "total_power": {"$sum": {"$ifNull": ["$bireysel_guc", 0]}},
            }},
            {"$project": {"_id": 0, "name": "$_id", "member_count": 1, "total_power": 1}},
            {"$sort": {"total_power": -1}},
        ]
        return await db.members.aggregate(pipeline).to_list(500)

    @router.post("/alliances/rename")
    async def rename_alliance(body: RenameBody, admin: dict = Depends(require_edit)):
        old = _clean(body.old_name)
        new = _clean(body.new_name)
        if not old or not new:
            raise HTTPException(400, "Geçersiz alliance adı")
        if old.lower() == new.lower():
            return {"matched": 0, "modified": 0, "note": "aynı isim"}
        res = await db.members.update_many(
            {"alliance_name": old}, {"$set": {"alliance_name": new}}
        )
        await _audit("alliance-rename", admin, {
            "old_name": old, "new_name": new, "modified": res.modified_count,
        })
        return {"matched": res.matched_count, "modified": res.modified_count}

    @router.post("/alliances/merge")
    async def merge_alliances(body: MergeBody, admin: dict = Depends(require_edit)):
        target = _clean(body.target_name)
        if not target:
            raise HTTPException(400, "target_name gerekli")
        sources = [_clean(s) for s in body.source_names if _clean(s) and _clean(s).lower() != target.lower()]
        if not sources:
            raise HTTPException(400, "source_names boş")
        res = await db.members.update_many(
            {"alliance_name": {"$in": sources}},
            {"$set": {"alliance_name": target}},
        )
        await _audit("alliance-merge", admin, {
            "merged_from": sources, "merged_to": target, "modified": res.modified_count,
        })
        return {"merged_from": sources, "merged_to": target, "modified": res.modified_count}

    @router.post("/alliances/delete")
    async def delete_alliance(body: DeleteBody, admin: dict = Depends(require_edit)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "İttifak adı gerekli")
        res = await db.members.update_many(
            {"alliance_name": name}, {"$set": {"alliance_name": ""}}
        )
        await _audit("alliance-delete", admin, {
            "name": name, "cleared": res.modified_count,
        })
        return {"cleared": res.modified_count}

    return router
