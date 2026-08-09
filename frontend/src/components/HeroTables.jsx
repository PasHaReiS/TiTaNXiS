import React, { useState } from "react";
import { useTranslation } from "react-i18next";

// Hero Star data: rows correspond to 1..5 stars
// Order: [Recruit, Part1, Part2, Part3, Part4, Part5, Part6, TOTAL]
const HERO_STAR_ROWS = [
  { star: 1, values: [10, 1, 1, 2, 2, 2, 2, 20] },
  { star: 2, values: [null, 5, 5, 5, 5, 5, 15, 45] },
  { star: 3, values: [null, 15, 15, 15, 15, 15, 40, 115] },
  { star: 4, values: [null, 40, 40, 40, 40, 40, 100, 300] },
  { star: 5, values: [null, 100, 100, 100, 100, 100, 100, 600] },
];

// Cumulative helper: sum column-wise from star 1 → target star.
function cumulativeThrough(star) {
  const cum = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const row of HERO_STAR_ROWS) {
    if (row.star > star) break;
    row.values.forEach((v, i) => { cum[i] += Number(v) || 0; });
  }
  return cum;
}

const WEAPON_ROWS = [
  { from: 0, to: 1, parts: 10 },
  { from: 1, to: 2, parts: 25 },
  { from: 2, to: 3, parts: 25 },
  { from: 3, to: 4, parts: 45 },
  { from: 4, to: 5, parts: 45 },
  { from: 5, to: 6, parts: 65 },
  { from: 6, to: 7, parts: 65 },
  { from: 7, to: 8, parts: 85 },
  { from: 8, to: 9, parts: 85 },
  { from: 9, to: 10, parts: 100 },
];

const fmt = (n) => (n === null || n === undefined ? "-" : Number(n).toLocaleString("tr-TR"));

const StarLabel = ({ n }) => (
  <span aria-label={`${n} star`}>
    {"⭐".repeat(n)}
  </span>
);

