"""Alliance management — list / rename / merge / delete alliances.

Alliances are not a separate collection in this schema — they live inside
`members.alliance_name`. Operations are implemented as bulk updates on that
field, so a "rename" is a case-insensitive `updateMany` and a "merge" is a
rename of the losing alliance's members to the winning alliance's canonical
casing.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class RenameBody(BaseModel):
    old_name: str
    new_name: str


class MergeBody(BaseModel):
    source_names: list[str]  # alliances to be renamed
    target_name: str         # canonical alliance they merge into


class DeleteBody(BaseModel):
    name: str  # clears alliance_name on all members with this alliance


def _clean(s: str) -> str:
    return (s or "").replace("[", "").replace("]", "").strip()


def make_alliances_router(db, require_edit):
    router = APIRouter()

    @router.get("/alliances")
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
    async def rename_alliance(body: RenameBody, _: dict = Depends(require_edit)):
        old = _clean(body.old_name)
        new = _clean(body.new_name)
        if not old or not new:
            raise HTTPException(400, "Geçersiz alliance adı")
        if old.lower() == new.lower():
            return {"matched": 0, "modified": 0, "note": "aynı isim"}
        res = await db.members.update_many(
            {"alliance_name": old}, {"$set": {"alliance_name": new}}
        )
        return {"matched": res.matched_count, "modified": res.modified_count}

    @router.post("/alliances/merge")
    async def merge_alliances(body: MergeBody, _: dict = Depends(require_edit)):
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
        return {"merged_from": sources, "merged_to": target, "modified": res.modified_count}

    @router.post("/alliances/delete")
    async def delete_alliance(body: DeleteBody, _: dict = Depends(require_edit)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "İttifak adı gerekli")
        res = await db.members.update_many(
            {"alliance_name": name}, {"$set": {"alliance_name": ""}}
        )
        return {"cleared": res.modified_count}

    return router
