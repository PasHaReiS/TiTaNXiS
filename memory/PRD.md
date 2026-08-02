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
- **[2026-02] Name casing preserved**: Added `textTransform:'none'` + `normal-case` class to all member-name renders across Leaderboard (podium+rest), Members cards, PointsList rows, AddPoints selector/history — DB casing shown as-is (e.g. `PaSHa` renders `PaSHa`, not `PASHA`).
- **[2026-02] Dropdown z-index & style**: Header profile dropdown now `position:absolute`, `zIndex:9999`, `background:#1E1410`, `border:1px solid #E74C1A`, `box-shadow:0 4px 20px rgba(0,0,0,0.8)` — always overlays other content.
- **[2026-02] New brand logo**: Header logo swapped to new URL (`fb92b583ca964c22a56b6b68f1cf73ef_1000073431.jpg`). Style: 44×88 px, `object-fit:cover`, `border-radius:4px`, `transform:scaleX(1.15)` for slight horizontal stretch. Old text-based logo variants removed. Verified iter_16.
- **[2026-02] Logo v3**: Header logo swapped to `4e1d325e85084ea69c28857dabe96728_1000073434.jpg`. Height 40, max-width 160, `object-fit:contain`, `border-radius:4`. Removed `scaleX(1.15)` transform. Verified iter_17.
- **[2026-02] Logo enlarged (v3.1)**: Header img now stretches to fill left side — height 56, width 100% up to maxWidth 400, `object-fit:cover`, `object-position:left center`, `border-radius:6`. Renders as wide banner ("God of War" text visible). Right controls (LanguageSwitcher, theme, profile) unaffected.
- **[2026-02] Background music toggle**: New `header-music-toggle` button between LanguageSwitcher and theme toggle. Uses Volume2 (playing / `#E74C1A` + glow) / VolumeX (paused / `#F5F0E8`) lucide icons. Loops, volume 0.3, no autoplay. Music file self-hosted at `/app/frontend/public/audio/epic_battle.mp3` (Kevin MacLeod "Hitman" 8MB CC-BY). i18n keys `music_play`, `music_stop`, `music_blocked` added for all 8 locales. Verified iter_19.
- **[2026-02] Portal dropdown**: Header profile dropdown now rendered via `ReactDOM.createPortal(..., document.body)` with z-index 999999 (overlay 999998). Escapes any parent stacking context and always appears above stat cards. Removed the redundant `mousedown` outside-click useEffect — overlay div is sole outside-click handler. Menu items (Profil, Kullanıcılar, Şifre Değiştir, Detaylı Rapor, Çıkış) all click-functional.
- **[2026-02] Floating music button + new Viking track**: Music toggle moved from Header into new `/components/MusicButton.jsx` rendered globally via `Layout.jsx`. Floating fixed at bottom:80 right:16, 48×48 circle, `linear-gradient(135deg,#C0392B,#E74C1A)`, box-shadow `0 4px 12px rgba(231,76,26,0.5)`, zIndex 9000. Pulses with `musicPulse` keyframes (2s infinite) when playing. MP3 swapped to Joel Fazhari "Against All Gods" Viking tribal track (external CDN, 6.3MB, audio/mpeg). Volume 0.4, loop true, no autoplay. Old `/audio/epic_battle.mp3` local file retained but unused.
- **[2026-02] Tab rename → LoJ Hakkında**: `nav_commanders` + `commanders_title` renamed across all 8 locales (TR "LoJ Hakkında", EN "About LoJ", RU "О LoJ", DE "Über LoJ", FR "À propos LoJ", ES "Sobre LoJ", KO "LoJ 소개", AR "حول LoJ"). Route path `/komutanlar` unchanged.
- **[2026-02] MALİYET HESAPLAMA section**: Added new sidebar section with 8 sub-categories (mh_asker_egitim, mh_bina, mh_teknoloji, mh_kitap, mh_koleksiyon, mh_ekipman, mh_uydu, mh_robot). Uses existing commanders collection with `category` prefix `mh_`. Items rendered as info-style cards (title/body/image) — `isInfo` and `addButtonLabel` extended to treat `mh_*` keys the same as `bilgilendirme`. `sb_maliyet_hesaplama` i18n key added for all 8 locales.
- **[2026-02] Dropdown position fixed + overlay**: Header dropdown promoted to `position:fixed, top:60, right:8, zIndex:99999`. Added transparent overlay (`data-testid="header-profile-overlay"`, `position:fixed, inset:0, zIndex:99998`) that closes menu on outside-click. Solves stacking issue against stats cards. Verified iter_17.
- **[2026-02] Işıklandır removed + constant podium glow**: Removed `podium-illuminate` button, `podiumLit` state, and `Sparkles` import. Podium cards now render permanent gradient bg + fixed glow (p1 red 0.6, p2 silver 0.5, p3 bronze 0.5). Alliance pill (`podium-alliance-badge-1/2/3`, text-[9px] rounded-full, allianceColors[name] || `#E74C1A`) added under member name on each podium card. Verified iter_17.
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
