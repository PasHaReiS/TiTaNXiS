"""Telegram bot integration for @TiTaNXiS_BoT.

Reads token from TELEGRAM_BOT_TOKEN env var. If unset, all operations no-op so
the app boots fine without Telegram.

Webhook URL derived from TELEGRAM_WEBHOOK_URL env var (falls back to
`{REACT_APP_BACKEND_URL}/api/telegram/webhook`, whichever is set).

Actual MongoDB schema (verified):
  - members: {id, name, rank, alliance_name, bireysel_guc, created_at, ...}
  - events:  {id, name, group_name, date (ISO string), multiplier, archived}

SvS reminders: `/svs HH:MM` schedules a one-shot broadcast for that clock time
today (or tomorrow if the moment already passed) to the same chat. `/svs_iptal`
cancels the scheduled reminder for that chat.
"""
from __future__ import annotations

import os
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from telegram import Update, BotCommand
from telegram.ext import Application, CommandHandler, ContextTypes, PollAnswerHandler

log = logging.getLogger("telegram")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else ""

DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "").strip()
DEEPL_BASE = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"


async def _deepl_translate(text: str, target_lang: str,
                            source_lang: Optional[str] = None) -> Optional[dict]:
    """Call DeepL /translate. Returns {"text": ..., "detected_source_language": ...}
    or None on failure. `target_lang` must be a DeepL code (EN-GB, DE, RU, ...)."""
    if not DEEPL_API_KEY or not text:
        return None
    payload = {"text": [text], "target_lang": target_lang}
    if source_lang:
        payload["source_lang"] = source_lang
    headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}",
               "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{DEEPL_BASE}/translate",
                                  headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
            first = (data.get("translations") or [{}])[0]
            return {
                "text": first.get("text"),
                "detected_source_language": first.get("detected_source_language"),
            }
    except Exception as e:
        log.warning(f"DeepL translate failed: {e}")
        return None


# ISO-ish code (lowercase) → DeepL target-lang code.
_DEEPL_TARGET = {
    "en": "EN-GB", "ru": "RU", "de": "DE", "fr": "FR", "es": "ES", "ko": "KO",
    "bg": "BG", "cs": "CS", "da": "DA", "el": "EL", "et": "ET", "fi": "FI",
    "hu": "HU", "id": "ID", "it": "IT", "ja": "JA", "lt": "LT", "lv": "LV",
    "nb": "NB", "nl": "NL", "pl": "PL", "pt": "PT-PT", "ro": "RO", "sk": "SK",
    "sl": "SL", "sv": "SV", "uk": "UK", "zh": "ZH", "ar": "AR",
    "tr": "TR",
}


async def _detect_source(text: str) -> Optional[str]:
    """Detect the source language of a piece of text via DeepL's round-trip
    (translate to EN and read `detected_source_language`). Returns a 2-letter
    lowercase code or None on failure."""
    if not text or not DEEPL_API_KEY:
        return None
    res = await _deepl_translate(text, "EN-US")
    if not res:
        return None
    lang = (res.get("detected_source_language") or "").lower()
    # DeepL returns codes like "EN", "TR", "PT-BR" — normalise.
    if not lang:
        return None
    if "-" in lang:
        lang = lang.split("-")[0]
    return lang


async def reply_ml(update: Update, tr_text: str, parse_mode: str = "Markdown"):
    """Reply in the language of the incoming message.

    - Detects the user's language from `update.message.text` via DeepL.
    - If detected language is Turkish (or detection fails / DeepL disabled),
      sends the original Turkish text unchanged.
    - Otherwise translates `tr_text` (Turkish source) to the detected language
      and sends that.

    Markdown symbols are preserved by DeepL well enough; parse_mode="Markdown"
    is kept so bold/italic still work in translated replies.
    """
    src_lang = None
    incoming = (update.message.text or "").strip() if update.message else ""
    # Strip the leading /command so detection sees the human-typed part only.
    if incoming.startswith("/"):
        parts = incoming.split(None, 1)
        incoming = parts[1] if len(parts) > 1 else ""
    if incoming and DEEPL_API_KEY:
        src_lang = await _detect_source(incoming)
    if not src_lang or src_lang == "tr":
        await update.message.reply_text(tr_text, parse_mode=parse_mode)
        return
    target = _DEEPL_TARGET.get(src_lang)
    if not target:
        await update.message.reply_text(tr_text, parse_mode=parse_mode)
        return
    res = await _deepl_translate(tr_text, target, source_lang="TR")
    out = (res or {}).get("text") or tr_text
    await update.message.reply_text(out, parse_mode=parse_mode)


