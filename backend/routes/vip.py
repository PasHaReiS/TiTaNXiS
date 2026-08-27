"""VIP Destek (VIP Support) routes.

MongoDB collections:
  - vip_threads   : {id, category, title, body, author_id, author_name, upvotes,
                     downvotes, views, resolved, pinned, created_at, last_reply_at}
  - vip_replies   : {id, thread_id, author_id, author_name, body, is_admin,
                     is_public, created_at}
  - vip_votes     : {thread_id, user_id, value}  (unique per user/thread)
  - vip_translations: {entity_id, field, target_lang, translated_text,
                       source_hash, created_at}  — DeepL cache for user-generated text
"""
import os
import uuid
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field


# DeepL config — key + i18n → DeepL lang code mapping. Duplicated from server.py
# to keep vip module self-contained.
DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "").strip()
# v133.6 — TR + AR eklendi (önceden eksikti). ET (Estonca) TR ile karışmaz.
DEEPL_LANG_MAP = {
    "tr": "TR", "en": "EN-GB", "ru": "RU", "de": "DE", "fr": "FR", "es": "ES",
    "ko": "KO", "ar": "AR",
    "bg": "BG", "cs": "CS", "da": "DA", "el": "EL", "et": "ET", "fi": "FI",
    "hu": "HU", "id": "ID", "it": "IT", "ja": "JA", "lt": "LT", "lv": "LV",
    "nb": "NB", "nl": "NL", "pl": "PL", "pt": "PT-PT", "ro": "RO", "sk": "SK",
    "sl": "SL", "sv": "SV", "uk": "UK", "zh": "ZH",
}


def _hash_text(s: str) -> str:
    return hashlib.md5((s or "").encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


CATEGORIES = [
    {"slug": "genel-sorular",    "label": "Genel Sorular",   "color": "#8B5CF6"},
    {"slug": "teknik-destek",    "label": "Teknik Destek",   "color": "#3B82F6"},
    {"slug": "oneriler",         "label": "Öneriler",        "color": "#10B981"},
    {"slug": "duyurular",        "label": "Duyurular",       "color": "#F59E0B"},
    {"slug": "sikca-sorulanlar", "label": "Sıkça Sorulanlar","color": "#EC4899"},
]
CATEGORY_SLUGS = {c["slug"] for c in CATEGORIES}


PRIORITIES = {"yuksek", "normal", "dusuk"}


class ThreadCreate(BaseModel):
    category: str
    title: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=1, max_length=8000)
    attachments: Optional[List[str]] = None  # file_ids returned by /uploads/image
    priority: Optional[str] = "normal"  # yuksek | normal | dusuk


class ReplyCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=8000)
    is_public: Optional[bool] = True
    attachments: Optional[List[str]] = None


class VoteBody(BaseModel):
    value: int  # +1 upvote, -1 downvote, 0 clear


class ResolveBody(BaseModel):
    resolved: bool


class PinBody(BaseModel):
    pinned: bool


class VisibilityBody(BaseModel):
    is_public: bool


class DeleteBody(BaseModel):
    reason: Optional[str] = None  # e.g. "spam" | "inappropriate" | "duplicate" | free text


