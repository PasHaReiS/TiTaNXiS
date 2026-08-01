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
- **[2026-02] Commander card rarity theming**: `rarityCardStyle` helper — Legendary orange (#F97316), Epic purple (#A855F7), Common blue (#3B82F6) frames + dark tinted bg gradient. Applied to grid + list cards + image thumbnails.
- **[2026-02] Commander "Tümü" flat view + Robotlar excluded**: KOMUTANLAR aggregate section renders as a single flat 2-col grid of Tetikçi + Bombacı + Kalkanlı; `Robotlar` excluded from Tümü and only in its own sub-tab.
- **[2026-02] Commander grid sort (shared helper)**: Module-level `sortCommandersList(arr)` in `Commanders.jsx`. Order: (1) KoF first → (2) Ranked non-KoF (S6→…→R1) → (3) Unranked by rarity (legendary > epic > common) → (4) Turkish-locale name tie-break. Used by both single-category and aggregate grid views.
- **[2026-02] Commander form: hide Rank + Rarity for Team & Garrison**: `CommanderForm` in `Commanders.jsx` skips Rank + Rarity block when current section is `KAFES ETKİNLİK`, `SAVAŞ`, `SVS EKİP`, or `GARNİZON`.
- **[2026-02] Note position + color (Member)**: Backend `Member`/`MemberCreate`/`MemberUpdate` extended with `note_position` (`inline` | `bottom`) and `note_color` (hex). Form has toggle chips + 8-color palette shown only when bottom is selected. Card + Profile Dialog render conditionally with defensive `note.trim() !== ""` guard.
- **[2026-02] Stone & Fire final polish**: `Leaderboard.jsx` rest rows now use `.rank-row` (carved stone slab + lava left border + inset shadow) instead of `.card-dark`. Position `#N` amber-Cinzel, name Cinzel-cream, total lava `#E74C1A`. `.section-title` promoted to Cinzel+amber+lava-underline via `.heading-cinzel`. Üyeler alliance header span uses Cinzel with 0.08em tracking.
- **[2026-02] BottomNav lucide icons**: Reverted custom SVG runic icons to standard `lucide-react` (Trophy, Swords, BarChart2, PlusCircle, Users, Flag). Size `w-[22px] h-[22px]`, ACTIVE `#E74C1A` with `drop-shadow(0 0 6px rgba(231,76,26,0.5))` glow, INACTIVE `#666`.
- **[2026-02] BottomNav centering**: `flex flex-col items-center justify-center text-center` on NavLink; label span uses `text-center leading-tight w-full` so multi-line labels center evenly.
- **[2026-02] Leaderboard: alliance replaces level**: All 3 podium slots + rest rows now show `alliance_name` (fallback "-" / t("member")) instead of "Lv N".
- **[2026-02] Leaderboard: PODYUM title removed + collapsible podium**: `podiumOpen` state with `data-testid="podium-toggle"` button (ChevronUp/Down, Stone & Fire styled). Default open. Section-title text gone.
- **[2026-02] Header cleanup**: `subtitle` prop no longer rendered (dead-code prop remains at callsites but is ignored) — header is now logo-only alongside language/theme/profile controls.
- **[2026-02] PointsList inline edit**: Blue Pencil button per row (`data-testid="edit-scorelist-{id}"`) opens `EditScoreDialog` (points / multiplier / event / note) → PATCH `/api/scores/{id}`. Refreshes SWR keys `/scores`, `/points`, `/stats`, `/leaderboard`.
- **[2026-02] Members Ungrouped color-picker**: Removed `grp.name !== t("no_group")` guard — `Gruplandırılmamış` group also shows Palette button (`alliance-color-btn-Gruplandırılmamış`) and opens the AllianceColorPicker like normal alliances.
- **[2026-02] Excel Sıralama sheet — full ranking**: Sheet 3 now merges zero-point members after scored ones and writes sequential `idx` (1..N) in column A. Total row count == `/api/members` count. Verified via openpyxl (iteration_13 pytest).
- **[2026-02] Null-safe member search**: Guarded `(m.name || '').toLowerCase()` and `(m.member_id || '').includes(...)` across AddPoints.jsx (single+bulk+filter-edit), Commanders.jsx (character search), PointsList.jsx, Members.jsx sort cmp — fixes prior `Cannot read properties of null (reading 'includes')` TypeError when a member had null name/id.
- **[2026-02] Tab label rename**: `nav_commanders` translated to "Komutan Bilgileri" (TR) / "Commander Info" (EN) / "Информация о командирах" (RU) / "Kommandanten-Info" (DE) / "Info Commandants" (FR) / "Info Comandantes" (ES) / "지휘관 정보" (KO) / "معلومات القادة" (AR). Verified live across all 8 locales in iteration_14.
- **[2026-02] Leaderboard row alliance pill**: Rank badge (R4/R5) in rest rows replaced with alliance-name pill (`data-testid="row-alliance-badge-{id}"`) — `minWidth 48px`, `text-[10px]`, background = custom alliance color if set else `#E74C1A`, `"-"` fallback when no alliance_name.
- **[2026-02] Podium narrower + Işıklandır button**: Grid switched to inline `gridTemplateColumns: '0.85fr 1fr 0.85fr'` + `gap: 4px`. Removed ChevronUp/Down toggle; added `Sparkles`-icon `Işıklandır` button (`data-testid="podium-illuminate"`, `aria-pressed`, default OFF). When ON, each podium card's `boxShadow` transitions (0.5s) to: p1 red glow `rgba(220,38,38,0.9)/0.4`, p2 silver `rgba(192,192,192,0.8)/0.3`, p3 bronze `rgba(205,127,50,0.8)/0.3`. `illuminate` i18n key added for all 8 languages.
- **[2026-02] Header profile dropdown**: `header-profile` button now toggles a dropdown menu (`data-testid="header-profile-dropdown"`) with items Profil, Kullanıcılar (admin), Şifre Değiştir, Detaylı Rapor (admin), Çıkış. Standalone `header-settings-btn` removed. Excel export moved from Leaderboard bottom into this dropdown (`dropdown-export`, admin-only). Old bottom button retained hidden with `className="hidden"` to preserve `LEADERBOARD.exportButton` testId contract. Verified 100% in iteration_15.
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
- User communicates in Turkish — respond in Turkish.
