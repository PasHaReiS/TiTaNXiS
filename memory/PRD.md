# TiTaNXiS — Gaming Guild Management (oyun-loncasi)

## Original Problem Statement
Build and extend a full-stack Gaming Guild Management App. Advanced 29-language i18n via DeepL, complex Leaderboard, Web Push, Premium Admin Dashboard, VIP Support tickets, and deep Telegram Bot / Object Storage integrations. **User language: Turkish** (respond in TR).

## Tech Stack
- React 19 (CRA) + Tailwind + shadcn/ui + i18next + react-image-crop
- FastAPI + Motor (MongoDB)
- Telegram Bot API (webhooks, inline keyboards, callback queries)
- DeepL API (Free tier — `:fx`)
- Web Push (VAPID, pywebpush)
- Emergent Object Storage for image uploads
- Resend (weekly digest email)

## Users
- **Admin** (`admin` / `Admin123`) — full control
- **Editor** (`pasha` / `pasha123`) — content edit, no user mgmt
- **Members** — leaderboard viewers, some link Telegram for event DMs

## What's Implemented
- 29-language i18n with DeepL bulk translate + on-the-fly DM translation
- Leaderboard, Commanders, Points, Events, Members CRUD
- OCR (OpenAI Vision) for member list + event score screenshots
- **NEW (Feb 2026)**: OCR **Preview Cropping** — every uploaded thumbnail has a Scissors button that opens `CropDialog.jsx` (react-image-crop). Users trim edges/ads/UI chrome before sending to `/ocr/parse`. Cropped images get a gold "KIRP" badge. Reduces token cost + boosts recognition accuracy.
- Web Push (VAPID) + scheduled broadcasts w/ recurrence
- Telegram fan-out on scheduled push: channel + DM (linked users + `/start` fallback)
- Inline ✅/❌ attendance callbacks + auto-chase cron
- Event Screenshot Gallery (Object Storage)
- Telegram diagnostic panel + manual chat ID link
- Header dil menüsü + DeepL bulk translate modal
- Open Graph / SEO meta tags
- **NEW (Feb 2026)**: DM auto-translate on scheduled push — recipient's `preferred_language` triggers per-user DeepL translation of the DM body. UI dil değişikliği artık `preferred_language`'ı DB'ye yazıyor (`POST /api/auth/preferred-language`), `auth/me` alanı geri döndürüyor, refresh sonrası UI hydrate ediyor. Indentation bug fixed (`_telegram_forward_scheduled` no longer crashes on `send_dm=False`).

## Backlog
- **P1**: `server.py` refactor — extract `events`, `calc`, `deepl` routes into `/app/backend/routes/`
- **P3**: Discord Webhook Mirror for push broadcasts
- **P3**: OpenAI TTS Voice Notifications for Telegram DMs
- **P3**: Member / Event Point CSV Export
- **P3**: VIP Trash role-based visibility (editors → own deletions only)
- **P3**: Weekly Telegram DM health-check cron (detect dead chat_ids like Selim's)

## Known Ops Notes
- Selim (`chat_id=5528595771`) has a stale chat_id — Telegram returns `chat not found`. Needs `/start` again or manual cleanup.
- DeepL usage: 220K / 1M chars (22%), resets 2026-09-01.
- Preview ≠ Prod: every fix must be Deployed via "Save to GitHub → Deploy" before user sees it live.

## Key Files
- `/app/backend/server.py` — huge, needs refactor. `_telegram_forward_scheduled` at line 3363.
- `/app/backend/auth.py` — auth + preferred_language endpoint (line 332), `public_user()` now exposes `preferred_language` + `telegram_chat_id`.
- `/app/backend/telegram_bot.py` — send_message w/ HTTP-level logging
- `/app/backend/routes/push.py`, `/app/backend/routes/cron.py`
- `/app/frontend/src/components/CropDialog.jsx` — NEW: react-image-crop wrapper, canvas → File.
- `/app/frontend/src/components/OcrDialog.jsx` — Scissors button per thumb, replaces `previews[i]` with cropped File.
- `/app/frontend/src/components/LanguageSwitcher.jsx` — persists preferred_language on switch.
- `/app/frontend/src/App.js` — AppShell hydrates i18n from user.preferred_language.
