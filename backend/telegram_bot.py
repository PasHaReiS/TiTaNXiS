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


# v133.6 — DeepL target-lang mapping (ISO 639-1 lowercase → DeepL code).
# HER kod DeepL'in resmi /v2/languages?type=target listesine karşı doğrulandı.
# KRİTİK: `tr` (Türkçe) ve `et` (Estonca) İKİ AYRI DİLDİR — asla karıştırma.
# Bilinmeyen kodlar için `.get(k)` None döner → çağıran taraf TR fallback yapmalı.
_DEEPL_TARGET = {
    "tr": "TR",       # Türkçe   ← varsayılan / kaynak
    "en": "EN-GB",    # İngilizce (British)
    "de": "DE",       # Almanca
    "fr": "FR",       # Fransızca
    "es": "ES",       # İspanyolca
    "it": "IT",       # İtalyanca
    "pt": "PT-PT",    # Portekizce (Portugal)
    "ru": "RU",       # Rusça
    "zh": "ZH",       # Çince
    "ja": "JA",       # Japonca
    "ko": "KO",       # Korece
    "ar": "AR",       # Arapça
    "nl": "NL",       # Hollandaca
    "pl": "PL",       # Lehçe
    "sv": "SV",       # İsveççe
    "et": "ET",       # Estonca  ← TR DEĞİL, ayrı dil!
    # Ek diller (uygulama i18n panelinden erişilebilir):
    "bg": "BG", "cs": "CS", "da": "DA", "el": "EL", "fi": "FI",
    "hu": "HU", "id": "ID", "lt": "LT", "lv": "LV", "nb": "NB",
    "ro": "RO", "sk": "SK", "sl": "SL", "uk": "UK",
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
    """Reply in the user's chosen language (v133.5 — dil eşleştirme fix).

    Yeni öncelik sırası (güvenilirden güvensize):
      1) `users.preferred_language` (kullanıcı Profile'dan seçmiş) — kesin.
      2) Telegram `update.effective_user.language_code` (cihaz/uygulama dili).
      3) DeepL detection (mesaj metninden) — SON çare, ambiguous kısa
         metinlerde TR ↔ ET/AZ karışıklığı yaşandığı için kısıtlı kullanılır.
      4) Fallback: TR (orijinal Türkçe metin gönderilir).

    Kritik: hangi yolda olursa olsun tespit edilen kod normalize edilir
    (lowercase, "-XX" suffix'i atılır) ve `_DEEPL_TARGET`'ta yoksa TR fallback
    devreye girer — asla yanlış diale (örn. ET) çevrilmez.
    """
    def _normalise(code):
        code = (code or "").strip().lower()
        if not code:
            return None
        if "-" in code:
            code = code.split("-")[0]
        return code

    src_lang = None

    # 1) Persisted preference — kesin doğru
    try:
        chat_id = str(update.effective_chat.id) if update.effective_chat else None
        if chat_id and _db is not None:
            u = await _db.users.find_one(
                {"telegram_chat_id": chat_id},
                {"_id": 0, "preferred_language": 1},
            )
            if not u:
                cm = await _db.chat_map.find_one({"chat_id": chat_id}, {"_id": 0, "user_id": 1})
                if cm and cm.get("user_id"):
                    u = await _db.users.find_one(
                        {"id": cm["user_id"]},
                        {"_id": 0, "preferred_language": 1},
                    )
            if u and u.get("preferred_language"):
                src_lang = _normalise(u["preferred_language"])
    except Exception as e:
        log.warning(f"reply_ml preferred_language lookup failed: {e}")

    # 2) Telegram client language
    if not src_lang and update.effective_user:
        src_lang = _normalise(getattr(update.effective_user, "language_code", None))

    # 3) DeepL detection — sadece yeterince uzun metinlerde (ambiguity azalır)
    if not src_lang and DEEPL_API_KEY and update.message:
        incoming = (update.message.text or "").strip()
        if incoming.startswith("/"):
            parts = incoming.split(None, 1)
            incoming = parts[1] if len(parts) > 1 else ""
        # 12+ karakter olsun ki "merhaba" → ET yanılgısı olmasın.
        if incoming and len(incoming) >= 12:
            detected = await _detect_source(incoming)
            src_lang = _normalise(detected)

    log.debug(f"reply_ml → src_lang={src_lang}")

    # 4) TR ya da bilinmeyen → orijinal Türkçe metni gönder
    if not src_lang or src_lang == "tr":
        await update.message.reply_text(tr_text, parse_mode=parse_mode)
        return

    # _DEEPL_TARGET'ta yoksa fallback TR
    target = _DEEPL_TARGET.get(src_lang)
    if not target:
        log.info(f"reply_ml: unknown src_lang={src_lang!r} → falling back to TR")
        await update.message.reply_text(tr_text, parse_mode=parse_mode)
        return

    # Aynı dile çeviri anlamsız
    if target == "TR":
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
    # v133 — Genişletilmiş komut seti
    _app.add_handler(CommandHandler("puan", puan_command))
    _app.add_handler(CommandHandler("karsilastir", karsilastir_command))
    _app.add_handler(CommandHandler("etkinlikler", etkinlikler_command))
    _app.add_handler(CommandHandler("yakinda", yakinda_command))
    _app.add_handler(CommandHandler("katil", katil_command))
    _app.add_handler(CommandHandler("katilmiyorum", katilmiyorum_command))
    _app.add_handler(CommandHandler("profil", profil_command))
    _app.add_handler(CommandHandler("rozet", rozet_command))
    _app.add_handler(CommandHandler("istatistik", istatistik_command))
    _app.add_handler(CommandHandler("bildirimler", bildirimler_command))
    _app.add_handler(CommandHandler("mola", mola_command))
    _app.add_handler(CommandHandler("takvim", takvim_command))
    _app.add_handler(CommandHandler("arsiv", arsiv_command))
    _app.add_handler(CommandHandler("lonca", lonca_command))
    _app.add_handler(CommandHandler("online", online_command))
    _app.add_handler(CommandHandler("streak", streak_command))
    _app.add_handler(CommandHandler("davet", davet_command))
    _app.add_handler(CommandHandler("hatirlatici", hatirlatici_command))
    _app.add_handler(CommandHandler("dil", dil_command))
    _app.add_handler(CommandHandler("sifremi_sifirla", sifremi_sifirla_command))
    _app.add_handler(CommandHandler("geri_bildirim", geri_bildirim_command))
    _app.add_handler(CommandHandler("link", link_command))
    _app.add_handler(CommandHandler("baglanti", link_command))
    _app.add_handler(CommandHandler("hakkinda", hakkinda_command))
    _app.add_handler(CommandHandler("komutlar", yardim_command))
    # Admin
    _app.add_handler(CommandHandler("duyuru", duyuru_command))
    _app.add_handler(CommandHandler("toplu_duyuru", toplu_duyuru_command))
    _app.add_handler(CommandHandler("uyar", uyar_command))
    _app.add_handler(CommandHandler("rapor", rapor_command))
    _app.add_handler(CommandHandler("uyeler", uyeler_command))
    _app.add_handler(CommandHandler("ekle", ekle_command))
    _app.add_handler(CommandHandler("cikar", cikar_command))
    _app.add_handler(CommandHandler("puan_ekle", puan_ekle_command))
    _app.add_handler(CommandHandler("rozet_ver", rozet_ver_command))
    _app.add_handler(CommandHandler("etkinlik_ekle", etkinlik_ekle_command))
    _app.add_handler(CommandHandler("etkinlik_iptal", etkinlik_iptal_command))
    _app.add_handler(CommandHandler("esik_uyari", esik_uyari_command))
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
                                        "allowed_updates": ["message", "poll_answer", "poll", "callback_query"]})
            data = r.json()
            if data.get("ok"):
                log.info(f"Telegram webhook set → {url}")
                ok_hook = True
            else:
                log.warning(f"Telegram setWebhook failed: {data}")
            # Publish the bot command menu so Telegram shows the "/" popover.
            # v133 — Genişletilmiş komut listesi (35+ komut).
            cmds = [
                {"command": "siralama",        "description": "Sıralama (top10 ile ilk 10)"},
                {"command": "puan",            "description": "Kendi/üye puan bilgisi"},
                {"command": "karsilastir",     "description": "İki üyeyi karşılaştır"},
                {"command": "etkinlik",        "description": "Bugünün etkinlikleri"},
                {"command": "etkinlikler",     "description": "Bu hafta etkinlikleri"},
                {"command": "yakinda",         "description": "Yaklaşan etkinlikler"},
                {"command": "takvim",          "description": "Aylık takvim"},
                {"command": "arsiv",           "description": "Son arşivler"},
                {"command": "katil",           "description": "Etkinliğe katıl"},
                {"command": "katilmiyorum",    "description": "Katılmayacağını bildir"},
                {"command": "hatirlatici",     "description": "Etkinliğe hatırlatıcı kur"},
                {"command": "profil",          "description": "Profil özeti"},
                {"command": "rozet",           "description": "Rozetler"},
                {"command": "istatistik",      "description": "Detaylı istatistikler"},
                {"command": "streak",          "description": "RSVP streak bilgisi"},
                {"command": "online",          "description": "Şu an aktif üyeler"},
                {"command": "lonca",           "description": "Lonca genel bilgisi"},
                {"command": "davet",           "description": "Kişisel davet linki"},
                {"command": "bildirimler",     "description": "Bildirim ac/kapat"},
                {"command": "mola",            "description": "X gün mola modu"},
                {"command": "dil",             "description": "Bot dilini değiştir"},
                {"command": "sifremi_sifirla", "description": "Şifre sıfırlama linki"},
                {"command": "geri_bildirim",   "description": "Admin'e geri bildirim"},
                {"command": "link",            "description": "Hesap bağlama"},
                {"command": "unlink",          "description": "Hesap bağlantısını kaldır"},
                {"command": "hakkinda",        "description": "Uygulama bilgisi"},
                {"command": "yardim",          "description": "Tüm komutlar"},
                # Admin komutları (herkese görünür ama backend kontrolü var)
                {"command": "duyuru",          "description": "[Admin] Duyuru gönder"},
                {"command": "toplu_duyuru",    "description": "[Admin] Toplu mesaj"},
                {"command": "uyar",            "description": "[Admin] Üyeyi uyar"},
                {"command": "rapor",           "description": "[Admin] Haftalık rapor"},
                {"command": "uyeler",          "description": "[Admin] Üye listesi"},
                {"command": "ekle",            "description": "[Admin] Üye ekle"},
                {"command": "cikar",           "description": "[Admin] Üye çıkar"},
                {"command": "puan_ekle",       "description": "[Admin] Manuel puan"},
                {"command": "rozet_ver",       "description": "[Admin] Rozet ver"},
                {"command": "etkinlik_ekle",   "description": "[Admin] Hızlı etkinlik"},
                {"command": "etkinlik_iptal",  "description": "[Admin] Etkinlik iptal"},
                {"command": "esik_uyari",      "description": "[Admin] Eşik uyarıları"},
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


async def yardim_command_removed(update: Update, _: ContextTypes.DEFAULT_TYPE):
    """DEPRECATED — v133'te yardim_command aşağıda yeniden tanımlandı."""
    await reply_ml(update, "Bu komut güncellendi — lütfen /yardim yeniden çalıştır.")


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


async def siralama_command_v1_removed(*args, **kwargs):
    """DEPRECATED — v133'te yeni /siralama (top10 destekli) aşağıda."""
    return None


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
    # v133 — /etkinlik = bugünün etkinlikleri (24h penceresi). Boşsa
    # kullanıcıya /yakinda önerir.
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=24)
    cursor = _db.events.find({
        "archived": {"$ne": True},
        "date": {"$gte": now.isoformat(), "$lt": end.isoformat()},
    }, {"_id": 0}).sort("date", 1).limit(10)
    events = await cursor.to_list(10)
    if not events:
        await reply_ml(update, "📅 Bugün planlı etkinlik yok. `/yakinda` ile önümüzdeki 7 günü gör.")
        return
    lines = ["📅 *Bugünkü Etkinlikler*\n"]
    for e in events:
        d = (e.get("date") or "")[:16].replace("T", " ")
        lines.append(f"• *{e.get('name','?')}* — `{d}` · {e.get('group_name','')} · ×{e.get('multiplier',1.0)} · `{e.get('id','')[:8]}`")
    lines.append("\n💡 Katılmak için: `/katil <id>`")
    await reply_ml(update, "\n".join(lines))


