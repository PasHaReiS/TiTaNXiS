"""Auth module: JWT + bcrypt + role-based access control for Oyun Loncası."""
import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
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
    # Member matching: link app user to one or more in-game members._id
    member_ids: List[str] = Field(default_factory=list)
    # Per-character notification opt-in (subset of member_ids). Empty = all opted-in.
    notification_member_ids: List[str] = Field(default_factory=list)
    # Global notification opt-in/out (both Telegram DMs and Web Push respect this)
    notification_enabled: bool = True
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
    member_ids: Optional[List[str]] = None
    notification_enabled: Optional[bool] = None


class LinkMembersBody(BaseModel):
    """Full-replace list of linked members."""
    member_ids: List[str] = Field(default_factory=list)


class LinkMemberOneBody(BaseModel):
    """Single-member add/remove."""
    member_id: str


class NotificationPrefBody(BaseModel):
    enabled: bool


class NotificationMembersBody(BaseModel):
    """Per-character notification opt-in list (subset of linked members)."""
    member_ids: List[str] = Field(default_factory=list)


class ResetPwdBody(BaseModel):
    new_password: str


class ChangePwdBody(BaseModel):
    old_password: str
    new_password: str


def public_user(u: dict) -> dict:
    # Migrate legacy single member_id → member_ids list so old records stay compatible.
    # Strip out any null/empty entries that may have leaked in from earlier writes.
    ids = [x for x in (u.get("member_ids") or []) if x]
    legacy = u.get("member_id")
    if legacy and legacy not in ids:
        ids.append(legacy)
    notif_ids = [x for x in (u.get("notification_member_ids") or []) if x and x in ids]
    return {
        "id": u["id"],
        "username": u["username"],
        "email": u.get("email"),
        "role": u.get("role", "user"),
        "can_edit": bool(u.get("can_edit", False)) or u.get("role") == "admin",
        "must_change_password": bool(u.get("must_change_password", False)),
        "member_ids": ids,
        "notification_member_ids": notif_ids,
        "notification_enabled": bool(u.get("notification_enabled", True)),
        "password_updated_at": u.get("password_updated_at"),
        "password_updated_by": u.get("password_updated_by"),
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
        # Log successful auth to activity feed (fire-and-forget style — safe if collection missing).
        try:
            await db.activity_log.insert_one({
                "id": __import__("uuid").uuid4().hex,
                "member_id": user["id"],
                "member_name": user["username"],
                "action_type": "login",
                "details": "Uygulamaya giriş yaptı",
                "timestamp": now_iso(),
                "device": "desktop",
            })
        except Exception:
            pass
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
            {"$set": {
                "password_hash": hash_password(body.new_password),
                "must_change_password": False,
                "password_updated_at": now_iso(),
                "password_updated_by": user["username"],
            }},
        )
        return {"ok": True}

    # ---------- Member Matching (user self-service) ----------
    @router.post("/auth/link-members")
    async def set_linked_members(body: LinkMembersBody, user: dict = Depends(require_auth)):
        """Replace the caller's linked-members list. Empty list = unlink all.
        Auto-syncs `notification_member_ids` so removed characters are dropped from
        the opt-in set."""
        ids = list(dict.fromkeys([(x or "").strip() for x in (body.member_ids or []) if x and x.strip()]))
        if ids:
            found_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(len(ids))
            found = {m["id"] for m in found_docs}
            missing = [i for i in ids if i not in found]
            if missing:
                raise HTTPException(404, "Bazı üyeler bulunamadı")
            taken = await db.users.find_one(
                {"$or": [{"member_ids": {"$in": ids}}, {"member_id": {"$in": ids}}],
                 "id": {"$ne": user["id"]}},
                {"_id": 0, "username": 1},
            )
            if taken:
                raise HTTPException(409, f"Bazı üyeler zaten '{taken['username']}' hesabına bağlı")
        # Prune notification_member_ids to only the ids that are still linked.
        current = await db.users.find_one({"id": user["id"]}, {"_id": 0, "notification_member_ids": 1})
        prev_notif = list((current or {}).get("notification_member_ids") or [])
        new_notif = [x for x in prev_notif if x in ids]
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"member_ids": ids, "notification_member_ids": new_notif},
             "$unset": {"member_id": ""}},
        )
        doc = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        return public_user(doc)

    @router.post("/auth/link-members/add")
    async def add_linked_member(body: LinkMemberOneBody, user: dict = Depends(require_auth)):
        mid = (body.member_id or "").strip()
        if not mid:
            raise HTTPException(400, "member_id gerekli")
        m = await db.members.find_one({"id": mid}, {"_id": 0, "id": 1})
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        taken = await db.users.find_one(
            {"$or": [{"member_ids": mid}, {"member_id": mid}], "id": {"$ne": user["id"]}},
            {"_id": 0, "username": 1},
        )
        if taken:
            raise HTTPException(409, f"Bu üye zaten '{taken['username']}' hesabına bağlı")
        await db.users.update_one(
            {"id": user["id"]},
            {"$addToSet": {"member_ids": mid}, "$unset": {"member_id": ""}},
        )
        doc = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        return public_user(doc)

    @router.post("/auth/link-members/remove")
    async def remove_linked_member(body: LinkMemberOneBody, user: dict = Depends(require_auth)):
        mid = (body.member_id or "").strip()
        if not mid:
            raise HTTPException(400, "member_id gerekli")
        await db.users.update_one(
            {"id": user["id"]},
            {"$pull": {"member_ids": mid, "notification_member_ids": mid}},
        )
        await db.users.update_one(
            {"id": user["id"], "member_id": mid}, {"$unset": {"member_id": ""}}
        )
        doc = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        return public_user(doc)

    @router.post("/auth/notification-members")
    async def set_notification_members(body: NotificationMembersBody, user: dict = Depends(require_auth)):
        """Per-character notification opt-in list (must be subset of linked members)."""
        raw = list(dict.fromkeys([(x or "").strip() for x in (body.member_ids or []) if x and x.strip()]))
        u_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "member_ids": 1})
        linked = set((u_doc or {}).get("member_ids") or [])
        ids = [x for x in raw if x in linked]  # silently discard non-linked ids
        await db.users.update_one({"id": user["id"]}, {"$set": {"notification_member_ids": ids}})
        doc = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        return public_user(doc)

    @router.post("/auth/notification-preference")
    async def set_notification_preference(body: NotificationPrefBody, user: dict = Depends(require_auth)):
        await db.users.update_one(
            {"id": user["id"]}, {"$set": {"notification_enabled": bool(body.enabled)}}
        )
        doc = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        return public_user(doc)

    # ---------- User Management (admin only) ----------
    @router.get("/users/unmatched")
    async def list_unmatched_users(_: dict = Depends(require_admin)):
        """Return users with no linked member (empty/missing member_ids AND no legacy member_id)."""
        docs = await db.users.find(
            {
                "$and": [
                    {"$or": [{"member_ids": {"$exists": False}}, {"member_ids": {"$size": 0}}]},
                    {"$or": [{"member_id": None}, {"member_id": ""}, {"member_id": {"$exists": False}}]},
                ]
            },
            {"_id": 0, "password_hash": 0},
        ).sort("created_at", 1).to_list(1000)
        return [public_user({**d, "password_hash": ""}) for d in docs]

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
        # Use exclude_unset so admins can explicitly set member_ids=[] (unlink) —
        # a plain `if v is not None` filter would drop that intent.
        raw = body.model_dump(exclude_unset=True)
        update = {k: v for k, v in raw.items() if k == "member_ids" or v is not None}
        if "role" in update and update["role"] not in ("admin", "user"):
            raise HTTPException(400, "Geçersiz rol")
        unset_fields = {}
        # Admin override for member linking: verify each id + free the seats from other users.
        if "member_ids" in update:
            ids = list(dict.fromkeys([
                (x or "").strip() for x in (update["member_ids"] or []) if x and x.strip()
            ]))
            update["member_ids"] = ids
            if ids:
                found_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(len(ids))
                found = {m["id"] for m in found_docs}
                missing = [i for i in ids if i not in found]
                if missing:
                    raise HTTPException(404, "Bazı üyeler bulunamadı")
                # Auto-detach these members from any OTHER user (admin override wins).
                await db.users.update_many(
                    {"id": {"$ne": user_id},
                     "$or": [{"member_ids": {"$in": ids}}, {"member_id": {"$in": ids}}]},
                    {"$pull": {"member_ids": {"$in": ids}}},
                )
                # And clear any legacy singular member_id that collides.
                await db.users.update_many(
                    {"id": {"$ne": user_id}, "member_id": {"$in": ids}},
                    {"$unset": {"member_id": ""}},
                )
            # Any admin write drops the legacy singular field for this user.
            unset_fields["member_id"] = ""
        mongo_op: dict = {"$set": update}
        if unset_fields:
            mongo_op["$unset"] = unset_fields
        res = await db.users.update_one({"id": user_id}, mongo_op)
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
            {"$set": {
                "password_hash": hash_password(body.new_password),
                "must_change_password": True,
                "password_updated_at": now_iso(),
                "password_updated_by": f"admin:{admin['username']}",
            }},
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

    @router.post("/users/link-members/import")
    async def bulk_link_import(file: UploadFile = File(...), _: dict = Depends(require_admin)):
        """Admin bulk-import of user↔member linkage from an .xlsx/.csv.

        Expected columns (case-insensitive, Turkish accents tolerated):
          - username     (required)   — matched exactly against users.username (lowercased)
          - member_name  (optional)   — matched case-insensitively against members.name
          - member_id    (optional)   — matched exactly against members.id or members.member_id

        Behavior: For each row, add the resolved member id to the user's member_ids list
        (idempotent). Rows without a match report an error. Existing links preserved.
        """
        from openpyxl import load_workbook
        from io import BytesIO
        import csv as csv_mod
        contents = await file.read()
        if not contents:
            raise HTTPException(400, "Boş dosya")
        ext = (file.filename or "").lower().rsplit(".", 1)[-1]
        rows: list[dict] = []
        if ext == "xlsx":
            wb = load_workbook(BytesIO(contents), read_only=True, data_only=True)
            ws = wb[wb.sheetnames[0]]
            it = list(ws.iter_rows(values_only=True))
            if not it:
                return {"added": 0, "skipped": 0, "errors": 0, "rows": []}
            headers = [str(h).strip().lower() if h is not None else "" for h in it[0]]
            for r in it[1:]:
                if all(c is None or c == "" for c in r):
                    continue
                rows.append({headers[i]: r[i] for i in range(min(len(headers), len(r)))})
        elif ext == "csv":
            text = contents.decode("utf-8-sig", errors="ignore")
            rows = [dict(r) for r in csv_mod.DictReader(text.splitlines())]
            rows = [{(k or "").strip().lower(): v for k, v in row.items()} for row in rows]
        else:
            raise HTTPException(400, "Yalnızca .xlsx veya .csv desteklenir")

        users_all = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "member_ids": 1, "member_id": 1}).to_list(5000)
        users_by_name = {u["username"].lower(): u for u in users_all if u.get("username")}
        members_all = await db.members.find({}, {"_id": 0, "id": 1, "name": 1, "member_id": 1}).to_list(10000)
        members_by_id = {m["id"]: m for m in members_all}
        members_by_gid = {m["member_id"]: m for m in members_all if m.get("member_id")}
        # Case-sensitive member name lookup (Ali ≠ ali). Only usernames stay lowercased.
        members_by_name = {(m.get("name") or ""): m for m in members_all if m.get("name")}

        added = 0
        skipped = 0
        errors = 0
        report: list[dict] = []
        for row in rows:
            uname = str(row.get("username") or "").strip().lower()
            mname = str(row.get("member_name") or "").strip()
            mid_col = str(row.get("member_id") or "").strip()
            if not uname:
                errors += 1
                report.append({"row": row, "error": "username missing"})
                continue
            u = users_by_name.get(uname)
            if not u:
                errors += 1
                report.append({"row": row, "error": f"user '{uname}' not found"})
                continue
            m = None
            if mid_col:
                m = members_by_id.get(mid_col) or members_by_gid.get(mid_col)
            if not m and mname:
                m = members_by_name.get(mname)
            if not m:
                errors += 1
                report.append({"row": row, "error": "member not resolved"})
                continue
            existing_ids = set(u.get("member_ids") or [])
            if u.get("member_id"):
                existing_ids.add(u["member_id"])
            if m["id"] in existing_ids:
                skipped += 1
                continue
            # Auto-detach from any OTHER user first (admin override wins).
            await db.users.update_many(
                {"id": {"$ne": u["id"]}, "$or": [{"member_ids": m["id"]}, {"member_id": m["id"]}]},
                {"$pull": {"member_ids": m["id"], "notification_member_ids": m["id"]}},
            )
            await db.users.update_one(
                {"id": u["id"]},
                {"$addToSet": {"member_ids": m["id"]}, "$unset": {"member_id": ""}},
            )
            added += 1
        return {"added": added, "skipped": skipped, "errors": errors, "report": report[:50]}

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
        doc = u.model_dump()
        doc["password_updated_at"] = now_iso()
        doc["password_updated_by"] = "system-seed"
        await db.users.insert_one(doc)
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
            updates["password_updated_at"] = now_iso()
            updates["password_updated_by"] = "system-seed"
        if updates:
            await db.users.update_one({"id": existing["id"]}, {"$set": updates})

    # Seed the editor account "pasha" (role=user, can_edit=True) idempotently.
    # Password is sourced from PASHA_ADMIN_PASSWORD env var and re-synced on every startup.
    editor_username = "pasha"
    editor_password = os.environ["PASHA_ADMIN_PASSWORD"]
    editor = await db.users.find_one({"username": editor_username})
    if not editor:
        u = User(
            username=editor_username,
            password_hash=hash_password(editor_password),
            role="user",
            can_edit=True,
            must_change_password=False,
        )
        doc = u.model_dump()
        doc["password_updated_at"] = now_iso()
        doc["password_updated_by"] = "system-seed"
        await db.users.insert_one(doc)
    else:
        updates = {}
        if editor.get("role") != "user":
            updates["role"] = "user"
        if not editor.get("can_edit"):
            updates["can_edit"] = True
        if not verify_password(editor_password, editor["password_hash"]):
            updates["password_hash"] = hash_password(editor_password)
            updates["password_updated_at"] = now_iso()
            updates["password_updated_by"] = "system-seed"
        if updates:
            await db.users.update_one({"id": editor["id"]}, {"$set": updates})


async def ensure_indexes(db):
    await db.users.create_index("username", unique=True)
    # Support brute-force throttle lookups by (username, success, created_at).
    await db.login_attempts.create_index([("username", 1), ("created_at", -1)])
    # Member matching lookup (sparse — some users have no linked member).
    await db.users.create_index("member_ids", sparse=True)
    # One-shot migration: users with legacy `member_id` string but no `member_ids` array.
    async for u in db.users.find(
        {"member_id": {"$exists": True, "$nin": [None, ""]},
         "$or": [{"member_ids": {"$exists": False}}, {"member_ids": {"$size": 0}}]},
        {"_id": 0, "id": 1, "member_id": 1},
    ):
        await db.users.update_one(
            {"id": u["id"]},
            {"$set": {"member_ids": [u["member_id"]]}, "$unset": {"member_id": ""}},
        )
