# PRD — TiTaNXiS Gaming Guild Management

## Original Problem Statement
Full-stack Gaming Guild Management App ("TiTaNXiS" / "oyun-loncasi"). Leaderboard, Commanders, Points, Members grouped by alliances, Events with 29-language i18n, Premium Admin Dashboard, VIP Support, Web Push, Telegram Bot (Login Widget), OCR (OpenAI Vision), Object Storage, interactive world map, country/alliance/group notification fan-out.

## User Preferences (Locked)
- Language: **Turkish**
- Theme: Midnight Red dark
- Auth: JWT + Telegram Login Widget

---

## [2026-02-14] Tabs Polish + Notif Filter + Attendance Default View — DONE ✅

### 1. Events Page 3-Tab Fantasy Style
- Full-width segmented control (flex ratios 42/38/20).
- **Hatırlatmalı**: 42% width, active state uses orange-gold gradient (`rgba(217,119,6,0.35)→rgba(180,83,9,0.55)`) with 2px `#F59E0B` inset border + 14px outer glow `rgba(245,158,11,0.55)` — mimics fiery guild-hall stone panel from reference image. Bell icon `#FCD34D`.
- **Hatırlatmasız**: 38% width, subtle blue-purple gradient when active, BellOff icon.
- **Arşiv**: 20% narrower width, minimal grey chip, Archive icon.
- Verified: mobile 420px screenshot — 42%/38%/20% ratios exact.

### 2. Etkinlik Bildirimleri Filter
- `EventNotificationsPanel.activeEvents` computation: added `e.reminder_enabled !== false` filter — silent events never surface in the scheduler UI.
- Verified: Sessiz Etkinlik hidden, only Kristal shown.

### 3. EventAttendance Default View
- Filter logic: no search query → show ONLY `attendedSet` members; typed query → unlock full roster.
- Reduces default noise on Kristal event card from 254 rows → 5 attended, admins can still `Ara` field to add unattended members.

---

## Prior Feature Timeline (most recent first)

- **Auto-Chase Cron + Callback UX**: `/api/cron/attendance-chase` every 15 min DMs unmarked members for events 20-24h away; callback UX rewrites DM with "Cevaplandı" state.
- **Screenshot Archive + 1-Tap Attendance**: `result_screenshots` field + gallery, inline ✅/❌ buttons + webhook callback handler.
- **Reminder Tabs + Test Button + Sound Preview + Countdown**: `reminder_enabled`, EventCountdown.jsx, `/push/test`, sound preview.
- **Scheduler Crash Fix + Multi-Channel Fan-out**: `_broadcast_push` kwargs, `_telegram_forward_scheduled`, analytics badge.
- **Direct DM via `telegram_username` fallback**: `telegram_chat_map`, `/username-status`.
- **Event Notifications dedicated page** at `/etkinlik-bildirimleri`.

## Backlog

### P1
- Extract `events`, `attendance`, `points`, `cron` routes from `server.py` (~4260 lines).

### P2
- Attendance MAYBE state (⏰ Belki third button).
- Screenshot OCR autofill (Vision-parse rank captures).
- Discord Webhook Mirror.
- OpenAI TTS voice DM notifications.
- Member/Event Point CSV Export.

## Test Credentials
See `/app/memory/test_credentials.md`.
