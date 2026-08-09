// Deterministic color palette for event group names — used across Events page + widgets
const PALETTE = [
  "#F5A623", // gold
  "#E74C1A", // fire
  "#A855F7", // purple
  "#3B82F6", // blue
  "#22C55E", // green
  "#EC4899", // pink
  "#EAB308", // amber
  "#38BDF8", // cyan
  "#F97316", // orange
  "#EF4444", // red
  "#8B5CF6", // violet
  "#14B8A6", // teal
];

// FNV-1a-ish hash of a string → palette index. Same input → same color across app.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

export function groupColor(name) {
  if (!name) return "#666666";
  const idx = hashStr(String(name).toLowerCase()) % PALETTE.length;
  return PALETTE[idx];
}

export function groupBgTint(name, alpha = 0.14) {
  const c = groupColor(name);
  // Convert hex → rgba
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
