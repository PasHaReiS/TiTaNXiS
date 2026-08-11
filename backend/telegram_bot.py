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

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

log = logging.getLogger("telegram")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else ""


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
    """Register the webhook with Telegram. No-op if token is missing."""
    if not BOT_TOKEN or _app is None:
        return False
    url = _webhook_url()
    try:
        # PTB v20+: Application needs to be initialized for bot.set_webhook to work
        # standalone, so we call the HTTP API directly for simplicity.
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"{TELEGRAM_API}/setWebhook",
                                  json={"url": url,
                                        "allowed_updates": ["message"]})
            data = r.json()
            if data.get("ok"):
                log.info(f"Telegram webhook set → {url}")
                return True
            log.warning(f"Telegram setWebhook failed: {data}")
            return False
    except Exception as e:
        log.warning(f"Telegram setWebhook exception: {e}")
        return False


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
    await update.message.reply_text(text, parse_mode="Markdown")


async def yardim_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    text = (
        "📖 *TiTaNXiS Bot Komutları*\n\n"
        "/start — Karşılama mesajı\n"
        "/siralama _(veya /ranking)_ — En güçlü 5 üye\n"
        "/guc `<isim>` _(veya /power)_ — Üye güç sorgulama\n"
        "/etkinlik _(veya /event)_ — Aktif etkinlikler\n"
        "/svs `HH:MM` — SvS başlama hatırlatıcısı planla\n"
        "/svs\\_iptal _(veya /svs\\_cancel)_ — Planlanmış hatırlatıcıyı iptal et\n"
        "/yardim _(veya /help)_ — Bu menü\n\n"
        "⚔️ TiTaNXiS Lonca Yönetimi"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def siralama_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None:
        await update.message.reply_text("⚠️ Veritabanı hazır değil.")
        return
    cursor = _db.members.find({}, {"_id": 0, "name": 1, "rank": 1,
                                    "alliance_name": 1, "bireysel_guc": 1}) \
        .sort("bireysel_guc", -1).limit(5)
    members = await cursor.to_list(5)
    if not members:
        await update.message.reply_text("📊 Henüz sıralama verisi yok.")
        return
    lines = ["🏆 *En Güçlü 5*\n"]
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
    for i, m in enumerate(members):
        power = int(m.get("bireysel_guc") or 0)
        name = m.get("name", "?")
        rank = m.get("rank", "")
        alliance = m.get("alliance_name", "")
        lines.append(f"{medals[i]} *{name}* [{rank}·{alliance}] — {power:,}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def guc_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(
            "Kullanım: `/guc <isim>`\nÖrnek: `/guc Ekko`", parse_mode="Markdown")
        return
    if _db is None:
        await update.message.reply_text("⚠️ Veritabanı hazır değil.")
        return
    search = " ".join(context.args).strip()
    # Case-insensitive name substring match; also try exact rank/alliance in fallback.
    import re
    pattern = re.escape(search)
    m = await _db.members.find_one({"name": {"$regex": pattern, "$options": "i"}}, {"_id": 0})
    if not m:
        await update.message.reply_text(f"❌ '{search}' adında üye bulunamadı.")
        return
    power = int(m.get("bireysel_guc") or 0)
    text = (
        f"⚔️ *{m.get('name', '?')}*\n\n"
        f"💪 Güç: `{power:,}`\n"
        f"🎖 Rütbe: {m.get('rank', '-')}\n"
        f"🏰 İttifak: {m.get('alliance_name', '-')}\n"
        f"📅 Eklenme: {(m.get('created_at') or '')[:10]}"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def etkinlik_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None:
        await update.message.reply_text("⚠️ Veritabanı hazır değil.")
        return
    cursor = _db.events.find({"archived": {"$ne": True}}, {"_id": 0}) \
        .sort("date", -1).limit(5)
    events = await cursor.to_list(5)
    if not events:
        await update.message.reply_text("📅 Aktif etkinlik bulunmuyor.")
        return
    lines = ["📅 *Aktif Etkinlikler*\n"]
    for e in events:
        name = e.get("name", "?")
        date_str = (e.get("date") or "")[:10]
        group = e.get("group_name", "")
        mult = e.get("multiplier", 1.0)
        lines.append(f"• *{name}* — `{date_str}` · {group} · ×{mult}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


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
    """Sleeps until target, then sends the SvS start message once."""
    delay = (target - datetime.now(target.tzinfo)).total_seconds()
    try:
        if delay > 0:
            await asyncio.sleep(delay)
        await send_message(str(chat_id), "⚔️ *SvS başlıyor! Hazırlanın!*")
    except asyncio.CancelledError:
        raise
    except Exception as e:
        log.warning(f"SvS worker error for chat {chat_id}: {e}")
    finally:
        _svs_tasks.pop(chat_id, None)


async def svs_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """/svs HH:MM — schedule a one-shot SvS start reminder for this chat."""
    if not context.args:
        await update.message.reply_text(
            "Kullanım: `/svs HH:MM`\nÖrnek: `/svs 20:00`", parse_mode="Markdown")
        return
    parsed = _parse_hhmm(context.args[0])
    if not parsed:
        await update.message.reply_text(
            "❌ Geçersiz saat formatı. `HH:MM` (24 saat) olmalı.",
            parse_mode="Markdown")
        return
    hh, mm = parsed
    chat_id = update.effective_chat.id
    target = _next_occurrence(hh, mm)
    # Cancel existing schedule if any.
    existing = _svs_tasks.pop(chat_id, None)
    if existing and not existing.done():
        existing.cancel()
    task = asyncio.create_task(_svs_worker(chat_id, target))
    _svs_tasks[chat_id] = task
    delta = target - datetime.now(target.tzinfo)
    hours = int(delta.total_seconds() // 3600)
    mins = int((delta.total_seconds() % 3600) // 60)
    when = target.strftime("%H:%M")
    await update.message.reply_text(
        f"⏱ *SvS hatırlatıcı planlandı*\n\n"
        f"🕒 Saat: `{when}` (TR)\n"
        f"⏳ Yaklaşık: {hours} sa {mins} dk sonra\n\n"
        f"İptal etmek için `/svs_iptal` yaz.",
        parse_mode="Markdown")


async def svs_cancel_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    """/svs_iptal — cancel any scheduled SvS reminder for this chat."""
    chat_id = update.effective_chat.id
    task = _svs_tasks.pop(chat_id, None)
    if task and not task.done():
        task.cancel()
        await update.message.reply_text(
            "🚫 *SvS hatırlatıcı iptal edildi.*", parse_mode="Markdown")
    else:
        await update.message.reply_text(
            "ℹ️ Aktif SvS hatırlatıcı yok.")
