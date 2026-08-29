"""Invite Links (Phase 5). One-time / timed self-service signup tokens.

Admins mint an invite from Yönetim > Davet Linkleri. The invite carries:
  - `token` (URL-safe random slug — used in `/kayit/:token`)
  - `max_uses` (1 = one-shot, N = capped, 0/None = unlimited until expiry)
  - `expires_at` (ISO8601 UTC, None = never expires)
  - `role` + `default_can_edit` (what the new user gets on signup)

Public endpoints:
  - GET  /api/invites/preview/{token}  → info card for signup page
  - POST /api/invites/consume          → {token, username, password}
                                          → creates user + session, returns JWT
Admin endpoints:
  - POST /api/invites          create
  - GET  /api/invites          list (active + expired)
  - PATCH /api/invites/{id}/disable
  - DELETE /api/invites/{id}   hard delete
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
import uuid
import secrets


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_token() -> str:
    # 12-byte URL-safe token → 16 chars — collision-safe for guild-scale usage.
    return secrets.token_urlsafe(12)


class InviteCreateBody(BaseModel):
    max_uses: Optional[int] = 1          # 1 = one-shot; 0/None = unlimited
    expires_at: Optional[str] = None     # ISO8601 UTC; None = never expires
    role: Optional[str] = "user"         # 'user' | 'editor' | 'admin' (admins rarely mint admin invites)
    default_can_edit: Optional[bool] = False
    note: Optional[str] = None           # free-form label ("SvS Ekim ekibi")
    # v135.32 — Language of the auto-generated invite letter. Falls back to
    # 'tr' when omitted or unsupported. The letter body itself is localised;
    # the invite link URL is language-neutral (React app auto-detects locale
    # via `i18n.detectedLanguage` when the recruit lands).
    letter_lang: Optional[str] = "tr"


# v135.32 — Localised invite letter templates. New members typically land on
# the Turkish version, but SvS coalitions frequently coordinate across EN /
# DE / ES / FR / RU / PT / AR guilds, so we ship first-class copy for those.
# Any unsupported code silently falls back to 'tr'.
INVITE_LETTER_TEMPLATES: dict = {
    "tr": {
        "label": "Türkçe",
        "title": "🎉 *{admin} seni {guild}'e davet ediyor!*",
        "cta": "Aramıza katılmak için aşağıdaki linke tıklayabilirsin:",
        "note_prefix": "_Not: {note}_",
        "outro": "{guild} bir gaming loncası — etkinlikler, ittifaklar ve dostluk seni bekliyor. Kaleyi sağlam tut, saflar bozulmasın Komutan. 🛡️",
    },
    "en": {
        "label": "English",
        "title": "🎉 *{admin} is inviting you to {guild}!*",
        "cta": "Tap the link below to join our guild:",
        "note_prefix": "_Note: {note}_",
        "outro": "{guild} is a gaming guild — events, alliances and camaraderie await. Hold the keep, keep the ranks tight Commander. 🛡️",
    },
    "de": {
        "label": "Deutsch",
        "title": "🎉 *{admin} lädt dich zu {guild} ein!*",
        "cta": "Tritt uns bei — klick den Link:",
        "note_prefix": "_Notiz: {note}_",
        "outro": "{guild} ist eine Gaming-Gilde — Events, Allianzen und Kameradschaft warten auf dich. Halte die Festung, Kommandant. 🛡️",
    },
    "es": {
        "label": "Español",
        "title": "🎉 *¡{admin} te invita a {guild}!*",
        "cta": "Únete al gremio con este enlace:",
        "note_prefix": "_Nota: {note}_",
        "outro": "{guild} es un gremio de juego — eventos, alianzas y camaradería te esperan. Mantén el fuerte, Comandante. 🛡️",
    },
    "fr": {
        "label": "Français",
        "title": "🎉 *{admin} t'invite à rejoindre {guild} !*",
        "cta": "Rejoins la guilde via ce lien :",
        "note_prefix": "_Note : {note}_",
        "outro": "{guild} est une guilde de jeu — événements, alliances et camaraderie t'attendent. Tiens le fort, Commandant. 🛡️",
    },
    "ru": {
        "label": "Русский",
        "title": "🎉 *{admin} приглашает тебя в {guild}!*",
        "cta": "Присоединяйся к гильдии по ссылке:",
        "note_prefix": "_Заметка: {note}_",
        "outro": "{guild} — это игровая гильдия. События, союзы и братство ждут тебя. Держи крепость, Командир. 🛡️",
    },
    "pt": {
        "label": "Português",
        "title": "🎉 *{admin} está te convidando para {guild}!*",
        "cta": "Entra na guilda pelo link:",
        "note_prefix": "_Nota: {note}_",
        "outro": "{guild} é uma guilda de jogos — eventos, alianças e camaradagem te esperam. Segura o forte, Comandante. 🛡️",
    },
    "ar": {
        "label": "العربية",
        "title": "🎉 *{admin} يدعوك للانضمام إلى {guild}!*",
        "cta": "انضم إلى النقابة عبر الرابط:",
        "note_prefix": "_ملاحظة: {note}_",
        "outro": "{guild} نقابة ألعاب — الفعاليات والتحالفات والصداقة بانتظارك. احرس القلعة أيها القائد. 🛡️",
    },
}


def _build_invite_letter(lang: str, admin_name: str, guild_name: str,
                          link: str, note: Optional[str]) -> str:
    """Compose the multi-line invite letter for the requested language.
    Falls back to Turkish if the code isn't in the template map."""
    t = INVITE_LETTER_TEMPLATES.get((lang or "tr").lower()) \
        or INVITE_LETTER_TEMPLATES["tr"]
    parts = [
        t["title"].format(admin=admin_name, guild=guild_name),
        "",
        t["cta"],
        f"🔗 {link}",
    ]
    if (note or "").strip():
        parts.append("")
        parts.append(t["note_prefix"].format(note=note.strip()))
    parts.append("")
    parts.append(t["outro"].format(guild=guild_name))
    return "\n".join(parts)


