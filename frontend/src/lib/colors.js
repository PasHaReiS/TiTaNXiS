// Alliance color assignment: consistent color per alliance name
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

export function getAllianceColor(name) {
  if (!name) return { bg: "#374151", border: "#6b7280" };
  if (name === "GOW") return GOW_GRADIENT;
  return PALETTE[hash(name) % PALETTE.length];
}

export function allianceBadgeStyle(name) {
  const c = getAllianceColor(name);
  return {
    background: c.bg,
    borderColor: c.border,
    color: "#fff",
  };
}