def _webhook_url() -> str:
    explicit = os.environ.get("TELEGRAM_WEBHOOK_URL", "").strip()
    if explicit:
        return explicit
    base = os.environ.get("PUBLIC_BASE_URL", "").strip()
    if not base:
        # Best-effort fallback to preview URL derived from allowed CORS list.
        base = "https://oyun-loncasi.preview.emergentagent.com"
    return f"{base.rstrip('/')}/api/telegram/webhook"


# Module-level state — set once by init_bot(db) from server.py
_db = None
_app: Optional[Application] = None


def init_bot(db) -> Optional[Application]:
    """Called once from server.py startup. Returns the Application or None
    if TELEGRAM_BOT_TOKEN is not configured."""
    global _db, _app
    _db = db
    if not BOT_TOKEN:
        log.warning("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.")
        return None
    _app = Application.builder().token(BOT_TOKEN).build()
    _app.add_handler(CommandHandler("start", start_command))
    _app.add_handler(CommandHandler("siralama", siralama_command))
    _app.add_handler(CommandHandler("ranking", siralama_command))
    _app.add_handler(CommandHandler("siralamatop5", siralama_command))
    _app.add_handler(CommandHandler("top5", siralama_command))
    _app.add_handler(CommandHandler("guc", guc_command))
    _app.add_handler(CommandHandler("power", guc_command))
    _app.add_handler(CommandHandler("etkinlik", etkinlik_command))
    _app.add_handler(CommandHandler("event", etkinlik_command))
    _app.add_handler(CommandHandler("svs", svs_command))  # noqa: F821
    _app.add_handler(CommandHandler("svs_iptal", svs_cancel_command))  # noqa: F821
    _app.add_handler(CommandHandler("svs_cancel", svs_cancel_command))  # noqa: F821
    _app.add_handler(CommandHandler("yardim", yardim_command))
    _app.add_handler(CommandHandler("help", yardim_command))
    # Note: /link handler removed in favour of the Telegram Login Widget (OAuth-style
    # flow on the web app). /unlink is kept so users can revoke from either side.
    _app.add_handler(CommandHandler("unlink", unlink_command))
    _app.add_handler(PollAnswerHandler(_poll_answer_handler))
    log.info("Telegram bot handlers registered (@TiTaNXiS_BoT).")
    return _app


async def setup_webhook() -> bool:
    """Register the webhook with Telegram + publish the / command menu.
    No-op if token is missing."""
    if not BOT_TOKEN or _app is None:
        return False
    url = _webhook_url()
    ok_hook = False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{TELEGRAM_API}/setWebhook",
                                  json={"url": url,
                                        "allowed_updates": ["message"]})
            data = r.json()
            if data.get("ok"):
                log.info(f"Telegram webhook set → {url}")
                ok_hook = True
            else:
                log.warning(f"Telegram setWebhook failed: {data}")
            # Publish the bot command menu so Telegram shows the "/" popover.
            cmds = [
                {"command": "siralama",   "description": "Sıralamayı göster"},
                {"command": "guc",        "description": "Üye güç sorgula"},
                {"command": "etkinlik",   "description": "Aktif etkinlikler"},
                {"command": "svs",        "description": "SvS hatırlatma ayarla"},
                {"command": "unlink",     "description": "Hesap bağlantısını kaldır"},
                {"command": "yardim",     "description": "Yardım menüsü"},
            ]
            r2 = await client.post(f"{TELEGRAM_API}/setMyCommands",
                                   json={"commands": cmds})
            d2 = r2.json()
            if d2.get("ok"):
                log.info(f"Telegram command menu published ({len(cmds)} entries)")
            else:
                log.warning(f"Telegram setMyCommands failed: {d2}")
    except Exception as e:
        log.warning(f"Telegram setup exception: {e}")
    return ok_hook


