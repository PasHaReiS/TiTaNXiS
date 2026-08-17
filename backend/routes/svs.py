"""SvS (Server vs Server) battle tracker. Records historical battles with
scores, winner tag, and participant list so leaders can review performance
across seasons."""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


class SvSBattleBody(BaseModel):
    date: str                        # ISO date (YYYY-MM-DD or full ISO)
    enemy_server: str
    our_score: int
    enemy_score: int
    participants: List[str] = []     # member_ids
    notes: Optional[str] = None


def _public(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


def make_svs_router(db, require_auth, require_admin):
    router = APIRouter(prefix="/svs", tags=["svs"])

    @router.get("")
    async def list_battles(user: dict = Depends(require_auth)):
        items = await db.svs_battles.find({}, {"_id": 0}).sort("date", -1).to_list(500)
        wins = sum(1 for b in items if b["our_score"] > b["enemy_score"])
        losses = sum(1 for b in items if b["our_score"] < b["enemy_score"])
        draws = sum(1 for b in items if b["our_score"] == b["enemy_score"])
        return {"items": items, "stats": {"wins": wins, "losses": losses, "draws": draws, "total": len(items)}}

    @router.post("")
    async def create_battle(body: SvSBattleBody, admin: dict = Depends(require_admin)):
        our = int(body.our_score); enemy = int(body.enemy_score)
        winner = "us" if our > enemy else "enemy" if enemy > our else "draw"
        doc = {
            "id": str(uuid.uuid4()),
            "date": body.date,
            "enemy_server": body.enemy_server.strip(),
            "our_score": our,
            "enemy_score": enemy,
            "winner": winner,
            "participants": list(body.participants or []),
            "notes": (body.notes or "").strip() or None,
            "created_at": _now_iso(),
            "created_by": admin["id"],
            "created_by_username": admin.get("username"),
        }
        await db.svs_battles.insert_one(doc)
        return _public(doc)

    @router.patch("/{battle_id}")
    async def update_battle(battle_id: str, body: SvSBattleBody, _: dict = Depends(require_admin)):
        our = int(body.our_score); enemy = int(body.enemy_score)
        winner = "us" if our > enemy else "enemy" if enemy > our else "draw"
        upd = {
            "date": body.date,
            "enemy_server": body.enemy_server.strip(),
            "our_score": our, "enemy_score": enemy, "winner": winner,
            "participants": list(body.participants or []),
            "notes": (body.notes or "").strip() or None,
            "updated_at": _now_iso(),
        }
        r = await db.svs_battles.update_one({"id": battle_id}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(404, "Savaş bulunamadı")
        doc = await db.svs_battles.find_one({"id": battle_id}, {"_id": 0})
        return doc

    @router.delete("/{battle_id}")
    async def delete_battle(battle_id: str, _: dict = Depends(require_admin)):
        await db.svs_battles.delete_one({"id": battle_id})
        return {"ok": True}

    return router


async def ensure_svs_indexes(db):
    await db.svs_battles.create_index("id", unique=True)
    await db.svs_battles.create_index([("date", -1)])
