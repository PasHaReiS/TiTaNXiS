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
- Selim's login username is **`selim@titanxis.com`** (not bare `selim`). Typing bare `selim` never matches → 401 → 8 fails → 15-min brute-force lock on the `selim` bucket. Feb 15 2026: cleared and admin unlock endpoint added.
- DeepL usage: ~220K / 1M chars (~22%), resets 2026-09-01.
- Preview ≠ Prod: fixes must be Deployed via "Save to GitHub → Deploy".

## Admin unlock endpoint (Feb 15, 2026)
`POST /api/auth/unlock-user` (admin-only, body `{"username": "..."}`).
Case-insensitive: `selim`, `Selim`, `selim@titanxis.com` all resolve to the
same lockout bucket. Wipes:
1. `login_attempts` rows matching the lowercased username exactly
2. `login_attempts` rows matching the case-insensitive regex (variants)
3. `users` doc `$unset` of any legacy lockout fields (`failed_login_attempts`,
   `locked_until`, `lockout_until`, `login_locked`, `brute_force_locked_until`)
Response: `{ok, username, failed_attempts_cleared, user_docs_touched, matched_users}`.
Post-deploy usage from admin console:
```
curl -X POST $API/api/auth/unlock-user -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "Content-Type: application/json" -d '{"username":"selim"}'
```

## Events page — Gruplu/Grupsuz 2-Column Split (Feb 15, 2026)
`/etkinlikler` (`Events.jsx`) now separates events into two side-by-side

## Mobile safe-area (iPhone notch / dynamic island / home indicator) — Feb 15, 2026
- `public/index.html` viewport meta now includes `viewport-fit=cover` (required
  to expose `env(safe-area-inset-*)` on iOS). Combined with the existing
  `apple-mobile-web-app-status-bar-style: black-translucent` this means the
  page paints edge-to-edge and every fixed/sticky bar must pad itself.
- `components/Header.jsx` sticky wrapper: `padding-top: max(8px, env(safe-area-inset-top))`
  plus L/R safe-area padding for landscape notches. `header-profile-dropdown`
  top anchor is now `calc(60px + env(safe-area-inset-top))` so the menu
  doesn't slip under the dynamic island.
- `index.css .bottom-nav` bottom padding is now `calc(12px + env(safe-area-inset-bottom))`
  so the tab bar sits above the home indicator; L/R padding also opts into
  the horizontal insets.
- Non-notched devices (desktop, Android without gestures, older iPhones)
  resolve `env()` to 0 → visual behaviour unchanged.

columns via a responsive `grid grid-cols-1 lg:grid-cols-2 gap-4` at

## Phase 1+2+3 Refactor — Feb 15, 2026
**Faz 1 (küçük rötuşlar)**:
- MusicButton floating pill: 48×48 → 36×36, icon 22 → 16px, shadow trimmed.
- Announcement list rows: `p-3 → p-2`, gap tightened, thumbnails capped at `max-h-32`, meta text `text-[9px]`. `line-clamp-2` on body for scannable rows.
- "Etkinlik Bildirimleri" → **"Bildirimler"** rename (header dropdown label, page `<Header title>`).

**Faz 2 (Bildirimler hub konsolidasyonu)**:
- `pages/EventNotifications.jsx` rewritten as a tabbed hub with `?tab=events|announcements` query state.
  - Tab 1: `<EventNotificationsPanel/>` (scheduler-driven event reminders)
  - Tab 2: `<Announcements embedded/>` (one-shot broadcast form + history)
  - `data-testid`: `notif-tab-events`, `notif-tab-announcements`, `notif-tab-content-*`.
- `pages/Announcements.jsx` gained `embedded` prop so it renders header-less inside the hub tab. History moved into a collapsible drawer (`announcements-history-toggle`, default closed, `<History>` icon + ChevronDown flip) — each row keeps its `Trash2` delete button (even after archive) so history can be pruned.
- ImageDropzone already integrated (Feb 14) — device pick + URL fallback both supported.

**Faz 3 (Events UI)**:
- Sub-filter chip row (`events-subfilter-bar`) sits UNDER the Hatırlatmalı/Hatırlatmasız/Arşiv tabs with 3 chips (`Tümü`/`Gruplu`/`Grupsuz`, persisted to `localStorage.events_subfilter`). "Grupsuz" or "Gruplu" collapses the layout to one full-width column; "Tümü" keeps the 2-column split.
- Event cards inside every bucket now render in a `grid grid-cols-1 md:grid-cols-2 gap-1.5` — 2-per-row on desktop.
- HTML5 native drag-drop reorder: every card has a `GripVertical` handle, `draggable`, `onDragStart/Over/Drop/End`. Reorder scope is bucket-keyed (`ungrouped` or `group:{name}`) so a card only shuffles inside its own bucket. Order is persisted to `localStorage.events_manual_order_v1` and layered on top of the date sort via `applyManualOrder(list, bucketKey)`.
- `data-testid`: `events-subfilter-{all|grouped|ungrouped}`, `event-drag-handle-{id}`, `event-group-grid-{name}`, `events-ungrouped-grid`.

**Deferred to next iteration**:
- Etkinlik Takvimi (monthly calendar view)
- İki-kolon resizable width split
- Widget panel move
- DeepL weekly report + cache clear button move to Dashboard
- Emoji migration (Lucide → colored emojis) — large scope


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

## Etkinlik Takvimi (Monthly Grid) — Feb 16, 2026
- New component `components/EventCalendar.jsx` — pure presentational monthly
  grid (6 rows × 7 cols, Monday-first for TR locale). Props: `events`,
  `onEventClick`. Uses `groupColor()` to tint event pills by group and shows
  up to 3 pills per cell with a "+N daha" overflow chip.
- Cell click opens a portal-hosted dialog with the full day's events, each
  row shows time / group / multiplier / countdown. Row click bubbles to
  `onEventClick` so the parent can open the edit form.
- Integrated into `pages/Events.jsx` behind a new **Liste / Takvim** view
  toggle above the tab bar (`data-testid="events-view-{list|calendar}"`),
  persisted to `localStorage.events_view`. Calendar view suppresses the
  tab/sub-filter bars and drag-drop list; toggling back restores everything.
- Data source: `allActive` (both reminded + unreminded) so admins see the
  whole active pipeline on one screen; the "Bugün" chip snaps the cursor
  back to today's month.
- Safe-area coexistence verified: on a simulated iPhone 15 Pro (393×852
  with `--sim-top:47px --sim-bottom:34px`), the header still resolves
  `padding-top: 47px`, `.bottom-nav` still resolves `padding-bottom: 46px`,
  and the calendar renders cleanly between them (rect 359×463 at y=278).
- Data-testids: `event-calendar`, `calendar-grid`, `calendar-month-label`,
  `calendar-prev-month`, `calendar-next-month`, `calendar-today-btn`,
  `calendar-cell-{Y-M-D}`, `calendar-event-{id}`, `calendar-day-dialog`,

## DeepL + Cache → Dashboard Admin Araçları (Feb 16, 2026)
- `DeeplUsageBadge` and `DeeplDigestButton` imports + JSX removed from
  `components/Header.jsx` (lines 10-11, 93-94) so the header cluster stops
  competing with the notification bell / language switcher for horizontal
  space.
- Both components re-mounted in `pages/Dashboard.jsx` under a new
  **"Admin Araçları"** section (`data-testid="dashboard-admin-tools"`),
  rendered right below Firebase Analitik + VIP Trash Purge. Labelled rows
  (`DEEPL CACHE` + `HAFTALIK RAPOR`) so admins see what each control does
  without hovering.
- Zero behaviour change — same components, same endpoints, same tooltips.
- Verified: header no longer has `[data-testid=deepl-clear-cache]`;
  dashboard admin-tools does. Screenshot captured.

  `calendar-day-event-{id}`.


## Panel Sadeleştirme + PushBroadcastPanel → Bildirimler Hub (Feb 16, 2026)
- `pages/LiveDashboardPage.jsx` slimmed: PushBroadcastPanel import + JSX removed.
  Panel now surfaces PushSubscribeCard + PushPrefsCard + WidgetGrid + BulkAdminActions
  only. Users see personal push controls, widgets, and bulk admin actions — nothing else.