# ============================ v133 — Genişletilmiş Komut Seti =================
# Aşağıda kullanıcının istediği 35+ yeni komut için handler'lar var. Yardımcı
# fonksiyonlar önce, sonra genel komutlar, en sonda /admin komutları.

WEB_BASE = os.environ.get("PUBLIC_BASE_URL", "https://titanxis.com").rstrip("/")

# v133.4 — /duyuru için hedef Telegram grubu. Gerçek getChat API testi
# gösteriyor ki bu bot için grup ID `-1003597221954` (12 hane, tek `-`).
# Diğer varyantlar (`-100…`, prefix'siz) "chat not found" (400) döner.
# Env'den override edilebilir; yoksa doğrulanmış varsayılan kullanılır.
TITANXIS_GROUP_CHAT_ID = os.environ.get(
    "TITANXIS_GROUP_CHAT_ID",
    os.environ.get("TELEGRAM_CHANNEL_ID", "-1003597221954"),
).strip()

async def _user_from_chat(chat_id: str) -> Optional[dict]:
    """Bu Telegram sohbetiyle bağlı TiTaNXiS user'ını döndürür.

    v133.1 — Fallback: `users.telegram_chat_id` yoksa `chat_map` collection'ına
    bak (kullanıcı /start ile bağlanmış ama admin henüz Profile'dan eşleme
    yapmamış olabilir). chat_map schema: {chat_id, telegram_username, user_id?}.
    """
    if _db is None:
        return None
    u = await _db.users.find_one({"telegram_chat_id": str(chat_id)}, {"_id": 0})
    if u:
        return u
    # Fallback via chat_map (bir /start webhook fallback tarafından yazıldı)
    cm = await _db.chat_map.find_one({"chat_id": str(chat_id)}, {"_id": 0})
    if not cm:
        return None
    uid = cm.get("user_id")
    if uid:
        return await _db.users.find_one({"id": uid}, {"_id": 0})
    tg_username = (cm.get("telegram_username") or "").lstrip("@")
    if tg_username:
        return await _db.users.find_one({"telegram_username": tg_username}, {"_id": 0})
    return None


