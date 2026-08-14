# PRD — TiTaNXiS Gaming Guild Management

## Original Problem Statement
Full-stack Gaming Guild Management App ("TiTaNXiS" / "oyun-loncasi"): Leaderboard, Commanders, Points, Members grouped by alliances, Events. 29-language i18n (DeepL), Premium Admin Dashboard (recharts), VIP Support tickets, Web Push (VAPID), Telegram Bot (Login Widget), Object Storage, OCR (OpenAI Vision), Interactive world map, Country/Alliance/Group notification fan-out.

## User Preferences (Locked)
- Language: **Turkish**
- Theme: Midnight Red dark
- Auth: JWT + Telegram Login Widget

---

## [2026-02-14] Screenshot Archive + 1-Tap Attendance Callback — DONE ✅

### Screenshot Archive (post-event rank/reward gallery)
- **Event model**: `result_screenshots: List[str] = []` field
- **Endpoints**: `POST /events/{id}/screenshots` (idempotent), `DELETE ?url=`
- **Frontend `EventResultGallery.jsx`**: collapsible under each PAST event card, ImageDropzone reuse (`purpose="event"`), 3-col grid, fullscreen preview, edit-gated delete
- **Auto-show**: only on events whose date is in the past
- **E2E verified**: add/duplicate-ignore/second/delete cycle ✅

### 1-Tap Attendance via Telegram Inline Buttons
- **`send_message` extended**: accepts `reply_markup` param
- **`answer_callback_query()` helper**: dismisses loading + shows toast
- **`_telegram_forward_scheduled`**: attaches `✅ Katılıyorum` + `❌ Katılamam` inline keyboard to every event-DM
- **`/telegram/webhook` handler**: intercepts `callback_query` with `att:{action}:{event_id}` pattern
  - Resolves tapper's chat_id → member(s) via `users.telegram_chat_id` OR fallback `members.telegram_username`
  - `att:yes:{event_id}` → upsert `event_attendance` with `source: telegram_dm`
  - `att:no:{event_id}` → delete `event_attendance` row
  - Answers callback with toast: *"✅ 'Etkinlik Adı' için katılım kaydedildi"*
- **E2E verified**: full yes→attendance-inserted, no→attendance-deleted cycle ✅

**Neden Önemli**: Attendance tracking artık **sıfır admin manuel iş** — üye DM'e gelen buton'a tıklar, sistem her şeyi kendi halleder. Screenshot archive lonca hafızasını korur, 6 ay sonra "geçen SvS'te kim ne yapmıştı" bir tık uzakta.

---

## Prior Session Work (chronological)

- **[2026-02-14] Scheduler crash fix + Multi-Channel Fan-out**: `_broadcast_push` kwargs, `_telegram_forward_scheduled`, `PushScheduledBody.send_channel/send_dm`, `push_history` telegram metrics, `GET /push/scheduled?include_sent=true` merge with analytics badge in `EventNotificationsPanel`.
- **[2026-02-14] Reminder tabs + tests + sound preview + countdown**: 3-tab Events page (Hatırlatmalı/Hatırlatmasız/Arşiv), `reminder_enabled` bool, `EventCountdown.jsx` live tick component, `POST /push/test` sanity endpoint, sound preview buttons.
- **Direct DM via `telegram_username` fallback**: member schema field, `telegram_chat_map` upsert on webhook, broadcast fan-out fallback, `/api/telegram/username-status`.
- **Event Notifications dedicated page**: `/etkinlik-bildirimleri` route, header dropdown menu item between Dashboard ↔ VIP Destek.
- **Attendance list layout fix**: `flex-col` card, `open=true` default.

---

## Backlog

### P1 — Server.py Refactoring
- Extract `events`, `attendance`, `points` routes from `server.py` (~4120 lines).

### P2 — Nice-to-have
- **Attendance callback for MAYBE state**: `⏰ Belki` third button + separate state.
- **Callback DM confirmation**: after tap, also edit the original message to strike through the button.
- **Auto-attendance chase**: 24h before event, DM every member NOT yet marked with the "still coming?" prompt.
- **Screenshot OCR autofill**: after uploading a rank screen, use OpenAI Vision to auto-extract top participants.
- **Discord Webhook Mirror**.
- **OpenAI TTS voice DM notifications**.
- **Member/Event Point CSV Export**.

## Test Credentials
See `/app/memory/test_credentials.md`.