async def process_update(update_data: dict) -> None:
    """Called from the FastAPI webhook route. Feeds the update through PTB."""
    if _app is None:
        log.warning("process_update called but bot not initialized.")
        return
    if not _app.running:
        # First call — initialize the Application so update_queue/etc are ready.
        await _app.initialize()
        await _app.start()
    update = Update.de_json(update_data, _app.bot)
    await _app.process_update(update)


# ------------------------------ Commands ------------------------------------

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handles `/start` and Telegram deep-link payloads like
    `/start link_ABC123` — used by the "Telegram Bağla" button on
    Reports > Digest to bind the chat_id in one tap."""
    # Deep-link auto-link: `t.me/BOT?start=link_TOKEN` arrives here.
    args = getattr(context, "args", None) or []
    if args and args[0].startswith("link_") and _db is not None:
        token = args[0][5:].strip().upper()
        if len(token) >= 4:
            now_iso_str = datetime.now(timezone.utc).isoformat()
            doc = await _db.telegram_link_tokens.find_one({"token": token})
            if not doc:
                await reply_ml(update, "❌ Kod bulunamadı ya da süresi dolmuş. Web'den yenisini al.")
                return
            if doc.get("expires_at") and doc["expires_at"] < now_iso_str:
                await _db.telegram_link_tokens.delete_one({"token": token})
                await reply_ml(update, "⌛ Kod süresi dolmuş. Web'den yenisini al.")
                return
            chat_id = str(update.effective_chat.id)
            await _db.users.update_one(
                {"id": doc["user_id"]},
                {"$set": {"telegram_chat_id": chat_id, "telegram_linked_at": now_iso_str}},
            )
            await _db.telegram_link_tokens.delete_one({"token": token})
            u = await _db.users.find_one({"id": doc["user_id"]}, {"_id": 0, "username": 1})
            uname = (u or {}).get("username") or "?"
            await reply_ml(
                update,
                f"✅ Bağlantı başarılı!\n\n"
                f"*{uname}* hesabıyla bu sohbet artık bağlı — tüm bildirimleri buradan alacaksın.\n"
                f"İstersen /unlink ile her zaman kaldırabilirsin."
            )
            return
    text = (
        "⚔️ *TiTaNXiS Lonca Yönetim Botu*\n\n"
        "Hoş geldin savaşçı! Ben TiTaNXiS loncasının resmi botuyum.\n\n"
        "🏰 Lonca bilgilerini sorgulayabilir, etkinlikleri takip edebilir "
        "ve sıralamadaki yerini görebilirsin.\n\n"
        "✅ Bu mesajla birlikte artık lonca yöneticileri sana Telegram üzerinden "
        "bildirim gönderebilir.\n\n"
        "Komutlar için /yardim yaz."
    )
    await reply_ml(update, text)


async def yardim_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    text = (
        "📖 *TiTaNXiS Bot Komutları*\n\n"
        "/start — Karşılama mesajı\n"
        "/siralama (veya /ranking, /siralamatop5, /top5) — En güçlü 5 üye\n"
        "/guc [isim] (veya /power) — Üye güç sorgulama\n"
        "/etkinlik (veya /event) — Aktif etkinlikler\n"
        "/svs [HH:MM] — SvS başlama hatırlatıcısı planla\n"
        "/svs_iptal (veya /svs_cancel) — Planlanmış hatırlatıcıyı iptal et\n"
        "/link [token] — Hesabımı web uygulamasına bağla\n"
        "/unlink — Bağlı hesabı kaldır\n"
        "/yardim (veya /help) — Bu menü\n\n"
        "⚔️ TiTaNXiS Lonca Yönetimi"
    )
    await reply_ml(update, text)


async def link_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Bind a Telegram chat to a TiTaNXiS user account via a short-lived token.

    Flow:
      1) User opens Profile page on titanxis.com, taps "Telegram Bağla",
         backend issues a 6-char token (stored in ``telegram_link_tokens``).
      2) User DMs the bot: ``/link 4B7X2P``.
      3) This handler validates + consumes the token, sets ``user.telegram_chat_id``
         and deletes the token so it can't be reused.
    """
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    if not context.args:
        await reply_ml(
            update,
            "🔗 *Hesap Bağlama*\n\n"
            "Web uygulamasında Profil sayfasından bir bağlantı kodu al, ardından\n"
            "`/link KODUN` şeklinde bana gönder.\n\n"
            "Örnek: `/link 4B7X2P`"
        )
        return
    token = (context.args[0] or "").strip().upper()
    if len(token) < 4:
        await reply_ml(update, "⚠️ Geçersiz kod formatı.")
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = await _db.telegram_link_tokens.find_one({"token": token})
    if not doc:
        await reply_ml(update, "❌ Kod bulunamadı ya da süresi dolmuş. Web'den yenisini al.")
        return
    if doc.get("expires_at") and doc["expires_at"] < now_iso:
        await _db.telegram_link_tokens.delete_one({"token": token})
        await reply_ml(update, "⌛ Kod süresi dolmuş. Web'den yenisini al.")
        return
    chat_id = str(update.effective_chat.id)
    user_id = doc["user_id"]
    await _db.users.update_one(
        {"id": user_id},
        {"$set": {"telegram_chat_id": chat_id, "telegram_linked_at": now_iso}},
    )
    await _db.telegram_link_tokens.delete_one({"token": token})
    u = await _db.users.find_one({"id": user_id}, {"_id": 0, "username": 1})
    uname = u.get("username") if u else "?"
    await reply_ml(
        update,
        f"✅ Bağlantı başarılı!\n\n"
        f"Artık *{uname}* hesabıyla bu Telegram sohbetinden bildirim alacaksın.\n"
        f"İstersen `/unlink` ile her zaman kaldırabilirsin."
    )

