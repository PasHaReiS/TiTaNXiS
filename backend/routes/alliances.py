"""Alliance management — list / rename / merge / delete + Ana/Akademi kategorisi.

Alliances live inside `members.alliance_name` (case-sensitive — `GOW`, `GoW`,
`GOw` are intentionally distinct). Category metadata (`main` / `academy`)
lives in `db.alliance_meta` keyed by alliance name.
"""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional
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


class CategoryBody(BaseModel):
    name: str
    category: Optional[Literal["main", "academy"]] = None  # None clears


def _clean(s: str) -> str:
    return (s or "").replace("[", "").replace("]", "").strip()


def make_alliances_router(db, require_edit):
    router = APIRouter()

    async def _audit(mode: str, actor: dict, payload: dict):
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

    async def _categories() -> dict:
        docs = await db.alliance_meta.find({}, {"_id": 0, "name": 1, "category": 1}).to_list(500)
        return {d["name"]: d.get("category") for d in docs if d.get("name")}

    @router.get("/alliances/stats")
    async def list_alliances(_: dict = Depends(require_edit)):
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
        rows = await db.members.aggregate(pipeline).to_list(500)
        cats = await _categories()
        seen = {r["name"] for r in rows}
        # Include shell alliances declared via /alliances/create but no members yet.
        for name, cat in cats.items():
            if name not in seen:
                rows.append({"name": name, "member_count": 0, "total_power": 0})
        for r in rows:
            r["category"] = cats.get(r["name"])
        rows.sort(key=lambda r: (-(r.get("total_power") or 0), r["name"]))
        return rows

    class CreateBody(BaseModel):
        name: str
        category: Optional[Literal["main", "academy"]] = None

    @router.post("/alliances/create")
    async def create_alliance(body: CreateBody, admin: dict = Depends(require_edit)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "İttifak adı gerekli")
        # Duplicate lock: reject if name already exists in members OR alliance_meta.
        existing = set(await db.members.distinct("alliance_name"))
        existing.update([d["name"] for d in await db.alliance_meta.find({}, {"_id": 0, "name": 1}).to_list(500)])
        if name in existing:
            raise HTTPException(409, f"'{name}' ittifakı zaten var")
        await db.alliance_meta.update_one(
            {"name": name},
            {"$set": {"name": name, "category": body.category}},
            upsert=True,
        )
        await _audit("alliance-create", admin, {"name": name, "category": body.category})
        return {"name": name, "category": body.category}

    @router.post("/alliances/rename")
    async def rename_alliance(body: RenameBody, admin: dict = Depends(require_edit)):
        old = _clean(body.old_name)
        new = _clean(body.new_name)
        if not old or not new:
            raise HTTPException(400, "Geçersiz ittifak adı")
        if old == new:
            return {"matched": 0, "modified": 0, "note": "aynı isim"}
        # Duplicate lock: refuse if `new` already exists as a distinct alliance
        # (exact case-sensitive match). This blocks accidentally overwriting
        # main ↔ academy alliances like GOW/GoW. Real merges must go through
        # `/alliances/merge` where intent is explicit.
        existing = set(await db.members.distinct("alliance_name"))
        if new in existing and new != old:
            raise HTTPException(
                409,
                f"'{new}' ittifakı zaten var. Birleştirmek için 'Birleştir' işlemini kullanın."
            )
        res = await db.members.update_many(
            {"alliance_name": old}, {"$set": {"alliance_name": new}}
        )
        # Migrate category metadata to the new name too.
        try:
            existing_meta = await db.alliance_meta.find_one({"name": old})
            if existing_meta:
                await db.alliance_meta.delete_one({"name": old})
                await db.alliance_meta.update_one(
                    {"name": new},
                    {"$set": {"name": new, "category": existing_meta.get("category")}},
                    upsert=True,
                )
        except Exception:
            pass
        await _audit("alliance-rename", admin, {
            "old_name": old, "new_name": new, "modified": res.modified_count,
        })
        return {"matched": res.matched_count, "modified": res.modified_count}

    @router.post("/alliances/merge")
    async def merge_alliances(body: MergeBody, admin: dict = Depends(require_edit)):
        target = _clean(body.target_name)
        if not target:
            raise HTTPException(400, "target_name gerekli")
        sources = [_clean(s) for s in body.source_names if _clean(s) and _clean(s) != target]
        if not sources:
            raise HTTPException(400, "source_names boş")
        res = await db.members.update_many(
            {"alliance_name": {"$in": sources}},
            {"$set": {"alliance_name": target}},
        )
        try:
            await db.alliance_meta.delete_many({"name": {"$in": sources}})
        except Exception:
            pass
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
        try:
            await db.alliance_meta.delete_one({"name": name})
        except Exception:
            pass
        await _audit("alliance-delete", admin, {
            "name": name, "cleared": res.modified_count,
        })
        return {"cleared": res.modified_count}

    @router.post("/alliances/set-category")
    async def set_category(body: CategoryBody, admin: dict = Depends(require_edit)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "İttifak adı gerekli")
        if body.category is None:
            await db.alliance_meta.delete_one({"name": name})
            await _audit("alliance-category", admin, {"name": name, "category": None})
            return {"name": name, "category": None}
        await db.alliance_meta.update_one(
            {"name": name},
            {"$set": {"name": name, "category": body.category}},
            upsert=True,
        )
        await _audit("alliance-category", admin, {"name": name, "category": body.category})
        return {"name": name, "category": body.category}

    return router
