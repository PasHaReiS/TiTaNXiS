"""Auth module: JWT + bcrypt + role-based access control for Oyun Loncası."""
import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict
import uuid

JWT_ALGO = "HS256"
JWT_EXP_DAYS = 7


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[JWT_ALGO])


# ---------- Models ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: Optional[str] = None
    password_hash: str
    role: str = "user"  # "admin" or "user"
    can_edit: bool = False
    must_change_password: bool = False
    created_at: str = Field(default_factory=now_iso)


class LoginBody(BaseModel):
    username: str
    password: str


class RegisterBody(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: Optional[str] = "user"
    can_edit: Optional[bool] = False


class UpdateUserBody(BaseModel):
    role: Optional[str] = None
    can_edit: Optional[bool] = None
    email: Optional[str] = None


class ResetPwdBody(BaseModel):
    new_password: str


class ChangePwdBody(BaseModel):
    old_password: str
    new_password: str


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "username": u["username"],
        "email": u.get("email"),
        "role": u.get("role", "user"),
        "can_edit": bool(u.get("can_edit", False)) or u.get("role") == "admin",
        "must_change_password": bool(u.get("must_change_password", False)),
        "created_at": u.get("created_at"),
    }


# ---------- Dependencies ----------
def make_auth_deps(db):
    """Factory that returns auth dependencies bound to a specific db handle."""

    async def optional_auth(request: Request) -> Optional[dict]:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth[7:].strip()
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        return user

    async def require_auth(user: Optional[dict] = Depends(optional_auth)) -> dict:
        if not user:
            raise HTTPException(401, "Giriş gerekli")
        return user

    async def require_edit(user: dict = Depends(require_auth)) -> dict:
        if user.get("role") == "admin" or user.get("can_edit"):
            return user
        raise HTTPException(403, "Değişiklik yetkiniz yok")

    async def require_admin(user: dict = Depends(require_auth)) -> dict:
        if user.get("role") != "admin":
            raise HTTPException(403, "Yönetici yetkisi gerekli")
        return user

    return optional_auth, require_auth, require_edit, require_admin


