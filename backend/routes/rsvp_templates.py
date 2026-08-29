"""RSVP Hatırlatma Şablonları (v135.39).

v135.38 → v135.39 değişiklikleri:
  - Send mantığı `_run_send()` modül-seviyesi yardımcıya çıkarıldı; hem
    `/send`, hem yeni `/test-send`, hem de zamanlayıcı aynı fonksiyonu
    çağırır (drift olmaz).
  - `/rsvp-templates/{tid}/test-send` — sadece bir kullanıcıya (default:
    admin'in kendisi) gönderim yapan doğrulama endpoint'i.
  - `/rsvp-schedules` CRUD — bir şablonu bir etkinlikten `minutes_before`
    dakika önce otomatik göndermek üzere planlar. `send_at` MongoDB'de UTC
    ISO olarak saklanır.
  - `check_and_fire_due_schedules(db)` — server startup'ında spawn'lanan
    periyodik loop tarafından her 60 sn'de bir çağırılır; `sent==False` ve
    `send_at <= now` olan planları ateşler, `sent=True` işaretler.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import os
import json
import logging
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("rsvp_templates")

ALLOWED_CHANNELS = {"push", "telegram_dm"}
ALLOWED_MINUTES_BEFORE = {15, 30, 60, 120, 180, 360, 720, 1440}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_event_dt(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        s = iso.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class RsvpTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=4000)
    channels: Optional[List[str]] = None


class RsvpTemplateUpdate(BaseModel):
    name: Optional[str] = None
    body: Optional[str] = None
    channels: Optional[List[str]] = None
    archived: Optional[bool] = None


class RsvpTemplateSendBody(BaseModel):
    event_id: str
    include_maybe: bool = False


class RsvpTestSendBody(BaseModel):
    # Boş bırakılırsa gönderi mevcut admin kullanıcısına yapılır.
    user_id: Optional[str] = None


class RsvpScheduleCreate(BaseModel):
    template_id: str
    event_id: str
    minutes_before: int
    include_maybe: bool = False


def _sanitize_channels(chs: Optional[List[str]]) -> List[str]:
    if not chs:
        return ["push", "telegram_dm"]
    out = [c for c in chs if c in ALLOWED_CHANNELS]
    return out or ["push", "telegram_dm"]


def _serialize(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


async def _resolve_targets(db, ev: dict, include_maybe: bool) -> tuple[list, dict]:
    """Return (target_user_ids, {user_id: first_telegram_chat_id})."""
    answered_statuses = ["yes", "no"] if include_maybe else ["yes", "maybe", "no"]
    rsvp_rows = await db.event_rsvps.find(
        {"event_id": ev["id"], "status": {"$in": answered_statuses}},
        {"_id": 0, "user_id": 1},
    ).to_list(10000)
    answered_ids = {r["user_id"] for r in rsvp_rows if r.get("user_id")}

    all_users = await db.users.find(
        {}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1},
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

    rev = await db.members.find(
        {"user_id": {"$in": list(user_to_mids.keys())}},
        {"_id": 0, "id": 1, "user_id": 1},
    ).to_list(20000)
    for r in rev:
        uid = r.get("user_id")
        if uid and r.get("id"):
            user_to_mids.setdefault(uid, set()).add(r["id"])

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

    # Opt-out
    try:
        from server import _users_disabled_for_pref as _udfp
        disabled = await _udfp("reminder")
        target_ids = [u for u in target_ids if u not in disabled]
    except Exception:
        pass

    return target_ids, target_tg_chat


async def _fanout_push_and_tg(db, tpl: dict, ev: dict, target_ids: list, target_tg_chat: dict, tag_suffix: str = "") -> dict:
    """Push + Telegram DM fanout. Returns delivery counters."""
    channels = _sanitize_channels(tpl.get("channels"))
    body = (tpl.get("body") or "")[:240]
    push_sent = 0
    push_failed = 0
    tg_sent = 0
    tg_failed = 0

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
                    "body": body,
                    "url": f"/etkinlikler#event-{ev['id']}",
                    "tag": f"rsvp-template-{tpl['id']}-{ev['id']}{tag_suffix}",
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

    if "telegram_dm" in channels and target_ids:
        try:
            from telegram_bot import send_message as _tg_send
            for uid in target_ids:
                chat = target_tg_chat.get(uid)
                if not chat:
                    continue
                try:
                    ok = await _tg_send(str(chat), body)
                    if ok:
                        tg_sent += 1
                    else:
                        tg_failed += 1
                except Exception:
                    tg_failed += 1
        except Exception as ex:
            logger.warning(f"[rsvp-tpl] telegram_dm fanout failed: {ex}")

    return {
        "channels": channels,
        "push_sent": push_sent,
        "push_failed": push_failed,
        "telegram_sent": tg_sent,
        "telegram_failed": tg_failed,
    }


async def _run_send(db, tid: str, event_id: str, include_maybe: bool) -> dict:
    tpl = await db.rsvp_templates.find_one({"id": tid}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "template not found")
    ev = await db.events.find_one(
        {"id": event_id},
        {"_id": 0, "id": 1, "name": 1, "date": 1, "alliance_scope": 1},
    )
    if not ev:
        raise HTTPException(404, "event not found")
    target_ids, target_tg_chat = await _resolve_targets(db, ev, include_maybe)
    counters = await _fanout_push_and_tg(db, tpl, ev, target_ids, target_tg_chat)
    now = _now_iso()
    if target_ids:
        await db.rsvp_templates.update_one(
            {"id": tid},
            {"$set": {"last_sent_at": now}, "$inc": {"send_count": 1}},
        )
    return {
        "ok": True,
        "sent_at": now,
        "target_count": len(target_ids),
        **counters,
    }


async def _run_test_send(db, tid: str, user_id: str) -> dict:
    tpl = await db.rsvp_templates.find_one({"id": tid}, {"_id": 0})
    if not tpl:
        raise HTTPException(404, "template not found")
    if not user_id:
        raise HTTPException(400, "user_id gerekli")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "username": 1})
    if not user:
        raise HTTPException(404, "user not found")
    # user'in üye kaydından telegram_chat_id çek
    mids: set = set()
    for m in (user.get("member_ids") or []):
        if m: mids.add(m)
    if user.get("member_id"):
        mids.add(user["member_id"])
    reverse = await db.members.find({"user_id": user_id}, {"_id": 0, "id": 1}).to_list(50)
    for r in reverse:
        if r.get("id"): mids.add(r["id"])
    chat = None
    if mids:
        m_rows = await db.members.find(
            {"id": {"$in": list(mids)}}, {"_id": 0, "telegram_chat_id": 1},
        ).to_list(500)
        for m in m_rows:
            if m.get("telegram_chat_id"):
                chat = m["telegram_chat_id"]; break

    dummy_ev = {"id": f"test-{uuid.uuid4().hex[:8]}", "name": f"TEST — {tpl.get('name', '')}"}
    target_ids = [user_id]
    target_tg = {user_id: chat} if chat else {}
    counters = await _fanout_push_and_tg(db, tpl, dummy_ev, target_ids, target_tg, tag_suffix="-test")

    return {
        "ok": True,
        "sent_at": _now_iso(),
        "recipient": user.get("username"),
        "has_push_subscription": bool(await db.push_subscriptions.count_documents({"user_id": user_id})),
        "has_telegram_chat": bool(chat),
        **counters,
    }


# v135.40 — Exponential backoff retry policy for schedule fires.
# Bir plan başarısız olduğunda sonsuz retry olmasın diye:
#   * Deneme 1 başarısız → 1 dk sonra tekrar
#   * Deneme 2 başarısız → 5 dk sonra tekrar
#   * Deneme 3 başarısız → 15 dk sonra tekrar
#   * Deneme 4 (MAX_ATTEMPTS=3 sonrası) → vazgeç, `abandoned=True` + log.
BACKOFF_MINUTES = [1, 5, 15]
MAX_ATTEMPTS = 3


async def check_and_fire_due_schedules(db) -> int:
    """Called by the background loop every 60 s. Returns count fired."""
    now = _now_iso()
    # Zamanı gelmiş, sent olmayan ve (henüz next_retry_at yok VEYA
    # geçmiş) tüm planlar aday.
    due = await db.rsvp_reminder_schedules.find(
        {
            "sent": {"$ne": True},
            "send_at": {"$lte": now},
            "$or": [
                {"next_retry_at": {"$exists": False}},
                {"next_retry_at": None},
                {"next_retry_at": {"$lte": now}},
            ],
        },
        {"_id": 0},
    ).to_list(200)
    fired = 0
    for sch in due:
        attempts_prev = int(sch.get("attempts") or 0)
        try:
            res = await _run_send(db, sch["template_id"], sch["event_id"], bool(sch.get("include_maybe")))
            await db.rsvp_reminder_schedules.update_one(
                {"id": sch["id"]},
                {"$set": {
                    "sent": True,
                    "fired_at": _now_iso(),
                    "target_count": res.get("target_count", 0),
                    "push_sent": res.get("push_sent", 0),
                    "telegram_sent": res.get("telegram_sent", 0),
                    "attempts": attempts_prev + 1,
                }, "$unset": {"next_retry_at": ""}},
            )
            fired += 1
            logger.info(f"[rsvp-schedule] fired {sch['id']} -> target={res.get('target_count')} (attempt {attempts_prev + 1})")
        except Exception as ex:
            attempts = attempts_prev + 1
            err = str(ex)[:200]
            if attempts >= MAX_ATTEMPTS:
                # Vazgeç — `sent=True` işaretle ki bir daha çekilmesin.
                await db.rsvp_reminder_schedules.update_one(
                    {"id": sch["id"]},
                    {"$set": {
                        "sent": True,
                        "abandoned": True,
                        "attempts": attempts,
                        "last_error": err,
                        "last_error_at": _now_iso(),
                    }, "$unset": {"next_retry_at": ""}},
                )
                logger.error(f"[rsvp-schedule] ABANDONED {sch['id']} after {attempts} attempts: {err}")
            else:
                idx = min(attempts - 1, len(BACKOFF_MINUTES) - 1)
                backoff_min = BACKOFF_MINUTES[idx]
                next_retry = (datetime.now(timezone.utc) + timedelta(minutes=backoff_min)).isoformat()
                await db.rsvp_reminder_schedules.update_one(
                    {"id": sch["id"]},
                    {"$set": {
                        "attempts": attempts,
                        "next_retry_at": next_retry,
                        "last_error": err,
                        "last_error_at": _now_iso(),
                    }},
                )
                logger.warning(f"[rsvp-schedule] retry {attempts}/{MAX_ATTEMPTS} for {sch['id']} in {backoff_min}min: {err}")
    return fired


async def make_scheduler_loop(db):
    """Poll every 60s. Spawned by server.py at startup."""
    logger.info("[rsvp-schedule] scheduler loop started")
    while True:
        try:
            await check_and_fire_due_schedules(db)
        except Exception as ex:
            logger.warning(f"[rsvp-schedule] loop error: {ex}")
        await asyncio.sleep(60)


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
        # Cascade: silinen şablonun zamanlanmış planlarını da temizle.
        await db.rsvp_reminder_schedules.delete_many({"template_id": tid})
        return {"ok": True}

    @router.post("/rsvp-templates/{tid}/send")
    async def send_tpl(tid: str, body: RsvpTemplateSendBody, _: dict = Depends(require_admin)):
        return await _run_send(db, tid, body.event_id, body.include_maybe)

    @router.post("/rsvp-templates/{tid}/test-send")
    async def test_send(tid: str, body: Optional[RsvpTestSendBody] = None, user: dict = Depends(require_admin)):
        """Tek kullanıcıya deneme gönderimi. Body opsiyonel — verilmezse admin'in
        kendisine (`user['id']`) gönderir. RSVP+event filtresi devre dışı."""
        target = ((body or RsvpTestSendBody()).user_id) or (user or {}).get("id")
        if not target:
            raise HTTPException(400, "target user_id çözümlenemedi")
        return await _run_test_send(db, tid, target)

    # -------- Schedules CRUD ----------
    @router.get("/rsvp-schedules")
    async def list_schedules(
        include_sent: Optional[bool] = True,
        _: dict = Depends(require_admin),
    ):
        q = {} if include_sent else {"sent": {"$ne": True}}
        rows = await db.rsvp_reminder_schedules.find(q, {"_id": 0}).sort("send_at", 1).to_list(500)
        # Yerinde template.name + event.name join'i yapılırsa UI daha okunur.
        tpl_ids = list({r["template_id"] for r in rows})
        ev_ids = list({r["event_id"] for r in rows})
        tpls = {t["id"]: t async for t in db.rsvp_templates.find({"id": {"$in": tpl_ids}}, {"_id": 0})} if tpl_ids else {}
        evs = {e["id"]: e async for e in db.events.find({"id": {"$in": ev_ids}}, {"_id": 0, "id": 1, "name": 1, "date": 1})} if ev_ids else {}
        for r in rows:
            r["template_name"] = (tpls.get(r["template_id"]) or {}).get("name")
            e = evs.get(r["event_id"]) or {}
            r["event_name"] = e.get("name")
            r["event_date"] = e.get("date")
        return {"items": rows, "count": len(rows)}

    @router.post("/rsvp-schedules")
    async def create_schedule(body: RsvpScheduleCreate, _: dict = Depends(require_admin)):
        if body.minutes_before not in ALLOWED_MINUTES_BEFORE:
            raise HTTPException(400, f"minutes_before {sorted(ALLOWED_MINUTES_BEFORE)} içinden olmalı")
        tpl = await db.rsvp_templates.find_one({"id": body.template_id}, {"_id": 0, "id": 1, "name": 1})
        if not tpl:
            raise HTTPException(404, "template not found")
        ev = await db.events.find_one({"id": body.event_id}, {"_id": 0, "id": 1, "name": 1, "date": 1})
        if not ev:
            raise HTTPException(404, "event not found")
        ev_dt = _parse_event_dt(ev.get("date"))
        if not ev_dt:
            raise HTTPException(400, "etkinlik tarihi çözümlenemedi")
        send_at_dt = ev_dt - timedelta(minutes=int(body.minutes_before))
        doc = {
            "id": str(uuid.uuid4()),
            "template_id": body.template_id,
            "event_id": body.event_id,
            "minutes_before": int(body.minutes_before),
            "include_maybe": bool(body.include_maybe),
            "send_at": send_at_dt.astimezone(timezone.utc).isoformat(),
            "sent": False,
            "created_at": _now_iso(),
        }
        await db.rsvp_reminder_schedules.insert_one(doc)
        return {"ok": True, "item": _serialize(doc)}

    @router.delete("/rsvp-schedules/{sid}")
    async def delete_schedule(sid: str, _: dict = Depends(require_admin)):
        r = await db.rsvp_reminder_schedules.delete_one({"id": sid})
        if r.deleted_count == 0:
            raise HTTPException(404, "schedule not found")
        return {"ok": True}

    return router


async def ensure_rsvp_templates_indexes(db):
    try:
        await db.rsvp_templates.create_index("id", unique=True)
        await db.rsvp_templates.create_index([("archived", 1), ("updated_at", -1)])
        await db.rsvp_reminder_schedules.create_index("id", unique=True)
        await db.rsvp_reminder_schedules.create_index([("sent", 1), ("send_at", 1)])
    except Exception as e:
        logger.warning(f"rsvp_templates index ensure: {e}")