async def _send_tg_poll(chat_id: str, question: str, options: list,
                         is_anonymous: bool = False,
                         allows_multiple_answers: bool = False) -> Optional[dict]:
    """Send a native Telegram poll via `sendPoll`. Non-anonymous so we can
    process `poll_answer` updates and merge votes into the app tallies."""
    if not BOT_TOKEN:
        return None
    payload = {
        "chat_id": chat_id,
        "question": question[:300],
        "options": [str(o)[:100] for o in options][:10],  # Telegram limits
        "is_anonymous": bool(is_anonymous),
        "allows_multiple_answers": bool(allows_multiple_answers),
        "type": "regular",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{TELEGRAM_API}/sendPoll", json=payload)
            if r.status_code == 200:
                data = r.json().get("result") or {}
                return {
                    "tg_poll_id": (data.get("poll") or {}).get("id"),
                    "message_id": data.get("message_id"),
                    "chat_id": (data.get("chat") or {}).get("id"),
                }
            log.warning(f"sendPoll {r.status_code}: {r.text[:200]}")
    except Exception as ex:
        log.warning(f"sendPoll error: {ex}")
    return None


async def _poll_answer_handler(update: Update, _: ContextTypes.DEFAULT_TYPE):
    """Fired when a Telegram user casts / retracts a vote on a non-anonymous
    poll we published via `sendPoll`. Updates our app poll doc's `tg_votes`
    map so the frontend UI reflects Telegram voters alongside app voters."""
    if _db is None or update.poll_answer is None:
        return
    ans = update.poll_answer
    tg_poll_id = str(ans.poll_id)
    tg_user_id = str(ans.user.id) if ans.user else None
    option_ids = list(ans.option_ids or [])
    poll = await _db.polls.find_one({"tg_poll_id": tg_poll_id}, {"_id": 0})
    if not poll:
        return
    options = poll.get("options", [])
    # Map Telegram option indexes → our internal option ids.
    picked = [options[i]["id"] for i in option_ids if 0 <= i < len(options)]
    if not tg_user_id:
        return
    if not picked:
        # Retraction — user cleared their vote.
        await _db.polls.update_one(
            {"id": poll["id"]},
            {"$unset": {f"tg_votes.{tg_user_id}": ""}},
        )
        return
    await _db.polls.update_one(
        {"id": poll["id"]},
        {"$set": {
            f"tg_votes.{tg_user_id}": {
                "option_ids": picked,
                "username": (ans.user.username or ans.user.first_name or "tg") if ans.user else "tg",
                "voted_at": datetime.now(timezone.utc).isoformat(),
            },
        }},
    )




async def unlink_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    """Remove telegram_chat_id from the user linked to this DM."""
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    chat_id = str(update.effective_chat.id)
    res = await _db.users.update_many(
        {"telegram_chat_id": chat_id},
        {"$unset": {"telegram_chat_id": "", "telegram_linked_at": ""}},
    )
    if res.modified_count:
        await reply_ml(update, "🔓 Bağlantı kaldırıldı. Artık DM bildirim almayacaksın.")
    else:
        await reply_ml(update, "ℹ️ Bu sohbetle bağlı hesap bulunamadı.")


async def siralama_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    cursor = _db.members.find({}, {"_id": 0, "name": 1, "rank": 1,
                                    "alliance_name": 1, "bireysel_guc": 1}) \
        .sort("bireysel_guc", -1).limit(5)
    members = await cursor.to_list(5)
    if not members:
        await reply_ml(update, "📊 Henüz sıralama verisi yok.")
        return
    lines = ["🏆 *En Güçlü 5*\n"]
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
    for i, m in enumerate(members):
        power = int(m.get("bireysel_guc") or 0)
        name = m.get("name", "?")
        rank = m.get("rank", "")
        alliance = m.get("alliance_name", "")
        lines.append(f"{medals[i]} *{name}* [{rank}·{alliance}] — {power:,}")
    await reply_ml(update, "\n".join(lines))


async def guc_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await reply_ml(update, "Kullanım: `/guc <isim>`\nÖrnek: `/guc Ekko`")
        return
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    search = " ".join(context.args).strip()
    import re
    pattern = re.escape(search)
    m = await _db.members.find_one({"name": {"$regex": pattern, "$options": "i"}}, {"_id": 0})
    if not m:
        await reply_ml(update, f"❌ '{search}' adında üye bulunamadı.")
        return
    power = int(m.get("bireysel_guc") or 0)
    text = (
        f"⚔️ *{m.get('name', '?')}*\n\n"
        f"💪 Güç: `{power:,}`\n"
        f"🎖 Rütbe: {m.get('rank', '-')}\n"
        f"🏰 İttifak: {m.get('alliance_name', '-')}\n"
        f"📅 Eklenme: {(m.get('created_at') or '')[:10]}"
    )
    await reply_ml(update, text)


async def etkinlik_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    cursor = _db.events.find({"archived": {"$ne": True}}, {"_id": 0}) \
        .sort("date", -1).limit(5)
    events = await cursor.to_list(5)
    if not events:
        await reply_ml(update, "📅 Aktif etkinlik bulunmuyor.")
        return
    lines = ["📅 *Aktif Etkinlikler*\n"]
    for e in events:
        name = e.get("name", "?")
        date_str = (e.get("date") or "")[:10]
        group = e.get("group_name", "")
        mult = e.get("multiplier", 1.0)
        lines.append(f"• *{name}* — `{date_str}` · {group} · ×{mult}")
    await reply_ml(update, "\n".join(lines))


# ------------------------------ Notifications --------------------------------

async def send_message(chat_id: str, text: str, parse_mode: Optional[str] = "Markdown",
                       reply_markup: Optional[dict] = None) -> bool:
    """Fire-and-forget broadcaster. When Markdown parsing fails (unbalanced
    `_` `*` `[` in dynamic content), we retry ONCE without parse_mode so the
    plain text still delivers. Non-ok responses log Telegram's `description`
    + `error_code` for debuggability."""
    if not BOT_TOKEN or not chat_id:
        return False
    async def _post(pmode: Optional[str]) -> dict:
        payload: dict = {"chat_id": chat_id, "text": text}
        if pmode:
            payload["parse_mode"] = pmode
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{TELEGRAM_API}/sendMessage", json=payload)
            return {"status": r.status_code, "body": (r.json() if r.content else {})}
    try:
        first = await _post(parse_mode)
        data = first["body"]
        if data.get("ok"):
            return True
        desc = str(data.get("description") or "")
        # Retry as plain text when Markdown parser rejects the payload.
        if parse_mode and "can't parse entities" in desc.lower():
            log.warning(
                "Telegram sendMessage markdown parse failed chat_id=%s description=%r — retrying as plain text",
                chat_id, desc,
            )
            second = await _post(None)
            sd = second["body"]
            if sd.get("ok"):
                return True
            log.warning(
                "Telegram sendMessage plain-text retry also failed chat_id=%s code=%s description=%r",
                chat_id, sd.get("error_code"), sd.get("description"),
            )
            return False
        log.warning(
            "Telegram sendMessage rejected chat_id=%s code=%s description=%r http_status=%s",
            chat_id, data.get("error_code"), desc, first["status"],
        )
        return False
    except Exception as e:
        log.warning(f"Telegram sendMessage exception chat_id={chat_id}: {e}")
        return False



async def send_photo(chat_id: str, photo_url: str, caption: Optional[str] = None,
                     parse_mode: Optional[str] = "Markdown",
                     reply_markup: Optional[dict] = None) -> bool:
    """Send an image with an optional caption. `photo_url` is a public URL
    (Telegram fetches it server-side). Falls back to plain text sendMessage
    when Telegram rejects the photo (invalid URL, size limit, etc.) so the
    caption still reaches the recipient."""
    if not BOT_TOKEN or not chat_id or not photo_url:
        return False
    caption = (caption or "")[:1024]  # Telegram caption cap
    payload: dict = {"chat_id": chat_id, "photo": photo_url}
    if caption:
        payload["caption"] = caption
        if parse_mode:
            payload["parse_mode"] = parse_mode
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{TELEGRAM_API}/sendPhoto", json=payload)
            data = r.json() if r.content else {}
            if data.get("ok"):
                return True
            log.warning("Telegram sendPhoto rejected chat_id=%s code=%s desc=%r → fallback to sendMessage",
                        chat_id, data.get("error_code"), data.get("description"))
    except Exception as e:
        log.warning("Telegram sendPhoto error chat_id=%s: %s → fallback to sendMessage", chat_id, e)
    # Photo failed — deliver the caption as plain message so the announcement isn't lost.
    if caption:
        return await send_message(chat_id, caption, parse_mode=parse_mode, reply_markup=reply_markup)
    return False


async def answer_callback_query(cb_id: str, text: str = "", show_alert: bool = False) -> bool:
    """Acknowledge an inline-button tap so Telegram removes the loading state.
    Optionally shows a toast/alert to the user."""
    if not BOT_TOKEN or not cb_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{TELEGRAM_API}/answerCallbackQuery",
                json={"callback_query_id": cb_id, "text": text, "show_alert": show_alert},
            )
            data = r.json() if r.content else {}
            if data.get("ok"):
                return True
            log.warning(
                "Telegram answerCallbackQuery rejected cb_id=%s code=%s description=%r",
                cb_id, data.get("error_code"), data.get("description"),
            )
            return False
    except Exception as e:
        log.warning(f"answerCallbackQuery exception cb_id={cb_id}: {e}")
        return False


