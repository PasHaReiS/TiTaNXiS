# PRD — GOD OF WAR (Gaming Guild Management)

## Original Problem Statement
Build a full-stack Gaming Guild Management App (rebranded "GOD OF WAR"): Leaderboard, Commanders list, Points tracking/adding, Member management grouped by alliances, and Events management. Midnight Red dark theme. Role-based JWT Auth (Admin, Edit, View), Excel export, 8-language i18n (TR, EN, RU, DE, FR, ES, KO, AR).

## Tech Stack
- Frontend: React + react-i18next + SWR + Tailwind + Shadcn/ui + lucide-react
- Backend: FastAPI + Motor (MongoDB) + openpyxl + JWT (PyJWT)
- Auth: JWT (7-day, localStorage `ol_token`)

## User Preferences (Locked)
- Language: **Turkish** (user communicates in TR)
- Theme: Midnight Red dark

## Implemented (feature snapshot)
- Auth: JWT, roles (admin / user + can_edit / view), user management, forced password change
- Members: grouped by alliance, filter/sort, alliance color picker, castle level, military barracks (tetikçi/bombacı/kalkanlı F+T)
- **[2026-02] Case-sensitive alliance names**: Backend removed `gow → GOW` normalization in `leaderboard/by-alliance`; groups keyed by exact case. Sort priority: `GOW → GoW → GOw → alpha → Gruplandırılamamış`. Frontend removed `uppercase` CSS from alliance headers/labels in Members.jsx, Leaderboard.jsx, and AllianceColorPicker preview so display matches DB exactly.
- **[2026-02] Member card + compact profile modal**: Card body now shows only the member name (bold) + castle level (`t("castle_short")` format like "Kale F8") — alliance badge moved into the popup. Clicking a name opens `MemberProfileDialog` — a compact custom (non-Radix) modal that lists: name+ID, alliance chip (case-preserved), Kale Seviyesi (F8), Tetikçi/Kalkanlı/Bombacı as `F# - T#` rows. Missing values render as `-`. Backdrop click closes. Radix `Dialog` replaced due to portal/transform positioning bug that placed content at y=6021.
- **[2026-02] Members POST validation fix**: `MemberCreate` schema — only `name` is required; `member_id`, `rank` (defaults to `R1`), `alliance_name`, `castle_level`, `tetikci_*`, `bombaci_*`, `kalkanli_*`, `note`, `title`, `level` all optional. Extra unknown fields ignored via `ConfigDict(extra="ignore")`.
- **[2026-02] Members list restructure**: Each alliance is an independent collapsible accordion block. Within each alliance, rank sections (R5→R4→R3→R2→R1) are independent collapsible sub-accordions. **All ranks render as 2-column responsive grid** (previous R5-full-width rule removed). Card shows large name, ID, castle level, and an alliance badge preserving DB case. Alliance groups sorted GOW → GoW → GOw → alpha → NoGroup last.
- Commanders: image upload, rarity (Legendary/Epic/Common), KoF matching, dynamic multi-select ranks, 4-slot team compositions (Tetikçi/Bombacı/Kalkanlı/Robot), custom sort (KoF S6→S1 first, then non-KoF R5→R1)
- Points/Events: add points, event archive/active/all filter, per-event scoreboard, podium
- Excel export: styled multi-sheet openpyxl with AutoFilters, dynamic alliance PatternFill row colors
- i18n: 8 languages with Midnight Red dropdown panel
- Alliance colors: dynamic, persisted in `alliance_colors` collection

## Key Files
- `/app/frontend/src/pages/Members.jsx` — accordion by alliance + rank
- `/app/frontend/src/pages/Commanders.jsx` — team slots, KoF, rarity, sorting
- `/app/backend/server.py` — API routes, Excel export
- `/app/frontend/src/i18n/index.js` — 8-language dict

## Backlog (Prioritized)
- **P1** — Rarity filter chips (Legendary/Epic/Common) above Commander grid
- **P2** — Duplicate button in Commander team composition form
- **P3** — Chart sheet in Excel export (top 10 alliances by points)
- **P3** — Members: "Expand all" / "Collapse all" quick buttons for the rank sections
- **P3** — Persist collapse state in localStorage per alliance

## Test Credentials
See `/app/memory/test_credentials.md`

## Notes for Next Agent
- Do NOT create random files under `/app/backend/` that trigger uvicorn watchfiles reload cascade (502 crash).
- Router prefixes: `auth_router` mounted so `/api/auth/login` resolves.
- REACT_APP_BACKEND_URL is the only correct external URL — never hardcode.