async def _all_delivery_chat_ids() -> list:
    """v133.1 — /duyuru + /toplu_duyuru için birleşik hedef listesi:
    (a) `users.telegram_chat_id` dolu + `notification_enabled != False` olanlar,
    (b) `chat_map` içindeki tüm chat_id'ler (bot'a /start atmış herkes).
    (c) v134 — `members.telegram_chat_id` (admin panelinden elle bağlanmış).
    Yinelenen chat_id'ler tekilleştirilir."""
    if _db is None:
        return []
    ids = set()
    async for u in _db.users.find(
        {"telegram_chat_id": {"$ne": None},
         "notification_enabled": {"$ne": False}},
        {"_id": 0, "telegram_chat_id": 1},
    ):
        cid = u.get("telegram_chat_id")
        if cid:
            ids.add(str(cid))
    async for cm in _db.chat_map.find({}, {"_id": 0, "chat_id": 1}):
        cid = cm.get("chat_id")
        if cid:
            ids.add(str(cid))
    async for m in _db.members.find(
        {"telegram_chat_id": {"$ne": None, "$exists": True}},
        {"_id": 0, "telegram_chat_id": 1},
    ):
        cid = m.get("telegram_chat_id")
        if cid:
            ids.add(str(cid))
    return sorted(ids)


async def _require_link(update: Update) -> Optional[dict]:
    """Bağlı user yoksa açıklayıcı mesaj gönderip None döndürür."""
    chat_id = str(update.effective_chat.id)
    u = await _user_from_chat(chat_id)
    if not u:
        await reply_ml(update,
            "🔗 *Telegram hesabınız sisteme bağlı değil*\n\n"
            f"Bu komutu kullanabilmen için önce hesabını bağlaman gerekiyor.\n\n"
            f"1️⃣ Web paneline giriş yap: [{WEB_BASE}/profil]({WEB_BASE}/profil)\n"
            f"2️⃣ Profil → *Telegram Bağla* butonuna tıkla ve 6 haneli kodu al\n"
            f"3️⃣ Burada `/link KOD` yaz (ya da `/baglanti KOD`)\n\n"
            f"💡 Chat ID'niz: `{chat_id}` — admin bu ID'yi elle de eşleyebilir.")
        return None
    return u


async def _require_admin(update: Update) -> Optional[dict]:
    u = await _require_link(update)
    if not u:
        return None
    if u.get("role") != "admin":
        await reply_ml(update,
            "🚫 *Bu komut sadece yöneticiler içindir*\n\n"
            f"Hesabın: `{u.get('username','?')}` (rol: `{u.get('role','member')}`)\n"
            f"Yetki için lonca yöneticisine ulaş.")
        return None
    return u


async def _require_member(update: Update) -> Optional[tuple]:
    """v136.5 — İki-aşamalı doğrulama: (a) chat bağlı mı? (b) user'a member
    eşlenmiş mi? Her iki durum için ayrı, açıklayıcı mesaj döndürür.
    Başarıda `(user, member)` tuple'ı; başarısızlıkta `None` döner."""
    u = await _require_link(update)
    if not u:
        return None
    m = await _member_from_user(u)
    if not m:
        await reply_ml(update,
            "👤 *Telegram hesabınız bağlı ama lonca üyesiyle eşleşmemiş*\n\n"
            f"Kullanıcı: `{u.get('username','?')}` (rol: `{u.get('role','member')}`)\n\n"
            f"Bir yönetici sizin *Telegram hesabınızı* bir *lonca üyesi kaydına* eşleyene "
            f"kadar bu komut çalışmıyor. Yönetici:\n"
            f"1️⃣ [Web paneli → Üyeler]({WEB_BASE}/uyeler)\n"
            f"2️⃣ Sizin üye kartınızda *Telegram Eşle* butonuna tıklamalı\n\n"
            f"💡 Puan/güç/rütbe gibi bilgileri görmek için üye eşleşmesi zorunlu.")
        return None
    return (u, m)


async def _member_from_user(u: dict) -> Optional[dict]:
    mids = [x for x in (u.get("member_ids") or []) if x]
    if not mids or _db is None:
        return None
    return await _db.members.find_one({"id": mids[0]}, {"_id": 0})


async def _member_by_query(q: str) -> Optional[dict]:
    """@handle, isim veya username eşleştir."""
    if not q or _db is None:
        return None
    import re
    q = q.strip().lstrip("@")
    # Önce username eşleşmesi (users → member_ids)
    u = await _db.users.find_one({"username": {"$regex": f"^{re.escape(q)}$", "$options": "i"}}, {"_id": 0})
    if u:
        m = await _member_from_user(u)
        if m: return m
    # Sonra üye adı direkt eşleşme
    return await _db.members.find_one({"name": {"$regex": re.escape(q), "$options": "i"}}, {"_id": 0})


async def _member_score(member_id: str) -> int:
    if _db is None:
        return 0
    cur = _db.points.aggregate([
        {"$match": {"member_id": member_id}},
        {"$group": {"_id": None, "s": {"$sum": "$points"}}},
    ])
    async for r in cur:
        return int(r.get("s") or 0)
    return 0


# ------------------------------ /siralama (with top10) ------------------------
async def siralama_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    args = getattr(context, "args", None) or []
    limit = 10 if (args and args[0].lower() == "top10") else 5
    # Aggregate points table (aktif skorlama)
    pipeline = [
        {"$group": {"_id": "$member_id", "total": {"$sum": "$points"}}},
        {"$sort": {"total": -1}}, {"$limit": limit},
    ]
    rows = await _db.points.aggregate(pipeline).to_list(limit)
    if not rows:
        # Fallback: bireysel_guc sırala
        cur = _db.members.find({}, {"_id": 0, "name": 1, "alliance_name": 1, "bireysel_guc": 1}).sort("bireysel_guc", -1).limit(limit)
        ms = await cur.to_list(limit)
        if not ms:
            await reply_ml(update, "📊 Henüz sıralama verisi yok.")
            return
        lines = [f"🏆 *En Güçlü {limit}*\n"]
        for i, m in enumerate(ms):
            medal = ["🥇","🥈","🥉"][i] if i < 3 else f"{i+1}."
            lines.append(f"{medal} *{m.get('name','?')}* [{m.get('alliance_name','-')}] — {int(m.get('bireysel_guc') or 0):,}")
        await reply_ml(update, "\n".join(lines))
        return
    mids = [r["_id"] for r in rows]
    ms = await _db.members.find({"id": {"$in": mids}}, {"_id": 0}).to_list(len(mids))
    mmap = {m["id"]: m for m in ms}
    lines = [f"🏆 *Sıralama (Top {limit})*\n"]
    for i, r in enumerate(rows):
        m = mmap.get(r["_id"]) or {}
        medal = ["🥇","🥈","🥉"][i] if i < 3 else f"{i+1}."
        lines.append(f"{medal} *{m.get('name','?')}* [{m.get('alliance_name','-')}] — `{int(r['total']):,}`")
    await reply_ml(update, "\n".join(lines))