async def edit_message_text(chat_id: str, message_id: int, text: str,
                             parse_mode: str = "Markdown",
                             reply_markup: Optional[dict] = None) -> bool:
    """Edit a previously-sent message. Used to strike through inline attendance
    buttons after the user has already answered so the chat stays clean."""
    if not BOT_TOKEN or not chat_id or not message_id:
        return False
    try:
        payload: dict = {"chat_id": chat_id, "message_id": message_id,
                         "text": text, "parse_mode": parse_mode}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{TELEGRAM_API}/editMessageText", json=payload)
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{TELEGRAM_API}/editMessageText", json=payload)
            data = r.json() if r.content else {}
            if data.get("ok"):
                return True
            log.warning(
                "Telegram editMessageText rejected chat_id=%s message_id=%s code=%s description=%r",
                chat_id, message_id, data.get("error_code"), data.get("description"),
            )
            return False
    except Exception as e:
        log.warning(f"editMessageText exception chat_id={chat_id} message_id={message_id}: {e}")
        return False


async def send_event_notification(event_name: str, event_date: str,
                                    group_name: str, multiplier: float,
                                    event_id: Optional[str] = None) -> bool:
    """Broadcast to TELEGRAM_CHANNEL_ID (if set) when a new event is created.
    When `event_id` is provided, appends a deep-link that opens the event on the
    production site."""
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if not channel:
        return False
    lines = [
        "🎉 *Yeni Etkinlik!*",
        "",
        f"📅 *{event_name}*",
        f"🗓 Tarih: `{event_date[:10]}`",
        f"📊 Grup: {group_name}",
        f"⚡ Çarpan: ×{multiplier}",
    ]
    if event_id:
        base = (os.environ.get("PUBLIC_BASE_URL", "") or "https://titanxis.com").rstrip("/")
        lines.append(f"\n🔗 [Etkinliğe Katıl]({base}/etkinlikler#event-{event_id})")
    return await send_message(channel, "\n".join(lines))