class InviteConsumeBody(BaseModel):
    token: str
    username: str
    password: str
    # v121 — KVKK Terms tracking. Frontend sets to now-ISO when the user
    # ticks the Terms of Service checkbox at signup. Optional so admin
    # tooling / older clients still work.
    terms_accepted_at: Optional[str] = None


def _invite_status(inv: dict) -> str:
    """`active` | `full` | `expired` | `disabled`."""
    if inv.get("disabled"):
        return "disabled"
    ea = inv.get("expires_at")
    if ea:
        try:
            when = datetime.fromisoformat(ea.replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            if when <= datetime.now(timezone.utc):
                return "expired"
        except Exception:
            pass
    mu = inv.get("max_uses")
    if mu and inv.get("uses", 0) >= mu:
        return "full"
    return "active"


def _invite_public(inv: dict, include_token: bool = True) -> dict:
    return {
        "id": inv.get("id"),
        "token": inv.get("token") if include_token else None,
        "max_uses": inv.get("max_uses"),
        "uses": inv.get("uses", 0),
        "expires_at": inv.get("expires_at"),
        "role": inv.get("role", "user"),
        "default_can_edit": bool(inv.get("default_can_edit")),
        "note": inv.get("note") or "",
        "created_at": inv.get("created_at"),
        "created_by_username": inv.get("created_by_username"),
        "disabled": bool(inv.get("disabled")),
        "status": _invite_status(inv),
        # v135.31 — Auto-generated invite letter (admin can copy / push to TG).
        # v135.32 — Language code the letter was rendered in.
        "letter_body": inv.get("letter_body") or None,
        "letter_lang": inv.get("letter_lang") or "tr",
    }


def make_invites_router(db, require_admin, hash_password_fn, create_token_fn,
                        parse_user_agent_fn, now_iso_fn, public_user_fn):
    router = APIRouter(prefix="/invites", tags=["invites"])

    # -------------- Public --------------
    @router.get("/preview/{token}")
    async def preview_invite(token: str):
        """Public — return safe invite metadata for the signup landing page.
        Never reveals who created it beyond the display name."""
        inv = await db.invites.find_one({"token": token}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Davet linki bulunamadı")
        status = _invite_status(inv)
        return {
            "status": status,
            "role": inv.get("role", "user"),
            "expires_at": inv.get("expires_at"),
            "note": inv.get("note") or "",
            "uses": inv.get("uses", 0),
            "max_uses": inv.get("max_uses"),
            "created_by_username": inv.get("created_by_username"),
        }

    @router.post("/consume")
    async def consume_invite(body: InviteConsumeBody, request: Request):
        """Public — atomic invite → user → session. Returns the same shape
        as `/auth/login` (`{token, user}`) so the frontend can plug it into
        the existing AuthContext without a second round-trip.

        Concurrency: uses `$inc: {uses:1}` with a matching status filter so
        two racing clients on a `max_uses=1` invite can't both succeed —
        MongoDB's atomic update yields `modified_count=1` for exactly one.
        """
        token = (body.token or "").strip()
        uname = (body.username or "").strip().lower()
        pwd = body.password or ""
        if not token or not uname or len(pwd) < 6:
            raise HTTPException(400, "Kullanıcı adı ve en az 6 karakter şifre gerekli")
        if len(uname) < 3 or len(uname) > 32:
            raise HTTPException(400, "Kullanıcı adı 3-32 karakter olmalı")

        inv = await db.invites.find_one({"token": token}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Davet linki bulunamadı")
        status = _invite_status(inv)
        if status != "active":
            raise HTTPException(400, f"Davet linki geçersiz: {status}")

        # Username uniqueness check BEFORE burning the invite counter.
        clash = await db.users.find_one({"username": uname}, {"_id": 0, "id": 1})
        if clash:
            raise HTTPException(400, "Bu kullanıcı adı zaten kullanılıyor")

        # Atomically consume one slot. If max_uses is set, guard against overshoot.
        match: dict = {"token": token, "disabled": {"$ne": True}}
        if inv.get("max_uses"):
            match["uses"] = {"$lt": inv["max_uses"]}
        r = await db.invites.update_one(match, {"$inc": {"uses": 1}, "$set": {"last_used_at": _now_iso()}})
        if r.modified_count == 0:
            raise HTTPException(400, "Davet linki artık geçerli değil")

        # Create user.
        user_id = str(uuid.uuid4())
        role = inv.get("role") or "user"
        doc = {
            "id": user_id,
            "username": uname,
            "email": None,
            "password_hash": hash_password_fn(pwd),
            "role": role if role in ("user", "editor", "admin") else "user",
            "can_edit": bool(inv.get("default_can_edit")) or role == "admin",
            "must_change_password": False,
            "member_ids": [],
            "notification_member_ids": [],
            "notification_enabled": True,
            "created_at": now_iso_fn(),
            "invited_by_invite_id": inv.get("id"),
            "invited_by_username": inv.get("created_by_username"),
            # v121 — audit trail for KVKK Terms acceptance at signup.
            # Frontend supplies ISO timestamp when the checkbox is ticked.
            "terms_accepted_at": (body.terms_accepted_at or now_iso_fn()),
        }
        await db.users.insert_one(doc)

        # Create a session so the returned JWT is remotely-revokable, mirroring /auth/login.
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
            "invite_signup": True,
        })
        jwt_token = create_token_fn(user_id, uname, doc["role"], sid=sid)
        # v135.31 — Welcome bell + push notification pointing to /kurallar
        # so every newly-signed-up member sees the guild rules on first
        # login. Best-effort — signup path must never fail because of this.
        try:
            await db.in_app_notifications.insert_one({
                "id": uuid.uuid4().hex,
                "user_id": user_id,
                "title": "🎉 Aramıza hoş geldin!",
                "body": "Loncanın kurallarını okumayı unutma — /kurallar sayfasında.",
                "url": "/kurallar",
                "event_id": None,
                "sched_id": f"welcome-{user_id}",
                "created_at": now_iso_fn(),
                "read": False,
            })
        except Exception:
            pass
        return {"token": jwt_token, "user": public_user_fn(doc)}

    # -------------- Admin --------------
    @router.post("")
    async def create_invite(body: InviteCreateBody, admin: dict = Depends(require_admin)):
        exp = None
        if body.expires_at:
            try:
                when = datetime.fromisoformat(body.expires_at.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(400, "invalid expires_at")
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            if when <= datetime.now(timezone.utc):
                raise HTTPException(400, "expires_at gelecekte olmalı")
            exp = when.isoformat()
        max_uses = body.max_uses
        if max_uses is not None and max_uses < 0:
            raise HTTPException(400, "max_uses negatif olamaz")
        role = (body.role or "user").lower()
        if role not in ("user", "editor", "admin"):
            role = "user"
        doc = {
            "id": str(uuid.uuid4()),
            "token": _gen_token(),
            "max_uses": max_uses if max_uses else None,   # 0 or None both mean unlimited
            "uses": 0,
            "expires_at": exp,
            "role": role,
            "default_can_edit": bool(body.default_can_edit),
            "note": (body.note or "").strip() or None,
            "created_at": _now_iso(),
            "created_by": admin["id"],
            "created_by_username": admin.get("username") or "",
            "disabled": False,
        }
        # v135.31 — Auto-generated invite letter. v135.32 — localised via
        # `letter_lang`; falls back to 'tr'. The link URL is language-neutral;
        # only the surrounding prose changes per language.
        try:
            import os as _os
            gs = await db.guild_settings.find_one({"key": "guild_name"}, {"_id": 0})
            guild_name = ((gs or {}).get("value")
                          or _os.environ.get("GUILD_NAME", "").strip()
                          or "TiTaNXiS")
            base = (_os.environ.get("PUBLIC_BASE_URL", "") or "https://titanxis.com").rstrip("/")
            link = f"{base}/kayit/{doc['token']}"
            admin_name = admin.get("display_name") or admin.get("username") or "Admin"
            lang = (body.letter_lang or "tr").lower()
            if lang not in INVITE_LETTER_TEMPLATES:
                lang = "tr"
            doc["letter_lang"] = lang
            doc["letter_body"] = _build_invite_letter(
                lang, admin_name, guild_name, link, doc.get("note"),
            )
        except Exception:
            doc["letter_lang"] = "tr"
            doc["letter_body"] = None
        await db.invites.insert_one(doc)
        return _invite_public(doc)

    @router.get("/letter/languages")
    async def list_letter_languages(_: dict = Depends(require_admin)):
        # Exposed so the composer can render the language dropdown from a
        # single source of truth. Returns `[{code, label}]`.
        return {
            "items": [
                {"code": code, "label": tpl["label"]}
                for code, tpl in INVITE_LETTER_TEMPLATES.items()
            ]
        }

    @router.post("/{invite_id}/letter/regenerate")
    async def regenerate_invite_letter(
        invite_id: str, lang: Optional[str] = None,
        admin: dict = Depends(require_admin),
    ):
        """Rebuild the letter body — handy when admin wants to switch the
        target language after the invite is already live, without deleting
        and re-issuing the token."""
        import os as _os
        inv = await db.invites.find_one({"id": invite_id}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Davet bulunamadı")
        new_lang = (lang or inv.get("letter_lang") or "tr").lower()
        if new_lang not in INVITE_LETTER_TEMPLATES:
            new_lang = "tr"
        gs = await db.guild_settings.find_one({"key": "guild_name"}, {"_id": 0})
        guild_name = ((gs or {}).get("value")
                      or _os.environ.get("GUILD_NAME", "").strip()
                      or "TiTaNXiS")
        base = (_os.environ.get("PUBLIC_BASE_URL", "") or "https://titanxis.com").rstrip("/")
        link = f"{base}/kayit/{inv['token']}"
        admin_name = admin.get("display_name") or admin.get("username") or "Admin"
        letter = _build_invite_letter(
            new_lang, admin_name, guild_name, link, inv.get("note"),
        )
        await db.invites.update_one(
            {"id": invite_id},
            {"$set": {"letter_lang": new_lang, "letter_body": letter,
                      "letter_regenerated_at": _now_iso()}},
        )
        return {"ok": True, "letter_lang": new_lang, "letter_body": letter}

    @router.get("")
    async def list_invites(_: dict = Depends(require_admin)):
        docs = await db.invites.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"items": [_invite_public(d) for d in docs]}

    @router.patch("/{invite_id}/disable")
    async def disable_invite(invite_id: str, _: dict = Depends(require_admin)):
        r = await db.invites.update_one({"id": invite_id}, {"$set": {"disabled": True, "disabled_at": _now_iso()}})
        if r.matched_count == 0:
            raise HTTPException(404, "Davet bulunamadı")
        return {"ok": True}

    @router.delete("/{invite_id}")
    async def delete_invite(invite_id: str, _: dict = Depends(require_admin)):
        await db.invites.delete_one({"id": invite_id})
        return {"ok": True}

    # v135.31 — Push the auto-generated invite letter to Telegram. Uses the
    # bot channel target (`TELEGRAM_CHANNEL_ID`) with Markdown formatting.
    @router.post("/{invite_id}/send-letter-telegram")
    async def send_invite_letter_tg(invite_id: str, _: dict = Depends(require_admin)):
        import os as _os
        inv = await db.invites.find_one({"id": invite_id}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Davet bulunamadı")
        if not inv.get("letter_body"):
            raise HTTPException(400, "Bu davet için mektup üretilmemiş")
        channel = _os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
        token = _os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        if not channel or not token:
            raise HTTPException(400, "TELEGRAM_CHANNEL_ID / TELEGRAM_BOT_TOKEN tanımlı değil")
        try:
            from telegram_bot import send_message as _tg_send
            ok = await _tg_send(channel, inv["letter_body"])
        except Exception as ex:
            raise HTTPException(502, f"Telegram send failed: {str(ex)[:200]}")
        if not ok:
            raise HTTPException(502, "Telegram send returned False")
        await db.invites.update_one(
            {"id": invite_id},
            {"$set": {"letter_last_sent_at": _now_iso()}},
        )
        return {"ok": True}

    return router


async def ensure_invites_indexes(db):
    await db.invites.create_index("id", unique=True)
    await db.invites.create_index("token", unique=True)
    await db.invites.create_index([("disabled", 1), ("expires_at", 1)])
