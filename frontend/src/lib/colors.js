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
// v62 — Akademi (case variants like `GoW` / `GOw`) için ayrık mavi-cam gradient.
// Case-sensitive alliance mühürüyle uyumlu: sadece `GOW` (exact) ana ittifak;
// diğer casing'ler otomatik olarak akademi olarak boyanır.
const ACADEMY_GRADIENT = {
  bg: "linear-gradient(135deg,#0369A1,#38BDF8)",
  border: "#7DD3FC",
};

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

// v62 — Akademi tespiti: sadece `GOW` (exact) ANA ittifaktır; diğer tüm
// casing varyantları (`GoW`, `GOw`, `gow`, ...) AKADEMİ olarak işaretlenir.
// Case-sensitivity mühürüyle 1:1 uyumlu, hiçbir birleştirme yapmaz.
export function isAcademyAlliance(name) {
  if (!name) return false;
  const s = String(name);
  return s !== "GOW" && s.toUpperCase() === "GOW";
}

export function getAllianceColor(name, customColors) {
  if (!name) return { bg: "#374151", border: "#6b7280", academy: false };
  const custom = customColors && customColors[name];
  if (custom) {
    return { bg: custom, border: lightenHex(custom, 0.4), academy: isAcademyAlliance(name) };
  }
  if (name === "GOW") return { ...GOW_GRADIENT, academy: false };
  if (isAcademyAlliance(name)) return { ...ACADEMY_GRADIENT, academy: true };
  const p = PALETTE[hash(name) % PALETTE.length];
  return { ...p, academy: false };
}

export function allianceBadgeStyle(name, customColors) {
  const c = getAllianceColor(name, customColors);
  const style = {
    background: c.bg,
    borderColor: c.border,
    color: "#fff",
  };
  if (c.academy) {
    // Ekstra outer sky-glow + solid border kalır — akademi olduğu bir bakışta
    // anlaşılsın diye. (Dashed border küçük chip'lerde okunmuyor.)
    style.boxShadow = "0 0 0 1px rgba(125,211,252,0.55), 0 0 6px rgba(56,189,248,0.35)";
  }
  return style;
}
