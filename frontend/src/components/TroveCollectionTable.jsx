import React, { useState } from "react";

// Coin key order: [common, rare, precious, legendary]
const COLLECTIONS = [
  { key: "UNCOMMON",     color: "#6B7280", rows: [[3000,30,0,0],[7500,75,0,0],[10500,105,0,0],[0,0,0,0]] },
  { key: "RARE",         color: "#3B82F6", rows: [[13500,135,0,0],[20000,200,70,0],[5000,50,70,0],[6000,60,80,0]] },
  { key: "EPIC",         color: "#A855F7", rows: [[7000,70,90,0],[8000,80,100,0],[9000,90,110,0],[10000,100,120,0]] },
  { key: "EPIC-T1",      color: "#A855F7", rows: [[15000,150,140,0],[20000,200,150,0],[25000,250,170,0],[30000,300,210,0]] },
  { key: "LEGENDARY",    color: "#FFD700", rows: [[41000,410,90,0],[43000,430,90,0],[47000,470,100,0],[49000,490,100,0]] },
  { key: "LEGENDARY-T1", color: "#FFD700", rows: [[53000,530,100,0],[57000,570,120,0],[61000,610,120,0],[66000,660,120,0]] },
  { key: "LEGENDARY-T2", color: "#FFD700", rows: [[71000,710,120,0],[83000,830,160,0],[88000,880,170,0],[95000,950,180,0]] },
  { key: "EXOTIC",       color: "#E74C1A", rows: [[100000,1000,180,15],[105000,1050,190,20],[110000,1150,200,20],[115000,1150,210,25]] },
  { key: "EXOTIC-T1",    color: "#E74C1A", rows: [[120000,1200,245,25],[125000,1250,255,30],[130000,1300,265,30],[135000,1350,275,35]] },
  { key: "EXOTIC-T2",    color: "#E74C1A", rows: [[140000,1400,310,35],[145000,1450,315,40],[150000,1500,325,40],[160000,1600,335,45]] },
  { key: "EXOTIC-T3",    color: "#E74C1A", rows: [[165000,1650,350,45],[170000,1700,365,50],[175000,1750,385,50],[180000,1800,410,55]] },
];

const ROW_LABELS = ["Base", "1 Star", "2 Star", "3 Star"];
const COIN_LABELS = ["Common Coin", "Rare Coin", "Precious Coin", "Legendary Coin"];
const COIN_COLORS = ["#F5F0E8", "#3B82F6", "#A855F7", "#FFD700"];

const GRAND_TOTAL = { common: 3158000, rare: 31580, precious: 7325, legendary: 560 };

const fmt = (n) => (n === 0 ? "-" : Number(n).toLocaleString("tr-TR"));

export default function TroveCollectionTable() {
  const [selected, setSelected] = useState("UNCOMMON");
  const current = COLLECTIONS.find((c) => c.key === selected) || COLLECTIONS[0];

  return (
    <div data-testid="trove-collection-table" className="flex flex-col" style={{ gap: 16 }}>
      {/* Type selector */}
      <div
        data-testid="trove-type-selector"
        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        {COLLECTIONS.map((c) => {
          const active = c.key === selected;
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`trove-type-btn-${c.key}`}
              aria-pressed={active}
              onClick={() => setSelected(c.key)}
              style={{
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.04em",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: active ? c.color : "#1a1a2e",
                color: active ? "#0B0704" : "#F5F0E8",
                border: `1px solid ${active ? c.color : "rgba(231,76,26,0.4)"}`,
                boxShadow: active ? `0 0 8px ${c.color}88` : "none",
                whiteSpace: "nowrap",
              }}
            >
              {c.key}
            </button>
          );
        })}
      </div>

      {/* Rows: Base / 1 Star / 2 Star / 3 Star */}
      <div
        data-testid="trove-rows"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
        style={{ gap: 12 }}
      >
        {ROW_LABELS.map((label, ri) => {
          const row = current.rows[ri];
          return (
            <div
              key={label}
              data-testid={`trove-row-${current.key}-${ri}`}
              style={{
                background: "rgba(26,26,46,0.85)",
                border: `1px solid ${current.color}66`,
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "Cinzel, serif",
                  color: current.color,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                  borderBottom: `1px solid ${current.color}44`,
                  paddingBottom: 6,
                }}
              >
                {label}
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {COIN_LABELS.map((cl, ci) => (
                  <div
                    key={cl}
                    className="flex items-center justify-between"
                    style={{ fontSize: 12 }}
                  >
                    <span style={{ color: COIN_COLORS[ci], fontWeight: 600 }}>
                      {cl}
                    </span>
                    <span
                      data-testid={`trove-cell-${current.key}-${ri}-${ci}`}
                      style={{ color: "#F5F0E8", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                    >
                      {fmt(row[ci])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grand total */}
      <div
        data-testid="trove-grand-total"
        style={{
          background: "linear-gradient(180deg, #2A1408 0%, #1a0d05 100%)",
          border: "1px solid #F5A623",
          borderRadius: 8,
          padding: "12px 16px",
          boxShadow: "0 0 12px rgba(245,166,35,0.25) inset",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "Cinzel, serif",
            color: "#F5A623",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Grand Total
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 8 }}>
          {[
            { label: "Common", value: GRAND_TOTAL.common, color: COIN_COLORS[0], key: "common" },
            { label: "Rare", value: GRAND_TOTAL.rare, color: COIN_COLORS[1], key: "rare" },
            { label: "Precious", value: GRAND_TOTAL.precious, color: COIN_COLORS[2], key: "precious" },
            { label: "Legendary", value: GRAND_TOTAL.legendary, color: COIN_COLORS[3], key: "legendary" },
          ].map((it) => (
            <div
              key={it.key}
              className="flex flex-col"
              data-testid={`trove-total-${it.key}`}
              style={{
                background: "rgba(0,0,0,0.35)",
                borderRadius: 6,
                padding: "8px 10px",
                border: `1px solid ${it.color}44`,
              }}
            >
              <span style={{ fontSize: 10, color: it.color, letterSpacing: "0.06em", fontWeight: 700 }}>
                {it.label}
              </span>
              <span style={{ fontSize: 14, color: "#F5F0E8", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmt(it.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
