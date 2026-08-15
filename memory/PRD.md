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

## Environments
- **Preview**: `https://oyun-loncasi.preview.emergentagent.com` (dev, agent-writable)
- **Production**: `https://titanxis.com` (live, agent read-only — user must redeploy for changes)

## Users
- **Admin** (`admin` / `Admin123`) — full control
- **Editor** (`pasha` / `pasha123`) — content edit, no user mgmt
- **Members** — leaderboard viewers, some link Telegram for event DMs

## What's Implemented
- 29-language i18n with DeepL bulk translate + on-the-fly DM translation
- Leaderboard, Commanders, Points, Events, Members CRUD
- OCR (OpenAI Vision) for member list + event score screenshots
- **Feb 2026**: OCR **Preview Cropping** via `CropDialog.jsx` (react-image-crop) with Scissors button + "KIRP" badge on every thumbnail
- Web Push (VAPID) + scheduled broadcasts w/ recurrence
- Telegram fan-out on scheduled push: channel + DM (linked users + `/start` fallback via chat_map)
- Inline ✅/❌ attendance callbacks + auto-chase cron
- Event Screenshot Gallery (Object Storage)
- Telegram diagnostic panel + manual chat ID link
- Header dil menüsü + DeepL bulk translate modal
- Open Graph / SEO meta tags
- **Feb 2026 (critical fix)**: DM auto-translate on scheduled push. Full chain now works:
  1. UI dil menüsünden değişim → `POST /api/auth/preferred-language` DB'ye yazıyor
  2. `auth/me` yanıtı `preferred_language`'ı döndürüyor → AppShell login'de i18n'i hydrate ediyor
  3. `_telegram_forward_scheduled` her iki yolu da izler: (a) `users.telegram_chat_id` (Widget), (b) `telegram_chat_map` (`/start`) → `members.telegram_username` → `users.member_ids` → `preferred_language`
  4. Trace log: `forward_scheduled sched_id=X chat_ids=N chat_lang=M langs=[...]`
  5. Her başarılı çeviri log'lanıyor: `auto-translate ok chat=X lang=Y src_len=N out_len=M`
  6. `push_history` dokümanına `telegram_dm_translated` sayacı ekleniyor

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
- `/app/backend/server.py` — `_telegram_forward_scheduled` at line 3363 (now has trace logging + inline chat_lang build)
- `/app/backend/auth.py` — auth + preferred_language endpoint (line 332), `public_user()` exposes `preferred_language` + `telegram_chat_id`
- `/app/backend/telegram_bot.py` — send_message w/ HTTP-level logging
- `/app/backend/routes/push.py`, `/app/backend/routes/cron.py`
- `/app/frontend/src/components/CropDialog.jsx` — react-image-crop wrapper (NEW)
- `/app/frontend/src/components/OcrDialog.jsx` — Scissors button per thumb
- `/app/frontend/src/components/LanguageSwitcher.jsx` — persists preferred_language on switch
- `/app/frontend/src/App.js` — AppShell hydrates i18n from user.preferred_language

## Diagnostics — how to trace DM auto-translation in prod
After deploy, admin can watch `backend.err.log` for these lines:
- `forward_scheduled sched_id=X chat_ids=N chat_lang=M langs=[...]` — if `chat_lang=0` no user has preferred_language matching a linked chat_id
- `auto-translate ok chat=X lang=en src_len=73 out_len=75` — DeepL succeeded
- `auto-translate empty chat=X lang=Y — DeepL returned no text` — API responded but translation empty
- `auto-translate skip chat=X lang=Y: <err>` — DeepL threw (network/quota)