# ------------------------------ SvS reminders --------------------------------
# One active reminder per chat_id, stored as an asyncio.Task so we can cancel.
_svs_tasks: dict[int, asyncio.Task] = {}


def _parse_hhmm(s: str) -> Optional[tuple[int, int]]:
    """Accept HH:MM (24h). Returns (h, m) or None."""
    try:
        parts = s.strip().split(":")
        if len(parts) != 2:
            return None
        h, m = int(parts[0]), int(parts[1])
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h, m
        return None
    except Exception:
        return None


def _next_occurrence(hh: int, mm: int) -> datetime:
    """Next datetime at HH:MM in Turkey time (UTC+3) — if it's already past today,
    return the same time tomorrow."""
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz)
    target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if target <= now:
        target = target + timedelta(days=1)
    return target


async def _svs_worker(chat_id: int, target: datetime) -> None:
    """Sleeps until target, then sends the SvS start message once. Broadcasts
    to TELEGRAM_CHANNEL_ID as well when configured."""
    delay = (target - datetime.now(target.tzinfo)).total_seconds()
    try:
        if delay > 0:
            await asyncio.sleep(delay)
        msg = "⚔️ *SvS başlıyor! Hazırlanın!*"
        await send_message(str(chat_id), msg)
        channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
        if channel and str(chat_id) != channel:
            await send_message(channel, msg)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        log.warning(f"SvS worker error for chat {chat_id}: {e}")
    finally:
        _svs_tasks.pop(chat_id, None)


