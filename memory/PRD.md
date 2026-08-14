# PRD — TiTaNXiS Gaming Guild Management

## Original Problem Statement
Full-stack Gaming Guild Management App ("TiTaNXiS" / "oyun-loncasi"): Leaderboard, Commanders, Points, Members grouped by alliances, Events. 29-language i18n (DeepL), Premium Admin Dashboard (recharts), VIP Support tickets, Web Push (VAPID), Telegram Bot (Login Widget), Object Storage, OCR (OpenAI Vision), Interactive world map, Country/Alliance/Group notification fan-out.

## User Preferences (Locked)
- Language: **Turkish**
- Theme: Midnight Red dark
- Auth: JWT + Telegram Login Widget

## Tech Stack
- Frontend: React + react-i18next + SWR + Tailwind + Shadcn/ui + lucide-react + react-simple-maps + recharts
- Backend: FastAPI + Motor (MongoDB) + JWT (PyJWT) + python-telegram-bot + pywebpush
- Integrations: OpenAI GPT-4o Vision (Emergent LLM Key), DeepL API, Telegram Bot API, Web Push (VAPID), Emergent Object Storage

---

## [2026-02-14] Reminder Tabs + Test Button + Sound Preview + Countdown — DONE ✅
- **Event schema**: `reminder_enabled: bool = True` (Event, EventCreate, EventUpdate).
- **Events page**: 3 tabs (Hatırlatmalı / Hatırlatmasız / Arşiv) — Puanlar sayfası tarzında.
- **EventForm**: mor `reminder_enabled` checkbox + açıklama; new events default reminded, existing rows without the field also treated as reminded (frontend `!== false`).
- **Live Countdown** (`EventCountdown.jsx`): her etkinlik kartında canlı sayaç, 60dk kalınca sarı, 10dk kalınca kırmızı+pulse.
- **Test button** in EventNotificationsPanel: `POST /api/push/test` → çoklu-kanal sanity check (Kanal + DM + Push). E2E: `telegram_channel_sent: true`.
- **Sound preview** in EventReminderDialog: rally/victory/dungeon/alarm için ▶ dinle butonları (existing `pushSound.js` reuse).
- Verified: 420px mobile screenshots — both tabs render, countdown tick, katılım list under card.

## [2026-02-14] Multi-Channel Scheduled Push Fan-out + Analytics Badge — DONE ✅
- `_broadcast_push` scheduler crash fix (accepts `country_iso2` + `event_id` kwargs).
- `_telegram_forward_scheduled()`: her scheduled push için otomatik Telegram kanal + attending members DM forward (Login Widget + username_map fallback).
- `PushScheduledBody.send_channel` + `send_dm` bayrakları (default True).
- `GET /push/scheduled?include_sent=true` — history merge ile `push_sent`, `telegram_channel_sent`, `telegram_dm_sent` döner.
- `EventNotificationsPanel` fired reminders'ta compact badge: `✈️✓/— · 📩N · 🔔N`.

## [2026-02-14] Event Notifications Dedicated Page — DONE
- `/etkinlik-bildirimleri` route (RequireAdminOrEditor) + Header dropdown menüde 🔔 Dashboard ↔ VIP Destek arasında.
- `EventNotificationsPanel` mor tema, per-event Bildirim Kur + snooze + delete.

## [2026-02-14] Direct DM via Telegram Username Fallback — DONE
- `Member.telegram_username` + normalization + audit.
- `POST /telegram/webhook`: `telegram_chat_map` upsert (username → chat_id).
- `POST /telegram/broadcast`: username fallback + `username_dm_hits` metric.
- `GET /telegram/username-status?usernames=` — UI badge helper.

## [2026-02-14] Attendance List Layout Fix — DONE
- `EventAttendance.jsx`: `open = true` default.
- `Events.jsx`: card `flex-row` → `flex-col` — attendance panel tam-genişlik kartın altında.

---

## Backlog / Roadmap

### P1 — Server.py Refactoring
- Extract `events`, `attendance`, `points` route groups from `server.py` (~3920 lines) into `routes/*.py`.

### P2 — Deferred User Requests
- **Katılım Onayı 1-Tıklık DM Butonları**: DM içinde inline "✅ Katılıyorum / ❌ Katılamam / ⏰ Belki" — attendance otomatik güncelle.
- **Etkinlik Sonucu Ekran Görüntüsü Arşivi**: event'e post-hoc screenshot upload, member badge'i.

### Future / Nice-to-have
- Discord Webhook Mirror.
- OpenAI TTS voice DM notifications.
- Member/Event Point CSV Export.
- VIP Trash Role-Based Visibility.
- Preferred-language DeepL translation of scheduled push before delivery (currently only broadcast_push in routes/push.py translates).

## Test Credentials
See `/app/memory/test_credentials.md`.
