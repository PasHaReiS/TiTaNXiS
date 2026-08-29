"""RSVP Hatırlatma Şablonları (v135.38).

Admin bir hazır mesaj oluşturur (Push + Telegram DM için). Şablonu bir
etkinlik ile eşleştirip "Gönder" tuşuna basınca RSVP=yes/maybe/no VERMEMİŞ
tüm üyelere toplu bildirim atılır. Alliance scope + push subscription
filter server.py'daki mantığın aynısı ile çalışır (aynı VAPID + telegram
bot instance'ını lazy import ediyoruz).
"""
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import os
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("rsvp_templates")

ALLOWED_CHANNELS = {"push", "telegram_dm"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RsvpTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=4000)
    # ["push", "telegram_dm"] — hangi kanallara gönderilecek. Boşsa ikisi de.
    channels: Optional[List[str]] = None


class RsvpTemplateUpdate(BaseModel):
    name: Optional[str] = None
    body: Optional[str] = None
    channels: Optional[List[str]] = None
    archived: Optional[bool] = None


class RsvpTemplateSendBody(BaseModel):
    event_id: str
    include_maybe: bool = False  # False = maybe sayılmaz (hâlâ hatırlatılır)


def _sanitize_channels(chs: Optional[List[str]]) -> List[str]:
    if not chs:
        return ["push", "telegram_dm"]
    out = [c for c in chs if c in ALLOWED_CHANNELS]
    return out or ["push", "telegram_dm"]


