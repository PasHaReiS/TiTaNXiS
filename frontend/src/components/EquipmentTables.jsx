import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";

const REFORM_ROWS = [
  { lv: 1, gear: 20, batt: null },
  { lv: 2, gear: 40, batt: null },
  { lv: 3, gear: 60, batt: null },
  { lv: 4, gear: 80, batt: null },
  { lv: 5, gear: 100, batt: null },
  { lv: 6, gear: 120, batt: null },
  { lv: 7, gear: 140, batt: null },
  { lv: 8, gear: 160, batt: null },
  { lv: 9, gear: 180, batt: null },
  { lv: 10, gear: 200, batt: 220 },
  { lv: 11, gear: 220, batt: 200 },
  { lv: 12, gear: 240, batt: 400 },
  { lv: 13, gear: 260, batt: 600 },
  { lv: 14, gear: 280, batt: 800 },
  { lv: 15, gear: 300, batt: 1000 },
  { lv: 16, gear: 320, batt: 1200 },
  { lv: 17, gear: 360, batt: 1400 },
  { lv: 18, gear: 380, batt: 1600 },
  { lv: 19, gear: 400, batt: 1800 },
  { lv: 20, gear: 400, batt: 2000 },
];

const HERO_ROWS = [
  { from: "LEGENDARY T1", to: "LEGENDARY T2", lv: "LV 100-120", bolts: "117K", mag: "600", coils: "20" },
  { from: "LEGENDARY T2", to: "EXOTIC", lv: "LV 120-140", bolts: "157K", mag: "1,000", coils: "40" },
  { from: "EXOTIC", to: "EXOTIC T1", lv: "LV 140-160", bolts: "197K", mag: "1,000", coils: "60" },
  { from: "EXOTIC T1", to: "EXOTIC T2", lv: "LV 160-180", bolts: "258K", mag: "2,000", coils: "80" },
  { from: "EXOTIC T2", to: "EXOTIC T3", lv: "LV 180-200", bolts: "338.2K", mag: "2,000", coils: "100" },
];

const tierColor = (label) => {
  if (label.startsWith("LEGENDARY")) return "#FFD700";
  if (label.startsWith("EXOTIC")) return "#E74C1A";
  return "#F5F0E8";
};

const fmt = (n) => Number(n).toLocaleString("tr-TR");