- `pages/EventNotifications.jsx` Etkinlik Bildirimleri tab now stacks
  `EventNotificationsPanel` + `PushBroadcastPanel` in a `space-y-3` column so
  broadcast tooling sits next to the scheduler where the menu label suggests.
- Verified: `/gosterge-paneli` has no `[data-testid*=broadcast]`; the events
  tab of `/etkinlik-bildirimleri` has both panels rendered.

so both columns share the same JSX and attendance/gallery behaviour.

Verified in preview (Hatırlatmalı + Hatırlatmasız tabs) — screenshots show
clean separation with correct counts and no visual regressions.

## Kolektif/Bireysel + Kolon Resize + Backend Order Sync + Emoji Bottom Nav (Feb 16, 2026)
- **Rename** Gruplu → **Kolektif**, Grupsuz → **Bireysel** across Events.jsx
  (column headers, empty states, EventForm group-type toggle, comments).
  Sub-filter chips are now `[Kolektif] [Bireysel]` with `events-subfilter-kolektif`
  / `events-subfilter-bireysel` testids. **Tümü chip removed** — clicking an
  active chip toggles back to the default 2-column split.
- **Resizable column split** — the 2-column layout now uses a dynamic
  `gridTemplateColumns: {splitPct}fr 8px {100-splitPct}fr` with an 8px
  drag handle in the middle (`events-column-resize-handle`). Mouse + touch
  drag both work, clamped to `[20%, 80%]`, persisted to
  `localStorage.events_split_pct`. Handle only shows on `lg+` viewports;
  mobile collapses to stacked columns as before.
- **Backend order sync** — new endpoints on `auth.py`:
    - `GET /api/users/me/event-order` → `{order: {bucket_key: [ids]}}`
    - `PUT /api/users/me/event-order` → body `{bucket_key, ids}` merges one
      bucket at a time so buckets don't clobber each other. `[:500]` cap.
  Frontend `Events.jsx` fires `useEffect` on mount to hydrate remote order,
  and fires-and-forgets `api.put` on every reorder so any device sees the
  latest arrangement. LocalStorage remains an offline fallback.
- **Bottom nav emoji preview** — `BottomNav.jsx` rewritten to swap Lucide
  icons for matching colored emojis: 🏆 Sıralama · ⚔️ Loj Hakkında ·
  🧮 Puan Hesaplama · 📊 Puanlar Hakkında · 👥 Üyeler · 📅 Etkinlikler.
  Fixed 22×22 box keeps the layout identical; active state uses the same
  drop-shadow glow, inactive gets slight grayscale to match the muted look.
- Backend endpoints roundtrip-verified via curl (empty → PUT → 3 ids stored).


## Key Files

## Emoji Partial Migration + Split Presets (Feb 16, 2026)
- **Header dropdown** — `MenuItem` gained an optional `emoji` prop that
  wins over `icon`. All 12 dropdown rows migrated: 📊 Dashboard · 🔔 Bildirimler ·
  🎟️ VIP Destek · 🎛️ Panel · 🧩 Widget'lar · 🙂 Profilim · 👤 Kullanıcı Yönetimi ·
  🔑 Şifre Değiştir · 📸 OCR Geçmişi · 📥 Detaylı Rapor · ✨ Kurulumu tekrar göster ·
  🚪 Çıkış Yap. Icons stay fixed at a 14×14 box so alignment matches the
  Lucide baseline; no layout shift.
- **Events tabs** — 🔔 Hatırlatmalı, 🔕 Hatırlatmasız, 📦 Arşiv (grayscale
  when inactive).
- **Events sub-filter** — 🤝 Kolektif, 🧍 Bireysel (chip emoji prefix).
- **View toggle** — 📋 Liste, 📅 Takvim.
- **Bildirimler hub tabs** — 🔔 Etkinlik Bildirimleri, 📢 Duyurular.
- **Split preset chips** — new row `data-testid="events-split-presets"`
  visible only on `lg+` and only when both columns show (subFilter=all).
  30/70, 50/50, 70/30 buttons update `splitPct` state (same underlying
  variable as the drag handle), persisted to `localStorage.events_split_pct`.
  Active preset highlighted in amber. `data-testid="events-split-preset-{30|50|70}"`.
- Untouched (deferred): card action buttons (Pencil/Trash2/Archive/etc)
  and page-title h1 icons — icons there communicate destructive intent
  more clearly than an emoji, and swapping them wholesale would introduce
  more regression risk than value.

- `/app/backend/server.py` — helpers at 3193-3341; `_telegram_forward_scheduled` at 3488

## Recurring Events + Announcement Edit + Card Emojis + Order Purge (Feb 16, 2026)

### Recurring Events (Tekrarlama)
- `EventCreate`/`EventUpdate` gained `recurrence_interval` (none/2days/weekly/2weekly/monthly) + `recurrence_count` (2-52, clamped).
- **On CREATE**: server generates `count` events starting at `date`, each shifted by the interval. Monthly uses `calendar.monthrange` to clamp day (e.g. Jan 31 → Feb 28/29).
- **On PATCH**: leaves the original event untouched but spawns `count-1` future copies starting at `date + interval*i`. Lets admins retrofit a recurrence onto any existing event.
- Response includes `recurrence_created` count. Frontend surfaces via toast: `"3 etkinlik oluşturuldu (weekly)"`.
- EventForm shows a **Tekrarlama** chip row (Yok/2 Günde/Haftalık/2 Haftada/Aylık) + count input (2-52). testids: `event-form-recur-{none|2days|weekly|2weekly|monthly}`, `event-form-recur-count`.
- Curl round-trip: weekly×3 → 3 events at 09-01, 09-08, 09-15 ✅

### Announcement Edit + Full Delete
- New `copyToForm(a)` helper: loads title/body/image/urgent into compose form and scrolls to top. testid `announcement-copy-{id}` (✏️ emoji button).
- Delete button now uses **hard delete** confirmation ("tamamen silmek istiyor musun? Geri alınamaz") — was previously softer "arşivle" wording. testid `announcement-delete-{id}` (🗑️ emoji).
- Buttons stacked vertically on each row for a tighter footprint.

### Card Action Emojis
- Row-level buttons on event cards migrated: 📦 Arşivle · ♻️ Aktife Al · ✏️ Düzenle · 🗑️ Sil. Sizing/color/testids unchanged so no regression on existing tests.

### Backend Event-Order Purge
- New admin endpoint `POST /api/admin/event-order/purge-stale` — sweeps every user doc's `event_manual_order`, drops ids no longer pointing at live events, removes now-empty buckets. Response: `{users_touched, ids_removed, buckets_removed, live_events}`.
- Curl verified: removed 3 stale ids from 1 user + 1 empty bucket, 10 live events counted. Cron-ready.

- `/app/backend/auth.py` — `preferred-language` endpoint + public_user
- `/app/backend/telegram_bot.py` — send_message w/ HTTP-level logging
- `/app/backend/routes/push.py`, `/app/backend/routes/cron.py`
- `/app/frontend/src/components/CropDialog.jsx` — react-image-crop wrapper
- `/app/frontend/src/components/OcrDialog.jsx` — Scissors button per thumb

## Series Anchor + Multi-Bucket Drag + PATCH Announcement + Purge Cron (Feb 16, 2026)

- **Series Anchor**: `Event` model gained optional `series_id`. Create-time recurrence stamps every spawned copy with a shared uuid; PATCH-time recurrence back-fills the anchor id onto the parent too. Two new endpoints:
  - `PATCH /api/events/series/{series_id}` — bulk update every occurrence in a series (name, group_name, multiplier, subtitle, reminder_enabled). Accepts `from_date` for "this and future only" semantics.
  - `DELETE /api/events/series/{series_id}` — cascades to `points` then removes every occurrence. `from_date` narrows to future.
- **Multi-Bucket Drag**: Event cards now track `dragSourceBucket` on drag start. Drop onto a card in a DIFFERENT bucket → PATCH the source event's `group_name` (empty for Bireysel, group name for Kolektif). Same-bucket drop keeps existing reorder logic. Toast: "→ Bireysel" or "→ SvS".
- **Announcement PATCH**: New `PATCH /api/announcements/{aid}` (admin-only) for silent in-place edit — no re-broadcast. DELETE is now hard-delete (was soft-delete). Frontend `Announcements.jsx` now flips between POST (new) and PATCH (edit) based on `editingId`; toast changes to "Duyuru güncellendi". Copy-to-form button uses this path.
- **Purge Cron**: New no-auth `POST /api/cron/purge-stale-event-order` endpoint mirrors the admin one. Wired into `.emergent/crons.yml` as `purge-stale-event-order` running every Sunday at 04:30 UTC (30 minutes after telegram-dm-health).
- Curl round-trip verified: series create → PATCH matched=3, DELETE deleted=3, cron 200 OK, announcement PATCH updates title/body, hard-delete removes row.