def register_vip(api_router: APIRouter, db, require_auth, require_admin, logger: logging.Logger):
    async def _ensure_indexes():
        try:
            await db.vip_threads.create_index([("category", 1), ("created_at", -1)])
            await db.vip_threads.create_index("pinned")
            await db.vip_replies.create_index([("thread_id", 1), ("created_at", 1)])
            await db.vip_votes.create_index([("thread_id", 1), ("user_id", 1)], unique=True)
        except Exception as ex:
            logger.debug(f"vip index create: {ex}")

    # Fire-and-forget on module load (register_vip is called at startup time).
    import asyncio as _asyncio
    _asyncio.create_task(_ensure_indexes())

    def _is_admin(user: dict) -> bool:
        return (user or {}).get("role") == "admin"

    async def _optional_user(request: Request) -> Optional[dict]:
        """Best-effort auth: returns user if valid JWT, else None (public read)."""
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return None
        try:
            from auth import decode_token  # local import — auth is already loaded
            payload = decode_token(auth.split(" ", 1)[1])
            u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
            return u
        except Exception:
            return None

    async def _reply_visible(reply: dict, viewer: Optional[dict], thread_author_id: Optional[str]) -> bool:
        if reply.get("is_public"):
            return True
        if not viewer:
            return False
        if _is_admin(viewer):
            return True
        if viewer.get("id") == reply.get("author_id"):
            return True
        if thread_author_id and viewer.get("id") == thread_author_id:
            return True
        return False

    async def _translate_text(text: str, target_lang: str) -> Optional[str]:
        """Call DeepL to translate a single string. Returns None on failure."""
        if not text or not DEEPL_API_KEY:
            return None
        deepl_lang = DEEPL_LANG_MAP.get(target_lang.lower())
        if not deepl_lang:
            return None
        base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
        headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}",
                   "Content-Type": "application/json"}
        payload = {"text": [text], "target_lang": deepl_lang, "source_lang": "TR"}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(f"{base}/translate", headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
                translations = data.get("translations", [])
                return translations[0].get("text") if translations else None
        except Exception as e:
            logger.warning(f"DeepL translate failed for {target_lang}: {e}")
            return None

    async def _translate_field(entity_id: str, field: str, text: str,
                                target_lang: str) -> str:
        """Cache-first translate helper. Returns original text on any failure so
        the endpoint stays functional even if DeepL is down / unconfigured."""
        if not text or not target_lang or target_lang.lower() == "tr":
            return text
        src_hash = _hash_text(text)
        cache_key = {"entity_id": entity_id, "field": field, "target_lang": target_lang.lower()}
        cached = await db.vip_translations.find_one(cache_key, {"_id": 0})
        if cached and cached.get("source_hash") == src_hash and cached.get("translated_text"):
            return cached["translated_text"]
        translated = await _translate_text(text, target_lang)
        if not translated:
            return text  # graceful fallback
        # Upsert into cache
        try:
            await db.vip_translations.update_one(
                cache_key,
                {"$set": {**cache_key, "translated_text": translated,
                          "source_hash": src_hash, "created_at": _now_iso()}},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"vip_translations cache upsert failed: {e}")
        return translated

    @api_router.get("/vip/categories")
    async def vip_categories():
        # Attach live counts (thread total + unresolved).
        result = []
        for c in CATEGORIES:
            total = await db.vip_threads.count_documents({"category": c["slug"]})
            unresolved = await db.vip_threads.count_documents({"category": c["slug"], "resolved": {"$ne": True}})
            result.append({**c, "total": total, "unread": unresolved})
        return result

    @api_router.get("/vip/threads")
    async def vip_threads_list(
        request: Request,
        category: Optional[str] = None,
        status: Optional[str] = "all",  # all | new | resolved
        q: Optional[str] = None,
        priority: Optional[str] = None,  # yuksek | normal | dusuk
        limit: int = 50,
        lang: Optional[str] = None,
    ):
        query: dict = {}
        if category:
            if category not in CATEGORY_SLUGS:
                raise HTTPException(400, "invalid category")
            query["category"] = category
        if status == "resolved":
            query["resolved"] = True
        elif status == "new":
            query["resolved"] = {"$ne": True}
        if priority and priority.lower() in PRIORITIES:
            query["priority"] = priority.lower()
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"body": {"$regex": q, "$options": "i"}},
            ]
        # Priority-first ordering: pinned > yuksek > normal > dusuk > created_at desc.
        # MongoDB doesn't natively rank string values, so we bucket via aggregation.
        pipeline = [
            {"$match": query},
            {"$addFields": {
                "_prio_rank": {"$switch": {
                    "branches": [
                        {"case": {"$eq": ["$priority", "yuksek"]}, "then": 0},
                        {"case": {"$eq": ["$priority", "normal"]}, "then": 1},
                        {"case": {"$eq": ["$priority", "dusuk"]}, "then": 2},
                    ],
                    "default": 1,
                }},
            }},
            {"$sort": {"pinned": -1, "_prio_rank": 1, "created_at": -1}},
            {"$limit": min(int(limit), 200)},
            {"$project": {"_id": 0, "_prio_rank": 0}},
        ]
        threads = await db.vip_threads.aggregate(pipeline).to_list(200)
        # Attach reply counts + last admin snippet (public only, unless viewer is admin).
        viewer = await _optional_user(request)
        for tdoc in threads:
            replies = await db.vip_replies.find({"thread_id": tdoc["id"]}, {"_id": 0}).to_list(200)
            visible = [r for r in replies if await _reply_visible(r, viewer, tdoc.get("author_id"))]
            admin_replies = [r for r in visible if r.get("is_admin")]
            tdoc["reply_count"] = len(visible)
            tdoc["has_admin_reply"] = len(admin_replies) > 0
            if admin_replies:
                latest = sorted(admin_replies, key=lambda r: r.get("created_at", ""))[-1]
                tdoc["admin_snippet"] = (latest.get("body") or "")[:180]
            # Auto-translate title + body + admin_snippet when a non-TR lang requested.
            if lang and lang.lower() != "tr":
                tdoc["title"] = await _translate_field(tdoc["id"], "title", tdoc.get("title") or "", lang)
                tdoc["body"] = await _translate_field(tdoc["id"], "body", tdoc.get("body") or "", lang)
                if tdoc.get("admin_snippet"):
                    tdoc["admin_snippet"] = await _translate_field(
                        tdoc["id"], "admin_snippet", tdoc["admin_snippet"], lang)
        return threads

    @api_router.get("/vip/threads/{tid}")
    async def vip_thread_get(tid: str, request: Request, lang: Optional[str] = None):
        tdoc = await db.vip_threads.find_one({"id": tid}, {"_id": 0})
        if not tdoc:
            raise HTTPException(404, "thread not found")
        # Increment view (fire-and-forget style, but await here since count is small).
        await db.vip_threads.update_one({"id": tid}, {"$inc": {"views": 1}})
        tdoc["views"] = int(tdoc.get("views", 0)) + 1
        viewer = await _optional_user(request)
        replies_all = await db.vip_replies.find({"thread_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        replies = [r for r in replies_all if await _reply_visible(r, viewer, tdoc.get("author_id"))]
        my_vote = 0
        if viewer:
            v = await db.vip_votes.find_one({"thread_id": tid, "user_id": viewer["id"]}, {"_id": 0})
            if v:
                my_vote = int(v.get("value", 0))
        # Auto-translate title/body + each reply body when a non-TR lang is requested.
        if lang and lang.lower() != "tr":
            tdoc["title"] = await _translate_field(tid, "title", tdoc.get("title") or "", lang)
            tdoc["body"] = await _translate_field(tid, "body", tdoc.get("body") or "", lang)
            for r in replies:
                r["body"] = await _translate_field(r["id"], "reply_body", r.get("body") or "", lang)
        return {"thread": tdoc, "replies": replies, "my_vote": my_vote,
                "can_admin": _is_admin(viewer)}

    @api_router.post("/vip/threads")
    async def vip_thread_create(body: ThreadCreate, user: dict = Depends(require_auth)):
        if body.category not in CATEGORY_SLUGS:
            raise HTTPException(400, "invalid category")
        priority = (body.priority or "normal").lower()
        if priority not in PRIORITIES:
            priority = "normal"
        doc = {
            "id": str(uuid.uuid4()),
            "category": body.category,
            "title": body.title.strip(),
            "body": body.body.strip(),
            "author_id": user["id"],
            "author_name": user.get("username", "?"),
            "upvotes": 0, "downvotes": 0, "views": 0,
            "resolved": False, "pinned": False,
            "attachments": body.attachments or [],
            "priority": priority,
            "created_at": _now_iso(),
            "last_reply_at": None,
        }
        await db.vip_threads.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.post("/vip/threads/{tid}/reply")
    async def vip_reply(tid: str, body: ReplyCreate, user: dict = Depends(require_auth)):
        tdoc = await db.vip_threads.find_one({"id": tid}, {"_id": 0, "id": 1, "author_id": 1})
        if not tdoc:
            raise HTTPException(404, "thread not found")
        is_admin = _is_admin(user)
        # For non-admin authors replying to their own thread, is_public defaults to True.
        # Admins can choose visibility explicitly.
        is_public = body.is_public if body.is_public is not None else True
        reply = {
            "id": str(uuid.uuid4()),
            "thread_id": tid,
            "body": body.body.strip(),
            "author_id": user["id"],
            "author_name": user.get("username", "?"),
            "is_admin": is_admin,
            "is_public": bool(is_public),
            "attachments": body.attachments or [],
            "created_at": _now_iso(),
        }
        await db.vip_replies.insert_one(reply)
        await db.vip_threads.update_one({"id": tid}, {"$set": {"last_reply_at": reply["created_at"]}})
        reply.pop("_id", None)
        return reply

    @api_router.patch("/vip/replies/{rid}/visibility")
    async def vip_reply_visibility(rid: str, body: VisibilityBody, _: dict = Depends(require_admin)):
        r = await db.vip_replies.update_one({"id": rid}, {"$set": {"is_public": bool(body.is_public)}})
        if r.matched_count == 0:
            raise HTTPException(404, "reply not found")
        return {"id": rid, "is_public": bool(body.is_public)}

    @api_router.post("/vip/threads/{tid}/vote")
    async def vip_vote(tid: str, body: VoteBody, user: dict = Depends(require_auth)):
        if body.value not in (-1, 0, 1):
            raise HTTPException(400, "value must be -1, 0, or 1")
        tdoc = await db.vip_threads.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not tdoc:
            raise HTTPException(404, "thread not found")
        prev = await db.vip_votes.find_one({"thread_id": tid, "user_id": user["id"]}, {"_id": 0})
        prev_val = int(prev.get("value", 0)) if prev else 0
        # Update the vote doc.
        if body.value == 0:
            await db.vip_votes.delete_one({"thread_id": tid, "user_id": user["id"]})
        else:
            await db.vip_votes.update_one(
                {"thread_id": tid, "user_id": user["id"]},
                {"$set": {"thread_id": tid, "user_id": user["id"], "value": body.value}},
                upsert=True,
            )
        # Adjust thread counters delta between prev_val and body.value.
        inc = {}
        # upvotes counter: +1 when prev != +1 and new == +1, -1 when prev == +1 and new != +1
        up_delta = (1 if body.value == 1 else 0) - (1 if prev_val == 1 else 0)
        down_delta = (1 if body.value == -1 else 0) - (1 if prev_val == -1 else 0)
        if up_delta:
            inc["upvotes"] = up_delta
        if down_delta:
            inc["downvotes"] = down_delta
        if inc:
            await db.vip_threads.update_one({"id": tid}, {"$inc": inc})
        td = await db.vip_threads.find_one({"id": tid}, {"_id": 0})
        return {"thread": td, "my_vote": body.value}

    @api_router.delete("/vip/threads/{tid}")
    async def vip_thread_delete(tid: str, body: Optional[DeleteBody] = None, _: dict = Depends(require_admin)):
        tdoc = await db.vip_threads.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not tdoc:
            raise HTTPException(404, "thread not found")
        reason = (body.reason if body else None) or None
        upd = {"deleted_at": _now_iso()}
        if reason:
            upd["deleted_reason"] = reason[:120]
        await db.vip_threads.update_one({"id": tid}, {"$set": upd})
        return {"deleted": True, "id": tid, "soft": True, "reason": reason}

    @api_router.get("/vip/trash")
    async def vip_trash_list(_: dict = Depends(require_admin)):
        # Purge anything soft-deleted more than 24h ago.
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        stale = await db.vip_threads.find({"deleted_at": {"$lt": cutoff, "$ne": None}}, {"_id": 0, "id": 1}).to_list(500)
        stale_ids = [s["id"] for s in stale]
        if stale_ids:
            await db.vip_replies.delete_many({"thread_id": {"$in": stale_ids}})
            await db.vip_votes.delete_many({"thread_id": {"$in": stale_ids}})
            await db.vip_threads.delete_many({"id": {"$in": stale_ids}})
        # Return remaining trashed items (within 24h window).
        threads = await (
            db.vip_threads.find({"deleted_at": {"$ne": None, "$gte": cutoff}}, {"_id": 0})
            .sort("deleted_at", -1).limit(200).to_list(200)
        )
        return threads

    @api_router.post("/vip/threads/{tid}/restore")
    async def vip_thread_restore(tid: str, _: dict = Depends(require_admin)):
        r = await db.vip_threads.update_one({"id": tid}, {"$unset": {"deleted_at": "", "deleted_reason": ""}})
        if r.matched_count == 0:
            raise HTTPException(404, "thread not found")
        return {"restored": True, "id": tid}

    @api_router.post("/cron/vip-trash-purge")
    async def cron_vip_trash_purge(request: Request):
        # Same HMAC-secret guard used by other cron endpoints.
        import os as _os, hmac as _hmac
        secret = _os.environ.get("WEBHOOK_CRON_SECRET", "").strip()
        auth = request.headers.get("authorization", "")
        if not secret or not _hmac.compare_digest(auth, f"Bearer {secret}"):
            raise HTTPException(401, "unauthorized")
        return await _do_purge()

    async def _do_purge():
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        stale = await db.vip_threads.find({"deleted_at": {"$lt": cutoff, "$ne": None}}, {"_id": 0, "id": 1}).to_list(5000)
        stale_ids = [s["id"] for s in stale]
        replies_del = votes_del = 0
        if stale_ids:
            replies_del = (await db.vip_replies.delete_many({"thread_id": {"$in": stale_ids}})).deleted_count
            votes_del = (await db.vip_votes.delete_many({"thread_id": {"$in": stale_ids}})).deleted_count
            await db.vip_threads.delete_many({"id": {"$in": stale_ids}})
        return {"purged_threads": len(stale_ids), "replies_removed": replies_del, "votes_removed": votes_del}

    @api_router.post("/vip/trash/purge-now")
    async def vip_trash_purge_now(_: dict = Depends(require_admin)):
        """Admin-triggered manual purge of expired trash (24h+ soft-deleted)."""
        return await _do_purge()

    @api_router.patch("/vip/threads/{tid}/resolve")
    async def vip_thread_resolve(tid: str, body: ResolveBody, _: dict = Depends(require_admin)):
        r = await db.vip_threads.update_one({"id": tid}, {"$set": {"resolved": bool(body.resolved)}})
        if r.matched_count == 0:
            raise HTTPException(404, "thread not found")
        return {"id": tid, "resolved": bool(body.resolved)}

    @api_router.patch("/vip/threads/{tid}/pin")
    async def vip_thread_pin(tid: str, body: PinBody, _: dict = Depends(require_admin)):
        r = await db.vip_threads.update_one({"id": tid}, {"$set": {"pinned": bool(body.pinned)}})
        if r.matched_count == 0:
            raise HTTPException(404, "thread not found")
        return {"id": tid, "pinned": bool(body.pinned)}

    @api_router.get("/vip/faq")
    async def vip_faq():
        threads = await (
            db.vip_threads.find({"pinned": True, "deleted_at": {"$in": [None, ""]}}, {"_id": 0})
            .sort("created_at", -1).limit(20).to_list(20)
        )
        # Attach top public admin reply as answer (if any).
        for tdoc in threads:
            r = await db.vip_replies.find_one(
                {"thread_id": tdoc["id"], "is_admin": True, "is_public": True},
                {"_id": 0},
                sort=[("created_at", 1)],
            )
            tdoc["answer"] = r.get("body") if r else None
        return threads

    @api_router.get("/vip/stats")
    async def vip_stats():
        total = await db.vip_threads.count_documents({"deleted_at": {"$in": [None, ""]}})
        resolved = await db.vip_threads.count_documents({"resolved": True, "deleted_at": {"$in": [None, ""]}})
        # Average first-admin-response hours (across threads that have an admin reply).
        avg_hours: Optional[float] = None
        threads = await db.vip_threads.find({}, {"_id": 0, "id": 1, "created_at": 1}).to_list(2000)
        durations: List[float] = []
        for tdoc in threads:
            first_admin = await db.vip_replies.find_one(
                {"thread_id": tdoc["id"], "is_admin": True},
                {"_id": 0, "created_at": 1},
                sort=[("created_at", 1)],
            )
            if not first_admin:
                continue
            try:
                a = datetime.fromisoformat(tdoc["created_at"].replace("Z", "+00:00"))
                b = datetime.fromisoformat(first_admin["created_at"].replace("Z", "+00:00"))
                durations.append((b - a).total_seconds() / 3600.0)
            except Exception:
                continue
        if durations:
            avg_hours = round(sum(durations) / len(durations), 1)
        return {"total_threads": total, "resolved_threads": resolved, "avg_response_hours": avg_hours}