async def send_daily_briefing(db) -> bool:
    """Fetches upcoming events + top members and broadcasts a morning digest
    to TELEGRAM_CHANNEL_ID. Called by the platform cron at 08:00 TR (05:00 UTC).
    Returns True on successful send, False if channel unconfigured or on error."""
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if not channel or not BOT_TOKEN or db is None:
        return False
    # Upcoming events: non-archived, sorted by date ascending (next 5).
    try:
        upcoming = await db.events.find(
            {"archived": {"$ne": True}}, {"_id": 0, "name": 1, "date": 1, "group_name": 1, "multiplier": 1}
        ).sort("date", 1).limit(5).to_list(5)
    except Exception as e:
        log.warning(f"daily briefing DB read failed: {e}")
        return False
    tz = timezone(timedelta(hours=3))
    today_str = datetime.now(tz).strftime("%d %B %Y")
    lines = [f"🌅 *Günaydın TiTaNXiS!* — {today_str}\n"]
    if not upcoming:
        lines.append("📅 Bugün için planlı etkinlik yok.")
    else:
        lines.append("📅 *Yaklaşan Etkinlikler:*")
        for e in upcoming:
            name = e.get("name", "?")
            d = (e.get("date") or "")[:10]
            grp = e.get("group_name", "")
            mult = e.get("multiplier", 1.0)
            lines.append(f"• *{name}* — `{d}` · {grp} · ×{mult}")
    lines.append("\n⚔️ Bugün de savaşa hazır ol!")
    return await send_message(channel, "\n".join(lines))