- `/app/frontend/src/components/LanguageSwitcher.jsx` — persists preferred_language
- `/app/frontend/src/App.js` — AppShell hydrates i18n from user.preferred_language

## Prod diagnostic playbook
After redeploy, tail `backend.err.log` while triggering a notification:
- Expect `forward_scheduled sched_id=X chat_ids=N chat_lang=M langs=[...]` per scheduled fire
- Expect `dm_translate ok chat=X lang=en src_len=... out_len=...` per non-TR recipient
- If you see `dm_translate none chat=X — TR fallback` for a user you set to EN, then:
  - User's preferred_language was not persisted (check `auth/me` returns non-null pref)
  - OR user's chat_id / handle doesn't match ANY of the 3 resolution paths


## Series UI Toggle + 3-Way Delete + Drop Zone + Version History (Feb 16, 2026)

- **Series UI Toggle**: EventForm detects `initial.series_id`; renders a violet "🔗 Tüm seride uygula" checkbox (`event-form-apply-series`). When checked, submit routes to `PATCH /events/series/{id}` instead of `/events/{id}` with a subset of fields (no date/banner). Toast: "Seri güncellendi (N etkinlik)".
- **Series Delete Confirm**: Delete button on series-anchored cards opens a 3-option prompt: `1` bu occurrence · `2` bu ve gelecek (via `?from_date=`) · `3` tüm seri. Solo events keep the simple confirm dialog.
- **Cross-Bucket Drop Zone**: Both `renderGroupedCol` and `renderUngroupedCol` add `onDragOver` that only accepts a source from the OTHER bucket, plus a dashed outline (amber / violet) that only shows while a foreign card is being dragged. `renderUngroupedCol` handles the section-level drop to convert to Bireysel (`group_name: ""`).
- **Announcement Version History**: `PATCH /api/announcements/{aid}` snapshots previous title/body/image/urgent into `history` array (`$push` with `$slice: -20` cap) BEFORE writing new values. New `POST /api/announcements/{aid}/revert` pops the last history entry. `DELETE` remains hard-delete.
- Curl round-trip: create v1 → PATCH v2 (history=1, title=v2) → revert (history=0, title=v1) ✅


## Phase 2 — Oturum Yönetimi (Session Management) (Feb 16, 2026)

### Backend
- **JWT `sid` claim**: `create_token(user_id, username, role, sid=?)` now optionally embeds a session id. `optional_auth` requires the matching `sessions` doc to exist and NOT be revoked — a revoked session yields 401 immediately, even though the underlying JWT is otherwise valid until `JWT_EXP_DAYS` (7d).
- **Sessions collection**: `sessions` doc = `{id, user_id, username, role, ip, user_agent, ua_browser, ua_os, ua_device, created_at, last_active_at, revoked, revoked_at, revoked_by, revoked_reason}`. Indexes: `(id)`, `(user_id, revoked, last_active_at)`, `(revoked, last_active_at)`.
- **`parse_user_agent()`** cheap regex UA parser — no external dep. Extracts browser (Edge/Opera/Firefox/Chrome/Safari), OS (Windows/iOS/Android/macOS/Linux), device (mobile/tablet/desktop).
- **Login flow**: `POST /api/auth/login` now creates a session row (captures X-Forwarded-For IP + User-Agent) and mints a JWT carrying that `sid`. Response shape unchanged.
- **`last_active_at` refresh**: `optional_auth` opportunistically bumps the session's `last_active_at` when >60s stale — write-throttled to keep it cheap.
- **Endpoints**:
  - `GET /api/sessions/me` → own active sessions + `current_sid`.
  - `GET /api/sessions/all` (admin) → every active session, includes admin's own `current_sid` for UI highlighting. `?include_revoked=true` for audit.
  - `POST /api/sessions/{sid}/revoke` — self-owned OR admin — flips `revoked=true`.
  - `POST /api/sessions/revoke-others` — kill every own session except the current one.
  - `POST /api/sessions/revoke-user/{user_id}` (admin) — revoke every active session for a user.
  - `POST /api/auth/logout` — revoke current session (device logout).

### Frontend
- **`components/SessionManagement.jsx`** — new component rendered inside the Yönetim > Oturum Yönetimi tab. SWR `/sessions/all` (admin) or `/sessions/me` (non-admin) with 30s poll.
- **Admin view**: sessions grouped by user card. Header shows `username · role chip · N oturum` and a red "Tüm Oturumları Kes" button (`sessions-revoke-user-{uid}`) that fires the admin bulk-revoke endpoint.
- **Row layout**: device icon (💻/📱/📟) + `Browser · OS`, a green "BU CİHAZ" chip when `s.id === current_sid`, IP + relative "giriş X dk önce · son aktif Y dk önce" metadata, and a red Sonlandır button. Revoking the current session redirects to `/login` after a 500ms grace so the invalidated JWT stops firing.
- **Non-admin view**: flat list of own sessions + "Diğerlerini Sonlandır" button (`sessions-revoke-others`) when `items.length > 1`.
- **Testids**: `session-mgmt`, `sessions-refresh`, `sessions-revoke-others`, `sessions-user-{uid}`, `sessions-revoke-user-{uid}`, `session-row-{sid}`, `session-current-{sid}`, `session-revoke-{sid}`, `sessions-loading`, `sessions-error`, `sessions-empty`, `user-mgmt-sessions-content`.

### Verified (curl + Playwright)
- Two curl logins with distinct UAs (`Safari/iOS`, `Chrome/Android`) both created session docs.
- `revoke-others` from Safari/iOS → `{revoked:2}`, then `/auth/me` with Safari/iOS → 200, `/auth/me` with Android → **401**. JWT invalidation lands within one request.
- Admin UI screenshot: 4 sessions visible under `admin`, `BU CİHAZ` chip pinned on the Chrome/Linux Playwright session, per-row Sonlandır + "Tüm Oturumları Kes" bulk button all render.

## Phase 3 — Raporlar Merkezi (Reports Center) (Feb 16, 2026)

### Backend
- **Attendance status vocabulary**: `ATTENDANCE_STATUSES = {attending, declined, maybe, late}`. Legacy rows without a `status` field are auto-migrated to `attending` on startup (`event_attendance.update_many({status:{$exists:false}}, {$set:{status:"attending"}})`).
- **`PATCH /api/events/{event_id}/attendance/{member_id}`** — sets a member's attendance status. Upsert semantics: passing `status=null` deletes the row (member back to no-response). Invalid status → 400.
- **`GET /api/reports/members?period=all|30d|90d|180d|1y`** — full member performance aggregation. Returns `total_events`, per-member `{attending, late, maybe, declined, no_response, participation_rate, by_group}`. Rate = `(attending + late) / total_events`.
- **`GET /api/reports/events?period=…`** — per-event stats: counts by status, `responded`, `member_pool`, `participation_rate`.
- **`GET /api/reports/events/{event_id}/attendance`** — every member (present or absent) for one event so the frontend can render inline status dropdowns.
- **CSV exports**: `/api/reports/members/export.csv?period=…` and `/api/reports/events/export.csv?period=…` — text/csv with attachment filename hints; reuses the JSON aggregators.
- **Startup migration** wired into `startup()`; logs modified count.

