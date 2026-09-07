"""Duyurular (Announcements) — CRUD + bulk actions + edit-history revert.

Cross-cutting helpers (`broadcast_push`, `send_tg_channel`, `send_tg_dms`,
`broadcast_in_app`, `translate_fields`) callable olarak inject edilir; bu
sayede modül import-graph'e mengene olmadan mevcut helper'ları kullanır.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, List, Optional, Protocol, Sequence, Tuple
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


# v141 — Refactor Phase 3: Protocol'lar helper signature'larını sözleşme
# haline getirir. Böylece server.py'de bir helper rename olursa mypy/IDE
# hemen görür — silent wiring hataları önlenmiş olur.
class _BroadcastPushFn(Protocol):
    async def __call__(
        self,
        title: str,
        body: str,
        url: str = "/",
        *,
        tag: str = ...,
        group_name: Optional[str] = None,
        alliance_name: Optional[str] = None,
        country_iso2: Optional[str] = None,
        event_id: Optional[str] = None,
        sound: Optional[str] = None,
        notif_pref: Optional[str] = None,
    ) -> dict: ...


class _SendTgChannelFn(Protocol):
    async def __call__(self, doc: dict) -> dict: ...


class _SendTgDmsFn(Protocol):
    async def __call__(self, doc: dict) -> dict: ...


class _BroadcastInAppFn(Protocol):
    async def __call__(self, doc: dict, notif_pref: Optional[str] = None) -> dict: ...


class _TranslateFieldsFn(Protocol):
    async def __call__(self, doc: dict, fields: Sequence[Tuple[str, str]]) -> None: ...


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnnouncementBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = None
    image_url: Optional[str] = None
    broadcast: Optional[bool] = True
    urgent: Optional[bool] = False
    pinned: Optional[bool] = False
    pinned_until: Optional[str] = None
    scheduled_at: Optional[str] = None


class AnnouncementBulkBody(BaseModel):
    ids: List[str]


class AnnouncementPatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None
    urgent: Optional[bool] = None
    active: Optional[bool] = None
    pinned: Optional[bool] = None
    pinned_until: Optional[str] = None


def make_announcements_router(
    db,
    require_auth,
    require_admin,
    broadcast_push: _BroadcastPushFn,
    send_tg_channel: _SendTgChannelFn,
    send_tg_dms: _SendTgDmsFn,
    broadcast_in_app: _BroadcastInAppFn,
    translate_fields: _TranslateFieldsFn,
    logger=None,
):
    router = APIRouter()
    import logging as _logging
    _log = logger or _logging.getLogger(__name__)

    @router.get("/announcements")
    async def announcements_list(
        user: dict = Depends(require_auth),
        limit: int = 30,
        search: Optional[str] = None,
        filter: Optional[str] = None,
    ):
        q: dict = {} if (user and user.get("role") in ("admin", "editor")) else {"active": True}
        if search:
            s = search.strip()
            if s:
                q["$or"] = [
                    {"title": {"$regex": s, "$options": "i"}},
                    {"body": {"$regex": s, "$options": "i"}},
                ]
        f = (filter or "").strip().lower()
        if f == "urgent":
            q["urgent"] = True
        elif f == "scheduled":
            q["pending_broadcast"] = True
        elif f == "normal":
            q["urgent"] = {"$ne": True}
            q["pending_broadcast"] = {"$ne": True}
        elif f == "archived":
            q["active"] = False
        cursor = db.announcements.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 100)))
        return {"items": [r async for r in cursor]}

    @router.post("/announcements")
    async def announcements_create(body: AnnouncementBody, user: dict = Depends(require_admin)):
        scheduled_at_iso: Optional[str] = None
        is_scheduled = False
        if body.scheduled_at:
            try:
                when = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(400, "invalid scheduled_at (must be ISO8601)")
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            if when <= datetime.now(timezone.utc):
                raise HTTPException(400, "scheduled_at must be in the future")
            scheduled_at_iso = when.isoformat()
            is_scheduled = True

        doc = {
            "id": str(uuid.uuid4()),
            "title": (("🚨 " + body.title.strip()) if body.urgent else body.title.strip()),
            "body": body.body.strip(),
            "url": (body.url or "/duyurular").strip(),
            "urgent": bool(body.urgent),
            "image_url": (body.image_url or "").strip() or None,
            "created_by": user["id"],
            "created_by_username": user.get("username") or "",
            "created_at": _now_iso(),
            "active": (not is_scheduled),
            "scheduled_at": scheduled_at_iso,
            "pending_broadcast": is_scheduled and bool(body.broadcast),
            "pinned": bool(body.pinned),
            "pinned_until": (body.pinned_until or "").strip() or None,
        }
        try:
            await translate_fields(doc, [
                ("title", "title_translations"),
                ("body", "body_translations"),
            ])
        except Exception as _tx_ex:
            _log.warning(f"announcement auto-translate failed: {_tx_ex}")
        await db.announcements.insert_one(doc)
        result = {"item": {k: v for k, v in doc.items() if k != "_id"}}
        if body.broadcast and not is_scheduled:
            push_doc = {"id": doc["id"], "title": doc["title"], "body": doc["body"],
                        "url": doc["url"], "image_url": doc.get("image_url"),
                        "send_channel": True, "send_dm": True,
                        "send_app": True, "event_id": None}
            push_task = broadcast_push(
                doc["title"], doc["body"], doc["url"],
                tag=f"announcement-{doc['id']}",
                sound="rally",
                notif_pref="announcement",
            )
            channel_task = send_tg_channel(push_doc)
            dm_task = send_tg_dms(push_doc)
            app_task = broadcast_in_app(push_doc, notif_pref="announcement")
            results = await asyncio.gather(
                push_task, channel_task, dm_task, app_task,
                return_exceptions=True,
            )
            push_r, ch_r, dm_r, app_r = [
                (r if not isinstance(r, Exception) else {}) for r in results
            ]
            result["fanout"] = {
                "push_sent": (push_r or {}).get("sent", 0) if isinstance(push_r, dict) else 0,
                "telegram_channel_sent": (ch_r or {}).get("channel_sent", False),
                "telegram_dm_sent": (dm_r or {}).get("dm_sent", 0),
                "telegram_dm_translated": (dm_r or {}).get("dm_translated", 0),
                "telegram_dm_langs": (dm_r or {}).get("dm_lang_breakdown", {}),
                "app_notif_sent": (app_r or {}).get("app_notif_sent", 0),
            }
        return result

    @router.delete("/announcements/{aid}")
    async def announcements_delete(aid: str, user: dict = Depends(require_admin)):
        r = await db.announcements.delete_one({"id": aid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Duyuru bulunamadı")
        return {"ok": True}

    @router.post("/announcements/bulk-delete")
    async def announcements_bulk_delete(body: AnnouncementBulkBody, _: dict = Depends(require_admin)):
        ids = [i for i in (body.ids or []) if i]
        if not ids:
            return {"deleted": 0}
        r = await db.announcements.delete_many({"id": {"$in": ids}})
        return {"deleted": r.deleted_count}

    @router.post("/announcements/bulk-restore")
    async def announcements_bulk_restore(body: AnnouncementBulkBody, _: dict = Depends(require_admin)):
        ids = [i for i in (body.ids or []) if i]
        if not ids:
            return {"restored": 0}
        r = await db.announcements.update_many(
            {"id": {"$in": ids}},
            {"$set": {"active": True, "restored_at": _now_iso()}},
        )
        return {"restored": r.modified_count}

    @router.patch("/announcements/{aid}")
    async def announcements_patch(aid: str, body: AnnouncementPatch, _: dict = Depends(require_admin)):
        update = {k: v for k, v in body.model_dump().items() if v is not None}
        if not update:
            raise HTTPException(400, "Değişiklik yok")
        current = await db.announcements.find_one({"id": aid}, {"_id": 0})
        if not current:
            raise HTTPException(404, "Duyuru bulunamadı")
        if "title" in update:
            u = update.get("urgent") if "urgent" in update else current.get("urgent")
            # v141 — `str.lstrip('🚨 ')` was a char-set, not substring. removeprefix
            # is Py3.9+ and semantically correct here.
            raw = update["title"]
            clean = (raw.removeprefix("🚨 ") if isinstance(raw, str) else raw).strip()
            update["title"] = ("🚨 " + clean) if u else clean
        snap = None
        if ("title" in update and update["title"] != current.get("title")) or \
           ("body" in update and update["body"] != current.get("body")):
            snap = {
                "title": current.get("title"),
                "body": current.get("body"),
                "image_url": current.get("image_url"),
                "urgent": current.get("urgent"),
                "edited_at": _now_iso(),
            }
        update["updated_at"] = _now_iso()
        ops = {"$set": update}
        if snap:
            ops["$push"] = {"history": {"$each": [snap], "$slice": -20}}
        await db.announcements.update_one({"id": aid}, ops)
        doc = await db.announcements.find_one({"id": aid}, {"_id": 0})
        return {"ok": True, "item": doc}

    @router.post("/announcements/{aid}/revert")
    async def announcements_revert(aid: str, _: dict = Depends(require_admin)):
        doc = await db.announcements.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Duyuru bulunamadı")
        hist = doc.get("history") or []
        if not hist:
            raise HTTPException(400, "Geri alınacak sürüm yok")
        prev = hist[-1]
        await db.announcements.update_one(
            {"id": aid},
            {
                "$set": {
                    "title": prev.get("title"),
                    "body": prev.get("body"),
                    "image_url": prev.get("image_url"),
                    "urgent": prev.get("urgent"),
                    "reverted_at": _now_iso(),
                },
                "$pop": {"history": 1},
            },
        )
        return {"ok": True, "item": await db.announcements.find_one({"id": aid}, {"_id": 0})}

    return router
