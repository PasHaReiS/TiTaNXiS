"""v140.34 — Basit "davet KODU" (8-karakter alfanümerik) kayıt sistemi.

Mevcut token bazlı davet linki sistemine paralel, çok hafif bir kod bazlı
akış. Admin `/api/invite-codes` üzerinden kısa kod üretir (elden/sözlü
paylaşılabilir), yeni kullanıcı `/api/auth/register` uçuna kod + kullanıcı
adı + şifre gönderir. Kod tek kullanımlıktır.

Endpoints:
  Admin:
    - POST   /api/invite-codes           yeni kod üret
    - GET    /api/invite-codes           tüm kodları listele
    - DELETE /api/invite-codes/{code}    kodu sil
  Public:
    - POST   /api/auth/register          {username, password, invite_code}
                                          → yeni kullanıcı + JWT session döner
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
import uuid
import secrets
import string

# v136 — Bulk generation caps. Frontend UI only exposes 5/10/20 preset buttons.
_BULK_ALLOWED = {5, 10, 20}
_BULK_MAX = 20


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Belirsiz karakterleri (O/0, I/1) hariç tutuyoruz — kullanıcı yanlış yazmasın.
_ALPHABET = "".join(c for c in (string.ascii_uppercase + string.digits)
                    if c not in {"O", "0", "I", "1"})


def _gen_code() -> str:
    """8-karakter alfanümerik (büyük harf + rakam), belirsiz karakterler hariç."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))


class RegisterBody(BaseModel):
    username: str
    password: str
    invite_code: str
    terms_accepted_at: Optional[str] = None