### Frontend
- **`pages/Reports.jsx`** — new admin-only page at `/raporlar`. Two-tab layout (Üye Performansı / Etkinlik Katılım) sharing a period selector (`Tümü / 30 Gün / 90 Gün / 180 Gün`) and a CSV download button.
- **Üye Performansı**: Recharts BarChart (top-15 members) colored by tier (≥75% green, ≥50% amber, else red) + full sortable table with country flag, klan, per-status counts, and % rate.
- **Etkinlik Katılım**: Each event row shows status chips (`✅🕒❔❌⚪`), pool ratio, expand toggle. Expanded panel calls `/reports/events/{id}/attendance` and shows a 2-col grid of every member with an inline status `<select>` (⚪/✅/🕒/❔/❌). PATCH is optimistic — success → toast + revalidate.
- **CSV button** (`reports-download-csv`) — fetches blob, triggers browser download with period-aware filename (`uye-performans-90d.csv`, etc.).
- **Route + nav**: `/raporlar` route wrapped in `RequireAdmin`; header profile dropdown gets a `📊 Raporlar` entry (testid `dropdown-reports`).
- **Testids** (main): `reports-page`, `reports-tabs`, `reports-tab-members`, `reports-tab-events`, `reports-period-{key}`, `reports-download-csv`, `members-report`, `members-report-table`, `members-report-row-{id}`, `events-report`, `events-report-row-{id}`, `events-report-toggle-{id}`, `event-detail-{id}`, `event-detail-status-{member_id}`.

### Verified (curl + Playwright)
- `/reports/members?period=all` → `total_events=5, items=254` with correct 20% rate on 4 attendees.
- `/reports/events?period=all` → 5 events, pool=254.
- CSV export 200 / 19KB with proper header row.
- `PATCH .../attendance/{mid}` — `status=late` persists, `status=null` clears, `status="unknown"` → 400.
- Playwright: 254 members table, 5 event rows, expand → 254 status dropdowns rendered, BarChart visible with tiered colors, tab switching + period filter functional.



## Invite QR + Report Trends (Feb 16, 2026)

### Invite QR
- **Frontend**: Installed `qrcode.react` (v4). `InviteManagement.jsx` row now leads with a 68×68 white-bg QR (`SVG`, level "M"), click opens a modal (`invite-qr-modal`) with a 256×256 large version, the URL beneath, and a "PNG olarak indir" button that rasterizes the SVG to a 512×512 canvas and triggers a `image/png` blob download named `titanxis-davet-qr.png`.
- **Testids**: `invite-qr-{id}`, `invite-qr-modal`, `invite-qr-modal-close`, `invite-qr-download`.

### Report Trends (Katılım Trendi)
- **Backend**: New `GET /api/reports/trend?days=7|30|90|180&alliance=&country=`. For every day in the window, aggregates `(attending+late) / (member_pool × event_count) × 100`. Event-less days emit `participation_rate: null` so the line breaks rather than dips to zero. Alliance/country restrict the member pool same as `/reports/members`.
- **Frontend**: New `TrendChart` component rendered above the bar chart in the Üye Performansı tab. Recharts `LineChart` with `connectNulls={false}`. A linear regression slope classifies the trend into `▲ Yükselişte` (>0.2), `▼ Düşüşte` (<-0.2), or `→ Sabit`; the chip + line stroke share the color. Day toggles: 7G / 30G / 90G. Legend inherits the alliance+country filters from the parent MembersReport.
- **Testids**: `trend-chart`, `trend-direction`, `trend-days-{7|30|90}`, `trend-empty`.

### Verified
- Curl: `/reports/trend?days=30` → `days=30 pool=254 items=30 nonnull_days=1` (single dated event at 1.6%). `?days=7&alliance=GOW` → `pool=157`.
- Playwright: invite QR buttons rendered (2), modal opens with download button, `trend-chart` root + `trend-direction "→ Sabit"` chip + 3 day toggles all live; 7G ↔ 90G x-axis rescales correctly.


## Trend Overlays — Benchmark Band + Moving Average (Feb 16, 2026)

### Backend
- **`guild_settings` collection** — first entry stores the guild-wide participation target.
- **`GET /api/settings/guild-target`** → `{target: int}` (default 60).
- **`PUT /api/settings/guild-target`** (admin) → clamps to 0-100, upserts `{key:"guild_target", value, updated_at, updated_by}`.

### Frontend — `TrendChart` overhauled
- **Benchmark band** — Recharts `ReferenceArea` splits the y-axis into a green tinted "on-goal" zone (`target → 100`, 6% opacity) and a red tinted "danger" zone (`0 → target`, 4% opacity), with a dashed `ReferenceLine` at the target labeled `Hedef %N`. Toggleable via `trend-target-toggle`.
- **Inline target editor** — `trend-target-edit` opens a number input + Kaydet/İptal so admins bump the goal without leaving the report. PUT to `/settings/guild-target` and revalidate SWR.
- **Moving-average curve** — client-side trailing MA (7-day for 30/90G views, 3-day for 7G so it still varies across a short axis). Rendered as a blue dashed `Line` with `connectNulls` so gaps get bridged for smoothness. Toggle via `trend-ma-toggle`.
- **Compact legend** — under the chart, three chips distinguish daily / N-day avg / target lines.
- **Testids**: `trend-target-edit`, `trend-target-editor`, `trend-target-input`, `trend-target-save`, `trend-target-toggle`, `trend-ma-toggle`, `trend-legend`.

### Verified
- Curl: GET default 60 → PUT 75 → GET 75 → PUT 150 → clamped to 100 → reset 60. All 200.
- Playwright: chart renders, target chip reads `🎯 Hedef %60`, edit → 80 → chip updates to `🎯 Hedef %80` + toast "Hedef %80 olarak kaydedildi", MA toggle flips state ○/◉ + legend hides its 7-gün ort. chip, benchmark band + dashed target line visible on screenshot.


## Trend Alerts — MA7 Below Target × 3 Days (Feb 16, 2026)

### Backend
- **Shared aggregation**: `_compute_trend_items(days, member_query)` extracted from `/api/reports/trend` so the alert path uses the exact numbers admins see on the chart.
- **`_trend_ma7_series(items)`** — trailing 7-day MA matching the frontend's smoothing (min 2 non-null points).
- **`_trend_alert_evaluate()`** — computes current MA7 breach streak, fires bell + Telegram DM + Web Push only when `streak >= 3` AND (`>20h since last alert` OR `streak grew`). Idempotent via `guild_settings.trend_alert_state = {last_dispatched_at, last_streak, last_ma, target}`.
- **Delivery**:
  - Bell → direct `in_app_notifications.insert_many` for `role="admin"` users, `kind="trend_alert"`.
  - Telegram → `_send_tg_message` per admin with a linked `telegram_chat_id`.
  - Web push → `_broadcast_push(title, body, "/raporlar", tag=f"trend-alert-{today}", sound="rally")`.
- **`_trend_alert_loop()`** — hourly background task launched in `_start_push_scheduler` after a 120s warm-up.
- **Endpoints**:
  - `POST /api/reports/trend/check-alerts` — admin manual trigger.
  - `GET /api/reports/trend/alert-state` — snapshot `{target, streak, last_ma, state}`.

### Verified (curl)
- Seeded 5 consecutive daily events with zero attendance → `alert-state` reported `streak=4, last_ma=0.2%` → `check-alerts` returned `fired: true, bell_sent=7`. Retry returned `fired: false, reason: throttled`. Cleanup script removed 5 seed events + 7 bell rows + alert state.

## Alert Snooze + Recovery Ping (Feb 16, 2026)

### Backend
- **Snooze state**: `guild_settings.trend_alert_state` now carries `snoozed_until`, `snoozed_by_username`, `snoozed_at`. `_trend_alert_evaluate` honors an active window (`reason="snoozed"`) and skips fan-out — streak still computed for the state snapshot.
- **Recovery cycle**: State also carries `pending_recovery`. When a breach alert fires we set it to `True`. On the next tick, if `streak==0 && pending_recovery && last_ma>=target && !snoozed` we fire the green "🎯 Hedef Geri Kazanıldı" bell + push + TG DMs, `kind="trend_recovery"`, then flip `pending_recovery` back to `False`.
- **Endpoints**:
  - `POST /api/reports/trend/alert-snooze` `{days:int}` (1-30, default 7) — sets `snoozed_until=now+days`.
  - `DELETE /api/reports/trend/alert-snooze` — clears snooze.
- **`GET /api/reports/trend/alert-state`** — now returns `snoozed:bool` + `snoozed_until` (only when live) + `pending_recovery`.

