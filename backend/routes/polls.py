"""Polls / Voting (Phase 4). Guild-wide decision-making primitive.

Data model:
- `polls` collection: `{id, question, options:[{id,text}], multi_choice,
  closes_at, closed, created_at, created_by, created_by_username,
  visibility: 'all'|'admins'}`
- `poll_votes` collection: `{id, poll_id, user_id, option_ids:[str], voted_at}`.
  One vote doc per (poll, user). Re-voting overwrites option_ids.

Endpoints all mount under `/api/polls/*` via `make_polls_router()`.
"""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PollOptionCreate(BaseModel):
    text: str


class PollCreateBody(BaseModel):
    question: str
    options: List[PollOptionCreate]
    multi_choice: bool = False
    closes_at: Optional[str] = None  # ISO8601 UTC; None = open until admin closes


class PollVoteBody(BaseModel):
    option_ids: List[str] = Field(default_factory=list)


def _poll_is_closed(poll: dict) -> bool:
    if poll.get("closed"):
        return True
    ca = poll.get("closes_at")
    if not ca:
        return False
    try:
        when = datetime.fromisoformat(ca.replace("Z", "+00:00"))
    except Exception:
        return False
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when <= datetime.now(timezone.utc)


async def _poll_public(db, poll: dict, viewer_id: Optional[str]) -> dict:
    """Serialize a poll for API consumption. Adds vote tallies per option,
    total_votes, closed flag (with auto-close-on-time), and the viewer's
    own vote (`my_option_ids`) so the UI can restore selection state."""
    poll_id = poll["id"]
    option_ids = [o["id"] for o in poll.get("options", [])]
    tallies = {oid: 0 for oid in option_ids}
    total_voters = 0
    votes_cursor = db.poll_votes.find({"poll_id": poll_id}, {"_id": 0, "option_ids": 1, "user_id": 1})
    my_options: List[str] = []
    async for v in votes_cursor:
        total_voters += 1
        for oid in v.get("option_ids") or []:
            if oid in tallies:
                tallies[oid] += 1
        if viewer_id and v.get("user_id") == viewer_id:
            my_options = list(v.get("option_ids") or [])
    total_choices = sum(tallies.values()) or 1  # avoid div/0 for %
    options = [
        {
            "id": o["id"],
            "text": o["text"],
            "votes": tallies.get(o["id"], 0),
            "pct": round(tallies.get(o["id"], 0) / total_choices * 100, 1),
        }
        for o in poll.get("options", [])
    ]
    return {
        "id": poll_id,
        "question": poll.get("question"),
        "options": options,
        "multi_choice": bool(poll.get("multi_choice")),
        "closes_at": poll.get("closes_at"),
        "closed": _poll_is_closed(poll),
        "created_at": poll.get("created_at"),
        "created_by_username": poll.get("created_by_username"),
        "total_voters": total_voters,
        "my_option_ids": my_options,
        "has_voted": bool(my_options),
    }


