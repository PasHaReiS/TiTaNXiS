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
    <div data-testid="hero-tables" className="flex flex-col" style={{ gap: 24 }}>
      {/* ===== TABLE 1: HERO STAR ===== */}
      <div
        data-testid="hero-star-section"
        style={{
          background: "#1a1a2e",
          border: "1px solid rgba(231,76,26,0.3)",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h3
          style={{
            color: "#E74C1A",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {t("ht_hero_star_title")}
        </h3>

        {/* Star selector */}
        <div
          data-testid="hero-star-selector"
          style={{ display: "flex", flexWrap: "nowrap", gap: 4, marginBottom: 16, width: "100%" }}
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
                  flex: 1,
                  minWidth: 0,
                  borderRadius: 6,
                  padding: "8px 4px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: active
                    ? "linear-gradient(135deg,#D4730A,#E74C1A)"
                    : "#1A1210",
                  color: active ? "#0B0704" : "#F5F0E8",
                  border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  boxShadow: active ? "0 0 10px rgba(231,76,26,0.5)" : "none",
                  whiteSpace: "nowrap",
                  textAlign: "center",
                }}
              >
                <StarLabel n={n} />
              </button>
            );
          })}
        </div>

        {/* Selected star card - 2 columns grid */}
        <div
          data-testid={`hero-star-card-${currentStar.star}`}
          className="grid grid-cols-1 md:grid-cols-2"
          style={{
            gap: 12,
            background: "rgba(11,7,4,0.6)",
            border: "1px solid rgba(245,166,35,0.35)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          {[leftColumn, rightColumn].map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col" style={{ gap: 8 }}>
              {col.map((idx) => {
                const isTotal = idx === 7;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between"
                    data-testid={`hero-star-${currentStar.star}-row-${idx}`}
                    style={{
                      padding: "8px 10px",
                      background: isTotal ? "rgba(245,166,35,0.12)" : "rgba(26,18,16,0.6)",
                      borderRadius: 6,
                      border: isTotal ? "1px solid #F5A623" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isTotal ? 700 : 600,
                        color: isTotal ? "#F5A623" : "#F5F0E8",
                        letterSpacing: isTotal ? "0.08em" : "normal",
                        textTransform: isTotal ? "uppercase" : "none",
                      }}
                    >
                      {partLabels[idx]}
                    </span>
                    <span
                      style={{
                        fontSize: isTotal ? 16 : 14,
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
          ))}
        </div>
      </div>

      {/* ===== TABLE 2: EXCLUSIVE WEAPONS ===== */}
      <div
        data-testid="hero-weapon-section"
        style={{
          background: "#1a1a2e",
          border: "1px solid rgba(231,76,26,0.3)",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h3
          style={{
            color: "#E74C1A",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {t("ht_weapons_title")}
        </h3>

        {/* Weapon transition selector - 5x2 grid */}
        <div
          data-testid="hero-weapon-selector"
          className="grid grid-cols-5"
          style={{ gap: 6, marginBottom: 16 }}
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
                  borderRadius: 6,
                  padding: "8px 4px",
                  fontSize: 12,
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
                  boxShadow: active ? "0 0 8px rgba(231,76,26,0.5)" : "none",
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
            padding: "14px 18px",
            background: "linear-gradient(180deg, #2A1408 0%, #1a0d05 100%)",
            border: "1px solid #F5A623",
            borderRadius: 8,
            boxShadow: "0 0 12px rgba(245,166,35,0.25) inset",
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#F5A623",
              fontFamily: "Cinzel, serif",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {t("ht_required_parts")} ({currentWeapon.from}→{currentWeapon.to})
          </span>
          <span
            data-testid={`hero-weapon-value-${selectedWeapon}`}
            style={{
              fontSize: 22,
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
