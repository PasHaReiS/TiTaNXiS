"""Event templates (v135.38).

Etkinlik yaratma formundan "Şablon olarak kaydet" akışı ile tetiklenir; ayrıca
Şablonlar hub'ında elle CRUD yapılabilir. Şablon `date` alanı saklamaz; sadece
yapı (name, group_name, multiplier, subtitle, banner_url, reminder_enabled,
hidden_from_leaderboard, show_breakdown, attendance_enabled). v135.38'de
`archived` alanı + tam PATCH + arşiv filter eklendi.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventTemplateCreate(BaseModel):
    template_name: str
    name: str
    group_name: Optional[str] = "SvS vs 10007"
    multiplier: Optional[float] = 1.0
    subtitle: Optional[str] = None
    banner_url: Optional[str] = None
    reminder_enabled: Optional[bool] = True
    hidden_from_leaderboard: Optional[bool] = False
    show_breakdown: Optional[bool] = True
    attendance_enabled: Optional[bool] = True


class EventTemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    name: Optional[str] = None
    group_name: Optional[str] = None
    multiplier: Optional[float] = None
    subtitle: Optional[str] = None
    banner_url: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    hidden_from_leaderboard: Optional[bool] = None
    show_breakdown: Optional[bool] = None
    attendance_enabled: Optional[bool] = None
    archived: Optional[bool] = None


def _serialize(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


def make_event_templates_router(db, require_auth, require_admin):
    router = APIRouter()

    @router.get("/event-templates")
    async def list_templates(
        archived: Optional[bool] = False,
        _: dict = Depends(require_auth),
    ):
        q = {"archived": True} if archived else {"archived": {"$ne": True}}
        rows = await db.event_templates.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"items": rows}

    @router.post("/event-templates")
    async def create_template(body: EventTemplateCreate, user: dict = Depends(require_admin)):
        tn = (body.template_name or "").strip()
        n = (body.name or "").strip()
        if not tn or not n:
            raise HTTPException(400, "Şablon adı ve etkinlik adı zorunlu")
        doc = {
            "id": str(uuid.uuid4()),
            "template_name": tn,
            "name": n,
            "group_name": (body.group_name or "SvS vs 10007").strip(),
            "multiplier": float(body.multiplier or 1.0),
            "subtitle": (body.subtitle or "").strip() or None,
            "banner_url": (body.banner_url or "").strip() or None,
            "reminder_enabled": bool(body.reminder_enabled),
            "hidden_from_leaderboard": bool(body.hidden_from_leaderboard),
            "show_breakdown": bool(body.show_breakdown),
            "attendance_enabled": True if body.attendance_enabled is None else bool(body.attendance_enabled),
            "archived": False,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "created_by": user.get("username") or "",
        }
        await db.event_templates.insert_one(doc)
        return _serialize(doc)

    @router.patch("/event-templates/{tid}")
    async def update_template(tid: str, body: EventTemplateUpdate, _: dict = Depends(require_admin)):
        existing = await db.event_templates.find_one({"id": tid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Şablon bulunamadı")
        upd: dict = {}
        data = body.model_dump(exclude_unset=True)
        for key in (
            "template_name", "name", "group_name", "subtitle", "banner_url",
        ):
            if key in data:
                v = (data[key] or "").strip() if data[key] is not None else None
                if key in ("template_name", "name") and not v:
                    raise HTTPException(400, f"{key} cannot be empty")
                upd[key] = v or None
        if "multiplier" in data and data["multiplier"] is not None:
            upd["multiplier"] = float(data["multiplier"])
        for key in (
            "reminder_enabled", "hidden_from_leaderboard", "show_breakdown",
            "attendance_enabled", "archived",
        ):
            if key in data and data[key] is not None:
                upd[key] = bool(data[key])
        if not upd:
            return _serialize(existing)
        upd["updated_at"] = _now_iso()
        await db.event_templates.update_one({"id": tid}, {"$set": upd})
        doc = await db.event_templates.find_one({"id": tid}, {"_id": 0})
        return _serialize(doc)

    @router.delete("/event-templates/{tid}")
    async def delete_template(tid: str, _: dict = Depends(require_admin)):
        r = await db.event_templates.delete_one({"id": tid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Şablon bulunamadı")
        return {"ok": True}

    return router


async def ensure_event_templates_indexes(db):
    await db.event_templates.create_index("id", unique=True)
    try:
        await db.event_templates.create_index([("archived", 1), ("created_at", -1)])
    except Exception:
        pass