def make_invite_codes_router(db, require_admin, hash_password_fn,
                             create_token_fn, parse_user_agent_fn,
                             now_iso_fn, public_user_fn):
    router = APIRouter(tags=["invite-codes"])

    # ---------------- Admin ----------------
    @router.post("/invite-codes")
    async def create_code(admin: dict = Depends(require_admin)):
        # 6 deneme collision-safe.
        code = None
        for _ in range(6):
            candidate = _gen_code()
            exists = await db.invite_codes.find_one({"code": candidate}, {"_id": 0, "code": 1})
            if not exists:
                code = candidate
                break
        if not code:
            raise HTTPException(500, "Kod üretilemedi, tekrar dene")
        doc = {
            "id": str(uuid.uuid4()),
            "code": code,
            "created_by": admin.get("id"),
            "created_by_username": admin.get("username") or "",
            "created_at": _now_iso(),
            "used": False,
            "used_by": None,
            "used_by_user_id": None,
            "used_at": None,
        }
        await db.invite_codes.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.post("/invite-codes/bulk")
    async def create_codes_bulk(
        count: int = Query(10, ge=1, le=_BULK_MAX, description="Kaç kod üretilecek (5/10/20)"),
        admin: dict = Depends(require_admin),
    ):
        """v136 — Toplu davet kodu üretimi. Frontend 5/10/20 seçenekleri sunar.
        Response: {items: [...], created: N}"""
        if count not in _BULK_ALLOWED:
            raise HTTPException(400, f"count 5, 10 veya 20 olmalı (gelen: {count})")
        created_docs = []
        for _ in range(count):
            code = None
            for _try in range(8):
                candidate = _gen_code()
                exists = await db.invite_codes.find_one({"code": candidate}, {"_id": 0, "code": 1})
                if not exists:
                    code = candidate
                    break
            if not code:
                # Çok nadir; şimdiye kadar üretilenleri döndür.
                break
            doc = {
                "id": str(uuid.uuid4()),
                "code": code,
                "created_by": admin.get("id"),
                "created_by_username": admin.get("username") or "",
                "created_at": _now_iso(),
                "used": False,
                "used_by": None,
                "used_by_user_id": None,
                "used_at": None,
                "batch_id": None,  # aynı batch'te üretilen kodları gruplamak için
            }
            created_docs.append(doc)
        if not created_docs:
            raise HTTPException(500, "Toplu kod üretilemedi, tekrar dene")
        batch_id = str(uuid.uuid4())
        for d in created_docs:
            d["batch_id"] = batch_id
        await db.invite_codes.insert_many(created_docs)
        for d in created_docs:
            d.pop("_id", None)
        return {"items": created_docs, "created": len(created_docs), "batch_id": batch_id}

    @router.get("/invite-codes")
    async def list_codes(_: dict = Depends(require_admin)):
        docs = await db.invite_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"items": docs}

    @router.delete("/invite-codes/{code}")
    async def delete_code(code: str, _: dict = Depends(require_admin)):
        r = await db.invite_codes.delete_one({"code": (code or "").upper()})
        if r.deleted_count == 0:
            raise HTTPException(404, "Davet kodu bulunamadı")
        return {"ok": True}

    # ---------------- Public: register with invite code ----------------
    @router.post("/auth/register")
    async def register(body: RegisterBody, request: Request):
        uname = (body.username or "").strip().lower()
        pwd = body.password or ""
        code = (body.invite_code or "").strip().upper()

        # Validate.
        if not uname or len(uname) < 3 or len(uname) > 32:
            raise HTTPException(400, "Kullanıcı adı 3-32 karakter olmalı")
        if len(pwd) < 6:
            raise HTTPException(400, "Şifre en az 6 karakter olmalı")
        if not code:
            raise HTTPException(400, "Davet kodunuz geçersiz veya kullanılmış. Yönetici ile iletişime geçin.")

        inv = await db.invite_codes.find_one({"code": code}, {"_id": 0})
        if not inv or inv.get("used"):
            raise HTTPException(400, "Davet kodunuz geçersiz veya kullanılmış. Yönetici ile iletişime geçin.")

        # Username uniqueness BEFORE burning the code.
        clash = await db.users.find_one({"username": uname}, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(400, "Bu kullanıcı adı zaten kullanılıyor")

        # Atomically burn the code (unused → used) to prevent double-consume.
        r = await db.invite_codes.update_one(
            {"code": code, "used": False},
            {"$set": {"used": True, "used_by": uname, "used_at": _now_iso()}},
        )
        if r.modified_count == 0:
            raise HTTPException(400, "Davet kodunuz geçersiz veya kullanılmış. Yönetici ile iletişime geçin.")

        # Create user.
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id,
            "username": uname,
            "email": None,
            "password_hash": hash_password_fn(pwd),
            "role": "user",
            "can_edit": False,
            "must_change_password": False,
            "member_ids": [],
            "notification_member_ids": [],
            "notification_enabled": True,
            "created_at": now_iso_fn(),
            "invited_by_code": code,
            "invited_by_username": inv.get("created_by_username") or "",
            "terms_accepted_at": (body.terms_accepted_at or now_iso_fn()),
        }
        await db.users.insert_one(doc)

        # Session.
        xff = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        client_ip = xff or (request.client.host if request.client else "unknown")
        ua = (request.headers.get("user-agent") or "")[:400]
        ua_info = parse_user_agent_fn(ua)
        sid = uuid.uuid4().hex
        await db.sessions.insert_one({
            "id": sid, "user_id": user_id, "username": uname, "role": doc["role"],
            "ip": client_ip, "user_agent": ua,
            "ua_browser": ua_info["browser"], "ua_os": ua_info["os"], "ua_device": ua_info["device"],
            "created_at": now_iso_fn(), "last_active_at": now_iso_fn(), "revoked": False,
            "invite_code_signup": code,
        })
        jwt_token = create_token_fn(user_id, uname, doc["role"], sid=sid)

        # Audit: link the burned code back to the created user.
        await db.invite_codes.update_one(
            {"code": code},
            {"$set": {"used_by_user_id": user_id}},
        )
        return {"token": jwt_token, "user": public_user_fn(doc)}

    return router


async def ensure_invite_codes_indexes(db):
    await db.invite_codes.create_index("code", unique=True)
    await db.invite_codes.create_index([("used", 1), ("created_at", -1)])
