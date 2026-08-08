import React, { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

const LEVELS = ["F9", "F8", "F7", "F6"];
const catFor = (lvl) => `bina_guncelleme_${lvl.toLowerCase()}`;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");

function secondsToDHMS(total) {
  const s = Math.max(0, Number(total) || 0);
  return {
    gun: Math.floor(s / 86400),
    saat: Math.floor((s % 86400) / 3600),
    dakika: Math.floor((s % 3600) / 60),
    saniye: Math.floor(s % 60),
  };
}

export default function BuildingCalculator() {
  const { t } = useTranslation();
  const [level, setLevel] = useState("F9");
  const [forticlad, setForticlad] = useState("");
  const [gelismis, setGelismis] = useState("");

  const category = catFor(level);
  const { data: unitCosts = { yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0 } } =
    useSWR(`/unit-costs/${category}`, fetcher);

  const total = (Number(forticlad) || 0) + (Number(gelismis) || 0);
  const totalYemek = total * (unitCosts.yemek || 0);
  const totalOdun = total * (unitCosts.odun || 0);
  const totalCelik = total * (unitCosts.celik || 0);
  const totalBenzin = total * (unitCosts.benzin || 0);
  const totalSure = total * (unitCosts.sure_saniye || 0);
  const dhms = secondsToDHMS(totalSure);

  return (
    <div className="p-1" data-testid="building-calculator">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          Bina Güncelleme
        </h2>
      </div>

      {/* Level selector */}
      <div className="mb-4">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>SEVİYE</label>
        <div className="grid grid-cols-4 gap-2">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              data-testid={`bina-level-btn-${lv}`}
              aria-pressed={level === lv}
              className="py-2 rounded font-bold uppercase transition-all"
              style={{
                background: level === lv ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                border: `1px solid ${level === lv ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                color: level === lv ? "#0B0704" : "#F5F0E8",
                boxShadow: level === lv ? "0 0 10px rgba(231,76,26,0.5)" : "none",
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.08em",
                fontSize: 13,
              }}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {/* Forticlad + Gelişmiş Forticlad side-by-side */}
      <div className="mb-5">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Forticlad</label>
            <input
              type="number"
              value={forticlad}
              onChange={(e) => setForticlad(e.target.value)}
              data-testid="bina-forticlad-input"
              placeholder="0"
              min="0"
              className="w-full text-2xl font-bold text-center rounded-lg"
              style={{ background: "#1A1210", border: "1px solid #E74C1A", color: "#F5F0E8", padding: "14px 12px" }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Gelişmiş Forticlad</label>
            <input
              type="number"
              value={gelismis}
              onChange={(e) => setGelismis(e.target.value)}
              data-testid="bina-gelismis-input"
              placeholder="0"
              min="0"
              className="w-full text-2xl font-bold text-center rounded-lg"
              style={{ background: "#1A1210", border: "1px solid #E74C1A", color: "#F5F0E8", padding: "14px 12px" }}
            />
          </div>
        </div>
      </div>

      {/* Resources — 2 columns */}
      <div className="mb-5">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Birim Maliyeti</label>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            { label: "Yemek", value: totalYemek, tid: "bina-res-yemek" },
            { label: "Çelik", value: totalCelik, tid: "bina-res-celik" },
            { label: "Odun", value: totalOdun, tid: "bina-res-odun" },
            { label: "Benzin", value: totalBenzin, tid: "bina-res-benzin" },
          ].map((it) => (
            <div key={it.label} style={{ minWidth: 120 }}>
              <div className="text-[10px] mb-1 font-bold uppercase tracking-widest" style={{ color: "#F5F0E8", opacity: 0.7 }}>{it.label}</div>
              <div data-testid={it.tid} className="rounded font-bold text-sm" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8", padding: "10px 8px", textAlign: "center" }}>
                {fmt(it.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="mb-2">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Süre</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Gün", value: dhms.gun, tid: "bina-dhms-gun" },
            { label: "Saat", value: dhms.saat, tid: "bina-dhms-saat" },
            { label: "Dakika", value: dhms.dakika, tid: "bina-dhms-dakika" },
            { label: "Saniye", value: dhms.saniye, tid: "bina-dhms-saniye" },
          ].map((it) => (
            <div key={it.label}>
              <div className="text-[10px] mb-1 font-bold uppercase tracking-widest text-center" style={{ color: "#F5F0E8", opacity: 0.7 }}>{it.label}</div>
              <div data-testid={it.tid} className="rounded font-bold text-lg text-center" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5A623", padding: "10px 8px" }}>
                {it.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
