"""Admin-only hidden notes attached to a member. Distinct from the public
`note` field on members (which is visible to everyone). Only admins can
read/write these — regular users, editors, and the linked member itself
never see them.

Data model: stored as `admin_note: str | None` directly on the member
document to keep the read path a single lookup. History is not tracked
(admin notes are low-stakes coaching / internal reminders).

Endpoints:
- GET  /api/members/{id}/admin-note   — admin reads
- PUT  /api/members/{id}/admin-note   — admin upserts (empty string clears)
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


class AdminNoteBody(BaseModel):
    note: Optional[str] = None


def make_admin_notes_router(db, require_admin):
    router = APIRouter()

    @router.get("/members/{member_id}/admin-note")
    async def get_admin_note(member_id: str, _: dict = Depends(require_admin)):
        m = await db.members.find_one(
            {"id": member_id}, {"_id": 0, "id": 1, "name": 1, "admin_note": 1}
        )
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        return {"member_id": member_id, "name": m.get("name"), "admin_note": m.get("admin_note") or ""}

    @router.put("/members/{member_id}/admin-note")
    async def set_admin_note(member_id: str, body: AdminNoteBody, user: dict = Depends(require_admin)):
        note = (body.note or "").strip()
        m = await db.members.find_one({"id": member_id}, {"_id": 0, "id": 1})
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        await db.members.update_one(
            {"id": member_id},
            {"$set": {
                "admin_note": note if note else None,
                "admin_note_updated_by": user.get("username") or "",
                "admin_note_updated_at": None if not note else __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            }},
        )
        return {"ok": True, "admin_note": note}

    return router
