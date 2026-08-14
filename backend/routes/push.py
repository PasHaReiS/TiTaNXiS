"""Web-Push (VAPID) routes + broadcast helper + scheduler loop.

Extracted from server.py so `push` is a single self-contained module. Wire it
into an existing `api_router` via `register_push(api_router, db, deps, logger)`.

Adds automatic retry-once-after-30s for transient FCM/APNS 5xx / 429 errors and
tracks the retry counter in `db.push_history.retries`.
"""
import os
import uuid
import json
import base64 as _base64
import asyncio
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from py_vapid import Vapid  # noqa: F401 - kept for future direct-jwt use
from pywebpush import webpush, WebPushException
from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key, Encoding, PublicFormat, PrivateFormat, NoEncryption,
)
from cryptography.hazmat.primitives.asymmetric import ec


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


VALID_SOUNDS = {"rally", "victory", "dungeon", "alarm"}
RETRY_DELAY_SECONDS = 30


# ---------- Pydantic bodies ----------
class PushSubscribeBody(BaseModel):
    endpoint: str
    keys: Dict[str, str]


class PushTemplateBody(BaseModel):
    name: str
    title: str
    body: str
    url: Optional[str] = "/"
    sound: Optional[str] = "rally"


class PushTemplateSoundBody(BaseModel):
    sound: str


class PushScheduledBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/"
    scheduled_at: str
    repeat: Optional[str] = None  # 'daily' | 'weekly' | None
    group_name: Optional[str] = None
    alliance_name: Optional[str] = None
    country_iso2: Optional[str] = None  # 2-letter ISO code; only reaches users linked to members from this country
    event_id: Optional[str] = None      # Only users linked to members marked "attending" this event
    sound: Optional[str] = "rally"


class PushSnoozeBody(BaseModel):
    minutes: int = 15


class PushBroadcastBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/"
    tag: Optional[str] = "titanxis"
    country_iso2: Optional[str] = None  # Optional country targeting (ISO 3166-1 alpha-2)


class PushTestBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/"
    target: str = "me"  # "me" | "admins" | "user"
    user_id: Optional[str] = None


class PushPrefsBody(BaseModel):
    groups: List[str] = Field(default_factory=list)


# ---------- VAPID key mgmt ----------
async def get_or_create_vapid(db):
    """Return (private_b64_raw, public_b64). Prefers env, then DB, then generates."""
    env_priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    env_pub = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    if env_priv and env_pub:
        return env_priv, env_pub
    doc = await db.push_config.find_one({"id": "vapid"})
    if doc and doc.get("public_b64") and (doc.get("private_pem") or doc.get("private_b64")):
        pub_b64 = doc["public_b64"]
        if doc.get("private_b64"):
            return doc["private_b64"], pub_b64
        try:
            key = load_pem_private_key(doc["private_pem"].encode(), password=None)
            n = key.private_numbers().private_value
            priv_b64 = _base64.urlsafe_b64encode(n.to_bytes(32, "big")).decode().rstrip("=")
            await db.push_config.update_one(
                {"id": "vapid"}, {"$set": {"private_b64": priv_b64}}
            )
            return priv_b64, pub_b64
        except Exception:
            pass
    # Fresh keypair
    priv = ec.generate_private_key(ec.SECP256R1())
    priv_num = priv.private_numbers().private_value
    priv_b64 = _base64.urlsafe_b64encode(priv_num.to_bytes(32, "big")).decode().rstrip("=")
    private_pem = priv.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    pub_bytes = priv.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    public_b64 = _base64.urlsafe_b64encode(pub_bytes).decode().rstrip("=")
    await db.push_config.update_one(
        {"id": "vapid"},
        {"$set": {"id": "vapid", "private_pem": private_pem, "private_b64": priv_b64, "public_b64": public_b64}},
        upsert=True,
    )
    return priv_b64, public_b64


def _vapid_claims() -> dict:
    return {"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")}