def make_polls_router(db, require_auth, require_admin, on_poll_created=None):
    """`on_poll_created` — optional async callback invoked with
    `(question:str, poll_id:str)` right after a poll is inserted. Wired by
    server.py to fan out Web Push + TG DM + in-app bell (Faz 5 broadcast)."""
    router = APIRouter(prefix="/polls", tags=["polls"])

    @router.get("")
    async def list_polls(user: dict = Depends(require_auth)):
        """Every poll, newest first. Response items carry live tallies and
        the caller's own vote so the UI can render the ballot in one call."""
        polls = await db.polls.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"items": [await _poll_public(db, p, user["id"]) for p in polls]}

    @router.get("/{poll_id}")
    async def get_poll(poll_id: str, user: dict = Depends(require_auth)):
        p = await db.polls.find_one({"id": poll_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Anket bulunamadı")
        return await _poll_public(db, p, user["id"])

    @router.post("")
    async def create_poll(body: PollCreateBody, admin: dict = Depends(require_admin)):
        q = (body.question or "").strip()
        if not q:
            raise HTTPException(400, "Soru zorunlu")
        cleaned_opts = []
        for o in body.options or []:
            t = (o.text or "").strip()
            if not t:
                continue
            cleaned_opts.append({"id": uuid.uuid4().hex[:12], "text": t})
        if len(cleaned_opts) < 2:
            raise HTTPException(400, "En az 2 seçenek gerekli")
        closes_at = None
        if body.closes_at:
            try:
                when = datetime.fromisoformat(body.closes_at.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(400, "invalid closes_at")
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            if when <= datetime.now(timezone.utc):
                raise HTTPException(400, "closes_at gelecekte olmalı")
            closes_at = when.isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "question": q,
            "options": cleaned_opts,
            "multi_choice": bool(body.multi_choice),
            "closes_at": closes_at,
            "closed": False,
            "created_at": _now_iso(),
            "created_by": admin["id"],
            "created_by_username": admin.get("username") or "",
        }
        await db.polls.insert_one(doc)
        # Fan out the announcement across all channels — non-blocking, best-effort.
        if on_poll_created is not None:
            try:
                import asyncio as _asyncio
                _asyncio.create_task(on_poll_created(doc["question"], doc["id"]))
            except Exception:
                pass
        return await _poll_public(db, doc, admin["id"])

    @router.post("/{poll_id}/vote")
    async def vote(poll_id: str, body: PollVoteBody, user: dict = Depends(require_auth)):
        p = await db.polls.find_one({"id": poll_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Anket bulunamadı")
        if _poll_is_closed(p):
            raise HTTPException(400, "Anket kapalı")
        valid_ids = {o["id"] for o in p.get("options", [])}
        selected = [oid for oid in (body.option_ids or []) if oid in valid_ids]
        if not selected:
            raise HTTPException(400, "En az bir seçenek gerekli")
        if not p.get("multi_choice") and len(selected) > 1:
            raise HTTPException(400, "Bu ankette tek seçim yapılabilir")
        # Upsert one vote doc per (poll, user). Re-voting overwrites.
        await db.poll_votes.update_one(
            {"poll_id": poll_id, "user_id": user["id"]},
            {"$set": {"poll_id": poll_id, "user_id": user["id"],
                      "option_ids": selected, "voted_at": _now_iso()},
             "$setOnInsert": {"id": str(uuid.uuid4())}},
            upsert=True,
        )
        return await _poll_public(db, p, user["id"])

    @router.delete("/{poll_id}/vote")
    async def unvote(poll_id: str, user: dict = Depends(require_auth)):
        """Retract the caller's vote. Useful for accidental submits."""
        p = await db.polls.find_one({"id": poll_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Anket bulunamadı")
        if _poll_is_closed(p):
            raise HTTPException(400, "Anket kapalı")
        await db.poll_votes.delete_one({"poll_id": poll_id, "user_id": user["id"]})
        return await _poll_public(db, p, user["id"])

    @router.patch("/{poll_id}/close")
    async def close_poll(poll_id: str, _: dict = Depends(require_admin)):
        r = await db.polls.update_one({"id": poll_id}, {"$set": {"closed": True, "closed_at": _now_iso()}})
        if r.matched_count == 0:
            raise HTTPException(404, "Anket bulunamadı")
        return {"ok": True}

    @router.patch("/{poll_id}/reopen")
    async def reopen_poll(poll_id: str, _: dict = Depends(require_admin)):
        """Admin escape hatch — flip `closed` back to false. If `closes_at`
        already passed, clear it too so the poll reopens indefinitely."""
        p = await db.polls.find_one({"id": poll_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Anket bulunamadı")
        upd = {"closed": False}
        if _poll_is_closed({**p, "closed": False}):
            upd["closes_at"] = None
        await db.polls.update_one({"id": poll_id}, {"$set": upd})
        return {"ok": True}

    @router.delete("/{poll_id}")
    async def delete_poll(poll_id: str, _: dict = Depends(require_admin)):
        await db.polls.delete_one({"id": poll_id})
        await db.poll_votes.delete_many({"poll_id": poll_id})
        return {"ok": True}

    return router


async def ensure_polls_indexes(db):
    await db.polls.create_index("id", unique=True)
    await db.poll_votes.create_index([("poll_id", 1), ("user_id", 1)], unique=True)
    await db.poll_votes.create_index("poll_id")
