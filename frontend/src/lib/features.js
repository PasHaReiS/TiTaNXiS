// v143.3 — Feature flags. Toggle here to re-enable a subsystem app-wide.
// Kept as an ES module so tree-shakers can inline the constant and dead-code
// eliminate the branches when a flag is false.

// v143.3 — Rozet sistemi tamamen gizli (kullanıcı isteği). Backend endpoint'ler,
// veriler ve BadgeAISuggestions componenti kod tabanında duruyor — sadece UI
// erişimi kapalı. `true` yaparak tümünü geri açabilirsin.
export const BADGES_ENABLED = false;