# ------------------------------ /puan ----------------------------------------
async def puan_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = getattr(context, "args", None) or []
    if args:
        m = await _member_by_query(args[0])
        if not m:
            await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
            return
    else:
        r = await _require_member(update)
        if not r: return
        u, m = r
    score = await _member_score(m["id"])
    await reply_ml(update,
        f"⚔️ *{m.get('name','?')}*\n\n"
        f"🏆 Toplam Puan: `{score:,}`\n"
        f"💪 Güç: `{int(m.get('bireysel_guc') or 0):,}`\n"
        f"🎖 Rütbe: {m.get('rank','-')}\n"
        f"🏰 İttifak: {m.get('alliance_name','-')}"
    )


# ------------------------------ /karsilastir --------------------------------
async def karsilastir_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = getattr(context, "args", None) or []
    if len(args) < 2:
        await reply_ml(update,
            "Kullanım: `/karsilastir @kullanici1 @kullanici2`\n\n"
            "İki üyenin puan/güç karşılaştırmasını yapar. Üye adı veya @username kabul eder.")
        return
    m1 = await _member_by_query(args[0])
    m2 = await _member_by_query(args[1])
    if not m1 and not m2:
        await reply_ml(update, f"❌ '{args[0]}' ve '{args[1]}' bulunamadı. Üye adını veya @kullanıcı adını kontrol edin.")
        return
    if not m1:
        await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
        return
    if not m2:
        await reply_ml(update, f"❌ '{args[1]}' bulunamadı.")
        return
    s1, s2 = await _member_score(m1["id"]), await _member_score(m2["id"])
    g1, g2 = int(m1.get("bireysel_guc") or 0), int(m2.get("bireysel_guc") or 0)
    diff = s1 - s2
    winner = m1["name"] if diff > 0 else (m2["name"] if diff < 0 else "Berabere")
    await reply_ml(update,
        f"⚔️ *Karşılaştırma*\n\n"
        f"👤 *{m1['name']}* [{m1.get('alliance_name','-')}]\n"
        f"   🏆 `{s1:,}` puan · 💪 `{g1:,}` güç\n\n"
        f"👤 *{m2['name']}* [{m2.get('alliance_name','-')}]\n"
        f"   🏆 `{s2:,}` puan · 💪 `{g2:,}` güç\n\n"
        f"🏅 *Kazanan (puan):* {winner}\n"
        f"📊 Fark: `{abs(diff):,}`"
    )


# ------------------------------ /etkinlikler (haftalık) ---------------------
async def etkinlikler_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None:
        await reply_ml(update, "⚠️ Veritabanı hazır değil.")
        return
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=7)
    events = await _db.events.find({
        "archived": {"$ne": True},
        "date": {"$gte": now.isoformat(), "$lt": end.isoformat()},
    }, {"_id": 0}).sort("date", 1).limit(30).to_list(30)
    if not events:
        await reply_ml(update, "📅 Bu hafta planlı etkinlik yok.")
        return
    lines = ["📆 *Bu Haftanın Etkinlikleri*\n"]
    for e in events:
        d = (e.get("date") or "")[:16].replace("T", " ")
        lines.append(f"• *{e.get('name','?')}* — `{d}` · {e.get('group_name','')} · `{e.get('id','')[:8]}`")
    await reply_ml(update, "\n".join(lines))


# ------------------------------ /yakinda -----------------------------------
async def yakinda_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None: return
    now = datetime.now(timezone.utc)
    events = await _db.events.find({
        "archived": {"$ne": True}, "date": {"$gte": now.isoformat()},
    }, {"_id": 0}).sort("date", 1).limit(5).to_list(5)
    if not events:
        await reply_ml(update, "📅 Yaklaşan etkinlik yok.")
        return
    lines = ["🔜 *Yaklaşan Etkinlikler*\n"]
    for e in events:
        d = (e.get("date") or "")[:16].replace("T", " ")
        lines.append(f"• *{e.get('name','?')}* — `{d}` · `{e.get('id','')[:8]}`")
    await reply_ml(update, "\n".join(lines))


