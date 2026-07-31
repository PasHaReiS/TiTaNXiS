// Alliance color assignment: consistent color per alliance name.
// Supports custom color overrides via a map passed as second arg
// (populated from GET /api/alliance-colors).

const PALETTE = [
  { bg: "#2563eb", border: "#60a5fa" }, // blue
  { bg: "#16a34a", border: "#4ade80" }, // green
  { bg: "#7c3aed", border: "#a78bfa" }, // purple
  { bg: "#ea580c", border: "#fb923c" }, // orange
  { bg: "#0891b2", border: "#22d3ee" }, // cyan
  { bg: "#db2777", border: "#f472b6" }, // pink
  { bg: "#65a30d", border: "#a3e635" }, // lime
  { bg: "#4b5563", border: "#9ca3af" }, // gray
  { bg: "#0d9488", border: "#5eead4" }, // teal
  { bg: "#a16207", border: "#fbbf24" }, // amber
];

const GOW_GRADIENT = { bg: "linear-gradient(135deg,#DC2626,#F5A623)", border: "#F5A623" };

function hash(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Lighten a hex color by mixing with white — used to derive the border shade.
function lightenHex(hex, amt = 0.35) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amt).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

export function getAllianceColor(name, customColors) {
  if (!name) return { bg: "#374151", border: "#6b7280" };
  const custom = customColors && customColors[name];
  if (custom) {
    return { bg: custom, border: lightenHex(custom, 0.4) };
  }
  if (name === "GOW") return GOW_GRADIENT;
  return PALETTE[hash(name) % PALETTE.length];
}

export function allianceBadgeStyle(name, customColors) {
  const c = getAllianceColor(name, customColors);
  return {
    background: c.bg,
    borderColor: c.border,
    color: "#fff",
  };
}
