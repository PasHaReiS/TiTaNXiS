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

### Telegram DM auto-translate architecture (Feb 2026 — country-based, RESTORED)
All Telegram **DM** send sites route through `_dm_translate_and_send(chat_id, text, ...)`
at `backend/server.py:~3352`. **Language selection is driven by the linked
Member's `country` field (ISO 3166-1 alpha-2).** A member marked
`country="RU"` receives Russian DMs; `country="BR"` receives Brazilian
Portuguese via DeepL PT-BR; `country="PT"` receives European Portuguese
via PT-PT; `country="TR"` (source) gets the original text without a DeepL
round-trip.

Mapping (`backend/server.py:~3199`, extend as needed):
- Russian family: RU/BY/KZ/KG/TJ/UZ → ru
- German family: DE/AT/CH/LI → de
- English family: US/GB/UK/CA/AU/NZ/IE/IN/ZA/SG/PH → en (DeepL EN-GB)
- French family: FR/BE/LU/MC → fr
- Spanish (incl. LATAM): ES/MX/AR/CO/CL/PE/VE/UY/PY/EC/BO/DO/CR/GT/HN/NI/PA/SV → es
- Italian: IT/SM/VA → it
- Portuguese: PT/AO/MZ → pt (DeepL PT-PT), **BR → pt-br (DeepL PT-BR)**
- Dutch: NL → nl
- Polish: PL → pl
- Ukrainian: UA → uk
- Turkish (source): TR → tr (no translation)
- East Asia: JP → ja, KR → ko, CN/TW/HK/MO → zh
- Scandinavian: SE → sv, DK → da, NO → nb, FI → fi
- Central/Eastern Europe: CZ → cs, SK → sk, SI → sl, HU → hu, RO/MD → ro, BG → bg
- Greek: GR/CY → el
- Baltic: EE → et, LV → lv, LT → lt
- SE Asia: ID → id

`_resolve_dm_lang_for_chat(chat_id) → (lang, country)` walks 3 paths, first match wins:
  A) `users.telegram_chat_id` → `users.member_ids` → `members.country`
  B) `telegram_chat_map.username_lc` → `members.telegram_username` → `members.country`
  C) `telegram_chat_map.username_lc` → `users.telegram_username` → `users.member_ids` → `members.country`

Log grammar (all prefixed `dm_translate`, logger name `telegram`):
- `enter chat=X text_len=N` — every DM attempt
- `resolved chat=X user=... country=RU → lang=ru` — resolution outcome
- `call chat=X ... country=RU lang=ru src_len=N → calling DeepL` — right before DeepL
- `ok chat=X lang=ru src_len=N out_len=M`
- `cache_hit chat=X lang=ru`
- `empty chat=X lang=ru — DeepL API error: ...`
- `skip chat=X lang=ru — DeepL API error: <ExceptionType>: <message>`
- `none chat=X ... — country=TR maps to source language (TR) → sending original text`
- `none chat=X ... — no linked member OR member has no country set → sending original text`
- `sent chat=X country=RU lang=ru translated=bool telegram_ok=bool out_len=M`

### 4-Channel Parallel Notification Engine (Feb 2026)
The scheduler loop dispatches **every** fired scheduled push across 4
independent channels via `asyncio.gather(..., return_exceptions=True)` so
no single slow / failing backend can stall the others:

1. **Web Push** — `_broadcast_push(...)` → browser push via VAPID
2. **Telegram Group** — `_send_tg_channel(doc)` → TELEGRAM_CHANNEL_ID broadcast
3. **Telegram DM** — `_send_tg_dms(doc)` → per-linked-user with country-based DeepL translation
4. **In-App Notifications** — `_broadcast_in_app(doc)` → inserts one `in_app_notifications` row per targeted user

Per-channel failures are logged and coalesced to safe defaults, letting the
scheduler continue. Runtime: 1.4s for 4 recipients (was ~3-4s sequential).
Doc-level flags: `send_push` / `send_channel` / `send_dm` / `send_app` (all default True).

**In-app notifications collection** (`in_app_notifications`):
- Schema: `{id, user_id, title, body, url, event_id, sched_id, created_at, read}`
- Target selection: attending users when `event_id` present, otherwise ALL
  `notification_enabled != False` users. Admins/editors always receive.
- Endpoints:
  - `GET /api/notifications?limit=30` → `{items, unread, total}`
  - `POST /api/notifications/{id}/read` → idempotent mark-read
  - `POST /api/notifications/read-all` → mark all read for current user
- **Frontend bell icon: `NotificationBell.jsx`** at Header'da LanguageSwitcher + DeeplBadge + DeeplDigest'in yanında. 30s SWR polling, kırmızı unread badge (`99+` cap), portal-based dropdown with per-row mark-read + read-all footer button. `data-testid` selectors: `notif-bell-btn`, `notif-bell-badge`, `notif-bell-dropdown`, `notif-bell-item-{id}`, `notif-bell-read-all`, `notif-bell-empty`.