async def send_weekly_summary(db) -> bool:
    """Monday 08:00 TR digest — total members, top 5, last week's events,
    new members joined last week. Broadcasts to TELEGRAM_CHANNEL_ID."""
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if not channel or not BOT_TOKEN or db is None:
        return False
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz)
    week_ago = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago_iso = week_ago.isoformat()
    try:
        total_members = await db.members.count_documents({})
        top5 = await db.members.find(
            {}, {"_id": 0, "name": 1, "bireysel_guc": 1, "rank": 1}
        ).sort("bireysel_guc", -1).limit(5).to_list(5)
        # Events with a `date` field in the last 7 days (ISO string compare works
        # because dates are stored as ISO 8601).
        events = await db.events.find(
            {"date": {"$gte": week_ago_iso}}, {"_id": 0, "name": 1, "date": 1, "group_name": 1}
        ).sort("date", -1).limit(10).to_list(10)
        new_members = await db.members.find(
            {"created_at": {"$gte": week_ago_iso}}, {"_id": 0, "name": 1, "alliance_name": 1, "created_at": 1}
        ).sort("created_at", -1).limit(10).to_list(10)
    except Exception as e:
        log.warning(f"weekly summary DB read failed: {e}")
        return False

    lines = [
        f"📊 *Haftalık Özet* — {now.strftime('%d %B %Y')}\n",
        f"👥 Toplam üye: *{total_members}*",
    ]
    if top5:
        lines.append("\n🏆 *En Güçlü 5*")
        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
        for i, m in enumerate(top5):
            power = int(m.get("bireysel_guc") or 0)
            lines.append(f"{medals[i]} *{m.get('name','?')}* [{m.get('rank','')}] — {power:,}")
    lines.append(f"\n📅 *Geçen Haftaki Etkinlikler:* ({len(events)})")
    if events:
        for e in events[:5]:
            d = (e.get("date") or "")[:10]
            lines.append(f"• *{e.get('name','?')}* — `{d}` · {e.get('group_name','')}")
    else:
        lines.append("_Yok_")
    lines.append(f"\n🆕 *Yeni Katılan Üyeler:* ({len(new_members)})")
    if new_members:
        for m in new_members[:8]:
            d = (m.get("created_at") or "")[:10]
            lines.append(f"• *{m.get('name','?')}* [{m.get('alliance_name','-')}] — `{d}`")
    else:
        lines.append("_Yok_")
    lines.append("\n⚔️ Yeni haftada daha güçlü!")
    return await send_message(channel, "\n".join(lines))


async def svs_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/svs HH:MM — schedule a one-shot SvS start reminder for this chat."""
    if not context.args:
        await reply_ml(update, "Kullanım: `/svs HH:MM`\nÖrnek: `/svs 20:00`")
        return
    parsed = _parse_hhmm(context.args[0])
    if not parsed:
        await reply_ml(update, "❌ Geçersiz saat formatı. `HH:MM` (24 saat) olmalı.")
        return
    hh, mm = parsed
    chat_id = update.effective_chat.id
    target = _next_occurrence(hh, mm)
    existing = _svs_tasks.pop(chat_id, None)
    if existing and not existing.done():
        existing.cancel()
    task = asyncio.create_task(_svs_worker(chat_id, target))
    _svs_tasks[chat_id] = task
    delta = target - datetime.now(target.tzinfo)
    hours = int(delta.total_seconds() // 3600)
    mins = int((delta.total_seconds() % 3600) // 60)
    when = target.strftime("%H:%M")
    await reply_ml(update,
        f"⏱ *SvS hatırlatıcı planlandı*\n\n"
        f"🕒 Saat: `{when}` (TR)\n"
        f"⏳ Yaklaşık: {hours} sa {mins} dk sonra\n\n"
        f"İptal etmek için `/svs_iptal` yaz.")


async def svs_cancel_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    """/svs_iptal — cancel any scheduled SvS reminder for this chat."""
    chat_id = update.effective_chat.id
    task = _svs_tasks.pop(chat_id, None)
    if task and not task.done():
        task.cancel()
        await reply_ml(update, "🚫 *SvS hatırlatıcı iptal edildi.*")
    else:
        await reply_ml(update, "ℹ️ Aktif SvS hatırlatıcı yok.")
