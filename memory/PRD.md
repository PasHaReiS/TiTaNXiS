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

## [2026-02-14] Scheduler Crash Fix + Multi-Channel Reminder Fan-out — DONE ✅

**Kritik Bug**: `_broadcast_push()` `country_iso2` + `event_id` kwargs kabul etmiyordu → 30+ dakika boyunca scheduler her 60s'de çöktü, hiçbir planlı push (Telegram + Web Push) gitmedi.

**Fix**:
1. `server.py::_broadcast_push` signature genişletildi + attendance filter (`event_id`) + country filter (`country_iso2`) eklendi.
2. **YENİ**: `_telegram_forward_scheduled()` — her tetiklenen scheduled push için otomatik Telegram fan-out:
   - `send_channel=true` → `TELEGRAM_CHANNEL_ID`'e broadcast
   - `send_dm=true` + `event_id` → attending members'a DM (Login Widget'la bağlı `telegram_chat_id` + `telegram_username` fallback via `telegram_chat_map`)
3. `PushScheduledBody` model'e `send_channel` + `send_dm` alanları eklendi (default: True).
4. `EventReminderDialog.jsx` UI: "Nereye Gönderilsin?" alt paneli — 2 checkbox (Telegram Kanalı, Katılan Üyelere DM).
5. `push_history` kaydına yeni metrikler: `telegram_channel_sent`, `telegram_dm_sent`.

**Doğrulama (curl E2E)**:
- TG-TEST push 13:41:48'e planlandı → scheduler 13:42:30'da fire etti → `telegram_channel_sent: true` ✅
- Backend log: `sendMessage HTTP/1.1 200 OK` ✅
- Preview'da `push_subscriptions: 0` olduğu için Web Push sent=0 (beklenen — abone yok)

**Neden Önemli**: Web Push alıcı sayısı 0 iken bile kullanıcı Telegram kanalını takip ederek bildirim alabiliyor. Bu 3 kanallı fan-out yaklaşım, bildirimin kesin ulaşmasını garantiler.

## [2026-02-14] Direct DM via Telegram Username Fallback — DONE
- `Member.telegram_username` alanı + audit + normalize
- `POST /telegram/webhook`: chat_map upsert (username → chat_id)
- `POST /telegram/broadcast`: username fallback + `username_dm_hits` + `username_dm_pending`
- `GET /api/telegram/username-status?usernames=a,b,c` — badge için
- Frontend: MemberForm input + `/start` hint

## [2026-02-14] Event Notifications Dedicated Page — DONE
- Yeni route `/etkinlik-bildirimleri` (RequireAdminOrEditor)
- Header dropdown menü: Dashboard ↔ VIP Destek arasında 🔔 BellRing
- `EventNotificationsPanel` mor tema, per-event schedule + delete + snooze
- User Management'tan tamamen kaldırıldı

## [2026-02-14] Attendance List Under Event Card (Mobile Fix) — DONE
- `EventAttendance.jsx`: `open = true` default
- `Events.jsx`: root card `flex-row` → `flex-col` (attendance panel tam-genişlik kartın altında)

---

## Backlog / Roadmap (P0 → P2)

### P1 — Server.py Refactoring
- Extract `events`, `attendance`, `points` route groups from `server.py` (~3900 lines) into `routes/*.py`.
- Extract `deepl` translate helpers into shared `deepl_client.py`.

### P2 — OCR Preview Cropping
- Integrate `react-image-crop` in `OcrDialog.jsx`.

### Future / Nice-to-have
- **Bildirim Analitik Rozeti**: Her planlı hatırlatmaya "gönderildi: N/M · başarı: %K" mini rozeti.
- **Country Filter in Event Reminder Dialog**: 🌍 dropdown — sadece belirli ülkedeki katılımcılara hatırlat.
- **SvS Kombo Preset**: Favori lead kombinasyonlarını (60+30+15dk) tek tıkla uygula.
- **Discord Webhook Mirror**.
- **OpenAI TTS voice notifications** via Telegram.
- **Member/Event Point CSV Export**.
- **VIP Trash Role-Based Visibility**.

## Test Credentials
See `/app/memory/test_credentials.md`.
