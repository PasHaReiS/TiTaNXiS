# PRD — TiTaNXiS Gaming Guild Management

## Original Problem Statement
Full-stack Gaming Guild Management App ("TiTaNXiS" / "oyun-loncasi"): Leaderboard, Commanders, Points, Members grouped by alliances, Events. 29-language i18n (DeepL), Premium Admin Dashboard (recharts), VIP Support tickets, Web Push (VAPID), Telegram Bot (Login Widget), Object Storage, OCR (OpenAI Vision), Interactive world map, Country/Alliance/Group notification fan-out.

## User Preferences (Locked)
- Language: **Turkish**
- Theme: Midnight Red dark
- Auth: JWT + Telegram Login Widget (for member DM linking)

## Tech Stack
- Frontend: React + react-i18next + SWR + Tailwind + Shadcn/ui + lucide-react + react-simple-maps + recharts
- Backend: FastAPI + Motor (MongoDB) + openpyxl + JWT (PyJWT) + python-telegram-bot + pywebpush
- Integrations: OpenAI GPT-4o Vision (Emergent LLM Key), DeepL API (user key), Telegram Bot API (user token), Web Push (VAPID), Emergent Object Storage

---

## [2026-02] Direct DM via Telegram Username Fallback — DONE & VERIFIED
Fulfils the user's request to DM members using just their Telegram `@handle` when they haven't linked via the Login Widget. Telegram Bot API only accepts `chat_id`, so we capture it the first time the member texts the bot.

- **Backend `server.py`**:
  - `Member`, `MemberCreate`, `MemberUpdate` models gained `telegram_username: Optional[str]`. Field is audited (added to `_AUDITED_MEMBER_FIELDS`).
  - New `_normalize_telegram_username()` helper strips leading `@` and whitespace. POST/PATCH `/members` invoke it.
  - `POST /telegram/webhook`: FastAPI layer now upserts `telegram_chat_map` (`username_lc → {chat_id, first_name, updated_at}`) on ANY inbound message with a Telegram username — not just `/start` — so members are recognised on any interaction.
  - `POST /telegram/broadcast?country_iso2=XX`: fan-out extended. Members with `telegram_username` who aren't attached to a linked user get DM'd via `telegram_chat_map` lookup. Response now includes `username_dm_hits` + `username_dm_pending` (members that have a handle but haven't `/start`ed the bot yet — admin visibility).
  - New `GET /api/telegram/username-status?usernames=a,b,c`: returns `{linked: {name: bool}, pending: [names]}` so the Members UI can show a "DM hazır" badge.
- **Backend `telegram_bot.py`**: `/start` welcome text updated to mention "Bu mesajla artık lonca yöneticileri sana Telegram üzerinden bildirim gönderebilir." (Empowers member to understand the DM policy contract.)
- **Frontend `Members.jsx` `MemberForm`**: new "Telegram Kullanıcı Adı" input with leading `@` prefix + hint text ("Üye @TiTaNXiS_BoT'a bir kere `/start` göndermeli — yoksa Telegram politikası gereği bot DM atamaz.") Persists on POST/PATCH. `data-testid="member-form-telegram-username"` + `"member-telegram-start-hint"`.
- **i18n**: TR/EN keys `member_telegram_label` + `member_telegram_hint`.
- **Doğrulama (curl E2E)**:
  - POST /members `{telegram_username:"@TgHandleRenamed"}` → stored as `TgHandleRenamed` (@ stripped) ✅
  - PATCH → audit entry captured ✅
  - `/telegram/webhook` /start → `telegram_chat_map` upserted (`TgHandleRenamed → chat_id`) ✅
  - `/telegram/username-status?usernames=TgHandleRenamed,NeverStarted` → `{TgHandleRenamed:true, NeverStarted:false}` ✅
  - `/telegram/broadcast {country:"US"}` with member `telegram_username=TgHandleRenamed`, country=US → response `{dm_targets:1, username_dm_hits:1}` ✅

**Telegram API constraint documented**: Bot API cannot DM by @username, only chat_id. So we capture chat_id on any inbound message and store it in `telegram_chat_map` (keyed by lowercased username). Admin sees `username_dm_pending` list in broadcast response so they know which handles still need to `/start` the bot.

## [2026-02] Attendance List Default Open — DONE
- `EventAttendance.jsx`: `open` state initial value flipped `false → true`. Attendance list is now always visible under each event by default; users can still collapse via the toggle button. Also causes members fetch to fire on mount (previous: only after expand).

---

## [Feb 2026 — prior] Feature history (chronological, most recent first)
- **Telegram Login Widget** (replaces manual `/link`) — DONE
- **DeepL Free plan** validated (`:fx` → `api-free.deepl.com`) — DONE
- **Hybrid push translation** (user's preferred_language → DeepL translated push) — DONE
- **Multi-reminder scheduling** per event (15/30/60 min) — DONE
- **EventAttendance panel** (full-width member list) — DONE
- **Event Audit Trail** (`member_changes` collection) — DONE
- **Dashboard "Telegram DM aktif" metric** — DONE
- **Bulk assignment** (country, rank, alliance) — DONE
- **Country-based Web-Push & Telegram broadcast** — DONE
- **MemberLocationMap** (react-simple-maps choropleth + drawer) — DONE
- **VIP Support** (categories, threads, replies, votes, trash 24h, i18n) — DONE
- **Premium Dashboard v2** (Recharts, activity log, admin-only) — DONE
- **Case-sensitive member names** (Ali ≠ ali) — DONE
- **OCR sequential per-image parsing** (Cloudflare 524 workaround) — DONE
- **Members + Event OCR multi-image + auto-create** — DONE
- **Object Storage uploads** (VIP + Commander + Event) — DONE
- **Telegram Bot @TiTaNXiS_BoT** — commands + webhook + weekly summary + daily briefing — DONE
- **29-language i18n** (DeepL bulk auto-translate) — DONE

---

## Backlog / Roadmap (P0 → P2)

### P1 — Server.py Refactoring (in progress)
- Extract `events`, `attendance`, and `points` route groups from `server.py` (3696 lines) into `routes/events.py`, `routes/attendance.py`, `routes/points.py`.
- Extract `deepl` translate/detect helpers into a shared `deepl_client.py` (currently duplicated in `telegram_bot.py` + `routes/push.py`).

### P2 — OCR Preview Cropping
- Integrate `react-image-crop` in `OcrDialog.jsx` so admins can trim the noisy borders before AI parse. Cuts token cost + improves accuracy on multi-image sets.

### Future / Nice-to-have
- **Discord Webhook Mirror**: `/api/push/broadcast` also POSTs to a configured Discord webhook.
- **OpenAI TTS voice notifications**: `sendVoice` mp3 fan-out via Telegram DM.
- **Member / Event Point CSV Export**: admin download button on Members + Events pages.
- **VIP Trash Role-Based Visibility**: editors only see their own deleted items.
- **Telegram Username DM auto-linking**: when a member `/start`s the bot, look up any `members.telegram_username` matching their handle and auto-attach `member_id` to that member's linked user (removes admin manual step).

## Test Credentials
See `/app/memory/test_credentials.md`.