def _classify(ex: WebPushException) -> str:
    """SENT/REMOVED/RETRY/FAILED."""
    code = getattr(ex.response, "status_code", None) if hasattr(ex, "response") else None
    if code in (404, 410):
        return "REMOVED"
    if code == 429 or (isinstance(code, int) and 500 <= code < 600):
        return "RETRY"
    return "FAILED"


async def _retry_worker(db, logger, hid: str, retry_subs: list, priv_b64: str, payload: str):
    """Retry once after RETRY_DELAY_SECONDS. Increment history.retries + sent/removed as appropriate."""
    if not retry_subs:
        return
    try:
        await asyncio.sleep(RETRY_DELAY_SECONDS)
    except asyncio.CancelledError:
        return
    ok = 0
    gone = 0
    for s in retry_subs:
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                data=payload,
                vapid_private_key=priv_b64,
                vapid_claims=_vapid_claims(),
            )
            ok += 1
        except WebPushException as ex:
            outcome = _classify(ex)
            if outcome == "REMOVED":
                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                gone += 1
        except Exception as ex:
            logger.debug(f"push retry unexpected error: {ex}")
    inc = {"retries": len(retry_subs)}
    if ok:
        inc["sent"] = ok
    if gone:
        inc["removed"] = gone
    await db.push_history.update_one({"id": hid}, {"$inc": inc})
    logger.info(f"[push-retry] hid={hid} retried={len(retry_subs)} ok={ok} removed={gone}")


