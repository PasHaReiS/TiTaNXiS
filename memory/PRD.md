# PRD — Oyun Loncası Yönetim Uygulaması

## Original Problem Statement
Turkish Gaming Guild Management App (Oyun Loncası). Replica + improved version of an existing project. Mobile-first (max 430px), dark theme with Midnight Red aesthetic (bg #0a0a0a, red #DC2626, gold #F5A623). 6 bottom-nav tabs. Turkish UI throughout.

## User Choices (2026-02)
- Database: PostgreSQL requested, MongoDB used due to environment constraint (documented for user)
- All 9 improvements included: real-time updates, PDF/CSV export, multiplier history, dark/light mode toggle, member profile, notifications, bulk points, responsive, smooth animations
- Design: Midnight Red - bg #0a0a0a, red accents #DC2626, gold highlights #F5A623, dark cards #1c1c1c, red-gold borders. Aggressive gaming aesthetic.

## Architecture
- Backend: FastAPI (Python) + MongoDB (Motor async client). All routes under `/api` prefix. Auto-seeds on startup if empty.
- Frontend: React 19 + React Router 7 + SWR (real-time polling) + Tailwind + shadcn/ui + Sonner (toasts) + Lucide icons + Rajdhani/JetBrains Mono fonts.
- Deployment: Kubernetes ingress routes `/api` → :8001 (backend), everything else → :3000 (frontend).

## User Personas
- **Guild Leader**: Manages 156 members, adds points, tracks event participation, archives events, exports rapor.
- **Member (view-only)**: Checks leaderboard, own profile history, commander guides.

## Core Requirements (Static)
- Turkish UI everywhere
- Mobile 430px centered layout with fixed bottom nav (6 tabs, red-gold active state)
- Turkish flag icon in header
- Rank system: GOW, R5, R4, R3, R2, R1 with colored badges/headers
- Multiplier system 1x/1.5x/2x/3x + custom

## What's Been Implemented (2026-02-XX)
### Backend (server.py, 651 lines)
- Models: Member, Event, Point, Commander (UUID ids, timezone-aware ISO datetimes)
- CRUD: /api/members, /api/events, /api/points, /api/commanders (all with GET/POST/PATCH/DELETE)
- POST /api/points/bulk — bulk points to multiple members
- POST /api/events/archive-group — archive all events in a group
- GET /api/stats — dashboard counters
- GET /api/leaderboard[?group_name|event_id] — aggregated & sorted
- GET /api/members/{id}/history — profile + point history
- GET /api/export/csv — Turkish-header CSV
- GET /api/event-groups — grouped counts
- GET /api/multiplier-history — points grouped by multiplier
- POST /api/seed[?force] — populate DB
- Auto-seed on startup: 156 members (GOW=94, R5=1, R4=8, R3=20, R2=18, R1=15), 14 events (6 active + 8 archived), 14 commanders across all 12 categories, ~1120 point records

### Frontend
- **Tab 1 Sıralama**: 4 stat pills, AKTİF/ARŞİV chips, event-group chips, top-3 podium (crown/medal/award medals), full ranked list (rows clickable to open profile modal), Detaylı Rapor CSV export button, dark/light theme toggle
- **Tab 2 Komutanlar**: Sidebar tree (BİLGİLENDİRME / KOMUTANLAR / KAFES / GARNİZON / SAVAŞ / SVS), main cards with image, characters chips, edit/delete, + YENİ form
- **Tab 3 Puan Listesi**: Searchable list showing member/event/note/points/multiplier/date, delete action
- **Tab 4 Puan Ekle**: Member search dropdown, event select w/ flag, points input, multiplier button-group (1x default gold, 1.5x, 2x, 3x, custom), note, big PUANI EKLE button, SON 5 KAYIT list. Toggle bulk mode with checkboxes.
- **Tab 5 Üyeler**: Search, + YENİ, grouped by rank with colored headers, member cards with rank-badge + name + ID + title, edit/delete buttons. Click card opens profile with point history.
- **Tab 6 Etkinlikler**: AKTİF/ARŞİV tabs, grouped display with GRUBU ARŞİVLE button, event cards with flag/name/subtitle/multiplier/date, archive/edit/delete actions, + YENİ form
- Toast notifications on every action (sonner)
- SWR polling 5-8s for real-time feel
- Member profile dialog with full point history
- Data-testid attributes on all interactive elements
- Custom Turkish flag CSS component
- Rajdhani + JetBrains Mono fonts

## Testing (2026-02-XX)
- Backend: 18/18 tests PASSED — all CRUD, stats, leaderboard, export, bulk, filters verified
- Frontend: Manual screenshot verified — Leaderboard renders with all 156 members and correct theme

## Known Limitations
- MongoDB used instead of requested PostgreSQL (environment constraint)
- No pagination on large lists (fine at 156 members)
- CORS allow_origins='*' with credentials (documented; not blocking)

## Prioritized Backlog

### P1 - High Value
- **Member Level Toggle in header** — quick GOW-only/all-ranks view (mentioned in original screenshot)
- **PDF export** — currently CSV only; add PDF using jsPDF client-side
- **Multiplier history detail page** — currently endpoint exists but no dedicated UI

### P2 - Polish
- Server-side pagination on /api/points and /api/members
- Optimistic UI updates on create/edit/delete
- Undo toast for delete operations
- Better empty states / loading skeletons

### P3 - Extensions
- Real-time WebSocket updates (currently polling)
- Event participation heatmap chart
- Member growth chart in stats
- Import from CSV
- Push notifications for new events