### Frontend — `TrendChart` alert strip
- Renders under the legend only when `streak >= 3` (red breach strip) or `snoozed` (grey snooze strip). Healthy days keep the chart uncluttered.
- **Breach strip**: message "N gündür 7-günlük ortalama hedefin altında" + three snooze CTAs (`🔕 1G`, `🔕 1 hafta sessize al` — highlighted, `🔕 30G`). Each POSTs to `/reports/trend/alert-snooze` and toasts "Uyarılar 7 gün sessize alındı → {date}".
- **Snooze strip**: shows the active snooze window in TR locale + "Sessize almayı kaldır" button that DELETEs the snooze.
- **SWR polling** for `/reports/trend/alert-state` at 60s so the strip auto-appears/disappears without a manual refresh.
- **Testids**: `trend-alert-strip`, `trend-alert-snooze-{1d|7d|30d}`, `trend-alert-unsnooze`.

### Verified (curl + Playwright)
- Snooze cycle: fire breach → `snooze days=7` → 200 → `check-alerts` → `fired:false, reason:"snoozed"` → `unsnooze` 200.
- Recovery cycle: seeded 5 events × 254 attendings + `pending_recovery=True` (25h ago) → `alert-state` `streak=0, last_ma=90.2%, pending_recovery=True` → `check-alerts` → `fired:true, kind:"trend_recovery", bell_sent=7`. Retry cleared `pending_recovery`. 7 DB rows with title "🎯 Hedef Geri Kazanıldı — Son 7 günlük ortalama %90.2 — hedef %60 yeniden aşıldı". Cleanup restored preview DB.
- Playwright: target=99 → red strip "4 gündür …" + 3 snooze chips → click "🔕 1 hafta sessize al" → grey snooze strip + toast "Uyarılar 7 gün sessize alındı → 23.08.2026" → "Sessize almayı kaldır" reverts.


## Weekly Trend Digest (Feb 16, 2026)

### Backend
- **`trend_alert_history` collection** — every alert fan-out (`kind=trend_alert|trend_recovery`) and every snooze POST logs a row with `{id, kind, streak, last_ma, target, member_pool, timestamp}` (+`snoozed_by_username`, `days`, `snoozed_until` for snoozes).
- **`_trend_digest_compose(days=7)`** — reads history from the window, headline current MA7 via `_compute_trend_items`, computes rolling `avg_ma` + slope-based direction (`yükseliyor 📈 / düşüyor 📉 / sabit ➖`), builds a Telegram-ready markdown block with counts, snooze detail (last 3), recent breaches (last 3).
- **`_trend_digest_dispatch(days=7)`** — sends the markdown to every admin's `telegram_chat_id` via `_send_tg_message`, drops a plain-text "📊 Haftalık Katılım Özeti" bell (`kind="trend_digest"`) into `in_app_notifications` for every admin (so the digest is visible even without a linked Telegram), stamps `guild_settings.trend_digest_state = {last_sent_at, last_tg_sent, last_bell_sent, breaches, recoveries, snoozes}`.
- **Weekly cadence**: `_trend_alert_loop()` reuses its hourly tick to also call `_trend_digest_dispatch(7)` whenever `last_sent_at` is ≥ 167 hours old (small drift tolerance).
- **Endpoints**:
  - `GET /api/reports/trend/digest/preview?days=7|14|30` — full payload + `last_state`.
  - `POST /api/reports/trend/digest/send?days=7` — manual trigger (admin).

### Frontend — `TrendChart` digest modal
- New "📊 Özet" chip in the trend chart toolbar (`trend-digest-open`) opens `TrendDigestModal`.
- Modal shows 7G / 14G / 30G window toggles + a 3-stat mini grid (⚠️ Uyarı / 🎯 Toparlanma / 🔕 Sessize) + a monospace preview of the exact markdown that would be sent to Telegram. When a prior send exists, `last_state` line renders the timestamp + Telegram/Bell counts.
- **"Şimdi Gönder"** button (`trend-digest-send`) fires the manual dispatch, toasts "Özet gönderildi — Telegram N · Bell M" and revalidates.
- **Testids**: `trend-digest-open`, `trend-digest-modal`, `trend-digest-close`, `trend-digest-days-{7|14|30}`, `trend-digest-loading`, `trend-digest-preview`, `trend-digest-send`.

### Verified (curl + Playwright)
- After a breach + recovery + snooze on the seeded 5-event window:
  - `preview` returned `breaches=0 recoveries=1 snoozes=1 avg_ma=90.4 last_ma=90.2 direction="düşüyor 📉"` with a Turkish markdown body ending in "*Sessize alma detayı:* • 2026-08-16 15:29 — admin · 3g".
  - `send` returned `tg_sent=0 bell_sent=7` (admins have no linked chat_id in preview) and the second preview showed the populated `last_state`.
- Playwright: `trend-digest-open` renders, modal preview markdown block visible, "Şimdi Gönder" button + last-send metadata all lit. Cleanup restored preview DB.

## Digest Recipients — Channel Broadcast (Feb 16, 2026)

### Backend
- **`guild_settings.trend_digest_recipients.value = [{chat_id, label, added_by_username, added_at}]`** — list of Telegram groups/channels the digest is fanned out to alongside admin DMs.
- **Endpoints** (all admin-only):
  - `GET /api/reports/trend/digest/recipients` → `{items:[…]}`.
  - `POST /api/reports/trend/digest/recipients` `{chat_id, label?}` — dedupe check (400 on duplicate).
  - `DELETE /api/reports/trend/digest/recipients/{chat_id:path}` — path-param handles `-100…` group ids and `@channel` handles.
  - `POST /api/reports/trend/digest/recipients/{chat_id:path}/test` — fires a `🧪 TiTaNXiS Digest Bağlantı Testi` ping so admins can verify the bot has access before Sunday.
- **`_trend_digest_dispatch`** now iterates configured recipients after admin DMs, tracks `channels_sent` / `channels_err`, and persists `last_channels_sent` into `trend_digest_state` for the UI.

### Frontend
- **`TrendDigestModal`** grows a new **📡 Telegram Alıcıları** section under the last-send strip:
  - Row per recipient: label (bold) + monospace `chat_id` shadow + `🧪 Test` button + `Sil` button.
  - Inline form (`chat_id` + `Etiket`) POSTs to `/recipients`, toasts `Alıcı eklendi: {label}`.
  - Empty-state hint: "Sadece admin DM'lerine gidiyor. Kanal/grup ekleyerek liderlik sohbetine de düşürebilirsin."
  - "Şimdi Gönder" confirm text now shows the recipient count.
- **Testids**: `trend-digest-recipients`, `trend-digest-recipient-chatid`, `trend-digest-recipient-label`, `trend-digest-recipient-add`, `trend-digest-recipient-{chat_id}`, `trend-digest-recipient-test-{chat_id}`, `trend-digest-recipient-remove-{chat_id}`.

### Verified (curl + Playwright)
- Curl cycle: add → dedupe 400 → add second → dispatch `bell_sent=7 channels_sent=0` (dummy ids so bot correctly reports 0 delivery, no crash) → delete → list narrowed → cleanup.
- Playwright: open modal → recipient section renders → add form creates a `-1009876543210 (Ops)` row → remove via confirm dialog cleans up. Screenshot captured.

## Digest Schedule Picker (Feb 16, 2026)

### Backend
- **`guild_settings.trend_digest_schedule.value = {weekday:0-6, hour:0-23, tz:str}`** — default `weekday=6 (Pazar), hour=20, tz=Europe/Istanbul`. Timezone validated via `zoneinfo.ZoneInfo` at PUT time (typos → 400).
- **`GET /api/reports/trend/digest/schedule`** — returns current triple (falls back to defaults).
- **`PUT /api/reports/trend/digest/schedule` `{weekday, hour, tz}`** — clamps weekday 0-6 & hour 0-23, persists timestamp + `updated_by_username`.
- **`_trend_alert_loop` digest tick reworked**: reads the schedule doc each tick, computes `datetime.now(ZoneInfo(tz))`, fires when `local.weekday()==weekday && local.hour==hour && last_sent<12h ago is False`. Falls back to UTC if the stored TZ ever becomes invalid.

### Frontend
- **`TrendDigestModal`** grows a new **🗓️ Otomatik Program** section above the recipients form:
  - 3 selects: `weekday` (Pazartesi…Pazar), `hour` (00:00…23:00), `tz` (TR / UTC / London / Berlin / New York).
  - Each `onChange` PUTs the full triple; toasts "Program güncellendi" and revalidates SWR.
  - Header shows the current cadence inline: `🗓️ Otomatik Program · Pazar 20:00 · Europe/Istanbul`.
