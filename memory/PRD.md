# PRD — TiTaNXiS Gaming Guild Management

## Original Problem Statement
Full-stack Gaming Guild Management App ("TiTaNXiS" / "oyun-loncasi"). Leaderboard, Commanders, Points, Members grouped by alliances, Events with 29-language i18n, Premium Admin Dashboard, VIP Support, Web Push, Telegram Bot (Login Widget), OCR (OpenAI Vision), Object Storage, interactive world map, country/alliance/group notification fan-out.

## User Preferences (Locked)
- Language: **Turkish**
- Theme: Midnight Red dark
- Auth: JWT + Telegram Login Widget

---

## [2026-02-14] Attendance UX + Auto-Chase — DONE ✅

### Callback UX — "Zaten Cevapladın" State
- `telegram_bot.edit_message_text(chat_id, message_id, text, reply_markup)` helper (new)
- After user taps `✅ Katılıyorum` / `❌ Katılamam`:
  1. Insert/delete `event_attendance` (existing behavior)
  2. **`answerCallbackQuery` toast** (existing)
  3. **NEW: rewrite the original DM** with footer *"✅ Cevabın kaydedildi — Katılıyorsun"* (or ❌ variant) and replace inline keyboard with a single collapsed chip: *"✓ Cevaplandı — değiştirmek için admine yaz"*
- `att:noop` handler: user re-taps disabled chip → silent ack *"Zaten cevapladın"*

### Auto-Attendance Chase Cron
- `POST /api/cron/attendance-chase` (X-Cron-Secret guarded)
- Runs **every 15 minutes** via `.emergent/crons.yml` (`*/15 * * * *`)
- Logic:
  1. Find events 20–24h away with `reminder_enabled=true` and NOT yet `attendance_chased_at`
  2. Collect member_ids NOT in `event_attendance` with linked chat_id (Login Widget) OR telegram_username fallback via `telegram_chat_map`
  3. DM each: *"🔔 {event} — {hours_left} saat kaldı. Katılıyor musun?"* + ✅/❌ inline buttons (same callback pattern as reminders)
  4. Stamp `events.attendance_chased_at` to prevent re-chase
- Response reports `events_processed`, `total_dm`, `per_event` breakdown
- E2E verified: cron w/ secret → stamped, 2nd run → skipped, unlinked members → 0 dm sent as expected

**Neden Önemli**: Katılım gündemi tamamen otomatize oldu. Admin manuel takip etmiyor — 24h sonrasına kadar zaten cevap vermeyen üye otomatik DM alıyor, tek tıkla yanıtlıyor, sistem attendance'ı güncelliyor. Callback UX ile de "yanlış tıkladım, tekrar cevaplayayım mı?" karışıklığı bitiyor.

---

## Prior Session Work (chronological, most recent first)

- **Screenshot Archive + 1-Tap Attendance Callback**: Event `result_screenshots` field + gallery component, inline attendance buttons on scheduled DMs, callback_query webhook handler.
- **Reminder Tabs + Test Button + Sound Preview + Countdown**: 3-tab Events page (Hatırlatmalı/Hatırlatmasız/Arşiv), `reminder_enabled` bool, `EventCountdown.jsx` live tick, `POST /push/test`, sound preview buttons in EventReminderDialog.
- **Scheduler Crash Fix + Multi-Channel Fan-out**: `_broadcast_push` accepts `country_iso2`/`event_id`, `_telegram_forward_scheduled()` adds channel+DM per scheduled push, `PushScheduledBody.send_channel/send_dm`, analytics badge (`push_sent`/`telegram_channel_sent`/`telegram_dm_sent`).
- **Direct DM via `telegram_username` fallback**: Member schema field, `telegram_chat_map` upsert on webhook, broadcast fan-out fallback, `/api/telegram/username-status`.
- **Event Notifications dedicated page**: `/etkinlik-bildirimleri`, header dropdown between Dashboard ↔ VIP Destek.
- **Attendance panel hidden on Hatırlatmasız tab**: conditional render `e.reminder_enabled !== false`.

---

## Backlog

### P1 — Server.py Refactoring
- Extract `events`, `attendance`, `points`, `cron` route groups from `server.py` (~4250 lines).

### P2 — Nice-to-have
- **Attendance MAYBE state**: Third `⏰ Belki` button + separate schema state.
- **Screenshot OCR autofill**: Vision-parse rank captures to auto-populate top participants.
- **Discord Webhook Mirror**.
- **OpenAI TTS voice DM notifications**.
- **Member/Event Point CSV Export**.

## Test Credentials
See `/app/memory/test_credentials.md`.