export default function HeroTables() {
  const { t } = useTranslation();
  const [selectedStar, setSelectedStar] = useState(1);
  const [selectedWeapon, setSelectedWeapon] = useState(0);

  const currentStar = HERO_STAR_ROWS.find((r) => r.star === selectedStar) || HERO_STAR_ROWS[0];
  const currentWeapon = WEAPON_ROWS[selectedWeapon];

  const partLabels = [
    t("ht_recruit"),
    t("ht_part_1"),
    t("ht_part_2"),
    t("ht_part_3"),
    t("ht_part_4"),
    t("ht_part_5"),
    t("ht_part_6"),
    t("ht_total"),
  ];

  // Split into 2 columns: left = Recruit, Part1, Part2, Part3 (indices 0-3), right = Part4-6, TOTAL (indices 4-7)
  const leftColumn = [0, 1, 2, 3];
  const rightColumn = [4, 5, 6, 7];

  return (
    <div data-testid="hero-tables" className="flex flex-col" style={{ gap: 10 }}>
      {/* ===== TABLE 1: HERO STAR ===== */}
      <div
        data-testid="hero-star-section"
        style={{
          background: "#1a1a2e",
          border: "1px solid rgba(231,76,26,0.3)",
          borderRadius: 8,
          padding: 10,
        }}
      >
        <h3
          style={{
            color: "#E74C1A",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {t("ht_hero_star_title")}
        </h3>

        {/* Star selector — 3 top + 2 bottom, compact 60px buttons */}
        <div
          data-testid="hero-star-selector"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 60px)", gap: 4, marginBottom: 8, maxWidth: 192, boxSizing: "border-box", overflow: "hidden" }}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n === selectedStar;
            return (
              <button
                key={n}
                type="button"
                data-testid={`hero-star-btn-${n}`}
                aria-pressed={active}
                onClick={() => setSelectedStar(n)}
                style={{
                  width: "100%",
                  height: 24,
                  flexGrow: 0,
                  flexShrink: 0,
                  boxSizing: "border-box",
                  borderRadius: 4,
                  padding: "2px 3px",
                  fontSize: 9,
                  lineHeight: 1.1,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: active
                    ? "linear-gradient(135deg,#D4730A,#E74C1A)"
                    : "#1A1210",
                  color: active ? "#0B0704" : "#F5F0E8",
                  border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  boxShadow: active ? "0 0 6px rgba(231,76,26,0.5)" : "none",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <StarLabel n={n} />
              </button>
            );
          })}
        </div>

        {/* Selected star — 2×4 label/value grid */}
        <div
          data-testid={`hero-star-card-${currentStar.star}`}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: 8,
            rowGap: 2,
            background: "rgba(11,7,4,0.4)",
            borderRadius: 4,
            padding: "6px 8px",
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
            const isTotal = idx === 7;
            return (
              <div
                key={idx}
                data-testid={`hero-star-${currentStar.star}-row-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "2px 4px",
                  background: isTotal ? "rgba(245,166,35,0.15)" : "transparent",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isTotal ? 700 : 500,
                    color: isTotal ? "#F5A623" : "#B8B0A5",
                    letterSpacing: isTotal ? "0.06em" : "normal",
                    textTransform: isTotal ? "uppercase" : "none",
                  }}
                >
                  {partLabels[idx]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isTotal ? "#F5A623" : "#F5F0E8",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(currentStar.values[idx])}
                </span>
              </div>
            );
          })}
        </div>
        {/* Cumulative 1→N cost panel */}
        <div
          data-testid={`hero-star-cumulative-${currentStar.star}`}
          style={{
            marginTop: 6,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: 8,
            rowGap: 2,
            background: "linear-gradient(180deg, rgba(76,29,149,0.35), rgba(30,58,138,0.35))",
            border: "1px solid rgba(168,85,247,0.4)",
            borderRadius: 4,
            padding: "6px 8px",
          }}
        >
          <div style={{ gridColumn: "1 / -1", fontSize: 10, fontWeight: 700, color: "#E0E7FF", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
            {t("ht_cumulative_title", { star: currentStar.star })}
          </div>
          {(() => {
            const cum = cumulativeThrough(currentStar.star);
            return [0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
              const isTotal = idx === 7;
              return (
                <div
                  key={`cum-${idx}`}
                  data-testid={`hero-star-cumulative-${currentStar.star}-row-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "2px 4px",
                    background: isTotal ? "rgba(168,85,247,0.25)" : "transparent",
                    borderRadius: 3,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: isTotal ? 700 : 500, color: isTotal ? "#F5A623" : "#C7BFB4", letterSpacing: isTotal ? "0.06em" : "normal", textTransform: isTotal ? "uppercase" : "none" }}>
                    {partLabels[idx]}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isTotal ? "#F5A623" : "#E0E7FF", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(cum[idx])}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ===== TABLE 2: EXCLUSIVE WEAPONS ===== */}
      <div
        data-testid="hero-weapon-section"
        style={{
          background: "#1a1a2e",
          border: "1px solid rgba(231,76,26,0.3)",
          borderRadius: 8,
          padding: 10,
        }}
      >
        <h3
          style={{
            color: "#E74C1A",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          {t("ht_weapons_title")}
        </h3>

        {/* Weapon transition selector - 5x2 grid */}
        <div
          data-testid="hero-weapon-selector"
          className="grid grid-cols-5"
          style={{ gap: 4, marginBottom: 8 }}
        >
          {WEAPON_ROWS.map((r, i) => {
            const active = i === selectedWeapon;
            return (
              <button
                key={i}
                type="button"
                data-testid={`hero-weapon-btn-${i}`}
                aria-pressed={active}
                onClick={() => setSelectedWeapon(i)}
                style={{
                  borderRadius: 5,
                  padding: "5px 3px",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "Cinzel, serif",
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: active
                    ? "linear-gradient(135deg,#D4730A,#E74C1A)"
                    : "#1A1210",
                  color: active ? "#0B0704" : "#F5F0E8",
                  border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  boxShadow: active ? "0 0 6px rgba(231,76,26,0.5)" : "none",
                }}
              >
                {r.from}→{r.to}
              </button>
            );
          })}
        </div>

        {/* Selected weapon transition card */}
        <div
          data-testid={`hero-weapon-card-${selectedWeapon}`}
          className="flex items-center justify-between"
          style={{
            padding: "8px 12px",
            background: "linear-gradient(180deg, #2A1408 0%, #1a0d05 100%)",
            border: "1px solid #F5A623",
            borderRadius: 6,
            boxShadow: "0 0 8px rgba(245,166,35,0.25) inset",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#F5A623",
              fontFamily: "Cinzel, serif",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {t("ht_required_parts")} ({currentWeapon.from}→{currentWeapon.to})
          </span>
          <span
            data-testid={`hero-weapon-value-${selectedWeapon}`}
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#F5F0E8",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmt(currentWeapon.parts)}
          </span>
        </div>
      </div>
    </div>
  );
}
