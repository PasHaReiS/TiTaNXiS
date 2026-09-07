"""İttifak renkleri ve scope (Global/Sunucu) meta yönetimi.
`alliances.py` router'ı ana ittifak CRUD'u tutar; bu dosya sadece ittifak-adı
başına renk + scope preference'lerini yönetir.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AllianceColor(BaseModel):
    name: str
    color: str  # hex like "#DC2626"


class AllianceScopeBody(BaseModel):
    scope: str  # "global" | "server"


def make_alliance_meta_router(db, require_edit):
    router = APIRouter()

    @router.get("/alliance-colors")
    async def list_alliance_colors():
        docs = await db.alliance_colors.find({}, {"_id": 0}).to_list(500)
        return {d["name"]: d["color"] for d in docs}

    @router.put("/alliance-colors")
    async def upsert_alliance_color(body: AllianceColor, _: dict = Depends(require_edit)):
        name = (body.name or "").strip()
        color = (body.color or "").strip()
        if not name:
            raise HTTPException(400, "Alliance name required")
        if not color.startswith("#") or len(color) not in (4, 7):
            raise HTTPException(400, "Color must be hex like #RRGGBB or #RGB")
        await db.alliance_colors.update_one(
            {"name": name},
            {"$set": {"name": name, "color": color, "updated_at": _now_iso()}},
            upsert=True,
        )
        return {"name": name, "color": color}

    @router.delete("/alliance-colors/{name}")
    async def delete_alliance_color(name: str, _: dict = Depends(require_edit)):
        await db.alliance_colors.delete_one({"name": name})
        return {"deleted": True}

    @router.get("/alliance-scopes")
    async def list_alliance_scopes():
        """Per-alliance default scope (Global/Sunucu) used to render the toggle
        above each alliance header on the Members page."""
        docs = await db.alliance_scopes.find({}, {"_id": 0}).to_list(500)
        return {d["name"]: d.get("scope", "server") for d in docs}

    @router.post("/alliances/{name}/scope")
    async def set_alliance_scope(name: str, body: AllianceScopeBody, _: dict = Depends(require_edit)):
        """Sets an alliance's scope AND cascades that scope to every member with
        the same alliance_name."""
        if body.scope not in ("global", "server"):
            raise HTTPException(400, "scope must be 'global' or 'server'")
        await db.alliance_scopes.update_one(
            {"name": name},
            {"$set": {"name": name, "scope": body.scope, "updated_at": _now_iso()}},
            upsert=True,
        )
        result = await db.members.update_many(
            {"alliance_name": name},
            {"$set": {"scope": body.scope}},
        )
        return {"name": name, "scope": body.scope, "members_updated": result.modified_count}

    return router