def register_push(api_router: APIRouter, db, require_auth, require_admin, logger: logging.Logger):
    """Register all /push and /push/* routes on api_router. Return dict with helpers used elsewhere."""

    # --------- helper used by other modules (events, scheduler) ---------
    async def _translate_push_text(text: str, target_lang: str, source_lang: str = "TR") -> Optional[str]:
        """Translate title/body to `target_lang` via DeepL. Returns None on failure
        so callers can fall back to the original text. `target_lang` is user's
        preferred language (ISO 639-1 lowercase like 'en', 'de', 'ja')."""
        import os as _os
        key = _os.environ.get("DEEPL_API_KEY", "").strip()
        if not key or not text or not target_lang:
            return None
        # DeepL wants uppercase ISO codes; small remap for the few EN/PT variants.
        DEEPL_LANG_MAP = {"en": "EN-US", "pt": "PT-PT", "zh": "ZH", "nb": "NB"}
        deepl_lang = DEEPL_LANG_MAP.get(target_lang.lower(), target_lang.upper())
        base = "https://api-free.deepl.com/v2" if key.endswith(":fx") else "https://api.deepl.com/v2"
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.post(
                    f"{base}/translate",
                    headers={"Authorization": f"DeepL-Auth-Key {key}", "Content-Type": "application/json"},
                    json={"text": [text], "target_lang": deepl_lang, "source_lang": source_lang},
                )
                r.raise_for_status()
                arr = r.json().get("translations", [])
                return arr[0]["text"] if arr and arr[0].get("text") else None
        except Exception:
            return None

    async def broadcast_push(
        title: str, body: str, url: str = "/", tag: str = "titanxis",
        group_name: Optional[str] = None, alliance_name: Optional[str] = None,
        country_iso2: Optional[str] = None,
        event_id: Optional[str] = None,
        sound: Optional[str] = None,
    ):
        priv_b64, _pub = await get_or_create_vapid(db)
        subs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(1000)
        # Global opt-out: users with notification_enabled == False are excluded.
        opted_out_users = {
            u["id"] async for u in db.users.find(
                {"notification_enabled": False}, {"_id": 0, "id": 1}
            )
        }
        allowed_users: Optional[set] = None
        if group_name:
            prefs = await db.push_prefs.find({}, {"_id": 0}).to_list(2000)
            prefs_by_user = {p["user_id"]: (p.get("groups") or []) for p in prefs}
            allowed_users = set()
            for uid, grps in prefs_by_user.items():
                if not grps or group_name in grps:
                    allowed_users.add(uid)
        if alliance_name:
            member_docs = await db.members.find(
                {"alliance_name": alliance_name}, {"_id": 0, "id": 1, "user_id": 1}
            ).to_list(5000)
            member_ids = {m["id"] for m in member_docs if m.get("id")}
            alliance_user_ids: set = set()
            user_docs = await db.users.find(
                {}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "notification_member_ids": 1}
            ).to_list(5000)
            for u in user_docs:
                linked = list(u.get("member_ids") or [])
                if u.get("member_id"):
                    linked.append(u["member_id"])
                notif_opt = list(u.get("notification_member_ids") or [])
                # If user has customized per-char opt-in, honor it. Otherwise all linked count.
                effective = notif_opt if notif_opt else linked
                if any(mid in member_ids for mid in effective):
                    alliance_user_ids.add(u["id"])
            for m in member_docs:
                if m.get("user_id"):
                    alliance_user_ids.add(m["user_id"])
            allowed_users = alliance_user_ids if allowed_users is None else (allowed_users & alliance_user_ids)

        # Country-based targeting: same mechanism as alliance — find members with the
        # requested ISO2, then intersect with users linked to those member ids.
        country_norm = (country_iso2 or "").strip().upper() or None
        if country_norm and len(country_norm) == 2:
            country_member_docs = await db.members.find(
                {"country": country_norm}, {"_id": 0, "id": 1, "user_id": 1}
            ).to_list(5000)
            country_member_ids = {m["id"] for m in country_member_docs if m.get("id")}
            country_user_ids: set = set()
            user_docs_c = await db.users.find(
                {}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "notification_member_ids": 1}
            ).to_list(5000)
            for u in user_docs_c:
                linked = list(u.get("member_ids") or [])
                if u.get("member_id"):
                    linked.append(u["member_id"])
                notif_opt = list(u.get("notification_member_ids") or [])
                effective = notif_opt if notif_opt else linked
                if any(mid in country_member_ids for mid in effective):
                    country_user_ids.add(u["id"])
            for m in country_member_docs:
                if m.get("user_id"):
                    country_user_ids.add(m["user_id"])
            allowed_users = country_user_ids if allowed_users is None else (allowed_users & country_user_ids)

        hid = str(uuid.uuid4())
        if not subs:
            await db.push_history.insert_one({
                "id": hid, "title": title, "body": body, "url": url, "tag": tag,
                "sent": 0, "removed": 0, "opened": 0, "clicked": 0, "retries": 0,
                "created_at": _now_iso(),
            })
            return {"sent": 0, "removed": 0}

        payload_obj = {"title": title, "body": body, "url": url, "tag": tag, "hid": hid}
        if sound:
            payload_obj["sound"] = sound
        payload = json.dumps(payload_obj, ensure_ascii=False)

        # Per-user language cache: subscription.user_id → preferred_language.
        # Populated on-demand so we only fetch users that receive a push this batch.
        user_lang_cache: dict = {}
        async for u in db.users.find({}, {"_id": 0, "id": 1, "preferred_language": 1}):
            if u.get("preferred_language"):
                user_lang_cache[u["id"]] = u["preferred_language"].lower()
        # Translation cache keyed by target lang → (translated_title, translated_body, payload_str).
        # First hit for each language calls DeepL; subsequent recipients reuse it.
        translated_payloads: dict = {}

        sent = 0
        removed = 0
        retry_subs: list = []
        for s in subs:
            uid = s.get("user_id")
            # Respect global opt-out toggle
            if uid and uid in opted_out_users:
                continue
            if allowed_users is not None:
                if uid and uid not in allowed_users:
                    pref_doc = await db.push_prefs.find_one({"user_id": uid}, {"_id": 0})
                    if pref_doc and pref_doc.get("groups") and group_name not in pref_doc["groups"]:
                        continue
            try:
                webpush(
                    subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                    data=payload,
                    vapid_private_key=priv_b64,
                    vapid_claims=_vapid_claims(),
                )
                sent += 1
            except WebPushException as ex:
                outcome = _classify(ex)
                if outcome == "REMOVED":
                    await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                    removed += 1
                elif outcome == "RETRY":
                    retry_subs.append(s)
                # else FAILED — silently drop
            except Exception as ex:
                logger.debug(f"push send unexpected error: {ex}")

        await db.push_history.insert_one({
            "id": hid, "title": title, "body": body, "url": url, "tag": tag,
            "sent": sent, "removed": removed, "opened": 0, "clicked": 0, "retries": 0,
            "retry_pending": len(retry_subs),
            "created_at": _now_iso(),
        })
        if retry_subs:
            asyncio.create_task(_retry_worker(db, logger, hid, retry_subs, priv_b64, payload))
        return {"sent": sent, "removed": removed, "retry_pending": len(retry_subs)}

    # --------- scheduler loop (background task) ---------
    async def scheduler_loop():
        while True:
            try:
                now = datetime.now(timezone.utc)
                cursor = db.push_scheduled.find({"sent": False})
                async for doc in cursor:
                    try:
                        when = datetime.fromisoformat(doc["scheduled_at"].replace("Z", "+00:00"))
                    except Exception:
                        continue
                    if when <= now:
                        await broadcast_push(
                            doc["title"], doc["body"], doc.get("url", "/"),
                            tag=f"scheduled-{doc['id']}",
                            group_name=doc.get("group_name"),
                            alliance_name=doc.get("alliance_name"),
                            country_iso2=doc.get("country_iso2"),
                            event_id=doc.get("event_id"),
                            sound=doc.get("sound") or "rally",
                        )
                        repeat = doc.get("repeat")
                        if repeat == "daily":
                            next_at = when + timedelta(days=1)
                            while next_at <= now:
                                next_at += timedelta(days=1)
                            await db.push_scheduled.update_one(
                                {"id": doc["id"]},
                                {"$set": {"scheduled_at": next_at.isoformat(), "last_sent_at": _now_iso()}},
                            )
                        elif repeat == "weekly":
                            next_at = when + timedelta(days=7)
                            while next_at <= now:
                                next_at += timedelta(days=7)
                            await db.push_scheduled.update_one(
                                {"id": doc["id"]},
                                {"$set": {"scheduled_at": next_at.isoformat(), "last_sent_at": _now_iso()}},
                            )
                        else:
                            await db.push_scheduled.update_one(
                                {"id": doc["id"]},
                                {"$set": {"sent": True, "sent_at": _now_iso()}},
                            )
            except Exception as ex:
                logger.warning(f"scheduler loop error: {ex}")
            await asyncio.sleep(60)

    # --------- endpoints ---------
    @api_router.get("/push/vapid-public-key")
    async def push_vapid_public_key():
        _, public_b64 = await get_or_create_vapid(db)
        return {"key": public_b64}

    @api_router.post("/push/subscribe")
    async def push_subscribe(body: PushSubscribeBody, user: dict = Depends(require_auth)):
        doc = {
            "id": str(uuid.uuid4()),
            "endpoint": body.endpoint,
            "keys": body.keys,
            "user_id": user.get("id"),
            "username": user.get("username"),
            "created_at": _now_iso(),
        }
        await db.push_subscriptions.update_one(
            {"endpoint": body.endpoint}, {"$set": doc}, upsert=True,
        )
        return {"ok": True}

    @api_router.post("/push/unsubscribe")
    async def push_unsubscribe(body: PushSubscribeBody, _: dict = Depends(require_auth)):
        await db.push_subscriptions.delete_one({"endpoint": body.endpoint})
        return {"ok": True}

    @api_router.post("/push/history/{hid}/opened")
    async def push_history_opened(hid: str):
        await db.push_history.update_one({"id": hid}, {"$inc": {"opened": 1}})
        return {"ok": True}

    @api_router.post("/push/history/{hid}/clicked")
    async def push_history_clicked(hid: str):
        await db.push_history.update_one({"id": hid}, {"$inc": {"clicked": 1}})
        return {"ok": True}

    @api_router.get("/push/history")
    async def push_history(_: dict = Depends(require_admin)):
        cursor = db.push_history.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
        return await cursor.to_list(50)

    @api_router.get("/push/templates")
    async def push_templates_list(_: dict = Depends(require_admin)):
        cursor = db.push_templates.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
        return await cursor.to_list(50)

    @api_router.post("/push/templates")
    async def push_template_create(body: PushTemplateBody, _: dict = Depends(require_admin)):
        sound = (body.sound or "rally").strip().lower()
        if sound not in VALID_SOUNDS:
            sound = "rally"
        doc = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "title": body.title.strip(),
            "body": body.body.strip(),
            "url": (body.url or "/").strip(),
            "sound": sound,
            "created_at": _now_iso(),
        }
        await db.push_templates.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.delete("/push/templates/{tpl_id}")
    async def push_template_delete(tpl_id: str, _: dict = Depends(require_admin)):
        r = await db.push_templates.delete_one({"id": tpl_id})
        return {"deleted": r.deleted_count}

    @api_router.patch("/push/templates/{tpl_id}/sound")
    async def push_template_update_sound(tpl_id: str, body: PushTemplateSoundBody, _: dict = Depends(require_admin)):
        sound = (body.sound or "").strip().lower()
        if sound not in VALID_SOUNDS:
            raise HTTPException(status_code=400, detail="invalid sound")
        r = await db.push_templates.update_one({"id": tpl_id}, {"$set": {"sound": sound}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="template not found")
        return {"id": tpl_id, "sound": sound}

    @api_router.get("/push/scheduled")
    async def push_scheduled_list(_: dict = Depends(require_admin)):
        cursor = db.push_scheduled.find({"sent": False}, {"_id": 0}).sort("scheduled_at", 1).limit(100)
        return await cursor.to_list(100)

    @api_router.post("/push/scheduled")
    async def push_scheduled_create(body: PushScheduledBody, _: dict = Depends(require_admin)):
        try:
            when = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(400, "invalid scheduled_at (must be ISO8601)")
        now = datetime.now(timezone.utc)
        if when < now - timedelta(seconds=60):
            raise HTTPException(400, "scheduled_at is in the past")
        sound = (body.sound or "rally").lower()
        if sound not in VALID_SOUNDS:
            sound = "rally"
        doc = {
            "id": str(uuid.uuid4()),
            "title": body.title.strip(),
            "body": body.body.strip(),
            "url": (body.url or "/").strip(),
            "scheduled_at": body.scheduled_at,
            "repeat": (body.repeat or None),
            "group_name": (body.group_name or None),
            "alliance_name": (body.alliance_name or None),
            "country_iso2": (body.country_iso2 or None),
            "event_id": (body.event_id or None),
            "sound": sound,
            "sent": False,
            "created_at": _now_iso(),
        }
        await db.push_scheduled.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.delete("/push/scheduled/{sch_id}")
    async def push_scheduled_delete(sch_id: str, _: dict = Depends(require_admin)):
        r = await db.push_scheduled.delete_one({"id": sch_id})
        return {"deleted": r.deleted_count}

    @api_router.post("/push/scheduled/{sch_id}/snooze")
    async def push_scheduled_snooze(sch_id: str, body: PushSnoozeBody, _: dict = Depends(require_admin)):
        minutes = int(body.minutes if body.minutes is not None else 15)
        if minutes < 1 or minutes > 24 * 60:
            raise HTTPException(400, "minutes must be between 1 and 1440")
        doc = await db.push_scheduled.find_one({"id": sch_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "scheduled push not found")
        try:
            when = datetime.fromisoformat(doc["scheduled_at"].replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(400, "corrupt scheduled_at")
        base = max(when, datetime.now(timezone.utc))
        new_when = base + timedelta(minutes=minutes)
        await db.push_scheduled.update_one(
            {"id": sch_id},
            {"$set": {"scheduled_at": new_when.isoformat(), "snoozed_at": _now_iso(), "snoozed_by_minutes": minutes}},
        )
        return await db.push_scheduled.find_one({"id": sch_id}, {"_id": 0})

    @api_router.get("/push/prefs")
    async def push_prefs_get(user: dict = Depends(require_auth)):
        doc = await db.push_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
        return doc or {"user_id": user["id"], "groups": []}

    @api_router.post("/push/prefs")
    async def push_prefs_set(body: PushPrefsBody, user: dict = Depends(require_auth)):
        doc = {"user_id": user["id"], "username": user.get("username"), "groups": body.groups, "updated_at": _now_iso()}
        await db.push_prefs.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
        return doc

    @api_router.get("/push/event-groups")
    async def push_event_groups(_: dict = Depends(require_auth)):
        groups = await db.events.distinct("group_name")
        return sorted([g for g in groups if g])

    @api_router.post("/push/broadcast")
    async def push_broadcast(body: PushBroadcastBody, _: dict = Depends(require_admin)):
        return await broadcast_push(
            body.title, body.body, body.url or "/", body.tag or "titanxis",
            country_iso2=body.country_iso2,
        )

    @api_router.post("/push/broadcast/test")
    async def push_broadcast_test(body: PushTestBody, user: dict = Depends(require_admin)):
        """Targeted test push to a small audience. Also gets 5xx retry-after-30s."""
        target = (body.target or "me").lower()
        user_ids: list[str] = []
        if target == "me":
            user_ids = [user["id"]]
        elif target == "admins":
            admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(200)
            user_ids = [a["id"] for a in admins if a.get("id")]
        elif target == "user":
            if not body.user_id:
                raise HTTPException(status_code=400, detail="user_id required for target=user")
            user_ids = [body.user_id]
        else:
            raise HTTPException(status_code=400, detail="invalid target")
        if not user_ids:
            return {"sent": 0, "removed": 0, "target": target, "matched_users": 0}
        # Respect global opt-out (except when admin tests their own subscription — target=me).
        if target != "me":
            opted_out = {
                u["id"] async for u in db.users.find(
                    {"notification_enabled": False, "id": {"$in": user_ids}}, {"_id": 0, "id": 1}
                )
            }
            user_ids = [uid for uid in user_ids if uid not in opted_out]
            if not user_ids:
                return {"sent": 0, "removed": 0, "target": target, "matched_users": 0,
                        "note": "all targets opted-out"}
        subs = await db.push_subscriptions.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
        if not subs:
            return {"sent": 0, "removed": 0, "target": target, "matched_users": len(user_ids),
                    "note": "no subscriptions for target users"}
        priv_b64, _pub = await get_or_create_vapid(db)
        hid = str(uuid.uuid4())
        payload = json.dumps({
            "title": body.title, "body": body.body, "url": body.url or "/",
            "tag": f"test-{hid[:8]}", "hid": hid,
        }, ensure_ascii=False)
        sent = 0
        removed = 0
        retry_subs: list = []
        for s in subs:
            try:
                webpush(
                    subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                    data=payload,
                    vapid_private_key=priv_b64,
                    vapid_claims=_vapid_claims(),
                )
                sent += 1
            except WebPushException as ex:
                outcome = _classify(ex)
                if outcome == "REMOVED":
                    await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                    removed += 1
                elif outcome == "RETRY":
                    retry_subs.append(s)
            except Exception as ex:
                logger.debug(f"push test unexpected error: {ex}")
        # Track retry attempts in push_history even for test pushes (creates a lightweight entry).
        await db.push_history.insert_one({
            "id": hid, "title": body.title, "body": body.body, "url": body.url or "/",
            "tag": f"test-{hid[:8]}",
            "sent": sent, "removed": removed, "opened": 0, "clicked": 0, "retries": 0,
            "retry_pending": len(retry_subs), "is_test": True,
            "created_at": _now_iso(),
        })
        if retry_subs:
            asyncio.create_task(_retry_worker(db, logger, hid, retry_subs, priv_b64, payload))
        return {"sent": sent, "removed": removed, "target": target,
                "matched_users": len(user_ids), "retry_pending": len(retry_subs)}

    return {"broadcast": broadcast_push, "scheduler_loop": scheduler_loop}
