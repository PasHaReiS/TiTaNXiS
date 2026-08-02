import React, { useState } from "react";
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

const th = { padding: "8px 10px", textAlign: "left", background: "#E74C1A", color: "#fff", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" };
const td = { padding: "8px 10px", borderBottom: "1px solid rgba(231,76,26,0.15)", color: "#F5F0E8", fontSize: 12 };

export default function EquipmentTables() {
  return (
    <div data-testid="equipment-tables" className="flex flex-col mb-6" style={{ gap: 24 }}>
      <CollapseCard testId="equipment-reformation" title="Equipment Reformation - Seviye Maliyetleri">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 320 }}>
          <thead>
            <tr>
              <th style={th}>Seviye</th>
              <th style={th}>⚙️ Dişli</th>
              <th style={th}>🔋 Pil</th>
            </tr>
          </thead>
          <tbody>
            {REFORM_ROWS.map((r) => (
              <tr key={r.lv} className="row-hover" data-testid={`reform-row-${r.lv}`}>
                <td style={{ ...td, fontWeight: 700, color: "#F5A623" }}>{r.lv}</td>
                <td style={td}>{fmt(r.gear)}</td>
                <td style={{ ...td, color: r.batt === null ? "#666" : "#F5F0E8" }}>{r.batt === null ? "-" : fmt(r.batt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CollapseCard>

      <CollapseCard testId="hero-equipment-guide" title="Hero Equip Level Guide - LV 100-200">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Başlangıç Tier</th>
              <th style={th}>Bitiş Tier</th>
              <th style={th}>Seviye Aralığı</th>
              <th style={th}>🔩 Bolts</th>
              <th style={th}>🧲 Magnets</th>
              <th style={th}>🔌 Potential Coils</th>
            </tr>
          </thead>
          <tbody>
            {HERO_ROWS.map((r, i) => (
              <tr key={i} className="row-hover" data-testid={`hero-row-${i}`}>
                <td style={{ ...td, color: tierColor(r.from), fontWeight: 700 }}>{r.from}</td>
                <td style={{ ...td, color: tierColor(r.to), fontWeight: 700 }}>{r.to}</td>
                <td style={{ ...td, color: "#F5A623" }}>{r.lv}</td>
                <td style={td}>{r.bolts}</td>
                <td style={td}>{r.mag}</td>
                <td style={td}>{r.coils}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
