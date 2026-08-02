import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const ICON_GEAR = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/b6ada6ac7abf4f579e421ac33c33f220_1000073487.jpg";
const ICON_BOLT = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/7a65ce2753904b0ca2cfa8da3e2def8e_1000073485.jpg";
const ICON_COIL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/59757d68af81428e9732fdcd9b3c861e_1000073483.jpg";
const ICON_MAGNET = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/43eb8dbd3a604f1e8fd6e587bac7e7c3_1000073480.jpg";

const iconStyle = { height: 20, width: "auto", objectFit: "contain", display: "inline-block", verticalAlign: "middle", marginRight: 4 };
const Icon = ({ src, alt, testId }) => (
  <img src={src} alt={alt} data-testid={testId} style={iconStyle} />
);

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

const th = { padding: "8px 10px", textAlign: "left", background: "#E74C1A", color: "#fff", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" };
const td = { padding: "8px 10px", borderBottom: "1px solid rgba(231,76,26,0.15)", color: "#F5F0E8", fontSize: 12 };

export default function EquipmentTables() {
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedHero, setSelectedHero] = useState(null);

  const btnBase = {
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "Cinzel, serif",
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };
  const btnStyle = (active) => ({
    ...btnBase,
    background: active ? "#F5A623" : "#1a1a2e",
    color: active ? "#0B0704" : "#F5F0E8",
    border: `1px solid ${active ? "#F5A623" : "rgba(231,76,26,0.4)"}`,
    boxShadow: active ? "0 0 8px rgba(245,166,35,0.5)" : "none",
  });

  const reformRows = selectedLevel === null
    ? REFORM_ROWS
    : REFORM_ROWS.filter((r) => r.lv === selectedLevel);
  const heroRows = selectedHero === null ? HERO_ROWS : [HERO_ROWS[selectedHero]];

  return (
    <div data-testid="equipment-tables" className="flex flex-col mb-6" style={{ gap: 24 }}>
      <CollapseCard testId="equipment-reformation" title="Equipment Reformation - Seviye Maliyetleri">
        <div
          data-testid="reform-level-selector"
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}
        >
          {REFORM_ROWS.map((r) => (
            <button
              key={r.lv}
              type="button"
              data-testid={`reform-level-btn-${r.lv}`}
              aria-pressed={selectedLevel === r.lv}
              onClick={() => setSelectedLevel((v) => (v === r.lv ? null : r.lv))}
              style={btnStyle(selectedLevel === r.lv)}
            >
              {r.lv}
            </button>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 240 }}>
          <thead>
            <tr>
              <th style={th}>Seviye</th>
              <th style={th}>Dişli</th>
              <th style={th}>Mıknatıs</th>
            </tr>
          </thead>
          <tbody>
            {reformRows.map((r) => {
              const big = selectedLevel !== null;
              const cellStyle = { ...td, fontSize: big ? 22 : 12, padding: big ? "14px 10px" : "8px 10px", textAlign: big ? "center" : "left" };
              return (
                <tr key={r.lv} className="row-hover" data-testid={`reform-row-${r.lv}`}>
                  <td style={{ ...cellStyle, fontWeight: 700, color: "#F5A623" }}>{r.lv}</td>
                  <td style={cellStyle}>{fmt(r.gear)}</td>
                  <td style={{ ...cellStyle, color: r.batt === null ? "#666" : "#F5F0E8" }}>{r.batt === null ? "-" : fmt(r.batt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CollapseCard>

      <CollapseCard testId="hero-equipment-guide" title="Hero Equip Level Guide - LV 100-200">
        <div
          data-testid="hero-range-selector"
          style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}
        >
          {HERO_ROWS.map((r, i) => (
            <button
              key={i}
              type="button"
              data-testid={`hero-range-btn-${i}`}
              aria-pressed={selectedHero === i}
              onClick={() => setSelectedHero((v) => (v === i ? null : i))}
              style={{ ...btnStyle(selectedHero === i), whiteSpace: "nowrap" }}
            >
              {r.lv}
            </button>
          ))}
        </div>
        <div className="flex flex-col">
          {heroRows.map((r) => {
            const i = HERO_ROWS.indexOf(r);
            return (
              <div
                key={i}
                data-testid={`hero-row-${i}`}
                style={{
                  background: "rgba(26,26,46,0.8)",
                  border: "1px solid rgba(231,76,26,0.3)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: tierColor(r.from), fontFamily: "Cinzel, serif" }}>{r.from}</span>
                  <span style={{ color: "#F5F0E8", margin: "0 8px" }}>→</span>
                  <span style={{ color: tierColor(r.to), fontFamily: "Cinzel, serif" }}>{r.to}</span>
                </div>
                <div style={{ fontSize: 12, color: "#F5A623", marginBottom: 8, letterSpacing: "0.06em" }}>{r.lv}</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#F5F0E8" }}>
                  <span data-testid={`hero-row-${i}-bolts`}>Bolts: {r.bolts}</span>
                  <span data-testid={`hero-row-${i}-magnets`}>Magnets: {r.mag}</span>
                  <span data-testid={`hero-row-${i}-coils`}>Potential Coils: {r.coils}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p
          data-testid="hero-guide-note"
          className="mt-2"
          style={{ fontStyle: "italic", fontSize: 11, color: "rgba(245,240,232,0.65)" }}
        >
          Magnets and potential coils are used as a break through after every 20 levels starting at lv 120.
        </p>
      </CollapseCard>
    </div>
  );
}