def make_auth_router(db):
    """Build the auth + user management router bound to a db."""
    optional_auth, require_auth, require_edit, require_admin = make_auth_deps(db)
    router = APIRouter(prefix="/api")

    @router.post("/auth/login")
    async def login(body: LoginBody, request: Request):
        # Brute-force throttle: max 8 failed attempts per username per 15 minutes.
        # (IP is unreliable behind Kubernetes ingress — proxy pods rotate. Username
        # is the stable identifier the attacker must control.)
        uname = body.username.lower()
        xff = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        client_ip = xff or (request.client.host if request.client else "unknown")
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        recent_fails = await db.login_attempts.count_documents({
            "username": uname,
            "success": False,
            "created_at": {"$gte": cutoff.isoformat()},
        })
        if recent_fails >= 8:
            raise HTTPException(429, "Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.")
        user = await db.users.find_one({"username": uname}, {"_id": 0})
        ok = bool(user and verify_password(body.password, user["password_hash"]))
        await db.login_attempts.insert_one({
            "username": uname, "ip": client_ip, "success": ok, "created_at": now_iso(),
        })
        if not ok:
            raise HTTPException(401, "Kullanıcı adı veya şifre hatalı")
        token = create_token(user["id"], user["username"], user.get("role", "user"))
        return {"token": token, "user": public_user(user)}

    @router.get("/auth/me")
    async def me(user: dict = Depends(require_auth)):
        return public_user(user)

    @router.post("/auth/change-password")
    async def change_password(body: ChangePwdBody, user: dict = Depends(require_auth)):
        if not verify_password(body.old_password, user["password_hash"]):
            raise HTTPException(400, "Mevcut şifre hatalı")
        if len(body.new_password) < 6:
            raise HTTPException(400, "Yeni şifre en az 6 karakter olmalı")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"password_hash": hash_password(body.new_password), "must_change_password": False}},
        )
        return {"ok": True}

    # ---------- User Management (admin only) ----------
    @router.get("/users")
    async def list_users(_: dict = Depends(require_admin)):
        docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(1000)
        return [public_user({**d, "password_hash": ""}) for d in docs]

    @router.post("/users")
    async def create_user(body: RegisterBody, _: dict = Depends(require_admin)):
        username = body.username.strip().lower()
        if not username or len(username) < 3:
            raise HTTPException(400, "Kullanıcı adı en az 3 karakter olmalı")
        if len(body.password) < 6:
            raise HTTPException(400, "Şifre en az 6 karakter olmalı")
        existing = await db.users.find_one({"username": username})
        if existing:
            raise HTTPException(400, "Bu kullanıcı adı zaten kullanımda")
        role = "admin" if body.role == "admin" else "user"
        u = User(
            username=username,
            email=body.email,
            password_hash=hash_password(body.password),
            role=role,
            can_edit=bool(body.can_edit) or role == "admin",
        )
        await db.users.insert_one(u.model_dump())
        return public_user(u.model_dump())

    @router.patch("/users/{user_id}")
    async def update_user(user_id: str, body: UpdateUserBody, admin: dict = Depends(require_admin)):
        update = {k: v for k, v in body.model_dump().items() if v is not None}
        if "role" in update and update["role"] not in ("admin", "user"):
            raise HTTPException(400, "Geçersiz rol")
        res = await db.users.update_one({"id": user_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Kullanıcı bulunamadı")
        doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        return public_user(doc)

    @router.post("/users/{user_id}/reset-password")
    async def reset_password(user_id: str, body: ResetPwdBody, admin: dict = Depends(require_admin)):
        if len(body.new_password) < 6:
            raise HTTPException(400, "Şifre en az 6 karakter olmalı")
        res = await db.users.update_one(
            {"id": user_id},
            {"$set": {"password_hash": hash_password(body.new_password), "must_change_password": True}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Kullanıcı bulunamadı")
        return {"ok": True}

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
        if user_id == admin["id"]:
            raise HTTPException(400, "Kendinizi silemezsiniz")
        res = await db.users.delete_one({"id": user_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Kullanıcı bulunamadı")
        return {"ok": True}

    return router


async def seed_admin(db):
    """Seed default admin user if not exists. Also sync password from env on each startup."""
    username = os.environ["ADMIN_USERNAME"].lower()
    email = os.environ.get("ADMIN_EMAIL") or None
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"username": username})
    if not existing:
        u = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role="admin",
            can_edit=True,
            must_change_password=True,
        )
        await db.users.insert_one(u.model_dump())
    else:
        # Ensure admin flags always correct; re-sync password from env if it changed.
        updates = {}
        if existing.get("role") != "admin":
            updates["role"] = "admin"
        if not existing.get("can_edit"):
            updates["can_edit"] = True
        if email and existing.get("email") != email:
            updates["email"] = email
        if not verify_password(password, existing["password_hash"]):
            updates["password_hash"] = hash_password(password)
        if updates:
            await db.users.update_one({"id": existing["id"]}, {"$set": updates})

    # Seed the editor account "pasha" (role=user, can_edit=True) idempotently.
    editor_username = "pasha"
    editor_password = os.environ["EDITOR_PASSWORD"]
    editor = await db.users.find_one({"username": editor_username})
    if not editor:
        u = User(
            username=editor_username,
            password_hash=hash_password(editor_password),
            role="user",
            can_edit=True,
            must_change_password=False,
        )
        await db.users.insert_one(u.model_dump())
    else:
        updates = {}
        if editor.get("role") != "user":
            updates["role"] = "user"
        if not editor.get("can_edit"):
            updates["can_edit"] = True
        if not verify_password(editor_password, editor["password_hash"]):
            updates["password_hash"] = hash_password(editor_password)
        if updates:
            await db.users.update_one({"id": editor["id"]}, {"$set": updates})


async def ensure_indexes(db):
    await db.users.create_index("username", unique=True)
    # Support brute-force throttle lookups by (username, success, created_at).
    await db.login_attempts.create_index([("username", 1), ("created_at", -1)])
