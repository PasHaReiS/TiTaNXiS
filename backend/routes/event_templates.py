"""Event templates — save an event's shape (name, group, multiplier,
subtitle, banner, reminder_enabled) so admins can quickly re-create similar
events. The template does NOT store `date` — only structural fields.

Endpoints:
- GET  /api/event-templates            — list all templates (auth)
- POST /api/event-templates            — admin creates a template
- DELETE /api/event-templates/{id}     — admin deletes
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


def make_event_templates_router(db, require_auth, require_admin):
    router = APIRouter()

    @router.get("/event-templates")
    async def list_templates(_: dict = Depends(require_auth)):
        rows = await db.event_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
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
            "created_at": _now_iso(),
            "created_by": user.get("username") or "",
        }
        await db.event_templates.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/event-templates/{tid}")
    async def delete_template(tid: str, _: dict = Depends(require_admin)):
        r = await db.event_templates.delete_one({"id": tid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Şablon bulunamadı")
        return {"ok": True}

    return router


async def ensure_event_templates_indexes(db):
    await db.event_templates.create_index("id", unique=True)
