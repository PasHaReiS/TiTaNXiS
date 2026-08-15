# TiTaNXiS — Gaming Guild Management (oyun-loncasi)

## Original Problem Statement
Build and extend a full-stack Gaming Guild Management App. Advanced 29-language i18n via DeepL, complex Leaderboard, Web Push, Premium Admin Dashboard, VIP Support tickets, and deep Telegram Bot / Object Storage integrations. **User language: Turkish** (respond in TR).

## Tech Stack
- React 19 (CRA) + Tailwind + shadcn/ui + i18next + react-image-crop
- FastAPI + Motor (MongoDB)
- Telegram Bot API (webhooks, inline keyboards, callback queries)
- DeepL API (Free tier — `:fx`)
- Web Push (VAPID, pywebpush)
- Emergent Object Storage
- Resend (weekly digest email)

## Environments
- **Preview**: `https://oyun-loncasi.preview.emergentagent.com` (dev, agent-writable)
- **Production**: `https://titanxis.com` (live, agent read-only — user must redeploy)

## Users
- **Admin** (`admin` / `Admin123`)
- **Editor** (`pasha` / `pasha123`)

## What's Implemented
- 29-language i18n with DeepL bulk translate + on-the-fly DM translation
- Leaderboard, Commanders, Points, Events, Members CRUD
- OCR (OpenAI Vision) with react-image-crop preview cropping
- Web Push (VAPID) + scheduled broadcasts
- Inline ✅/❌ attendance callbacks + auto-chase cron
- Event Screenshot Gallery
- Telegram diagnostic panel + manual chat ID link
- Open Graph / SEO meta

### Telegram DM auto-translate architecture (Feb 2026 — country-based)
All Telegram **DM** send sites route through `_dm_translate_and_send(chat_id, text, ...)`
at `backend/server.py:~3370`. **Language selection is now driven by the
linked Member's `country` field (ISO 3166-1 alpha-2), not the user's UI
`preferred_language`.** A member marked `country="RU"` always receives
Russian DMs regardless of their profile settings.

Mapping lives in `COUNTRY_TO_LANG` (`backend/server.py:~3198`). Extend as
new countries appear. Current coverage: RU/BY/KZ/KG/TJ/UZ→ru, DE/AT/CH/LI→de,
US/GB/UK/CA/AU/NZ/IE/IN/ZA/SG/PH→en, FR/BE/LU/MC→fr, ES + all LATAM→es,
IT/SM/VA→it, PT/BR/AO/MZ→pt, NL→nl, PL→pl, UA→uk, JP→ja, KR→ko,
CN/TW/HK/MO→zh, SE→sv, DK→da, NO→nb, FI→fi, CZ→cs, SK→sk, SI→sl,
HU→hu, RO/MD→ro, BG→bg, GR/CY→el, EE→et, LV→lv, LT→lt, ID→id, TR→tr (source).

`_resolve_dm_lang_for_chat(chat_id) → (lang, country)` walks 3 paths, first match wins:
  A) `users.telegram_chat_id` → `users.member_ids` → `members.country`
  B) `telegram_chat_map.username_lc` → `members.telegram_username` → `members.country`
  C) `telegram_chat_map.username_lc` → `users.telegram_username` → `users.member_ids` → `members.country`

Returns `(None, country)` when a country is known but maps to TR (source) —
no translation attempted. Returns `(None, None)` when no linked member.

Log grammar (all prefixed `dm_translate`, logger name `telegram`):
- `enter chat=X text_len=N` — every DM attempt
- `resolved chat=X user=... via widget country=RU → lang=ru` — country + lang resolved
- `call chat=X ... country=RU lang=ru src_len=N → calling DeepL` — right before DeepL
- `ok chat=X lang=ru src_len=N out_len=M` — DeepL succeeded
- `cache_hit chat=X lang=ru` — served from per-broadcast cache
- `empty chat=X lang=ru — DeepL API error: no translation returned...`
- `skip chat=X lang=ru — DeepL API error: <ExceptionType>: <message>`
- `none chat=X ... — country=TR maps to TR (source language) → sending original TR text`
- `none chat=X ... — no linked member OR member has no country set → sending original TR text`
- `sent chat=X country=RU lang=ru translated=bool telegram_ok=bool out_len=M`

Channel broadcasts (TELEGRAM_CHANNEL_ID) stay TR — the channel is shared.

**All 5 DM entry points wired to the helper:**
1. `_telegram_forward_scheduled` — scheduled push fan-out (line 3488)
2. `/api/push/test` — admin test button, per-user fan-out (line 3341)
3. `/api/cron/attendance-chase` — 24h-before event reminders (line 4028)
4. `/api/telegram/broadcast` — country-scoped admin broadcast DMs (line 4200)
5. `_telegram_forward_scheduled` (event scheduled) — also uses helper via precomputed_lang optimisation

Channel broadcasts (`TELEGRAM_CHANNEL_ID` sends) are NOT translated — they remain TR because the channel is shared across all languages.

## Backlog
- **P1**: `server.py` refactor — extract `events`, `calc`, `deepl` routes into `/app/backend/routes/`
- **P3**: Discord Webhook Mirror for push broadcasts
- **P3**: OpenAI TTS Voice Notifications for Telegram DMs
- **P3**: Member / Event Point CSV Export
- **P3**: VIP Trash role-based visibility (editors → own deletions only)
- **P3**: Weekly Telegram DM health-check cron (detect dead chat_ids)
- **P3**: Fan-out summary widget in admin panel (X Push / Y DM / Z translated)

## Known Ops Notes
- Selim (`chat_id=5528595771`) — Telegram returns `chat not found`. Needs `/start` again.
- DeepL usage: ~220K / 1M chars (~22%), resets 2026-09-01.
- Preview ≠ Prod: fixes must be Deployed via "Save to GitHub → Deploy".

## Key Files
- `/app/backend/server.py` — helpers at 3193-3341; `_telegram_forward_scheduled` at 3488
- `/app/backend/auth.py` — `preferred-language` endpoint + public_user
- `/app/backend/telegram_bot.py` — send_message w/ HTTP-level logging
- `/app/backend/routes/push.py`, `/app/backend/routes/cron.py`
- `/app/frontend/src/components/CropDialog.jsx` — react-image-crop wrapper
- `/app/frontend/src/components/OcrDialog.jsx` — Scissors button per thumb
- `/app/frontend/src/components/LanguageSwitcher.jsx` — persists preferred_language
- `/app/frontend/src/App.js` — AppShell hydrates i18n from user.preferred_language

## Prod diagnostic playbook
After redeploy, tail `backend.err.log` while triggering a notification:
- Expect `forward_scheduled sched_id=X chat_ids=N chat_lang=M langs=[...]` per scheduled fire
- Expect `dm_translate ok chat=X lang=en src_len=... out_len=...` per non-TR recipient
- If you see `dm_translate none chat=X — TR fallback` for a user you set to EN, then:
  - User's preferred_language was not persisted (check `auth/me` returns non-null pref)
  - OR user's chat_id / handle doesn't match ANY of the 3 resolution paths