- **Testids**: `trend-digest-schedule`, `trend-digest-schedule-{weekday|hour|tz}`.

### Verified
- Curl: default `Pazar 20:00 Europe/Istanbul` → PUT `Not/AZone` → 400 → PUT `weekday=99 hour=42 tz=UTC` → clamped to `6/23/UTC` → reset.
- Playwright: modal → schedule section renders, changing weekday→Perşembe + hour→18:00 persists (GET confirms `weekday=3 hour=18`). Screenshot captured. Preview DB restored.




## Digest Test Send (Feb 16, 2026)

### Backend
- **`POST /api/reports/trend/digest/test-send?days=7`** (admin) — mini dispatch scoped to the caller only:
  - Composes the same digest via `_trend_digest_compose`, prefixes it with `🧪 *[TEST]*\n`.
  - Sends to the requesting admin's own `telegram_chat_id` if linked (else `tg_err_reason: "telegram_chat_id yok — Profil > Telegram bağla"`).
  - Drops a personal bell (`kind="trend_digest_test"`, title "🧪 Digest Test Mesajı").
  - **Does NOT** touch `trend_digest_state`, `trend_digest_schedule`, or the recipients list — so admins can rehearse formatting without spamming leadership.

### Frontend — `TrendDigestModal`
- Adds a `🧪 Test Mesajı` chip next to "Şimdi Gönder" (side-by-side flex row). Loading state disables both.
- Distinct toasts: success when Telegram delivery lands; warning when only the bell fires (with the exact reason string from backend).
- **Testid**: `trend-digest-test-send`.


## Telegram Link Reminder (Feb 16, 2026)

### Backend
- **`telegram_bot.start_command` extended** — parses `context.args` for a `link_TOKEN` deep-link payload. Matching token binds `telegram_chat_id` inline (mirrors `/link TOKEN` flow) and confirms with "✅ Bağlantı başarılı!" — one tap from the digest modal to a fully bound account.
- **`POST /api/reports/trend/digest/test-send`** — when the caller has no `telegram_chat_id`:
  - Mints a 6-char uppercase token (10-min TTL) in `telegram_link_tokens`, dedupes prior tokens for the same user.
  - Returns `link_url: "https://t.me/{TELEGRAM_BOT_USERNAME}?start=link_{TOKEN}"` alongside `chat_id_linked: false` + friendly TR reason.
- Personal bell still fires; schedule / recipients / digest state untouched.

### Frontend — `TrendDigestModal`
- `testSend()` branches on the response:
  - `tg_sent > 0` → success toast.
  - `link_url` present → renders a **custom sticky toast** (30s duration) with `🔗 Telegram Bağla` chip pointing to `link_url` (`target="_blank"`, `rel=noreferrer`), a "Kapat" chip, and the raw URL in mono for admins who prefer copy-paste.
- **Testids**: `trend-digest-link-toast`, `trend-digest-telegram-bind`.

### Verified (curl)
- Test-send without chat_id → `link_url="https://t.me/TiTaNXiS_BoT?start=link_XXXXXX"` (shape ✓) + `chat_id_linked=false` + TR reason. `telegram_link_tokens` row inserted with user_id + expires_at. Cleanup restored preview DB.

### Verified (curl)
- Captured `last_state.last_sent_at` before test → `test-send` returned `tg_sent=0 bell_sent=1 reason="telegram_chat_id yok — Profil > Telegram bağla" text_prefix="🧪 *[TEST]*"` → post-test `last_sent_at` unchanged (✅). Bell row inserted with `kind="trend_digest_test"` and cleaned. State + schedule + recipients untouched.


## Kale Seviyesi İstatistikleri + Duyuru Klavye Odak Fix (Feb 17, 2026)

### Backend
- New endpoint: `GET /api/members/castle-stats` — aggregates castle-level totals,
  average/min/max, per-level distribution, and TOP 10 leaderboard. Defensively
  coerces the legacy `Optional[str]` `castle_level` field to int. Registered
  BEFORE `/members/{member_id}` to avoid the dynamic-route catch.
- SvS routes (`routes/svs.py`) verified end-to-end via curl: list/create/patch/delete
  all return 200 with admin JWT; win/loss counters compute correctly.

### Frontend
- `Members.jsx`: added `Castle` toggle chip in the toolbar next to Display/Filter.
  Opens a `CastleStatsCard` between the toolbar and the members list showing
  4 stat chips (Total, Average, Max, Missing), a level-distribution bar chart
  (F3–F8), and a TOP 10 castle-level list with rank/name/alliance/level.
  SWR fetches `/members/castle-stats` only when the card is open (refresh 30s).

### Duyuru klavye odak bug (P0 fix)
- **Root cause**: In `Announcements.jsx` a `Wrapper` component was defined
  **inside** the Announcements function body. Every `setTitle` / `setBody`
  keystroke produced a new `Wrapper` function reference, so React tore down
  and re-mounted the entire form on every character — closing the mobile
  keyboard after each keypress.
- **Fix**: Removed the in-component `Wrapper`; replaced with a plain
  `wrapperClass` string and a single top-level `<div>` rendered inline.
- Playwright verified: typing 24 chars in title + 40 chars in body both stay
  focused and preserve the full value.

## ImageDropzone Crop Button (Feb 17, 2026)
- **Root cause**: `ImageDropzone.jsx` (used by Duyurular / Events / VIP Support)
  had NO crop button — only the delete X. Crop was only wired inside
  `OcrDialog.jsx`, so users saw the ✂️ chip on "some" (OCR-only) images.
- **Fix**: Added `Scissors` chip on every uploaded thumbnail. On click, we
  `fetch()` the remote URL as a blob, convert to a fresh data:URL + `File`,
  and hand it to the shared `CropDialog` (same UX as OCR). On confirm the
  cropped file is re-POSTed to `/api/uploads/image?purpose=<p>` and the
  thumbnail is swapped in `value[]` preserving order.
- **Cross-origin safety**: blob-fetch route avoids canvas tainting when the
  URL is served from Emergent object-storage / CDN.
- **Playwright verified**: upload → crop button visible → click opens
  `CropDialog` with image + Apply button rendered.

## Poll Broadcast + Crop Restore + Events Visibility + PointCalc UX (Feb 17, 2026)

### Backend
- **Event model**: New `hidden_from_leaderboard: bool = False` on Event/Create/Update.
  Leaderboard aggregator now excludes any event with this flag so admins can
  keep the ranking clean while still logging practice / draft points.
- **Poll close broadcast**: `close_poll` route now accepts an `on_poll_closed`
  async callback. `server.py::_poll_broadcast_closed` formats a Markdown
  result card (winner 🏆, per-option progress bars, total tally including
  TG voters) and posts it into the same Telegram group where the native
  poll originated (falls back to `TELEGRAM_POLL_CHAT_ID`), plus fires a
  lightweight in-app bell. Non-blocking; failures logged only.

### Frontend
- **CropDialog**: New `originalUrl` + `onRestore` props render an "Orijinali
  Geri Yükle" chip alongside "Sıfırla" so users can bail out of a bad crop.
- **ImageDropzone**: Tracks `original_id/url/filename/size` alongside each
  entry; passes them into CropDialog only when the item has been cropped at
  least once. Restore swaps the entry in-place (no network round-trip; the
  original blob still lives in object storage).
- **Events form**: New "🏆 Sıralamada göster" checkbox (inverse of
  `hidden_from_leaderboard`). Cleanly styled amber card below the reminder
  toggle. Persists via existing `POST/PATCH /events`.
- **Events mobile layout**: Grouped + ungrouped event grids switched from
  `grid-cols-1 md:grid-cols-2` → `grid-cols-2` so events pair up on
  mobile screens too (tablet already worked).
- **Leaderboard Aktif Etkinlikler grid**: When "Tümü" is selected on Active
  tab, a new `active-events-grid` mirrors the archive layout — 2-col cards
  with banner thumbnail + name + subtitle + date. Clicking any card opens
  the shared event modal (renamed intent: works for both scopes).
- **Event detail modal**: Now renders `banner_url` full-width (up to 72
  viewport height) at the top so admins can view the event image + info
  stacked full-screen.
- **PointCalcPage**:
  - i18n TR label renamed: "Pre Etkinlik Puanlama" → "**SVS Pre Puan
    Hesaplama**"
  - Column labels renamed TR: "Birim İsmi" → "Malzeme", "Birim Miktarı" →
    "Miktar" (existing `pc_unit_*` keys, no schema change)
  - TableCard title is now inline-editable via a pencil icon next to the
    heading — auto-translates via DeepL on save.

