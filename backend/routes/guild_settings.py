"""Guild-wide preference toggles — currently only stores the target
participation percentage for the Katılım Trendi benchmark line."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class GuildTargetBody(BaseModel):
    target: int  # 0..100


def make_guild_settings_router(db, require_auth, require_admin):
    router = APIRouter()

    @router.get("/settings/guild-target")
    async def settings_get_guild_target(user: dict = Depends(require_auth)):
        """Return the guild's target participation percentage. Used by the
        Katılım Trendi chart to draw a benchmark line. Default 60% if unset."""
        doc = await db.guild_settings.find_one({"key": "guild_target"}, {"_id": 0})
        return {"target": int((doc or {}).get("value", 60))}

    @router.put("/settings/guild-target")
    async def settings_set_guild_target(body: GuildTargetBody, user: dict = Depends(require_admin)):
        t = max(0, min(100, int(body.target)))
        await db.guild_settings.update_one(
            {"key": "guild_target"},
            {"$set": {"key": "guild_target", "value": t, "updated_at": _now_iso(),
                      "updated_by": user["id"], "updated_by_username": user.get("username")}},
            upsert=True,
        )
        return {"target": t}

    return router
