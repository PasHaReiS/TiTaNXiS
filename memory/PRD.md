# PRD — TiTaNXiS Gaming Guild Management

## Original Problem Statement
Full-stack Gaming Guild Management App ("TiTaNXiS"). Leaderboard, Commanders, Points, Members, Events, 29-language i18n, Premium Dashboard, VIP Support, Web Push, Telegram Bot, OCR, Object Storage.

## User Preferences (Locked)
- Language: **Turkish**
- Theme: Midnight Red dark

---

## [2026-02-14] Telegram DM Diagnostic Panel — DONE ✅

**Kullanıcı Sorunu**: "Telegram DM bildirimleri gelmiyor" — debug talebi.

**Bulgular** (curl E2E):
- `TELEGRAM_BOT_TOKEN` ✅ set edildi (`8982244615:...`)
- `TELEGRAM_CHANNEL_ID` ✅ set edildi (`-1003597221954`)
- Webhook URL ✅ doğru (`emergent.host/api/telegram/webhook`)
- Test kanalda çalışıyor: `telegram_channel_sent: true` ✅
- **Sorun**: `chat_map_count_global: 0` — hiç kimse `@TiTaNXiS_BoT`'a `/start` atmamış
- **Sonuç**: DM yapılamaz çünkü Telegram Bot API sadece chat_id ile DM gönderir, ilk `/start` mesajı zorunlu

**Fix**: Diagnostic UI paneli — kullanıcı sorunun tam sebebini anında görüyor ve fix'liyor:
- Yeni endpoint `GET /api/telegram/dm-status` — self-user için full teşhis raporu (bot_configured / channel_configured / user_chat_id / chat_map_hit / linked_member_ids / ready_for_dm / next_step)
- `EventNotificationsPanel.jsx` üstünde compact diagnostic card:
  - Ready-for-dm yeşil / not-ready sarı uyarı
  - 4 rozet: BOT / KANAL / LOGIN / /START (✓ veya —)
  - Human-readable next step açıklama satırı
  - Ready değilse "@TiTaNXiS_BoT'a /start at" tek-tık dış link (t.me deep-link)

**Bu Bir Bug DEĞİL — Telegram Politika Constraint'i**: Kullanıcı bot ile ilk temasa geçmeden bot ona DM yollayamaz. UI artık bu constraint'i kullanıcıya net şekilde iletiyor.

## Prior Session Timeline (chronological)

- **JPEG background tabs**: fantasy stone tab wrapper on Events page (42/38/20 ratio) with JPEG background-image + transparent overlay buttons.
- **Fantasy 3-Tab Style + Notif Filter + Attendance Default**: 3-tab pill (orange-gold/blue-purple/gray), Etkinlik Bildirimleri filters out unreminded events, EventAttendance default shows only attended.
- **Auto-Chase Cron + Callback UX**: `/api/cron/attendance-chase` every 15 min, DM rewrite with "Cevaplandı" state.
- **Screenshot Archive + 1-Tap Attendance**: `result_screenshots` gallery, inline ✅/❌ buttons + webhook callback.
- **Reminder Tabs + Test + Sound Preview + Countdown**: `reminder_enabled`, EventCountdown, `/push/test`, sound preview.
- **Scheduler Fix + Multi-Channel Fan-out + Analytics Badge**.
- **Direct DM via `telegram_username` fallback** with `telegram_chat_map`.
- **Event Notifications dedicated page** at `/etkinlik-bildirimleri`.

## Backlog

### P1
- Extract `events`, `attendance`, `points`, `cron` routes from `server.py` (~4300 lines).

### P2
- Attendance MAYBE state.
- Screenshot OCR autofill.
- Discord Webhook Mirror.
- OpenAI TTS voice DM.
- Point CSV Export.

## Test Credentials
See `/app/memory/test_credentials.md`.
