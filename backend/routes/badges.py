"""Badge system — preset + custom badges assignable to members.

Data model:
- `badges` collection: `{id, name, icon, icon_url, is_preset, description,
   color, created_at, created_by}`. `icon` is an emoji shortcut; `icon_url`
   overrides it for custom uploads. `is_preset=True` rows come from the
   startup seed and cannot be deleted.
- `member_badges` collection: `{id, member_id, badge_id, awarded_at,
   awarded_by_username}`. Multiple badges per member; a member can hold the
   same badge only once (compound unique).

Endpoints (all under `/api/badges/*` + `/api/members/{id}/badges/*`):
- GET  /api/badges                        — list all badges
- POST /api/badges                        — admin creates custom badge
- DELETE /api/badges/{id}                 — admin deletes custom badge
- POST /api/members/{member_id}/badges    — admin assigns
- DELETE /api/members/{member_id}/badges/{badge_id} — admin removes
- GET  /api/members/{member_id}/badges    — list a member's badges (public)
"""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# 12 preset badges seeded on startup. Icons are emoji; `is_preset=True`
# so admins can assign/unassign but not delete these rows.
PRESET_BADGES = [
    {"key": "lider",     "name": "Lider",     "icon": "👑", "color": "#F5A623", "description": "İttifak lideri"},
    {"key": "tiran",     "name": "Tiran",     "icon": "💀", "color": "#DC2626", "description": "Acımasız komutan"},
    {"key": "savasci",   "name": "Savaşçı",   "icon": "⚔️", "color": "#B91C1C", "description": "Sahada aktif"},
    {"key": "efsane",    "name": "Efsane",    "icon": "💎", "color": "#38BDF8", "description": "Efsanevi başarılar"},
    {"key": "sampiyon",  "name": "Şampiyon",  "icon": "🏆", "color": "#EAB308", "description": "Etkinlik şampiyonu"},
    {"key": "streak",    "name": "Streak",    "icon": "🔥", "color": "#F97316", "description": "Kesintisiz katılım"},
    {"key": "izci",      "name": "İzci",      "icon": "👁", "color": "#6366F1", "description": "Keşif uzmanı"},
    {"key": "zengin",    "name": "Zengin",    "icon": "💰", "color": "#EAB308", "description": "Bol kaynaklı"},
    {"key": "fakir",     "name": "Fakir",     "icon": "🪙", "color": "#78716C", "description": "Kaynak sıkıntısı"},
    {"key": "sansli",    "name": "Şanslı",    "icon": "🧲", "color": "#22C55E", "description": "Şansı bol"},
    {"key": "sanssiz",   "name": "Şanssız",   "icon": "🪞", "color": "#94A3B8", "description": "Şansı kıt"},
    {"key": "baris",     "name": "Barış",     "icon": "☮️", "color": "#10B981", "description": "Diplomat"},
]


class BadgeCreateBody(BaseModel):
    name: str
    icon: Optional[str] = None       # emoji shortcut
    icon_url: Optional[str] = None   # uploaded image URL
    color: Optional[str] = "#F5A623"
    description: Optional[str] = None


class BadgeAssignBody(BaseModel):
    badge_id: str


def make_badges_router(db, require_auth, require_admin):
    router = APIRouter()

    @router.get("/badges")
    async def list_badges(_: dict = Depends(require_auth)):
        cursor = db.badges.find({}, {"_id": 0}).sort([("is_preset", -1), ("name", 1)])
        return {"items": [b async for b in cursor]}

    @router.post("/badges")
    async def create_badge(body: BadgeCreateBody, user: dict = Depends(require_admin)):
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(400, "İsim zorunlu")
        if not body.icon and not body.icon_url:
            raise HTTPException(400, "Emoji veya görsel URL gerekli")
        doc = {
            "id": str(uuid.uuid4()),
            "name": name,
            "icon": (body.icon or "").strip() or None,
            "icon_url": (body.icon_url or "").strip() or None,
            "color": (body.color or "#F5A623").strip(),
            "description": (body.description or "").strip() or None,
            "is_preset": False,
            "created_at": _now_iso(),
            "created_by": user.get("username") or "",
        }
        await db.badges.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/badges/{badge_id}")
    async def delete_badge(badge_id: str, _: dict = Depends(require_admin)):
        b = await db.badges.find_one({"id": badge_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Rozet bulunamadı")
        if b.get("is_preset"):
            raise HTTPException(400, "Hazır rozet silinemez")
        await db.badges.delete_one({"id": badge_id})
        # Also remove any member_badges rows referencing it.
        await db.member_badges.delete_many({"badge_id": badge_id})
        return {"ok": True}

    @router.get("/members/{member_id}/badges")
    async def list_member_badges(member_id: str, _: dict = Depends(require_auth)):
        rows = await db.member_badges.find(
            {"member_id": member_id}, {"_id": 0}
        ).sort("awarded_at", -1).to_list(200)
        # Enrich with badge details.
        badge_ids = list({r["badge_id"] for r in rows})
        badges = {b["id"]: b async for b in db.badges.find(
            {"id": {"$in": badge_ids}}, {"_id": 0}
        )}
        enriched = []
        for r in rows:
            b = badges.get(r["badge_id"])
            if not b:
                continue
            enriched.append({**r, "badge": b})
        return {"items": enriched}

    @router.post("/members/{member_id}/badges")
    async def assign_badge(member_id: str, body: BadgeAssignBody, user: dict = Depends(require_admin)):
        m = await db.members.find_one({"id": member_id}, {"_id": 0, "id": 1, "name": 1})
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        b = await db.badges.find_one({"id": body.badge_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Rozet bulunamadı")
        existing = await db.member_badges.find_one({"member_id": member_id, "badge_id": body.badge_id})
        if existing:
            raise HTTPException(400, "Bu rozet zaten bu üyede")
        doc = {
            "id": str(uuid.uuid4()),
            "member_id": member_id,
            "badge_id": body.badge_id,
            "awarded_at": _now_iso(),
            "awarded_by_username": user.get("username") or "",
        }
        await db.member_badges.insert_one(doc)
        doc.pop("_id", None)
        return {"ok": True, "assignment": doc, "badge": b}

    @router.delete("/members/{member_id}/badges/{badge_id}")
    async def remove_badge(member_id: str, badge_id: str, _: dict = Depends(require_admin)):
        r = await db.member_badges.delete_one({"member_id": member_id, "badge_id": badge_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "Atama bulunamadı")
        return {"ok": True}

    return router


async def ensure_badges_indexes(db):
    await db.badges.create_index("id", unique=True)
    await db.member_badges.create_index([("member_id", 1), ("badge_id", 1)], unique=True)
    await db.member_badges.create_index("badge_id")


async def seed_preset_badges(db):
    """Insert the 12 preset badges if they don't already exist. Idempotent
    via `key` uniqueness — never overwrites admin edits."""
    for p in PRESET_BADGES:
        existing = await db.badges.find_one({"key": p["key"]})
        if existing:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "key": p["key"],
            "name": p["name"],
            "icon": p["icon"],
            "icon_url": None,
            "color": p["color"],
            "description": p["description"],
            "is_preset": True,
            "created_at": _now_iso(),
            "created_by": "system",
        }
        await db.badges.insert_one(doc)