### 4-Channel Parallel Notification Engine (Feb 2026)

**Real-time SSE push** (`GET /api/notifications/stream?token=...`): backend
maintains an in-memory `SSE_NOTIF_SUBSCRIBERS` dict keyed by user_id with a
list of `asyncio.Queue` per open connection. `_broadcast_in_app` publishes
to every matching queue right after the DB insert. The endpoint streams
`event: hello` on connect and `event: notification` per publish, with a
`: keep-alive` comment every 25s to survive proxy timeouts. Auth via query
param since `EventSource` can't set headers. `NotificationBell.jsx` opens
one EventSource on mount, prepends new payloads into the SWR cache, and
lets the browser handle auto-reconnect. The 30s poll stays as a safety
net for missed frames. End-to-end preview test: payload arrived in the
subscriber queue within milliseconds of `insert_many`.

**Country Coverage Widget** (`frontend/src/components/CountryCoverageBadge.jsx`):
Admin-only chip mounted inside `EventNotificationsPanel` header. Polls
`GET /api/admin/country-coverage` every 2 min. Green when 100% covered
and every ISO2 is mapped; amber warning otherwise, showing "%X · N/T
üyenin country'si boş" plus a list of unmapped ISO2 chips. Backend
returns `{total_members, with_country, missing_country, coverage_pct,
per_country, unmapped_countries}`.

**Telegram DM Health Cron** (`POST /api/cron/telegram-dm-health`):
Weekly Sunday 04:00 UTC via `/app/.emergent/crons.yml`. Probes every
`users.telegram_chat_id` + `telegram_chat_map.chat_id` via Telegram's
`getChat` API. Dead chat_ids (400 "chat not found" / 403 "bot blocked" /
"user deactivated") get `telegram_dead_since` + `telegram_dead_reason`
flagged. Revived ids clear the flag automatically. Rate-limited to
~20 req/s. Returns `{users_checked, chat_map_checked, newly_dead_users,
newly_dead_chat_map, already_dead, revived, alive}`.

Every scheduled push + test push now returns a `telegram_dm_langs` breakdown
alongside `telegram_dm_sent` / `telegram_dm_translated`. The map has the
shape `{"ru": 3, "pt-br": 2, "en": 5, "src": 1}` — `"src"` bucket counts
recipients on the source language (TR) that received the original text
without translation. Increments only fire on **successful** Telegram
delivery so the widget reflects actual reach, not attempted sends.

Persisted to `push_history.telegram_dm_langs` by the scheduler loop; exposed
via `GET /api/push/scheduled` for each fired doc, and via `POST /api/push/test`
JSON response.

Frontend `AnalyticsBadge` at `EventNotificationsPanel.jsx:~128` renders it
as inline chips: `✈️✓ · 📩5 · 🔔12 · 🌐4 · ru:2 · pt-br:1 · en:1`. The
🌐N chip = auto-translated count (amber-tinted); the per-lang chips are
blue-tinted and sorted by descending recipient count, capped at 6 for
mobile. The runTest toast summary shares the same format so admins see
"Kanal:✓ · DM:5/5 · Push:12 · 🌐4 (ru:2 pt-br:1 en:1)" after every test.

**Test verification (preview, Feb 2026, mocked Telegram delivery)**:
5 recipients across RU/DE/EN/TR + 1 unrelated selim record → stats
returned `dm_lang_breakdown={ru:2, de:1, en:1, src:2}`, `dm_sent=6`,
`dm_translated=4`. Cache dedup verified: RU-2 hit cache instead of a
second DeepL call. Test data automatically cleaned up.

Channel broadcasts (TELEGRAM_CHANNEL_ID) stay in source Turkish — the
channel is shared across all languages.

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

## Events page — Gruplu/Grupsuz 2-Column Split (Feb 15, 2026)
`/etkinlikler` (`Events.jsx`) now separates events into two side-by-side
columns via a responsive `grid grid-cols-1 lg:grid-cols-2 gap-4` at
`data-testid="events-two-col-grid"`:

- **Left — GRUPLU ETKİNLİKLER** (`events-grouped-column`, amber accent):
  header shows `<N grup> · <M etkinlik>` chip. Renders `renderGroupBlock(group, list)`
  per named group (existing group header + rename/archive/delete + event cards).
  Empty state: `Gruplu etkinlik yok`.

- **Right — GRUPSUZ ETKİNLİKLER** (`events-ungrouped-column`, violet accent):
  flat list of events whose `group_name` is falsy or whitespace-only.
  Uses same `renderEventCard(e, gc, group)` helper as the grouped column.
  Empty state: `Grupsuz etkinlik yok`.

Data split lives in a single `useMemo` (`groupedMap`, `ungrouped`).
Card rendering extracted into `renderEventCard` + `renderGroupBlock` helpers
so both columns share the same JSX and attendance/gallery behaviour.

Verified in preview (Hatırlatmalı + Hatırlatmasız tabs) — screenshots show
clean separation with correct counts and no visual regressions.

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
