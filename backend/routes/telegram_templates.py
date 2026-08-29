"""Telegram Grup Mesaj Şablonları (v135.27).

Admin panelinde sık kullanılan Telegram mesajlarını şablon olarak yönetmek
için CRUD + "gönder" endpoint'i. Şablonlar `savas_cagrisi`, `etkinlik_hatirlatma`,
`duyuru`, `diger` kategorilerine ayrılır ve tek tıkla TELEGRAM_CHANNEL_ID'e
gönderilebilir. Gönderim `telegram_bot.send_message` üzerinden yapılır ve
`last_sent_at` / `send_count` alanları per-şablon güncellenir.
"""
from datetime import datetime, timezone
from typing import Optional
import os
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("telegram_templates")

ALLOWED_CATEGORIES = {"savas_cagrisi", "etkinlik_hatirlatma", "duyuru", "diger"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=4000)
    # 'savas_cagrisi' | 'etkinlik_hatirlatma' | 'duyuru' | 'diger'
    category: str = "diger"


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    # v135.38 — arşiv desteği (soft-delete). True → arşive, False → geri getir.
    archived: Optional[bool] = None


def make_telegram_templates_router(db, require_admin):
    router = APIRouter()

    def _sanitize_category(cat: Optional[str]) -> str:
        cat = (cat or "").strip().lower()
        return cat if cat in ALLOWED_CATEGORIES else "diger"

    def _serialize(doc: dict) -> dict:
        # Drop Mongo internal _id (ObjectId isn't JSON-serializable) and stamp
        # a safe default category on legacy rows created before this enum
        # existed.
        doc = {k: v for k, v in doc.items() if k != "_id"}
        if doc.get("category") not in ALLOWED_CATEGORIES:
            doc["category"] = "diger"
        return doc

    @router.get("/telegram-templates")
    async def list_templates(
        category: Optional[str] = None,
        archived: Optional[bool] = False,
        _: dict = Depends(require_admin),
    ):
        # v135.38 — Default: yalnızca aktif (archived != True). ?archived=true
        # ile arşivdekiler döner.
        q: dict = {"archived": True} if archived else {"archived": {"$ne": True}}
        if category and category in ALLOWED_CATEGORIES:
            q["category"] = category
        cursor = db.telegram_message_templates.find(q, {"_id": 0}).sort("updated_at", -1)
        items = [ _serialize(x) async for x in cursor ]
        return {"items": items, "count": len(items)}

    @router.post("/telegram-templates")
    async def create_template(body: TemplateCreate, user: dict = Depends(require_admin)):
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "body": body.body.strip(),
            "category": _sanitize_category(body.category),
            "created_at": now,
            "updated_at": now,
            "created_by_username": (user or {}).get("username") or "sistem",
            "send_count": 0,
            "last_sent_at": None,
        }
        await db.telegram_message_templates.insert_one(doc)
        return {"ok": True, "item": _serialize(doc)}

    @router.patch("/telegram-templates/{tid}")
    async def update_template(
        tid: str, body: TemplateUpdate, _: dict = Depends(require_admin)
    ):
        existing = await db.telegram_message_templates.find_one({"id": tid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "template not found")
        upd = {}
        if body.name is not None:
            n = body.name.strip()
            if not n:
                raise HTTPException(400, "name cannot be empty")
            upd["name"] = n
        if body.body is not None:
            b = body.body.strip()
            if not b:
                raise HTTPException(400, "body cannot be empty")
            upd["body"] = b
        if body.category is not None:
            upd["category"] = _sanitize_category(body.category)
        if body.archived is not None:
            upd["archived"] = bool(body.archived)
        if not upd:
            return {"ok": True, "item": _serialize(existing)}
        upd["updated_at"] = _now_iso()
        await db.telegram_message_templates.update_one({"id": tid}, {"$set": upd})
        doc = await db.telegram_message_templates.find_one({"id": tid}, {"_id": 0})
        return {"ok": True, "item": _serialize(doc)}

    @router.delete("/telegram-templates/{tid}")
    async def delete_template(tid: str, _: dict = Depends(require_admin)):
        r = await db.telegram_message_templates.delete_one({"id": tid})
        if r.deleted_count == 0:
            raise HTTPException(404, "template not found")
        return {"ok": True}

    @router.post("/telegram-templates/{tid}/send")
    async def send_template(tid: str, user: dict = Depends(require_admin)):
        # Look up the template + resolve the channel target from env. If the
        # channel isn't configured we return 400 so the UI can toast a clear
        # message instead of silently no-oping like the older announcement
        # fan-out did.
        doc = await db.telegram_message_templates.find_one({"id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "template not found")
        channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        if not channel or not token:
            raise HTTPException(400, "TELEGRAM_CHANNEL_ID veya TELEGRAM_BOT_TOKEN tanımlı değil")
        # v135.30 — Placeholder substitution. Resolve the newest upcoming
        # (or freshest archived) event so {event_name} / {tarih} / {grup} /
        # {carpan} auto-fill on send. Missing values fall back to "—" so
        # the template renders even when there's no active event.
        body_text = doc.get("body") or ""
        if any(k in body_text for k in ("{event_name}", "{tarih}", "{grup}", "{carpan}")):
            from datetime import datetime as _dtp, timezone as _tzp, timedelta as _tdp
            now_iso_ = _dtp.now(_tzp.utc).isoformat()
            ev = await db.events.find_one(
                {"archived": {"$ne": True}, "date": {"$gte": now_iso_}},
                {"_id": 0, "name": 1, "date": 1, "group_name": 1, "multiplier": 1},
                sort=[("date", 1)],
            ) or await db.events.find_one(
                {}, {"_id": 0, "name": 1, "date": 1, "group_name": 1, "multiplier": 1},
                sort=[("date", -1)],
            ) or {}
            try:
                _du = _dtp.fromisoformat((ev.get("date") or "").replace("Z", "+00:00"))
                if _du.tzinfo is None:
                    _du = _du.replace(tzinfo=_tzp.utc)
                _tr = _du.astimezone(_tzp(_tdp(hours=3)))
                tarih_str = _tr.strftime("%d.%m.%Y %H:%M (TR)")
            except Exception:
                tarih_str = "—"
            body_text = (body_text
                .replace("{event_name}", ev.get("name") or "—")
                .replace("{tarih}", tarih_str)
                .replace("{grup}", ev.get("group_name") or "—")
                .replace("{carpan}", f"×{ev.get('multiplier') or 1}"))
        try:
            from telegram_bot import send_message as _tg_send
            ok = await _tg_send(channel, body_text)
        except Exception as ex:
            logger.warning(f"[tg-template] send failed for {tid}: {ex}")
            raise HTTPException(502, f"Telegram send failed: {str(ex)[:200]}")
        if not ok:
            raise HTTPException(502, "Telegram send returned False")
        now = _now_iso()
        await db.telegram_message_templates.update_one(
            {"id": tid},
            {"$set": {"last_sent_at": now}, "$inc": {"send_count": 1}},
        )
        logger.info(
            f"[tg-template] sent tid={tid} by={(user or {}).get('username')} "
            f"cat={doc.get('category')} chars={len(body_text)}"
        )
        return {"ok": True, "sent_at": now}

    return router


async def ensure_telegram_templates_indexes(db):
    """Create indexes for the templates collection. Called from server startup."""
    try:
        await db.telegram_message_templates.create_index("id", unique=True)
        await db.telegram_message_templates.create_index([("category", 1), ("updated_at", -1)])
    except Exception as e:
        logger.warning(f"telegram_templates index ensure: {e}")