function CollapseCard({ testId, title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      data-testid={testId}
      style={{
        background: "#1a1a2e",
        border: "1px solid rgba(231,76,26,0.3)",
        borderRadius: 8,
        padding: 16,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testId}-toggle`}
        aria-expanded={open}
        className="w-full flex items-center justify-between"
        style={{
          color: "#E74C1A",
          fontFamily: "Cinzel, serif",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <span>{title}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="mt-3" style={{ overflowX: "auto" }}>{children}</div>}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "center", background: "#E74C1A", color: "#fff", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" };
const td = { padding: "8px 10px", borderBottom: "1px solid rgba(231,76,26,0.15)", color: "#F5F0E8", fontSize: 12 };

export default function EquipmentTables() {
  const { t } = useTranslation();
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedHero, setSelectedHero] = useState(0);

  const btnBase = {
    borderRadius: 4,
    padding: "3px 4px",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "Cinzel, serif",
    letterSpacing: "0.02em",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };
  const btnStyle = (active) => ({
    ...btnBase,
    background: active ? "#F5A623" : "#1a1a2e",
    color: active ? "#0B0704" : "#F5F0E8",
    border: `1px solid ${active ? "#F5A623" : "rgba(231,76,26,0.4)"}`,
    boxShadow: active ? "0 0 6px rgba(245,166,35,0.5)" : "none",
  });

  const currentReform = REFORM_ROWS.find((r) => r.lv === selectedLevel) || REFORM_ROWS[0];
  const heroRow = HERO_ROWS[selectedHero];

  const sectionStyle = {
    background: "#1a1a2e",
    border: "1px solid rgba(231,76,26,0.3)",
    borderRadius: 8,
    padding: 10,
  };
  const sectionTitleStyle = {
    color: "#E74C1A",
    fontFamily: "Cinzel, serif",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 700,
    fontSize: 12,
    marginBottom: 8,
  };

  return (
    <div data-testid="equipment-tables" className="flex flex-col mb-4" style={{ gap: 8 }}>
      {/* ===== TABLE 1: EQUIPMENT REFORMATION (compact) ===== */}
      <div data-testid="equipment-reformation" style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t("et_reformation_title")}</h3>

        <div
          data-testid="reform-level-selector"
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 40px)", gap: 3, marginBottom: 8, maxWidth: 212 }}
        >
          {REFORM_ROWS.map((r) => (
            <button
              key={r.lv}
              type="button"
              data-testid={`reform-level-btn-${r.lv}`}
              aria-pressed={selectedLevel === r.lv}
              onClick={() => setSelectedLevel(r.lv)}
              style={{ ...btnStyle(selectedLevel === r.lv), width: 40, height: 24, boxSizing: "border-box", textAlign: "center" }}
            >
              {r.lv}
            </button>
          ))}
        </div>

        {/* Inline row for selected level */}
        <div
          data-testid={`reform-row-${currentReform.lv}`}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            padding: "6px 10px",
            background: "rgba(11,7,4,0.5)",
            borderRadius: 6,
            border: "1px solid rgba(245,166,35,0.3)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }}>
            {t("et_col_level")}: <span style={{ color: "#F5F0E8" }}>{currentReform.lv}</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }}>
            {t("et_col_gear")}: <span style={{ color: "#F5F0E8", fontVariantNumeric: "tabular-nums" }}>{fmt(currentReform.gear)}</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }}>
            {t("et_col_magnet")}: <span style={{ color: currentReform.batt === null ? "#666" : "#F5F0E8", fontVariantNumeric: "tabular-nums" }}>{currentReform.batt === null ? "-" : fmt(currentReform.batt)}</span>
          </span>
        </div>
      </div>

      {/* ===== TABLE 2: HERO EQUIPMENT GUIDE ===== */}
      <div data-testid="hero-equipment-guide" style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t("et_hero_guide_title")}</h3>

        <div
          data-testid="hero-range-selector"
          style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}
        >
          {HERO_ROWS.map((r, i) => (
            <button
              key={i}
              type="button"
              data-testid={`hero-range-btn-${i}`}
              aria-pressed={selectedHero === i}
              onClick={() => setSelectedHero(i)}
              style={{ ...btnStyle(selectedHero === i), whiteSpace: "nowrap", padding: "4px 8px", fontSize: 11 }}
            >
              {r.lv}
            </button>
          ))}
        </div>

        <div
          data-testid={`hero-row-${selectedHero}`}
          style={{
            background: "rgba(26,26,46,0.8)",
            border: "1px solid rgba(231,76,26,0.3)",
            borderRadius: 6,
            padding: "8px 12px",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
            <span style={{ color: tierColor(heroRow.from), fontFamily: "Cinzel, serif" }}>{heroRow.from}</span>
            <span style={{ color: "#F5F0E8", margin: "0 6px" }}>→</span>
            <span style={{ color: tierColor(heroRow.to), fontFamily: "Cinzel, serif" }}>{heroRow.to}</span>
          </div>
          <div style={{ fontSize: 11, color: "#F5A623", marginBottom: 6, letterSpacing: "0.06em" }}>{heroRow.lv}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#F5F0E8" }}>
            <span data-testid={`hero-row-${selectedHero}-bolts`}>{t("et_bolts")}: {heroRow.bolts}</span>
            <span data-testid={`hero-row-${selectedHero}-magnets`}>{t("et_magnets")}: {heroRow.mag}</span>
            <span data-testid={`hero-row-${selectedHero}-coils`}>{t("et_potential_coils")}: {heroRow.coils}</span>
          </div>
        </div>
        <p
          data-testid="hero-guide-note"
          style={{ fontStyle: "italic", fontSize: 10, color: "rgba(245,240,232,0.6)", marginTop: 6 }}
        >
          {t("et_hero_note")}
        </p>
      </div>
    </div>
  );
}
