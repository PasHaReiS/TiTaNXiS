"""Event in-app chat — GET (poll) + POST (RSVP-yes/maybe post).
Küçük self-contained blok — Phase 7 refactor.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventMsgBody(BaseModel):
    text: str


def make_event_messages_router(db, require_auth):
    router = APIRouter()

    @router.get("/events/{event_id}/messages")
    async def event_messages_list(event_id: str, since: Optional[str] = None):
        q: dict = {"event_id": event_id}
        if since:
            q["ts"] = {"$gt": since}
        rows = await db.event_messages.find(q, {"_id": 0}).sort("ts", 1).to_list(500)
        return rows

    @router.post("/events/{event_id}/messages")
    async def event_messages_post(event_id: str, body: EventMsgBody, user: dict = Depends(require_auth)):
        text = (body.text or "").strip()
        if not text:
            raise HTTPException(400, "empty message")
        if len(text) > 500:
            raise HTTPException(400, "message too long (max 500)")
        ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1})
        if not ev:
            raise HTTPException(404, "event not found")
        doc = {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "user_id": user["id"],
            "username": user.get("username"),
            "avatar_url": user.get("avatar_url"),
            "text": text,
            "ts": _now_iso(),
        }
        await db.event_messages.insert_one({**doc})
        return doc

    return router
