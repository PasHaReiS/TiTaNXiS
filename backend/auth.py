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


def create_token(user_id: str, username: str, role: str, sid: Optional[str] = None) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[JWT_ALGO])


def parse_user_agent(ua: str) -> dict:
    """Cheap UA parser — no external dep. Returns {browser, os, device}.
    Enough for the Oturum Yönetimi table; not spec-perfect."""
    ua = (ua or "").strip()
    if not ua:
        return {"browser": "Bilinmiyor", "os": "Bilinmiyor", "device": "desktop"}
    low = ua.lower()
    # Order matters — Edge string contains "Chrome"; check Edge first.
    if "edg/" in low or "edge/" in low:
        browser = "Edge"
    elif "opr/" in low or "opera" in low:
        browser = "Opera"
    elif "firefox/" in low:
        browser = "Firefox"
    elif "chrome/" in low and "chromium" not in low:
        browser = "Chrome"
    elif "safari/" in low:
        browser = "Safari"
    else:
        browser = "Bilinmiyor"
    if "windows" in low:
        osn = "Windows"
    elif "iphone" in low or "ipad" in low or "ipod" in low:
        osn = "iOS"
    elif "android" in low:
        osn = "Android"
    elif "mac os" in low or "macintosh" in low:
        osn = "macOS"
    elif "linux" in low:
        osn = "Linux"
    else:
        osn = "Bilinmiyor"
    if "mobi" in low or "iphone" in low or "android" in low:
        device = "mobile"
    elif "ipad" in low or "tablet" in low:
        device = "tablet"
    else:
        device = "desktop"
    return {"browser": browser, "os": osn, "device": device}


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
        "display_name": u.get("display_name") or None,
        "email": u.get("email"),
        "role": u.get("role", "user"),
        "can_edit": bool(u.get("can_edit", False)) or u.get("role") == "admin",
        "must_change_password": bool(u.get("must_change_password", False)),
        "member_ids": ids,
        "notification_member_ids": notif_ids,
        "notification_enabled": bool(u.get("notification_enabled", True)),
        "preferred_language": (u.get("preferred_language") or None),
        "telegram_chat_id": (u.get("telegram_chat_id") or None),
        # v130 — expose the avatar URL so the profile card, header dropdown
        # and event chat can render the uploaded portrait. Nullable when
        # the user has not yet uploaded one.
        "avatar_url": u.get("avatar_url"),
        "avatar_updated_at": u.get("avatar_updated_at"),
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
        # Session-aware auth: if the token carries a `sid` claim, the matching
        # session doc must still be alive. Revoked sessions (remote logout) or
        # deleted sessions immediately invalidate the token even though the JWT
        # itself would otherwise still be valid for JWT_EXP_DAYS.
        sid = payload.get("sid")
        if sid:
            sess = await db.sessions.find_one({"id": sid}, {"_id": 0, "revoked": 1})
            if not sess or sess.get("revoked"):
                return None
            # Refresh last_active_at at most once per 60s to keep writes cheap.
            try:
                from datetime import datetime as _dt_a, timezone as _tz_a
                await db.sessions.update_one(
                    {"id": sid, "$or": [
                        {"last_active_at": {"$exists": False}},
                        {"last_active_at": {"$lt": (_dt_a.now(_tz_a.utc) - timedelta(seconds=60)).isoformat()}},
                    ]},
                    {"$set": {"last_active_at": now_iso()}},
                )
            except Exception:
                pass
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        if user is not None and sid:
            # Stash the sid so endpoints can identify the current session (e.g.
            # to mark it as "bu cihaz" or skip it in revoke-others).
            user["_current_sid"] = sid
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
        # Create a session row — token carries `sid` so we can revoke it
        # remotely from the Yönetim > Oturum Yönetimi tab without waiting
        # for the JWT to naturally expire.
        ua = (request.headers.get("user-agent") or "")[:400]
        ua_info = parse_user_agent(ua)
        sid = uuid.uuid4().hex
        await db.sessions.insert_one({
            "id": sid,
            "user_id": user["id"],
            "username": user["username"],
            "role": user.get("role", "user"),
            "ip": client_ip,
            "user_agent": ua,
            "ua_browser": ua_info["browser"],
            "ua_os": ua_info["os"],
            "ua_device": ua_info["device"],
            "created_at": now_iso(),
            "last_active_at": now_iso(),
            "revoked": False,
        })
        token = create_token(user["id"], user["username"], user.get("role", "user"), sid=sid)
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

    # v120 — RSVP consecutive-yes streak for the current user. Powers the
    # "🔥 5 Etkinlik Serisi" badge on the profile page. Only events with
    # `attendance_enabled` are counted; ties are broken by event date desc
    # so the newest RSVP anchors the streak. A "no" or "maybe" resets the
    # count. If the user has never RSVP'd, streak = 0.
    @router.get("/auth/me/rsvp-streak")
    async def rsvp_streak_me(user: dict = Depends(require_auth)):
        rsvps = await db.event_rsvps.find(
            {"user_id": user["id"]},
            {"_id": 0, "event_id": 1, "status": 1},
        ).to_list(2000)
        if not rsvps:
            return {"streak": 0, "has_badge": False, "threshold": 5}
        ev_ids = list({r["event_id"] for r in rsvps if r.get("event_id")})
        events = await db.events.find(
            {"id": {"$in": ev_ids}, "attendance_enabled": {"$ne": False}},
            {"_id": 0, "id": 1, "date": 1},
        ).to_list(2000)
        by_ev = {e["id"]: e for e in events}
        rows = []
        for r in rsvps:
            ev = by_ev.get(r.get("event_id"))
            if not ev or not ev.get("date"):
                continue
            rows.append({"status": r.get("status"), "date": ev["date"]})
        rows.sort(key=lambda x: x["date"], reverse=True)
        streak = 0
        for r in rows:
            if r["status"] == "yes":
                streak += 1
            else:
                break
        return {"streak": streak, "has_badge": streak >= 5, "threshold": 5}

    # v120 — KVKK "silme hakkı" — user-initiated hard delete of their own
    # account. Requires password confirmation as a safety gate (matches the
    # change-password contract). Wipes: users doc, event_rsvps, sessions,
    # push_subscriptions, telegram_links, notifications. Guild-side member
    # docs (leaderboard rows) are NOT removed — those belong to the guild,
    # not the login. Admins CANNOT delete themselves via this route to
    # avoid locking the loncayı out.
    @router.delete("/auth/me")
    async def delete_me(body: dict, user: dict = Depends(require_auth)):
        password = (body or {}).get("password") or ""
        if not verify_password(password, user["password_hash"]):
            raise HTTPException(400, "Mevcut şifre hatalı")
        if user.get("role") == "admin":
            # Guard: last-admin lockout prevention. If this is the ONLY
            # admin, refuse and ask them to hand over the role first.
            other_admins = await db.users.count_documents(
                {"role": "admin", "id": {"$ne": user["id"]}}
            )
            if other_admins == 0:
                raise HTTPException(
                    400,
                    "Son admin hesabı kendisini silemez. Önce başka bir admin atayın.",
                )
        uid = user["id"]
        # Cascade delete across per-user collections. Order matters only for
        # observability — each op is independent and idempotent.
        await db.event_rsvps.delete_many({"user_id": uid})
        await db.sessions.delete_many({"user_id": uid})
        await db.push_subscriptions.delete_many({"user_id": uid})
        await db.telegram_links.delete_many({"user_id": uid})
        await db.notifications.delete_many({"user_id": uid})
        await db.users.delete_one({"id": uid})
        return {"ok": True, "deleted_user_id": uid}

    # v124 — Notification preferences panel. Users can toggle individual
    # channels (rsvp reminders, general announcements, streak celebrations,
    # sadıklar mentions) without disabling notifications entirely. Missing
    # keys default to True so existing users get all notifications by
    # default until they explicitly opt out.
    @router.get("/auth/me/notification-prefs")
    async def get_notif_prefs(user: dict = Depends(require_auth)):
        prefs = user.get("notification_prefs") or {}
        return {
            "rsvp": prefs.get("rsvp", True),
            "announcement": prefs.get("announcement", True),
            "streak": prefs.get("streak", True),
            "sadiklar": prefs.get("sadiklar", True),
            # v135.26 — Pre-event auto reminder channel (15/30/60/120 dk).
            "reminder": prefs.get("reminder", True),
        }

    @router.put("/auth/me/notification-prefs")
    async def put_notif_prefs(body: dict, user: dict = Depends(require_auth)):
        allowed = {"rsvp", "announcement", "streak", "sadiklar", "reminder"}
        prefs = {k: bool(v) for k, v in (body or {}).items() if k in allowed}
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"notification_prefs": prefs,
                      "notification_prefs_updated_at": now_iso()}},
        )
        return {"ok": True, "prefs": prefs}

    # v135.28 — Optional birthday (MM-DD only, no year for privacy).
    # A daily loop in server.py posts a Telegram channel greeting + admin
    # push whenever `today == birthday_mmdd`. Setting an empty string clears
    # the value and mutes any future celebration.
    import re as _re_bday
    async def get_birthday(user: dict = Depends(require_auth)):
        return {"birthday_mmdd": user.get("birthday_mmdd") or ""}

    @router.put("/auth/me/birthday")
    async def put_birthday(body: dict, user: dict = Depends(require_auth)):
        raw = (body or {}).get("birthday_mmdd")
        if raw in (None, "", "null"):
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"birthday_mmdd": None,
                          "birthday_celebrated_year": None,
                          "birthday_updated_at": now_iso()}},
            )
            return {"ok": True, "birthday_mmdd": None}
        if not isinstance(raw, str) or not _re_bday.fullmatch(r"\d{2}-\d{2}", raw):
            raise HTTPException(400, "birthday_mmdd must be MM-DD (e.g. 05-14)")
        try:
            m, d = int(raw[:2]), int(raw[3:])
            if not (1 <= m <= 12 and 1 <= d <= 31):
                raise ValueError
        except Exception:
            raise HTTPException(400, "invalid MM-DD range")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"birthday_mmdd": raw,
                      "birthday_updated_at": now_iso()}},
        )
        return {"ok": True, "birthday_mmdd": raw}

    # v141 — Kullanıcının kendi görünen adı (max 40 karakter). Ses odalarında
    # LiveKit `.with_name()` çağrısında ve @-etiketlerinde bu değer kullanılır.
    # Boş / null → username fallback. Kullanıcı Ses Odası'nda kalem ikonuyla
    # anlık düzenleyebilir; değişiklik kalıcıdır ve tüm sistemde geçerli olur.
    @router.put("/auth/me/display-name")
    async def put_display_name(body: dict, user: dict = Depends(require_auth)):
        raw = (body or {}).get("display_name")
        if raw is None:
            raw = ""
        if not isinstance(raw, str):
            raise HTTPException(400, "display_name must be a string")
        raw = raw.strip()
        if len(raw) > 40:
            raise HTTPException(400, "display_name max 40 karakter")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"display_name": raw or None,
                      "display_name_updated_at": now_iso()}},
        )
        return {"ok": True, "display_name": raw or None}

    # v135.29 — Optional public bio (max 280 chars). Rendered on the member
    # profile card so guildmates can leave a short intro / battle cry.
    # Distinct from admin_notes (private) — the bio is user-authored and
    # visible to every logged-in guildmate.
    @router.get("/auth/me/bio")
    async def get_bio(user: dict = Depends(require_auth)):
        return {"bio": user.get("bio") or ""}

    @router.put("/auth/me/bio")
    async def put_bio(body: dict, user: dict = Depends(require_auth)):
        raw = (body or {}).get("bio")
        if raw is None:
            raw = ""
        if not isinstance(raw, str):
            raise HTTPException(400, "bio must be a string")
        raw = raw.strip()
        if len(raw) > 280:
            raise HTTPException(400, "bio max 280 karakter")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"bio": raw or None, "bio_updated_at": now_iso()}},
        )
        return {"ok": True, "bio": raw}

    # v124 — Avatar upload. Frontend uses the existing `/api/uploads/image`
    # endpoint to store the file and receive `{file_id, url}`; the URL is
    # then attached to the user doc here so it can render in headers,
    # profile card and message avatars.
    # v131 — Propagate the avatar to every member linked to this user so
    # the leaderboard, member list, and event chat all show the portrait
    # without needing a second collection lookup. When `avatar_url` is null
    # the linked members are cleared to null as well.
    @router.put("/auth/me/avatar")
    async def put_avatar(body: dict, user: dict = Depends(require_auth)):
        url = (body or {}).get("avatar_url")
        if url is not None and not isinstance(url, str):
            raise HTTPException(400, "avatar_url must be a string or null")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"avatar_url": url,
                      "avatar_updated_at": now_iso()}},
        )
        linked_ids = [x for x in (user.get("member_ids") or []) if x]
        if linked_ids:
            await db.members.update_many(
                {"id": {"$in": linked_ids}},
                {"$set": {"avatar_url": url}},
            )
        return {"ok": True, "avatar_url": url, "members_updated": len(linked_ids)}

    # ---------- Per-user manual event drag-drop order ----------
    # Stores the drag-drop reorder from the Etkinlikler page in a per-user
    # dict so a reorder done on desktop lives on the phone too. Bucket keys
    # look like "ungrouped" or "group:SvS" (whatever Events.jsx sends).
    # Body: {"bucket_key": str, "ids": [str]}
    @router.get("/users/me/event-order")
    async def get_event_order(user: dict = Depends(require_auth)):
        return {"order": user.get("event_manual_order") or {}}

    @router.put("/users/me/event-order")
    async def put_event_order(body: dict, user: dict = Depends(require_auth)):
        bucket = (body or {}).get("bucket_key") or ""
        ids = (body or {}).get("ids") or []
        if not bucket or not isinstance(ids, list):
            raise HTTPException(400, "bucket_key ve ids gerekli")
        # Merge into existing dict — one bucket at a time, don't clobber others
        current = user.get("event_manual_order") or {}
        current[bucket] = [str(x) for x in ids][:500]  # bounded to keep doc small
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"event_manual_order": current}},
        )
        return {"ok": True, "bucket_key": bucket, "count": len(current[bucket])}

    # ---------- Admin: purge stale event ids from per-user order maps ----------
    # Sweeps every user doc's `event_manual_order` and removes ids that no
    # longer point at a live event. Also drops now-empty bucket keys so the
    # map doesn't accumulate cruft. Called from Admin Tools UI or cron.
    @router.post("/admin/event-order/purge-stale")
    async def purge_stale_event_order(_: dict = Depends(require_admin)):
        live_ids = set()
        async for ev in db.events.find({}, {"_id": 0, "id": 1}):
            eid = ev.get("id")
            if eid:
                live_ids.add(str(eid))
        users_touched = 0
        ids_removed = 0
        buckets_removed = 0
        async for u in db.users.find(
            {"event_manual_order": {"$exists": True, "$ne": {}}},
            {"_id": 0, "id": 1, "event_manual_order": 1},
        ):
            current = u.get("event_manual_order") or {}
            new_map = {}
            local_removed = 0
            for bucket, ids in current.items():
                filtered = [i for i in (ids or []) if i in live_ids]
                dropped = len(ids or []) - len(filtered)
                local_removed += dropped
                if filtered:
                    new_map[bucket] = filtered
                elif ids:
                    buckets_removed += 1
            if new_map != current:
                await db.users.update_one(
                    {"id": u["id"]},
                    {"$set": {"event_manual_order": new_map}},
                )
                users_touched += 1
                ids_removed += local_removed
        return {
            "ok": True,
            "users_touched": users_touched,
            "ids_removed": ids_removed,
            "buckets_removed": buckets_removed,
            "live_events": len(live_ids),
        }
    # Wipes all failed login_attempts within the 15-min brute-force window for a
    # given username so an operator can rescue a locked-out user without waiting
    # out the timer. Also defensively unsets any per-user lockout fields that
    # older schemas may have written (`failed_login_attempts`, `locked_until`,
    # `lockout_until`, `login_locked`, `brute_force_locked_until`).
    #
    # Matches case-insensitively so `selim`, `Selim`, `selim@titanxis.com` all
    # map to the same lockout record and stored user doc.
    @router.post("/auth/unlock-user")
    async def unlock_user(body: dict, _: dict = Depends(require_admin)):
        raw = (body or {}).get("username") or ""
        uname = raw.strip().lower()
        if not uname:
            raise HTTPException(400, "username gerekli")
        import re as _re
        pat = _re.compile(_re.escape(uname), _re.IGNORECASE)
        # Clear failed attempts by exact lowercased username AND by regex so
        # variants like `selim` vs `selim@titanxis.com` both get drained.
        r1 = await db.login_attempts.delete_many({"username": uname, "success": False})
        r2 = await db.login_attempts.delete_many({
            "username": {"$regex": pat},
            "success": False,
        })
        # Unset any stored lockout fields on matching user docs (defensive —
        # older schemas may have written these; current schema does not).
        r3 = await db.users.update_many(
            {"username": {"$regex": pat}},
            {"$unset": {
                "failed_login_attempts": "",
                "locked_until": "",
                "lockout_until": "",
                "login_locked": "",
                "brute_force_locked_until": "",
            }},
        )
        return {
            "ok": True,
            "username": uname,
            "failed_attempts_cleared": r1.deleted_count + r2.deleted_count,
            "user_docs_touched": r3.modified_count,
            "matched_users": r3.matched_count,
        }

    # ---------- Sessions (Oturum Yönetimi / Phase 2) ----------
    def _session_public(s: dict, current_sid: Optional[str] = None) -> dict:
        return {
            "id": s.get("id"),
            "user_id": s.get("user_id"),
            "username": s.get("username"),
            "role": s.get("role"),
            "ip": s.get("ip"),
            "ua_browser": s.get("ua_browser") or "Bilinmiyor",
            "ua_os": s.get("ua_os") or "Bilinmiyor",
            "ua_device": s.get("ua_device") or "desktop",
            "user_agent": s.get("user_agent") or "",
            "created_at": s.get("created_at"),
            "last_active_at": s.get("last_active_at"),
            "revoked": bool(s.get("revoked")),
            "revoked_at": s.get("revoked_at"),
            "current": bool(current_sid and s.get("id") == current_sid),
        }

    @router.get("/sessions/me")
    async def list_my_sessions(user: dict = Depends(require_auth)):
        """Every active session for the current user, most-recent first."""
        current_sid = user.get("_current_sid")
        cursor = db.sessions.find(
            {"user_id": user["id"], "revoked": False},
            {"_id": 0},
        ).sort("last_active_at", -1)
        items = [_session_public(s, current_sid) async for s in cursor]
        return {"items": items, "current_sid": current_sid}

    @router.get("/sessions/all")
    async def list_all_sessions(
        include_revoked: bool = False,
        limit: int = 500,
        user: dict = Depends(require_admin),
    ):
        """Admin — every session across all users, grouped-ready payload.
        include_revoked=true also returns revoked rows for audit."""
        q = {} if include_revoked else {"revoked": False}
        current_sid = user.get("_current_sid")
        cursor = db.sessions.find(q, {"_id": 0}).sort("last_active_at", -1).limit(max(1, min(limit, 2000)))
        items = [_session_public(s, current_sid) async for s in cursor]
        return {"items": items, "current_sid": current_sid}

    @router.post("/sessions/{sid}/revoke")
    async def revoke_session(sid: str, user: dict = Depends(require_auth)):
        """Revoke a specific session. Users can only revoke their own; admins
        can revoke any. Immediately invalidates the JWT via `sid` check in
        `optional_auth`."""
        sess = await db.sessions.find_one({"id": sid}, {"_id": 0})
        if not sess:
            raise HTTPException(404, "Oturum bulunamadı")
        if user.get("role") != "admin" and sess.get("user_id") != user["id"]:
            raise HTTPException(403, "Bu oturumu sonlandırma yetkiniz yok")
        if sess.get("revoked"):
            return {"ok": True, "already": True}
        await db.sessions.update_one(
            {"id": sid},
            {"$set": {"revoked": True, "revoked_at": now_iso(),
                      "revoked_by": user["id"], "revoked_by_username": user.get("username")}},
        )
        return {"ok": True}

    @router.post("/sessions/revoke-others")
    async def revoke_other_sessions(user: dict = Depends(require_auth)):
        """Kill every session for the current user EXCEPT the one making the
        request. Requires a session-aware token (JWT with `sid` claim)."""
        current_sid = user.get("_current_sid")
        q = {"user_id": user["id"], "revoked": False}
        if current_sid:
            q["id"] = {"$ne": current_sid}
        r = await db.sessions.update_many(
            q,
            {"$set": {"revoked": True, "revoked_at": now_iso(),
                      "revoked_by": user["id"], "revoked_reason": "self-revoke-others"}},
        )
        return {"ok": True, "revoked": r.modified_count}

    @router.post("/sessions/revoke-user/{user_id}")
    async def revoke_all_user_sessions(user_id: str, admin: dict = Depends(require_admin)):
        """Admin — revoke every active session for a user in one shot."""
        r = await db.sessions.update_many(
            {"user_id": user_id, "revoked": False},
            {"$set": {"revoked": True, "revoked_at": now_iso(),
                      "revoked_by": admin["id"],
                      "revoked_by_username": admin.get("username"),
                      "revoked_reason": "admin-revoke-user"}},
        )
        return {"ok": True, "revoked": r.modified_count}

    @router.post("/auth/logout")
    async def logout(user: dict = Depends(require_auth)):
        """Revoke the current session (logout on THIS device only). The client
        should also drop the token from localStorage."""
        sid = user.get("_current_sid")
        if sid:
            await db.sessions.update_one(
                {"id": sid, "revoked": False},
                {"$set": {"revoked": True, "revoked_at": now_iso(),
                          "revoked_reason": "user-logout"}},
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

    class LanguagePrefBody(BaseModel):
        lang: str  # ISO 639-1 lowercase (e.g. "tr", "en", "de", "ja")

    @router.post("/auth/preferred-language")
    async def set_preferred_language(body: LanguagePrefBody, user: dict = Depends(require_auth)):
        """Persist the caller's preferred UI language. Used by push broadcast
        to translate outgoing notifications via DeepL per-recipient."""
        code = (body.lang or "").strip().lower()[:8]
        if not code:
            raise HTTPException(400, "lang boş olamaz")
        await db.users.update_one({"id": user["id"]}, {"$set": {"preferred_language": code}})
        return {"preferred_language": code}


    # ---------- User Management (admin only) ----------
    @router.get("/users/unmatched")
    async def list_unmatched_users(_: dict = Depends(require_admin)):
        """Return users with no linked member (empty/missing member_ids AND no legacy member_id).

        The built-in system accounts ``admin`` and ``pasha`` are excluded from
        this list — they are the guild-owner accounts and should not appear as
        matching candidates even when their member_ids happen to be empty.
        """
        docs = await db.users.find(
            {
                "$and": [
                    {"$or": [{"member_ids": {"$exists": False}}, {"member_ids": {"$size": 0}}]},
                    {"$or": [{"member_id": None}, {"member_id": ""}, {"member_id": {"$exists": False}}]},
                    {"username": {"$nin": ["admin", "pasha"]}},
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
    # Sessions collection — Oturum Yönetimi queries.
    await db.sessions.create_index("id", unique=True)
    await db.sessions.create_index([("user_id", 1), ("revoked", 1), ("last_active_at", -1)])
    await db.sessions.create_index([("revoked", 1), ("last_active_at", -1)])
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
