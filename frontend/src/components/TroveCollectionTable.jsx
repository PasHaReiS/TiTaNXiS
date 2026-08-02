import React, { useState } from "react";
import { useTranslation } from "react-i18next";

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

const ROW_KEYS = ["tc_base", "tc_1_star", "tc_2_star", "tc_3_star"];
const COIN_KEYS = ["tc_coin_common", "tc_coin_rare", "tc_coin_precious", "tc_coin_legendary"];
const COIN_COLORS = ["#F5F0E8", "#3B82F6", "#A855F7", "#FFD700"];

const GRAND_TOTAL = { common: 3158000, rare: 31580, precious: 7325, legendary: 560 };

const fmt = (n) => (n === 0 ? "-" : Number(n).toLocaleString("tr-TR"));

export default function TroveCollectionTable() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("UNCOMMON");
  const current = COLLECTIONS.find((c) => c.key === selected) || COLLECTIONS[0];

  return (
    <div data-testid="trove-collection-table" className="flex flex-col" style={{ gap: 8 }}>
      {/* Type selector — compact wrap */}
      <div
        data-testid="trove-type-selector"
        style={{ display: "flex", flexWrap: "wrap", gap: 3 }}
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
                borderRadius: 4,
                padding: "3px 5px",
                height: 22,
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.02em",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: active ? c.color : "#1a1a2e",
                color: active ? "#0B0704" : "#F5F0E8",
                border: `1px solid ${active ? c.color : "rgba(231,76,26,0.35)"}`,
                boxShadow: active ? `0 0 6px ${c.color}88` : "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {c.key}
            </button>
          );
        })}
      </div>

      {/* 2×2 grid of Base / 1★ / 2★ / 3★ */}
      <div
        data-testid="trove-rows"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
      >
        {ROW_KEYS.map((rowKey, ri) => {
          const row = current.rows[ri];
          return (
            <div
              key={rowKey}
              data-testid={`trove-row-${current.key}-${ri}`}
              style={{
                background: "rgba(26,26,46,0.85)",
                border: `1px solid ${current.color}55`,
                borderRadius: 5,
                padding: "5px 7px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "Cinzel, serif",
                  color: current.color,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 3,
                  borderBottom: `1px solid ${current.color}33`,
                  paddingBottom: 2,
                }}
              >
                {t(rowKey)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {COIN_KEYS.map((coinKey, ci) => (
                  <div
                    key={coinKey}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, lineHeight: 1.3 }}
                  >
                    <span style={{ color: COIN_COLORS[ci], fontWeight: 600, fontSize: 10 }}>
                      {t(coinKey)}
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

      {/* Grand total — single compact row */}
      <div
        data-testid="trove-grand-total"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          background: "linear-gradient(180deg, #2A1408 0%, #1a0d05 100%)",
          border: "1px solid #F5A623",
          borderRadius: 5,
          padding: "5px 10px",
          boxShadow: "0 0 8px rgba(245,166,35,0.2) inset",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "Cinzel, serif",
            color: "#F5A623",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {t("tc_grand_total")}
        </span>
        {[
          { labelKey: "tc_common_short", value: GRAND_TOTAL.common, color: COIN_COLORS[0], key: "common" },
          { labelKey: "tc_rare_short", value: GRAND_TOTAL.rare, color: COIN_COLORS[1], key: "rare" },
          { labelKey: "tc_precious_short", value: GRAND_TOTAL.precious, color: COIN_COLORS[2], key: "precious" },
          { labelKey: "tc_legendary_short", value: GRAND_TOTAL.legendary, color: COIN_COLORS[3], key: "legendary" },
        ].map((it) => (
          <span
            key={it.key}
            data-testid={`trove-total-${it.key}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}
          >
            <span style={{ color: it.color, fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {t(it.labelKey)}:
            </span>
            <span style={{ color: "#F5F0E8", fontVariantNumeric: "tabular-nums" }}>{fmt(it.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