## Crop History (Undo/Redo) + Hidden Event Polish (Feb 17, 2026)

### CropDialog
- New props: `canGoPrev`, `canGoNext`, `onGoPrev`, `onGoNext`, `historyIndex`,
  `historyTotal`. Renders "◀ Geri Al" / "İleri Al ▶" chips next to Sıfırla,
  plus a compact `1/N` position badge so users know where they are in the
  chain. Buttons dim/disable when at either extreme.

### ImageDropzone
- Each uploaded item now carries a `history: [{id,url,filename,size}, …]`
  array + `hi` pointer. Fresh uploads seed history with a single snapshot;
  every applied crop appends a new snapshot (and truncates any redo tail
  so a new edit branches from the current position). Undo/redo simply
  jump `hi` — no network round-trip because every snapshot's URL is a
  live upload.
- "Orijinali Geri Yükle" now maps to `history[0]` (same as jumping the
  pointer to zero). Legacy items uploaded before this feature backfill
  a single-entry history on first crop.

### Events list — Sıralama dışı rozeti
- `renderEventCard` now shows a subtle grey **🚫 Sıralama dışı** chip on
  every event whose `hidden_from_leaderboard === true`. Non-intrusive
  (below the row of icons), tooltipped, admin-visible in both grouped
  and ungrouped grids.

### Leaderboard — hidden events not listed
- `visibleActiveEvents` / `visibleArchivedEvents` memos now filter out
  `hidden_from_leaderboard === true` events client-side so the "Aktif
  Etkinlikler" and "Arşiv Etkinlikleri" grids never advertise a card
  that would return zero contribution. Aggregate totals already
  ignored these events at the backend query level (see prior
  changelog entry).

### Playwright verified
- First-open crop: undo hidden (history length 1) ✓
- After 1st crop apply: history 2/2, undo enabled, restore enabled ✓
- After undo click: redo enabled ✓
- Hidden event badge visible on Events list ✓
- Hidden event card NOT rendered in Leaderboard Active Events grid ✓

## Toplu Sıralama Dışı — Event Bulk Visibility Toggle (Feb 17, 2026)

### Backend
- New endpoint: `POST /api/events/bulk-visibility` accepting
  `{ids: [str], hidden: bool}`. Uses `update_many` so the DB round-trip
  is O(1) regardless of selection size. `require_edit` gated. Returns
  `{modified, hidden}`.

### Frontend (Events.jsx)
- New selection mode: `selectionMode`, `selectedIds:Set`, `toggleSelected`,
  `clearSelection` in the top-level state.
- **"Seç" chip** in the view-mode row (next to Liste/Takvim toggles),
  admin-gated via `CanEdit`. Toggles selection mode + clears on exit.
- **Per-card checkbox** rendered inside `renderEventCard` when
  `selectionMode` is on, using `Square`/`CheckSquare` icons.
- **`EventsBulkToolbar`** component:
  - "Tümünü Seç (N)", "Terse Çevir", "Temizle"
  - **"👁️‍🗨️ Sıralama Dışı"** (grey) — POST bulk-visibility {hidden:true}
  - **"👁️ Sıralamaya Ekle"** (gold) — POST bulk-visibility {hidden:false}
  - "Kapat" chip returns to normal mode
- After a bulk action: SWR revalidates every `/events*` key and the
  toolbar closes, matching the existing bulk-country UX in Members.

### Curl + Playwright verified
- Created 3 events, `POST /events/bulk-visibility {hidden:true}` → modified=3 ✓
- Verify: total=3 hidden=3 ✓
- `POST /events/bulk-visibility {hidden:false}` → modified=3, all shown ✓
- UI: selection toggle shows toolbar, per-event checkboxes render, hide/show
  buttons visible with correct counter ✓

## Gizli Etkinlik Filtresi (Feb 17, 2026)

### Frontend (Events.jsx)
- New `visibilityFilter` state (`all` | `hidden` | `visible`), persisted to
  `events_visibility_filter` in localStorage.
- **New visibility filter row** below Kolektif/Bireysel chips:
  - **🚫 Sadece Gizli (N)** — grey chip; when active shows ONLY
    `hidden_from_leaderboard === true` events. Counter shows the current
    hidden queue size within the active tab so admins see it at a glance.
  - **🏆 Sadece Görünen** — gold chip; opposite direction, useful after
    a bulk hide operation to double-check what stayed visible.
- `filteredEvents` now applies the visibility filter as a final step so
  it composes cleanly with the existing tab (reminded/unreminded/archive)
  and subFilter (kolektif/bireysel) filters.

### Playwright verified
- Chip label: `🚫 Sadece Gizli (2)` — counter reflects real count ✓
- Click "Sadece Gizli" → hidden event visible (badge rendered) ✓
- Click "Sadece Görünen" → hidden event NOT rendered ✓
- Persisted preference across reloads (localStorage) ✓

## Gizli Etkinlik Raporu Tab + Bulk Archive (Feb 17, 2026)

### Backend
- `GET /api/leaderboard?scope=hidden` — new opposite-mode aggregate that
  ONLY includes events with `hidden_from_leaderboard: true`. Verified end
  to end: creating a hidden event + adding 42000 points, `scope=hidden`
  returns the row while `scope=active` still reports 0 for the same
  member (isolation preserved).
- `POST /api/events/bulk-archive` accepting `{ids, archived: bool}` —
  `update_many` in a single round-trip. Verified: 3/3 modified.

### Frontend
- **Leaderboard.jsx**: New third filter chip **"🚫 GİZLİ"** alongside
  Active/Archive. When selected the page:
  - Fetches `/leaderboard?scope=hidden` (member totals from hidden events)
  - Fetches `/events` (unfiltered) and derives `hiddenEvents` client-side
  - Renders a dedicated audit panel `hidden-events-audit-panel` with 2-col
    event cards, muted greyscale palette, and an "N etkinlik" counter
  - Hides Podium + Active Events grid when this tab is on so the audit
    view stays focused
  - Empty state: `hidden-events-empty` placeholder when the guild has no
    hidden events (default happy path)
- **Events.jsx**: Bulk toolbar now includes **📦 Arşive Al** (grey chip)
  and **↩ Arşivden Çıkar** (green chip) alongside the existing
  Sıralama Dışı / Sıralamaya Ekle pair. Wires to `/events/bulk-archive`.

### Verified
- curl: bulk-archive `{modified:3, archived:true}` ✓
- curl: leaderboard `scope=hidden` returns hidden-only points; `scope=active`
  isolates them ✓
- UI: `leaderboard-filter-hidden` chip renders, panel or empty-state
  visible, Podium/Active grid correctly hidden on Gizli tab ✓
- UI: All 4 bulk toolbar chips ("Arşive Al", "Arşivden Çıkar",
  "Sıralama Dışı", "Sıralamaya Ekle") present in toolbar ✓

## Bina Aşama + F10 Seed + S7 Renk + Aktif Kart Priority (Feb 17, 2026)

### Backend
- Startup seed: 5 aşama × 5 seviye (F6-F10) × 7 bina = 175 kategori. Legacy
  `bina_{slug}_{lvl}` (aşamasız) dokümanları `_a1` variant'ına $setOnInsert
  ile göç ettiriliyor. `unit-cost seed: migrated=2 seeded=173` logu ile doğrulandı.

### BuildingCalculator
- `catFor(slug, lvl, stage)` → `bina_{slug}_{lvl}_a{stage}`
- Seviye ve Bina arasında yeni **Aşama** picker (1-5) 5-kolon grid
- BinaUnitCostModal içinde de aynı Aşama seçici + seviye grid'i 5-col'a çıktı

### Commanders — S7 rank chip
- 👑 emoji + altın-turuncu gradient background, altın box-shadow glow, seçili durumda parlak sarı `#FCD34D` + iç beyaz glow

### Leaderboard — Aktif Kart Priority Sıralama
- `visibleActiveEvents` memo priority sort'lu:
  - Rank 0: Bugün olan
  - Rank 1: Son 6 saatte bitmiş (hala sıcak)
  - Rank 2: Gelecek (en yakın ilk)
  - Rank 3: Geçmiş (en yeni ilk)
