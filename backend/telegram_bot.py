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
from telegram.ext import Application, CommandHandler, ContextTypes

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
    _app.add_handler(CommandHandler("guc", guc_command))
    _app.add_handler(CommandHandler("power", guc_command))
    _app.add_handler(CommandHandler("etkinlik", etkinlik_command))
    _app.add_handler(CommandHandler("event", etkinlik_command))
    _app.add_handler(CommandHandler("svs", svs_command))  # noqa: F821
    _app.add_handler(CommandHandler("svs_iptal", svs_cancel_command))  # noqa: F821
    _app.add_handler(CommandHandler("svs_cancel", svs_cancel_command))  # noqa: F821
    _app.add_handler(CommandHandler("yardim", yardim_command))
    _app.add_handler(CommandHandler("help", yardim_command))
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

async def start_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    text = (
        "⚔️ *TiTaNXiS Lonca Yönetim Botu*\n\n"
        "Hoş geldin savaşçı! Ben TiTaNXiS loncasının resmi botuyum.\n\n"
        "🏰 Lonca bilgilerini sorgulayabilir, etkinlikleri takip edebilir "
        "ve sıralamadaki yerini görebilirsin.\n\n"
        "Komutlar için /yardim yaz."
    )
    await reply_ml(update, text)


async def yardim_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    text = (
        "📖 *TiTaNXiS Bot Komutları*\n\n"
        "/start — Karşılama mesajı\n"
        "/siralama (veya /ranking) — En güçlü 5 üye\n"
        "/guc [isim] (veya /power) — Üye güç sorgulama\n"
        "/etkinlik (veya /event) — Aktif etkinlikler\n"
        "/svs [HH:MM] — SvS başlama hatırlatıcısı planla\n"
        "/svs_iptal (veya /svs_cancel) — Planlanmış hatırlatıcıyı iptal et\n"
        "/yardim (veya /help) — Bu menü\n\n"
        "⚔️ TiTaNXiS Lonca Yönetimi"
    )
    await reply_ml(update, text)


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

async def send_message(chat_id: str, text: str, parse_mode: str = "Markdown") -> bool:
    """Fire-and-forget broadcaster used by app hooks."""
    if not BOT_TOKEN or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{TELEGRAM_API}/sendMessage",
                                  json={"chat_id": chat_id, "text": text,
                                        "parse_mode": parse_mode})
            return bool(r.json().get("ok"))
    except Exception as e:
        log.warning(f"Telegram sendMessage failed: {e}")
        return False


async def send_event_notification(event_name: str, event_date: str,
                                    group_name: str, multiplier: float) -> bool:
    """Broadcast to TELEGRAM_CHANNEL_ID (if set) when a new event is created."""
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if not channel:
        return False
    text = (
        f"🎉 *Yeni Etkinlik!*\n\n"
        f"📅 *{event_name}*\n"
        f"🗓 Tarih: `{event_date[:10]}`\n"
        f"📊 Grup: {group_name}\n"
        f"⚡ Çarpan: ×{multiplier}"
    )
    return await send_message(channel, text)


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