# ------------------------------ /katil, /katilmiyorum -----------------------
async def _rsvp(update: Update, context, status: str, label: str):
    args = getattr(context, "args", None) or []
    if not args:
        await reply_ml(update, f"Kullanım: `/{'katil' if status=='yes' else 'katilmiyorum'} <etkinlik_id>`")
        return
    u = await _require_link(update)
    if not u: return
    ev_id_prefix = args[0].strip()
    ev = await _db.events.find_one({"id": {"$regex": f"^{ev_id_prefix}"}}, {"_id": 0})
    if not ev:
        await reply_ml(update, f"❌ '{ev_id_prefix}' ile başlayan etkinlik bulunamadı.\n\nAktif etkinlik listesi için: `/etkinlikler`")
        return
    m = await _member_from_user(u)
    if not m:
        await reply_ml(update,
            "👤 *RSVP için lonca üyesi eşleşmesi gerekli*\n\n"
            f"Telegram hesabınız bağlı (`{u.get('username','?')}`) ama bir lonca üyesiyle henüz eşleşmemiş.\n"
            f"Bir yönetici [Üyeler sayfasından]({WEB_BASE}/uyeler) sizin adınıza *Telegram Eşle* yapmalı.")
        return
    await _db.event_rsvps.update_one(
        {"event_id": ev["id"], "member_id": m["id"]},
        {"$set": {"event_id": ev["id"], "member_id": m["id"], "status": status,
                  "user_id": u["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await reply_ml(update, f"{label} — *{ev.get('name','?')}* için RSVP kaydedildi.")


async def katil_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _rsvp(update, context, "yes", "✅ Katılıyorsun")


async def katilmiyorum_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await _rsvp(update, context, "no", "🚫 Katılmayacaksın")


# ------------------------------ /profil ------------------------------------
async def profil_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = getattr(context, "args", None) or []
    if args:
        m = await _member_by_query(args[0])
        if not m:
            await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
            return
    else:
        r = await _require_member(update)
        if not r: return
        u, m = r
    score = await _member_score(m["id"])
    rsvp_yes = await _db.event_rsvps.count_documents({"member_id": m["id"], "status": "yes"}) if _db is not None else 0
    await reply_ml(update,
        f"👤 *{m.get('name','?')}*\n"
        f"🎖 {m.get('rank','-')} · 🏰 {m.get('alliance_name','-')}\n\n"
        f"🏆 Puan: `{score:,}`\n"
        f"💪 Güç: `{int(m.get('bireysel_guc') or 0):,}`\n"
        f"✅ RSVP: `{rsvp_yes}` etkinlik\n"
        f"📅 Eklenme: `{(m.get('created_at') or '')[:10]}`\n\n"
        f"📊 Detay: [{WEB_BASE}/uyeler]({WEB_BASE}/uyeler)"
    )


# ------------------------------ /rozet, /istatistik ------------------------
async def rozet_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    r = await _require_member(update)
    if not r: return
    u, m = r
    score = await _member_score(m["id"])
    badges = []
    if score >= 1_000_000:      badges.append("🥇 İlk Milyon")
    if score >= 100_000_000:    badges.append("💎 100M Kulübü")
    if score >= 500_000_000:    badges.append("👑 Loncanın Kralı")
    rsvp_yes = await _db.event_rsvps.count_documents({"member_id": m["id"], "status": "yes"}) if _db is not None else 0
    if rsvp_yes >= 10:  badges.append("🎖 10 Etkinlik Serisi")
    if rsvp_yes >= 50:  badges.append("🏅 50 Etkinlik Efsanesi")
    if not badges: badges = ["🌱 Henüz rozet yok — bir etkinliğe katılarak başla!"]
    await reply_ml(update, f"🏅 *{m.get('name','?')} — Rozetler*\n\n" + "\n".join(f"• {b}" for b in badges))


async def istatistik_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    r = await _require_member(update)
    if not r: return
    u, m = r
    score = await _member_score(m["id"])
    pt_count = await _db.points.count_documents({"member_id": m["id"]})
    rsvp_yes = await _db.event_rsvps.count_documents({"member_id": m["id"], "status": "yes"})
    rsvp_no = await _db.event_rsvps.count_documents({"member_id": m["id"], "status": "no"})
    rate = round(rsvp_yes * 100 / max(1, rsvp_yes + rsvp_no))
    await reply_ml(update,
        f"📊 *{m.get('name','?')} — İstatistikler*\n\n"
        f"🏆 Toplam Puan: `{score:,}`\n"
        f"🎯 Puanlı Etkinlik: `{pt_count}`\n"
        f"✅ RSVP Evet: `{rsvp_yes}`\n"
        f"❌ RSVP Hayır: `{rsvp_no}`\n"
        f"📈 Katılım Oranı: `%{rate}`"
    )


# ------------------------------ /bildirimler, /mola --------------------------
async def bildirimler_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_link(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if not args or args[0].lower() not in ("ac", "aç", "kapat", "on", "off"):
        await reply_ml(update, "Kullanım: `/bildirimler ac` veya `/bildirimler kapat`")
        return
    on = args[0].lower() in ("ac", "aç", "on")
    await _db.users.update_one({"id": u["id"]}, {"$set": {"notification_enabled": on}})
    await reply_ml(update, "🔔 Bildirimler açıldı." if on else "🔕 Bildirimler kapatıldı.")


async def mola_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_link(update)
    if not u: return
    args = getattr(context, "args", None) or []
    try:
        days = int(args[0]) if args else 3
    except ValueError:
        await reply_ml(update, "Kullanım: `/mola 3` (gün sayısı)")
        return
    days = max(1, min(30, days))
    until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    await _db.users.update_one({"id": u["id"]},
        {"$set": {"notification_enabled": False, "notification_pause_until": until}})
    await reply_ml(update, f"⏸ Mola modu aktif — {days} gün boyunca bildirim gelmeyecek (`{until[:10]}` tarihine kadar). `/bildirimler ac` ile erken bitirebilirsin.")


# ------------------------------ /takvim, /arsiv, /lonca, /online, /streak ----
async def takvim_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None: return
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=30)
    events = await _db.events.find({
        "archived": {"$ne": True}, "date": {"$gte": now.isoformat(), "$lt": end.isoformat()},
    }, {"_id": 0}).sort("date", 1).limit(30).to_list(30)
    lines = [f"📅 *Aylık Takvim ({now.strftime('%B %Y')})*\n"]
    if not events:
        lines.append("Bu ay planlı etkinlik yok.")
    else:
        cur_day = ""
        for e in events:
            day = (e.get("date") or "")[:10]
            if day != cur_day:
                lines.append(f"\n*{day}*")
                cur_day = day
            time = (e.get("date") or "")[11:16]
            lines.append(f"  • `{time}` — {e.get('name','?')}")
    lines.append(f"\n🌐 Detaylı: [{WEB_BASE}/etkinlikler]({WEB_BASE}/etkinlikler)")
    await reply_ml(update, "\n".join(lines))


async def arsiv_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None: return
    events = await _db.events.find({"archived": True}, {"_id": 0}).sort("date", -1).limit(10).to_list(10)
    if not events:
        await reply_ml(update, "📦 Arşivde etkinlik yok.")
        return
    lines = ["📦 *Son Arşivlenen Etkinlikler*\n"]
    for e in events:
        d = (e.get("date") or "")[:10]
        lines.append(f"• *{e.get('name','?')}* — `{d}`")
    await reply_ml(update, "\n".join(lines))


async def lonca_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None: return
    m_total = await _db.members.count_documents({})
    m_gow = await _db.members.count_documents({"alliance_name": "GOW"})
    e_active = await _db.events.count_documents({"archived": {"$ne": True}})
    e_archived = await _db.events.count_documents({"archived": True})
    # Toplam puan
    tot = 0
    async for r in _db.points.aggregate([{"$group": {"_id": None, "s": {"$sum": "$points"}}}]):
        tot = int(r.get("s") or 0)
    await reply_ml(update,
        f"🏰 *TiTaNXiS Loncası*\n\n"
        f"👥 Üye: `{m_total}` (GOW: `{m_gow}`)\n"
        f"📅 Aktif Etkinlik: `{e_active}`\n"
        f"📦 Arşiv: `{e_archived}`\n"
        f"🏆 Toplam Puan: `{tot:,}`\n\n"
        f"🌐 [{WEB_BASE}]({WEB_BASE})"
    )


async def online_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    if _db is None: return
    # Son 15 dakikada aktif kullanıcılar (last_seen_at varsa)
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    users = await _db.users.find({"last_seen_at": {"$gte": cutoff}}, {"_id": 0, "username": 1}).limit(30).to_list(30)
    if not users:
        await reply_ml(update, "🌙 Şu an aktif üye kaydı yok. (Aktivite izleme etkin değilse bu normal.)")
        return
    names = ", ".join(f"@{u.get('username','?')}" for u in users)
    await reply_ml(update, f"🟢 *Şu an aktif ({len(users)}):*\n{names}")


async def streak_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_link(update)
    if not u: return
    if _db is None:
        await reply_ml(update, "🚫 Veritabanına erişilemedi.")
        return
    # v136.4 — Streak'i dinamik hesapla: `rsvp_streaks` koleksiyonu doesn't exist
    # in this deployment; kaynak veri `event_rsvps` (user_id başına). Mantık
    # backend `_compute_user_yes_streak` ile aynı: attendance-enabled etkinlik
    # üzerinden geriye doğru "yes" sayacı; ilk 'no'/'maybe'de kırılır.
    rsvps = await _db.event_rsvps.find(
        {"user_id": u["id"]}, {"_id": 0, "event_id": 1, "status": 1},
    ).to_list(5000)
    display_name = (u.get("username") or "Komutan")
    m = await _member_from_user(u)
    if m and m.get("name"):
        display_name = m["name"]
    if not rsvps:
        await reply_ml(update,
            f"🔥 *{display_name} — RSVP Streak*\n\n"
            f"Henüz RSVP kaydın yok. Bir etkinliğe *Evet* de, seri başlasın!\n\n"
            f"📊 Sadıklar sıralaması: [{WEB_BASE}/siralama]({WEB_BASE}/siralama)")
        return
    ev_ids = list({r["event_id"] for r in rsvps if r.get("event_id")})
    events = await _db.events.find(
        {"id": {"$in": ev_ids}, "attendance_enabled": {"$ne": False}},
        {"_id": 0, "id": 1, "date": 1},
    ).to_list(5000)
    by_ev = {e["id"]: e for e in events}
    rows = []
    for r in rsvps:
        ev = by_ev.get(r.get("event_id"))
        if not ev or not ev.get("date"):
            continue
        rows.append({"status": r.get("status"), "date": ev["date"]})
    rows.sort(key=lambda x: x["date"], reverse=True)
    # Şu anki seri (en yeniden geriye)
    current = 0
    for r in rows:
        if r["status"] == "yes":
            current += 1
        else:
            break
    # Rekor seri (tüm zamanların en uzun "yes" ardışığı)
    best = 0
    run = 0
    # Kronolojik sıraya çevir
    for r in reversed(rows):
        if r["status"] == "yes":
            run += 1
            best = max(best, run)
        else:
            run = 0
    # Milestone motivasyon mesajı
    MILESTONES = [5, 10, 15, 20, 25, 50, 100]
    next_milestone = next((x for x in MILESTONES if x > current), None)
    footer = ""
    if next_milestone and current > 0:
        gap = next_milestone - current
        footer = f"\n🎯 Bir sonraki hedef: `{next_milestone}` — {gap} etkinlik kaldı!"
    elif current == 0:
        footer = "\n💤 Seri kırıldı. Bir sonraki etkinliğe *Evet* de, sıfırdan başla!"
    await reply_ml(update,
        f"🔥 *{display_name} — RSVP Streak*\n\n"
        f"Şu anki seri: `{current}` etkinlik\n"
        f"Rekor: `{best}` etkinlik\n"
        f"Toplam etkinlik geçmişi: `{len(rows)}`{footer}\n\n"
        f"🏆 Sadıklar: [{WEB_BASE}/siralama]({WEB_BASE}/siralama)"
    )


# ------------------------------ /davet, /hatirlatici, /dil ------------------
async def davet_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_link(update)
    if not u: return
    import secrets
    token = secrets.token_urlsafe(6).upper()[:8]
    invite = {
        "token": token, "created_by": u["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False,
    }
    if _db is not None:
        await _db.invites.insert_one(invite)
    link = f"{WEB_BASE}/kayit?davet={token}"
    await reply_ml(update,
        f"🎫 *Kişisel Davet Linki*\n\n"
        f"`{link}`\n\n"
        f"Bu linki paylaş → yeni üyeler kayıt olduğunda seninle eşlenir.")


async def hatirlatici_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = getattr(context, "args", None) or []
    if not args:
        await reply_ml(update,
            "Kullanım: `/hatirlatici <etkinlik_id>`\n\n"
            "Etkinlik ID'lerini `/etkinlikler` veya `/yakinda` komutlarıyla görebilirsin. "
            "ID'nin ilk 6-8 karakteri yeterli.")
        return
    u = await _require_link(update)
    if not u: return
    ev = await _db.events.find_one({"id": {"$regex": f"^{args[0]}"}}, {"_id": 0})
    if not ev:
        await reply_ml(update, f"❌ '{args[0]}' ile başlayan etkinlik bulunamadı.\n\nAktif etkinlikler için: `/etkinlikler`")
        return
    await _db.personal_reminders.update_one(
        {"user_id": u["id"], "event_id": ev["id"]},
        {"$set": {"user_id": u["id"], "event_id": ev["id"],
                  "chat_id": str(update.effective_chat.id),
                  "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await reply_ml(update, f"⏰ Hatırlatıcı kuruldu — *{ev.get('name','?')}* başlamadan 15 dk önce sana yazacağım.")


async def dil_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = getattr(context, "args", None) or []
    valid = list(_DEEPL_TARGET.keys())
    if not args or args[0].lower() not in valid:
        await reply_ml(update, f"Kullanım: `/dil tr` (desteklenen: {', '.join(sorted(valid))})")
        return
    lang = args[0].lower()
    u = await _require_link(update)
    if not u: return
    await _db.users.update_one({"id": u["id"]}, {"$set": {"preferred_language": lang}})
    await reply_ml(update, f"🌐 Bot dili `{lang}` olarak ayarlandı.")


# ------------------------------ /sifremi_sifirla, /geri_bildirim, /link, /hakkinda
async def sifremi_sifirla_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_link(update)
    if not u: return
    import secrets
    token = secrets.token_urlsafe(24)
    exp = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    await _db.password_reset_tokens.update_one(
        {"user_id": u["id"]},
        {"$set": {"user_id": u["id"], "token": token, "expires_at": exp}},
        upsert=True,
    )
    await reply_ml(update,
        f"🔑 *Şifre Sıfırlama*\n\n"
        f"Link 1 saat geçerli:\n`{WEB_BASE}/sifre-sifirla?token={token}`")


async def geri_bildirim_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await reply_ml(update,
            "Kullanım: `/geri_bildirim <mesajın>`\n\n"
            "Örnek: `/geri_bildirim Bot menüsüne dark mode ekleyebilir misiniz?`\n"
            "💡 Hesabın bağlı olmasa bile bu komut çalışır — anonim de gönderebilirsin.")
        return
    u = await _user_from_chat(str(update.effective_chat.id))
    msg = " ".join(context.args)[:2000]
    if _db is not None:
        await _db.feedback.insert_one({
            "message": msg,
            "user_id": (u or {}).get("id"),
            "username": (u or {}).get("username") or "anonim",
            "chat_id": str(update.effective_chat.id),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False,
        })
    await reply_ml(update, "✅ Geri bildirim admin'e iletildi. Teşekkürler!")


async def link_command_v2(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """v133 — /link için wrapper (mevcut link_command'a köprü)."""
    await link_command(update, context)


async def hakkinda_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    await reply_ml(update,
        f"⚔️ *TiTaNXiS Lonca Yönetim Botu*\n\n"
        f"🏰 Lonca: TiTaNXiS · GOW ittifakı\n"
        f"🌐 Web: [{WEB_BASE}]({WEB_BASE})\n"
        f"🤖 Bot: @TiTaNXiS_BoT\n"
        f"📖 Komutlar: /yardim\n\n"
        f"Emergent altyapısında çalışır.")


# ============================ ADMİN KOMUTLARI ================================
async def _list_admin_chat_ids() -> list:
    if _db is None: return []
    admins = await _db.users.find({"role": "admin", "telegram_chat_id": {"$ne": None}},
                                   {"_id": 0, "telegram_chat_id": 1}).to_list(50)
    return [a["telegram_chat_id"] for a in admins if a.get("telegram_chat_id")]


async def duyuru_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """v133.4 — /duyuru <mesaj>

    Admin ise mesajı `TITANXIS_GROUP_CHAT_ID` (doğrulanmış varsayılan:
    `-1003597221954`) grubuna atar. Format:
      `📢 *TiTaNXiS Duyurusu*\\n\\n{mesaj}\\n\\n— {gonderen_ad}`
    Başarılıysa admin'e "✅ Duyuru gruba gönderildi." döner; başarısız
    olursa Telegram'ın döndüğü tam hata metnini iletir (debug için).
    """
    u = await _require_admin(update)
    if not u:
        return
    if not context.args:
        await reply_ml(update, "Kullanım: `/duyuru <mesaj>`")
        return
    msg = " ".join(context.args).strip()
    if not msg:
        await reply_ml(update, "Kullanım: `/duyuru <mesaj>`")
        return

    sender_name = (
        u.get("username")
        or (update.effective_user.first_name if update.effective_user else None)
        or "Yönetici"
    )
    formatted = (
        f"📢 *TiTaNXiS Duyurusu*\n\n"
        f"{msg}\n\n"
        f"— {sender_name}"
    )

    log.info(f"/duyuru admin={sender_name} → group={TITANXIS_GROUP_CHAT_ID} msg={msg[:80]!r}")

    # Doğrudan Telegram sendMessage — hata olursa description'ı yakala.
    reply_text = "❌ Bilinmeyen hata"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{TELEGRAM_API}/sendMessage",
                json={
                    "chat_id": TITANXIS_GROUP_CHAT_ID,
                    "text": formatted,
                    "parse_mode": "Markdown",
                },
            )
            data = r.json() if r.content else {}
            if data.get("ok"):
                log.info(f"/duyuru delivered to group chat_id={TITANXIS_GROUP_CHAT_ID}")
                reply_text = "✅ Duyuru gruba gönderildi."
            else:
                desc = data.get("description") or "unknown"
                code = data.get("error_code")
                log.warning(f"/duyuru FAILED chat_id={TITANXIS_GROUP_CHAT_ID} code={code} desc={desc}")
                reply_text = (
                    f"❌ Duyuru gönderilemedi.\n"
                    f"Chat ID: `{TITANXIS_GROUP_CHAT_ID}`\n"
                    f"Hata ({code}): {desc}\n\n"
                    f"Bot'un grupta admin olduğundan emin ol."
                )
    except Exception as e:
        log.warning(f"/duyuru exception: {e}")
        reply_text = f"❌ Hata: {e}"

    try:
        await reply_ml(update, reply_text)
    except Exception as e:
        log.warning(f"/duyuru final reply failed: {e}")


async def uyar_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if len(args) < 2:
        await reply_ml(update, "Kullanım: `/uyar @kullanici <sebep>`")
        return
    handle = args[0].lstrip("@")
    reason = " ".join(args[1:])
    target = await _db.users.find_one({"username": handle}, {"_id": 0})
    if not target:
        await reply_ml(update, f"❌ @{handle} bulunamadı.")
        return
    await _db.warnings.insert_one({
        "user_id": target["id"], "reason": reason,
        "issued_by": u["id"], "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if target.get("telegram_chat_id"):
        await send_message(target["telegram_chat_id"], f"⚠️ *Uyarı aldın*\n\nSebep: {reason}")
    await reply_ml(update, f"⚠️ @{handle} uyarıldı.")


async def rapor_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    new_users = await _db.users.count_documents({"created_at": {"$gte": week_ago}})
    new_events = await _db.events.count_documents({"created_at": {"$gte": week_ago}})
    new_points = await _db.points.count_documents({"created_at": {"$gte": week_ago}} if False else {})
    week_score = 0
    async for r in _db.points.aggregate([
        {"$match": {"created_at": {"$gte": week_ago}}},
        {"$group": {"_id": None, "s": {"$sum": "$points"}}},
    ]):
        week_score = int(r.get("s") or 0)
    await reply_ml(update,
        f"📊 *Haftalık Rapor*\n\n"
        f"👥 Yeni üye: `{new_users}`\n"
        f"📅 Yeni etkinlik: `{new_events}`\n"
        f"🏆 Bu hafta puan: `{week_score:,}`\n\n"
        f"🌐 Detay: [{WEB_BASE}/raporlar]({WEB_BASE}/raporlar)"
    )


async def uyeler_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    cnt = await _db.members.count_documents({})
    top = await _db.members.find({}, {"_id": 0, "name": 1, "alliance_name": 1, "bireysel_guc": 1}).sort("bireysel_guc", -1).limit(20).to_list(20)
    lines = [f"👥 *Aktif Üye Listesi (Top 20 / {cnt})*\n"]
    for i, m in enumerate(top, 1):
        lines.append(f"{i}. *{m.get('name','?')}* [{m.get('alliance_name','-')}] — `{int(m.get('bireysel_guc') or 0):,}`")
    lines.append(f"\n🌐 Tam liste: [{WEB_BASE}/uyeler]({WEB_BASE}/uyeler)")
    await reply_ml(update, "\n".join(lines))


async def ekle_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if not args:
        await reply_ml(update, "Kullanım: `/ekle @kullanici` — yeni üye oluşturur (GOW default).")
        return
    name = args[0].lstrip("@")
    import uuid
    m = {
        "id": str(uuid.uuid4()), "name": name, "rank": "S1", "level": 1,
        "alliance_name": "GOW", "bireysel_guc": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db.members.insert_one(m)
    await reply_ml(update, f"✅ Üye eklendi: *{name}* (GOW)")


async def cikar_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if not args:
        await reply_ml(update, "Kullanım: `/cikar @kullanici`")
        return
    m = await _member_by_query(args[0])
    if not m:
        await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
        return
    await _db.members.delete_one({"id": m["id"]})
    await reply_ml(update, f"🗑 Üye çıkarıldı: *{m.get('name','?')}*")


async def puan_ekle_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if len(args) < 2:
        await reply_ml(update, "Kullanım: `/puan_ekle @kullanici <miktar>`")
        return
    m = await _member_by_query(args[0])
    if not m:
        await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
        return
    try:
        amt = int(args[1])
    except ValueError:
        await reply_ml(update, "❌ Geçersiz miktar.")
        return
    # Manuel puan → adhoc event olmadan direkt points'e yazamıyoruz;
    # basit çözüm: son aktif etkinliği bul
    ev = await _db.events.find_one({"archived": {"$ne": True}}, {"_id": 0}, sort=[("date", -1)])
    if not ev:
        await reply_ml(update, "❌ Aktif etkinlik yok — puan yazılamadı.")
        return
    import uuid
    await _db.points.insert_one({
        "id": str(uuid.uuid4()), "event_id": ev["id"], "member_id": m["id"],
        "points": amt, "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": u["id"], "manual": True,
    })
    await reply_ml(update, f"✅ *{m['name']}* → `{amt:,}` puan eklendi ({ev.get('name','?')})")


async def rozet_ver_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if len(args) < 2:
        await reply_ml(update, "Kullanım: `/rozet_ver @kullanici <rozet_adi>`")
        return
    m = await _member_by_query(args[0])
    if not m:
        await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
        return
    badge = " ".join(args[1:])[:60]
    await _db.custom_badges.insert_one({
        "member_id": m["id"], "badge": badge,
        "granted_by": u["id"], "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await reply_ml(update, f"🏅 *{m['name']}* → *{badge}* rozeti verildi.")


async def etkinlik_iptal_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    args = getattr(context, "args", None) or []
    if not args:
        await reply_ml(update, "Kullanım: `/etkinlik_iptal <etkinlik_id>`")
        return
    ev = await _db.events.find_one({"id": {"$regex": f"^{args[0]}"}}, {"_id": 0})
    if not ev:
        await reply_ml(update, f"❌ '{args[0]}' bulunamadı.")
        return
    await _db.events.update_one({"id": ev["id"]},
        {"$set": {"archived": True, "cancelled": True,
                  "cancelled_at": datetime.now(timezone.utc).isoformat()}})
    await reply_ml(update, f"🚫 *{ev.get('name','?')}* iptal edildi (arşive taşındı).")


async def etkinlik_ekle_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    await reply_ml(update,
        f"➕ *Hızlı Etkinlik Oluştur*\n\n"
        f"Etkinlikler karmaşık konfigürasyon gerektirdiği için web arayüzünden ekle:\n"
        f"[{WEB_BASE}/etkinlikler]({WEB_BASE}/etkinlikler)\n\n"
        f"Basit alanlar: Ad, tarih, çarpan, grup, otomatik arşiv, minimum puan eşiği.")


async def esik_uyari_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    u = await _require_admin(update)
    if not u: return
    events = await _db.events.find({
        "archived": {"$ne": True},
        "$or": [{"alliance_thresholds": {"$exists": True, "$not": {"$size": 0}}},
                {"member_thresholds": {"$exists": True, "$not": {"$size": 0}}}],
    }, {"_id": 0}).sort("date", -1).limit(20).to_list(20)
    if not events:
        await reply_ml(update, "📊 Eşik kuralı olan aktif etkinlik yok.")
        return
    lines = ["📊 *Minimum Puan Eşiği Uyarıları*\n"]
    for e in events:
        at = len(e.get("alliance_thresholds") or [])
        mt = len(e.get("member_thresholds") or [])
        lines.append(f"• *{e.get('name','?')}* — grup:`{at}` özel:`{mt}` · `{e.get('id','')[:8]}`")
    await reply_ml(update, "\n".join(lines))


async def toplu_duyuru_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Alias for /duyuru — kept as a separate command per user request."""
    await duyuru_command(update, context)


# --------------------------- /yardim v133 (rebuild) -----------------------
async def yardim_command(update: Update, _: ContextTypes.DEFAULT_TYPE):
    text = (
        "📖 *TiTaNXiS Bot Komutları*\n\n"
        "*GENEL:*\n"
        "/siralama, /siralama top10, /puan, /puan @kul\n"
        "/karsilastir @a @b, /profil, /profil @kul\n"
        "/etkinlik, /etkinlikler, /yakinda, /takvim, /arsiv\n"
        "/katil <id>, /katilmiyorum <id>, /hatirlatici <id>\n"
        "/rozet, /istatistik, /streak, /online, /lonca\n"
        "/bildirimler ac/kapat, /mola <gun>, /davet\n"
        "/dil tr|en|de, /sifremi_sifirla, /geri_bildirim <msg>\n"
        "/link <kod>, /unlink, /hakkinda, /yardim\n\n"
        "*ADMIN:*\n"
        "/duyuru, /toplu_duyuru, /uyar @kul <sebep>\n"
        "/rapor, /uyeler, /ekle @kul, /cikar @kul\n"
        "/puan_ekle @kul <n>, /rozet_ver @kul <ad>\n"
        "/etkinlik_ekle, /etkinlik_iptal <id>, /esik_uyari\n\n"
        f"🌐 [{WEB_BASE}]({WEB_BASE}) — Tam yönetim paneli"
    )
    await reply_ml(update, text)


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
    v134.7 — Attaches an inline "📅 Takvime Ekle" button that opens Google
    Calendar's event-create URL (mobil + web'de aynı deep-link)."""
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if not channel:
        return False

    # v135.22 — Parse date first so the message body can display Turkey time
    # (UTC+3) alongside the ISO date. Same parsed `dt` is reused later for the
    # Google Calendar deep-link.
    from urllib.parse import quote_plus
    import re as _re
    _time_known = True
    try:
        dt = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
    except Exception:
        # Fallback: date-only "YYYY-MM-DD" → 00:00 UTC, hide time in message.
        digits = _re.sub(r"\D", "", (event_date or "")[:10])[:8] or "20260101"
        dt = datetime.strptime(digits, "%Y%m%d").replace(tzinfo=timezone.utc)
        _time_known = False
    tr_tz = timezone(timedelta(hours=3))
    dt_tr = dt.astimezone(tr_tz)
    date_line = (
        f"🗓 Tarih: `{dt_tr.strftime('%Y-%m-%d %H:%M')} (TR)`"
        if _time_known else f"🗓 Tarih: `{dt_tr.strftime('%Y-%m-%d')}`"
    )
    lines = [
        "🎉 *Yeni Etkinlik!*",
        "",
        f"📅 *{event_name}*",
        date_line,
        f"📊 Grup: {group_name}",
        f"⚡ Çarpan: ×{multiplier}",
    ]
    base = (os.environ.get("PUBLIC_BASE_URL", "") or "https://titanxis.com").rstrip("/")
    if event_id:
        lines.append(f"\n🔗 [Etkinliğe Katıl]({base}/etkinlikler#event-{event_id})")

    # Google Calendar deep-link: dates=YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ
    end = dt + timedelta(hours=1)
    dates = f"{dt.strftime('%Y%m%dT%H%M%SZ')}/{end.strftime('%Y%m%dT%H%M%SZ')}"
    gcal = (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote_plus(event_name)}"
        f"&dates={dates}"
        f"&details={quote_plus(f'{group_name} · x{multiplier} · {base}/etkinlikler')}"
    )
    reply_markup = {
        "inline_keyboard": [[
            {"text": "📅 Takvime Ekle", "url": gcal},
        ]]
    }
    return await send_message(channel, "\n".join(lines), reply_markup=reply_markup)


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