- Admin en kritik etkinliği en tepede görüyor

## Aşama Karşılaştırma Görünümü (Feb 17, 2026)
- `BinaUnitCostModal`: Yeni **▦ 5 Aşamayı Karşılaştır** chip toggle
- Compare açıkken tek-aşama seçici gizleniyor, yerine 5 kolonlu (A1-A5) tablo geliyor: satırlar = malzemeler, hücreler = düzenlenebilir sayı input'ları
- Sticky ilk kolon (Malzeme adı) yatay kaydırmada sabit
- 5 aşama SWR ile paralel fetch, `compareState[stage][key]` local state
- **TÜMÜNÜ KAYDET (5 Aşama)** butonu `Promise.all` ile tek turda 5 PUT gönderiyor, ardından her aşamanın SWR cache'ini invalidate ediyor
- Curl doğrulama: 5 aşamanın yemek değerlerine sırayla 1000/2000/3000/4000/5000 yazıldı ve back-read'de tam eşleşti ✓

## Aşamaya Kopyala Hızlı Doldurma (Feb 17, 2026)
- `BinaUnitCostModal` compare tablosunda her hücrede:
  - **Sağ tık** → `copyRight(fromStage, key)` çağırıyor, `fromStage`'deki değeri
    strictly-sağdaki tüm aşamalara ((from+1)…5) kopyalıyor
  - Cell hover'ında sağ üstte küçük **⤳** altın chip görünür (mobil için de
    tıklanabilir) — aynı işi yapıyor
  - Toast: `A{n} → A{n+1}, ...A5 (değer)` bilgisi
- 5. aşama hücresinde ⤳ butonu gizli (sağa kopyalayacak hedef yok);
  sağ tıkta info toast göstererek uyarı veriyor
- `A2` en sağdaysa `toast.info("zaten en sağdaki aşama")`
- Curl doğrulama: A2=777, A3-A5=0 seed → 3 paralel PUT → A3-A5=[777,777,777] ✓

## /api/upload → Emergent Object Store (Feb 17, 2026)
- `POST /api/upload` (komutan/hero resimleri) artık yerel diskten `/app/uploads`'a yazmıyor
- `routes.uploads._put_object` helper'ı ile Emergent Object Store'a yükleniyor (VIP/event/dropzone gibi)
- Response şeması geriye uyumlu: `{url, filename, size}` korundu + yeni alanlar `id`, `content_type`
- URL formatı: `/api/uploads/{file_id}` (`routes.uploads` içindeki GET route Object Store'dan stream ediyor)
- MongoDB `files` collection'a kayıt: `{id, storage_path, original_filename, content_type, size, owner_id, purpose:"commander", is_deleted, created_at}`
- Legacy `UPLOADS_DIR` mount'u korundu, eski `/api/uploads/xxx.png` URL'leri sağlam çalışıyor (fallback path)
- Curl doğrulama: 200 upload, roundtrip 200 (592/592 bytes, image/png), local disk'te dosya YOK ✓

## Legacy Görsel Migrasyonu — /app/uploads → Object Store (Feb 17, 2026)

### `/app/backend/scripts/migrate_legacy_uploads.py`
- Standalone script + async fonksiyon
- Her `/app/uploads/*.{jpg,png,webp,gif,jpeg}` için:
  - `id = filename` (uzantı dahil — böylece eski URL `/api/uploads/abc.jpg` bozulmadan yeni GET route ile match ediyor)
  - `_put_object("titanxis/uploads/legacy/{id}", data, ct)`
  - `files` collection'a upsert: `{id, storage_path, purpose:"legacy", size, migrated_from_disk_at, ...}`
  - `files.find_one({id})` varsa atlar → tam idempotent
- Log formatı: `legacy uploads: migrated=N skipped=N failed=N`

### Startup Hook (server.py)
- `startup()` içinde SvS index'lerinden hemen sonra otomatik çağrılıyor
- Yeni pod restart'ında sadece atlar (skipped), performans etkisi yok

### `POST /api/uploads/migrate-legacy` (admin)
- Manuel yeniden çalıştırma endpoint'i — restart gerektirmez
- Admin `/app/uploads/`'a manuel yeni dosya bıraksa da bu endpoint'i çağırarak taşıyabilir

### Test kanıtları
- **Startup**: 36 dosya migrated ✓
- **İkinci çağrı**: 0 migrated / 36 skipped (idempotent) ✓
- **Roundtrip**: `/api/uploads/03901677...jpg` → HTTP 200, 134243 bytes, `image/jpeg` (Object Store'dan streamed) ✓

### Restart bağımlılığı yok
- Yeni yüklemeler: `POST /api/upload` direkt Object Store'a (dosya sistemi bağımlılığı yok)
- Eski görseller: Object Store'a taşındı + `files` collection'da kayıt
- `/app/uploads/*` dizini isteğe bağlı temizlenebilir — GET route Object Store'dan servis eder, StaticFiles mount'una düşmez artık

## Asker Eğitim — T12 Eklendi (Feb 17, 2026)
- `SoldierCalculator.jsx`: `TIERS = ["T11","T8","T7","T6"]` → **`["T12","T11","T8","T7","T6"]`**
- Tier grid `grid-cols-4` → `grid-cols-5` (ana ekran + modal ikisinde)
- Yeni SWR fetch: `/calculations?category=asker_egitim_t12` + save sonrası mutate
- Birim maliyet: T12 için category `asker_egitim_t12`, ilk kayıt PUT ile oluşturulur (backend zaten upsert yapar)
- Backend endpoint değişikliği gerekmedi — /unit-costs/ upsert paterni kullanılıyor

## Asker Eğitim — 5 Tier Karşılaştırma Görünümü (Feb 17, 2026)
- `SoldierCalculator.UnitCostModal`: **▦ 5 Tier'ı Karşılaştır** toggle chip'i
- Compare açıkken tek-tier seçici gizleniyor, yerine 5 kolonlu tablo (T12 · T11 · T8 · T7 · T6):
  - Satırlar: 5 malzeme (yemek, odun, çelik, benzin, süre)
  - Sticky ilk kolon (malzeme adı) yatay kaydırmada sabit
  - Her hücre editable number input, `asker-compare-{key}-{tier}` testid
- **Sağ tık** veya **⤳** altın chip → değeri sağdaki tüm tier'lara kopyala (T12→T11,T8,T7,T6)
- **TÜMÜNÜ KAYDET (5 Tier)** butonu `Promise.all` ile 5 PUT paralel gönderir, SWR cache invalidate
- Curl doğrulama: 5 tier PUT/GET roundtrip başarılı ✓

## Asker Compare — T6→T12 Fark Sütunu (Feb 17, 2026)
- Compare tablosunun en sağına yeni **"T6→T12 %"** kolonu:
  - Formül: `((T12 − T6) / T6) × 100`
  - T6=0 → "—" (bölme yok)
  - T6=0, T12>0 → "∞" (sadece T12'de maliyet)
  - Sonuç 0'dan büyükse yeşil (#4ADE80), küçükse kırmızı (#F87171), sıfırsa gri
  - İşaret: `+` veya `-`, 0 ondalık ("+334%")
- Header + cell testid: `asker-compare-delta-header`, `asker-compare-delta-{key}`
- Sol kenarı altın border ile ayrılıyor, arka planı diğerlerinden koyu

## Asker Delta Sparkline + Bina A1→A5 Fark Sütunu (Feb 17, 2026)

### Asker Compare — Sparkline üstte
- `asker-compare-sparklines` panel'i, her malzeme için mini SVG line chart:
  - 5 nokta + polyline (T6 → T12 sırasında, düşük→yüksek tier)
  - Trend rengi: `up` yeşil / `down` kırmızı / `flat` gri
  - Sağda yüzde etiketi (`+334%`, `∞`, `—`)
- Testid'ler: `asker-compare-sparklines` + satır bazında `asker-compare-spark-{key}`

### Bina Compare — A1→A5 % delta kolonu
- Tablonun sağına yeni "A1→A5 %" kolonu, Asker'daki T6→T12 kolonuyla aynı UX
- Formül: `((A5 − A1) / A1) × 100`
- Aynı edge case'ler: A1=0 → "—" · A1=0 & A5>0 → "∞"
- Testid'ler: `bina-compare-delta-header` + `bina-compare-delta-{key}`