def _serialize(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


def make_rsvp_templates_router(db, require_admin):
    router = APIRouter()

    @router.get("/rsvp-templates")
    async def list_tpls(
        archived: Optional[bool] = False,
        _: dict = Depends(require_admin),
    ):
        q = {"archived": True} if archived else {"archived": {"$ne": True}}
        cursor = db.rsvp_templates.find(q, {"_id": 0}).sort("updated_at", -1)
        items = [_serialize(x) async for x in cursor]
        return {"items": items, "count": len(items)}

    @router.post("/rsvp-templates")
    async def create_tpl(body: RsvpTemplateCreate, user: dict = Depends(require_admin)):
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "body": body.body.strip(),
            "channels": _sanitize_channels(body.channels),
            "archived": False,
            "created_at": now,
            "updated_at": now,
            "created_by_username": (user or {}).get("username") or "sistem",
            "send_count": 0,
            "last_sent_at": None,
        }
        await db.rsvp_templates.insert_one(doc)
        return {"ok": True, "item": _serialize(doc)}

    @router.patch("/rsvp-templates/{tid}")
    async def update_tpl(tid: str, body: RsvpTemplateUpdate, _: dict = Depends(require_admin)):
        existing = await db.rsvp_templates.find_one({"id": tid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "template not found")
        upd: dict = {}
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
        if body.channels is not None:
            upd["channels"] = _sanitize_channels(body.channels)
        if body.archived is not None:
            upd["archived"] = bool(body.archived)
        if not upd:
            return {"ok": True, "item": _serialize(existing)}
        upd["updated_at"] = _now_iso()
        await db.rsvp_templates.update_one({"id": tid}, {"$set": upd})
        doc = await db.rsvp_templates.find_one({"id": tid}, {"_id": 0})
        return {"ok": True, "item": _serialize(doc)}

    @router.delete("/rsvp-templates/{tid}")
    async def delete_tpl(tid: str, _: dict = Depends(require_admin)):
        r = await db.rsvp_templates.delete_one({"id": tid})
        if r.deleted_count == 0:
            raise HTTPException(404, "template not found")
        return {"ok": True}

    @router.post("/rsvp-templates/{tid}/send")
    async def send_tpl(tid: str, body: RsvpTemplateSendBody, user: dict = Depends(require_admin)):
        """RSVP VERMEMİŞ üyelere toplu bildirim.
        `include_maybe=True` verilirse `maybe` diyenler de hedeflenir
        (henüz kesin RSVP yok muamelesi).

        Alliance targeting `_resolve_user_alliances` mantığını yansıtır:
        user.member_ids + user.member_id + reverse `members.user_id` ile
        üye kayıtları toplanır, alliance_name buradan çekilir. `alliance_scope`
        boş veya 'all' -> filtresiz.
        """
        tpl = await db.rsvp_templates.find_one({"id": tid}, {"_id": 0})
        if not tpl:
            raise HTTPException(404, "template not found")
        ev = await db.events.find_one({"id": body.event_id}, {"_id": 0, "id": 1, "name": 1, "date": 1, "alliance_scope": 1})
        if not ev:
            raise HTTPException(404, "event not found")

        # 1) Cevaplayanları çıkar.
        answered_statuses = ["yes", "no"] if body.include_maybe else ["yes", "maybe", "no"]
        rsvp_rows = await db.event_rsvps.find(
            {"event_id": body.event_id, "status": {"$in": answered_statuses}},
            {"_id": 0, "user_id": 1},
        ).to_list(10000)
        answered_ids = {r["user_id"] for r in rsvp_rows if r.get("user_id")}

        # 2) Tüm kullanıcıları çek + üye eşleşmelerini çöz (batch).
        all_users = await db.users.find(
            {}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "username": 1},
        ).to_list(10000)
        user_to_mids: dict = {}
        for u in all_users:
            uid = u.get("id")
            if not uid:
                continue
            mids: set = set()
            for m in (u.get("member_ids") or []):
                if m:
                    mids.add(m)
            if u.get("member_id"):
                mids.add(u["member_id"])
            user_to_mids[uid] = mids

        # Reverse index — bazı üye kayıtları `user_id` ile bağlanmış olabilir.
        rev = await db.members.find(
            {"user_id": {"$in": list(user_to_mids.keys())}},
            {"_id": 0, "id": 1, "user_id": 1},
        ).to_list(20000)
        for r in rev:
            uid = r.get("user_id")
            if uid and r.get("id"):
                user_to_mids.setdefault(uid, set()).add(r["id"])

        # 3) Tüm member id'leri toplayıp alliance + telegram_chat_id çek.
        all_mids: set = set()
        for s in user_to_mids.values():
            all_mids |= s
        member_map: dict = {}
        if all_mids:
            m_rows = await db.members.find(
                {"id": {"$in": list(all_mids)}},
                {"_id": 0, "id": 1, "alliance_name": 1, "telegram_chat_id": 1},
            ).to_list(50000)
            member_map = {m["id"]: m for m in m_rows if m.get("id")}

        # 4) Scope filtresi + hedef listesi.
        scope = (ev.get("alliance_scope") or "").strip()
        no_scope = (not scope) or scope.lower() == "all"
        target_ids: list = []
        target_tg_chat: dict = {}
        for uid, mids in user_to_mids.items():
            if uid in answered_ids:
                continue
            alliances = set()
            chats = []
            for mid in mids:
                m = member_map.get(mid) or {}
                if m.get("alliance_name"):
                    alliances.add(str(m.get("alliance_name")).strip())
                if m.get("telegram_chat_id"):
                    chats.append(m.get("telegram_chat_id"))
            if not no_scope and scope not in alliances:
                continue
            target_ids.append(uid)
            if chats:
                target_tg_chat[uid] = chats[0]

        # 5) Push opt-out: notification_prefs.reminder==False kullanıcılarını çıkar.
        try:
            from server import _users_disabled_for_pref as _udfp
            disabled = await _udfp("reminder")
            target_ids = [u for u in target_ids if u not in disabled]
        except Exception:
            pass

        push_sent = 0
        tg_sent = 0
        push_failed = 0
        tg_failed = 0
        channels = _sanitize_channels(tpl.get("channels"))
        push_body = (tpl.get("body") or "")[:240]

        # Push
        if "push" in channels and target_ids:
            try:
                from server import _get_or_create_vapid
                from pywebpush import webpush, WebPushException  # type: ignore
                subs = await db.push_subscriptions.find(
                    {"user_id": {"$in": target_ids}}, {"_id": 0},
                ).to_list(5000)
                if subs:
                    private_pem, _pub = await _get_or_create_vapid()
                    payload = json.dumps({
                        "title": f"⏰ {ev.get('name') or 'Etkinlik'}",
                        "body": push_body,
                        "url": f"/etkinlikler#event-{ev['id']}",
                        "tag": f"rsvp-template-{tid}-{ev['id']}",
                    }, ensure_ascii=False)
                    vapid_sub = {"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")}
                    for s in subs:
                        try:
                            webpush(
                                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                                data=payload,
                                vapid_private_key=private_pem,
                                vapid_claims=vapid_sub,
                            )
                            push_sent += 1
                        except WebPushException as ex:
                            push_failed += 1
                            code = getattr(getattr(ex, "response", None), "status_code", None)
                            if code in (404, 410):
                                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                        except Exception:
                            push_failed += 1
            except Exception as ex:
                logger.warning(f"[rsvp-tpl] push fanout failed: {ex}")

        # Telegram DM
        if "telegram_dm" in channels and target_ids:
            try:
                from telegram_bot import send_message as _tg_send
                for uid in target_ids:
                    chat = target_tg_chat.get(uid)
                    if not chat:
                        continue
                    try:
                        ok = await _tg_send(str(chat), push_body)
                        if ok:
                            tg_sent += 1
                        else:
                            tg_failed += 1
                    except Exception:
                        tg_failed += 1
            except Exception as ex:
                logger.warning(f"[rsvp-tpl] telegram_dm fanout failed: {ex}")

        now = _now_iso()
        # send_count / last_sent_at sadece hedef bulunduğunda güncellenir —
        # 0 hedefli gönderim UI'da "gönderildi" yanıltmasın.
        if target_ids:
            await db.rsvp_templates.update_one(
                {"id": tid},
                {"$set": {"last_sent_at": now}, "$inc": {"send_count": 1}},
            )
        return {
            "ok": True,
            "sent_at": now,
            "target_count": len(target_ids),
            "push_sent": push_sent,
            "push_failed": push_failed,
            "telegram_sent": tg_sent,
            "telegram_failed": tg_failed,
            "channels": channels,
        }

    return router


async def ensure_rsvp_templates_indexes(db):
    try:
        await db.rsvp_templates.create_index("id", unique=True)
        await db.rsvp_templates.create_index([("archived", 1), ("updated_at", -1)])
    except Exception as e:
        logger.warning(f"rsvp_templates index ensure: {e}")
