import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Settings, Save, X, Trash2, GitCompare } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const TIERS = ["T12", "T11", "T8", "T7", "T6"];
const catFor = (tier) => `asker_egitim_${tier.toLowerCase()}`;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");
const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

function secondsToDHMS(total) {
  const s = Math.max(0, Number(total) || 0);
  const gun = Math.floor(s / 86400);
  const saat = Math.floor((s % 86400) / 3600);
  const dakika = Math.floor((s % 3600) / 60);
  const saniye = Math.floor(s % 60);
  return { gun, saat, dakika, saniye };
}

export default function SoldierCalculator() {
  const { t } = useTranslation();
  const { isAdmin, canEdit } = useAuth();
  const [tier, setTier] = useState("T11");
  const [soldierCount, setSoldierCount] = useState("");
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const category = catFor(tier);
  const { data: unitCosts = { yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0 } } =
    useSWR(`/unit-costs/${category}`, fetcher);

  // Fetch history for all 4 tiers in parallel and merge (backend uses exact-match on category)
  const t12 = useSWR(`/calculations?category=asker_egitim_t12`, fetcher);
  const t11 = useSWR(`/calculations?category=asker_egitim_t11`, fetcher);
  const t8 = useSWR(`/calculations?category=asker_egitim_t8`, fetcher);
  const t7 = useSWR(`/calculations?category=asker_egitim_t7`, fetcher);
  const t6 = useSWR(`/calculations?category=asker_egitim_t6`, fetcher);
  const calculations = [
    ...(t11.data || []),
    ...(t8.data || []),
    ...(t7.data || []),
    ...(t6.data || []),
  ].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const refreshAllHistory = () => {
    globalMutate(`/calculations?category=asker_egitim_t12`);
    globalMutate(`/calculations?category=asker_egitim_t11`);
    globalMutate(`/calculations?category=asker_egitim_t8`);
    globalMutate(`/calculations?category=asker_egitim_t7`);
    globalMutate(`/calculations?category=asker_egitim_t6`);
  };

  const n = Number(soldierCount) || 0;
  const totalYemek = n * (unitCosts.yemek || 0);
  const totalOdun = n * (unitCosts.odun || 0);
  const totalCelik = n * (unitCosts.celik || 0);
  const totalBenzin = n * (unitCosts.benzin || 0);
  const totalSure = n * (unitCosts.sure_saniye || 0);
  const { gun, saat, dakika, saniye } = secondsToDHMS(totalSure);

  const save = async () => {
    if (!n || n <= 0) { toast.error(t("sc_need_count")); return; }
    try {
      await api.post("/calculations", {
        category: `asker_egitim_${tier.toLowerCase()}`,
        soldier_count: n,
        yemek: totalYemek,
        odun: totalOdun,
        celik: totalCelik,
        benzin: totalBenzin,
        sure_saniye: totalSure,
      });
      refreshAllHistory();
      toast.success(t("sc_saved"));
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const removeCalc = async (id) => {
    try {
      await api.delete(`/calculations/${id}`);
      refreshAllHistory();
    } catch (e) { toast.error(e.message); }
  };

  const tierOf = (cat) => {
    const m = /^asker_egitim_(t\d+)$/i.exec(cat || "");
    return m ? m[1].toUpperCase() : "-";
  };

  const toggleCompareSel = (id) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };
  const compareRows = useMemo(
    () => selectedForCompare.map((id) => calculations.find((c) => c.id === id)).filter(Boolean),
    [selectedForCompare, calculations]
  );

  return (
    <div className="p-1" data-testid="soldier-calculator">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("sc_title")}
        </h2>
        {isAdmin && (
          <button
            onClick={() => setShowUnitModal(true)}
            data-testid="open-unit-cost-modal"
            className="px-3 py-1.5 rounded text-white text-xs font-bold flex items-center gap-1"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
          >
            <Settings className="w-3.5 h-3.5" /> {t("sc_unit_cost_btn")}
          </button>
        )}
      </div>

      {/* Tier selector */}
      <div className="mb-4">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("sc_tier_label")}</label>
        <div className="grid grid-cols-5 gap-2">
          {TIERS.map((tt) => (
            <motion.button
              key={tt}
              onClick={() => setTier(tt)}
              data-testid={`tier-btn-${tt}`}
              aria-pressed={tier === tt}
              className="py-2 rounded font-bold uppercase"
              whileHover={{ scale: 1.05, boxShadow: "0 0 18px rgba(245,166,35,0.55)" }}
              whileTap={{ scale: 0.95 }}
              animate={{ scale: tier === tt ? 1.05 : 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 14, mass: 0.5 }}
              style={{
                background: tier === tt ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                border: `1px solid ${tier === tt ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                color: tier === tt ? "#0B0704" : "#F5F0E8",
                boxShadow: tier === tt ? "0 0 12px rgba(231,76,26,0.55)" : "none",
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.08em",
                fontSize: 13,
              }}
            >
              {tt}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Soldier count */}
      <div className="mb-5">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("sc_soldier_count")}</label>
        <input
          type="number"
          value={soldierCount}
          onChange={(e) => setSoldierCount(e.target.value)}
          data-testid="soldier-count-input"
          placeholder="0"
          min="0"
          className="w-full text-2xl font-bold text-center rounded-lg"
          style={{ background: "#1A1210", border: "1px solid #E74C1A", color: "#F5F0E8", padding: "14px 12px" }}
        />
      </div>

      {/* Resources — 2 columns */}
      <div className="mb-5">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("sc_resource_count")}</label>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            { label: t("sc_food"), value: totalYemek, tid: "res-yemek" },
            { label: t("sc_steel"), value: totalCelik, tid: "res-celik" },
            { label: t("sc_wood"), value: totalOdun, tid: "res-odun" },
            { label: t("sc_gas"), value: totalBenzin, tid: "res-benzin" },
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

      {/* Time — Gün / Saat / Dakika / Saniye */}
      <div className="mb-5">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("sc_duration")}</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: t("sc_days_u"), value: gun, tid: "sure-gun" },
            { label: t("sc_hours_u"), value: saat, tid: "sure-saat" },
            { label: t("sc_minutes_u"), value: dakika, tid: "sure-dakika" },
            { label: t("sc_seconds_u"), value: saniye, tid: "sure-saniye" },
          ].map((it) => (
            <div key={it.label} className="text-center">
              <div className="text-[10px] mb-1" style={{ color: "#F5F0E8", opacity: 0.7 }}>{it.label}</div>
              <div data-testid={it.tid} className="rounded font-bold text-lg" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8", padding: "8px 4px" }}>
                {pad2(it.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <button
          onClick={save}
          data-testid="save-calculation-btn"
          className="w-full py-3 rounded-lg text-white font-bold flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
        >
          <Save className="w-4 h-4" /> {t("sc_calc_save")}
        </button>
      )}

      {calculations.length > 0 && (
        <div className="mt-6 overflow-x-auto card-dark p-3" data-testid="calc-history-table">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("sc_history")}</h3>
            {compareRows.length === 2 && (
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                data-testid="compare-btn"
                className="px-3 py-1 rounded text-white text-[11px] font-bold flex items-center gap-1"
                style={{ background: "linear-gradient(135deg,#7C3AED,#3B82F6)" }}
              >
                <GitCompare className="w-3 h-3" /> {t("sc_compare_btn")}
              </button>
            )}
          </div>
          <table className="w-full text-xs" style={{ color: "#F5F0E8" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th className="p-2 w-6"></th>
                <th className="p-2 text-left">{t("sc_tier_label")}</th>
                <th className="p-2 text-left">{t("sc_history_soldier")}</th>
                <th className="p-2 text-left">{t("sc_food")}</th>
                <th className="p-2 text-left">{t("sc_wood")}</th>
                <th className="p-2 text-left">{t("sc_steel")}</th>
                <th className="p-2 text-left">{t("sc_gas")}</th>
                <th className="p-2 text-left">{t("sc_days_u")}</th>
                <th className="p-2 text-left">{t("sc_hours_u")}</th>
                <th className="p-2 text-left">{t("sc_minutes_u")}</th>
                <th className="p-2 text-left">{t("sc_seconds_u")}</th>
                {canEdit && <th className="p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {calculations.map((c) => {
                const d = secondsToDHMS(c.sure_saniye);
                const checked = selectedForCompare.includes(c.id);
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #222", background: checked ? "rgba(124,58,237,0.12)" : "transparent" }}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompareSel(c.id)}
                        data-testid={`compare-check-${c.id}`}
                        aria-label={t("sc_compare_select")}
                        style={{ accentColor: "#7C3AED", cursor: "pointer" }}
                      />
                    </td>
                    <td className="p-2 mono font-bold" style={{ color: "#F5A623" }}>{tierOf(c.category)}</td>
                    <td className="p-2">{fmt(c.soldier_count)}</td>
                    <td className="p-2">{fmt(c.yemek)}</td>
                    <td className="p-2">{fmt(c.odun)}</td>
                    <td className="p-2">{fmt(c.celik)}</td>
                    <td className="p-2">{fmt(c.benzin)}</td>
                    <td className="p-2 mono" data-testid={`hist-gun-${c.id}`}>{d.gun}</td>
                    <td className="p-2 mono" data-testid={`hist-saat-${c.id}`}>{d.saat}</td>
                    <td className="p-2 mono" data-testid={`hist-dakika-${c.id}`}>{d.dakika}</td>
                    <td className="p-2 mono" data-testid={`hist-saniye-${c.id}`}>{d.saniye}</td>
                    {canEdit && (
                      <td className="p-2">
                        <button
                          onClick={() => removeCalc(c.id)}
                          data-testid={`delete-calc-${c.id}`}
                          className="text-red-400 hover:text-red-200"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showUnitModal && <UnitCostModal tier={tier} current={unitCosts} onClose={() => setShowUnitModal(false)} />}
      {showCompareModal && compareRows.length === 2 && (
        <CompareModal rows={compareRows} tierOf={tierOf} onClose={() => setShowCompareModal(false)} />
      )}
    </div>
  );
}

function CompareModal({ rows, tierOf, onClose }) {
  const { t } = useTranslation();
  const [a, b] = rows;
  const fields = [
    { key: "soldier_count", label: t("sc_history_soldier") },
    { key: "yemek", label: t("sc_food") },
    { key: "odun", label: t("sc_wood") },
    { key: "celik", label: t("sc_steel") },
    { key: "benzin", label: t("sc_gas") },
    { key: "sure_saniye", label: t("sc_duration") },
  ];
  // Winner = lower cost wins for every numeric field (less resource/time = better)
  const winnerOf = (k) => {
    const av = Number(a[k] || 0);
    const bv = Number(b[k] || 0);
    if (av === bv) return null;
    return av < bv ? "a" : "b";
  };
  const savingsPct = (k) => {
    const av = Number(a[k] || 0);
    const bv = Number(b[k] || 0);
    const hi = Math.max(av, bv);
    if (!hi) return 0;
    return Math.round((Math.abs(av - bv) / hi) * 100);
  };
  // Overall winner = tier with more field-wins
  const aWins = fields.filter((f) => winnerOf(f.key) === "a").length;
  const bWins = fields.filter((f) => winnerOf(f.key) === "b").length;
  const overallWinner = aWins === bWins ? null : aWins > bWins ? "a" : "b";

  const renderVal = (k, v) => {
    if (k !== "sure_saniye") return fmt(v);
    const d = secondsToDHMS(v);
    return `${d.gun}g ${pad2(d.saat)}s ${pad2(d.dakika)}d ${pad2(d.saniye)}sn`;
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
      data-testid="compare-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #7C3AED", boxShadow: "0 8px 32px rgba(0,0,0,0.9)", maxHeight: "88vh", overflowY: "auto" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white" data-testid="compare-modal-close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-4 uppercase flex items-center gap-2"
          style={{ color: "#E0E7FF", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          <GitCompare className="w-4 h-4" style={{ color: "#A855F7" }} />
          {t("sc_compare_title")}
        </h3>

        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[a, b].map((r, idx) => {
            const label = idx === 0 ? "A" : "B";
            const isWinner = overallWinner === (idx === 0 ? "a" : "b");
            return (
              <div key={r.id}
                data-testid={`compare-header-${label}`}
                className="rounded-lg p-3 text-center"
                style={{
                  background: isWinner ? "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(16,185,129,0.15))" : "rgba(20,12,10,0.7)",
                  border: `1px solid ${isWinner ? "rgba(34,197,94,0.6)" : "rgba(168,85,247,0.3)"}`,
                }}
              >
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "#D4730A", opacity: 0.85 }}>
                  {label} · {tierOf(r.category)}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "#F5F0E8", opacity: 0.6 }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                </div>
                {isWinner && (
                  <div className="mt-2 text-[10px] font-bold uppercase" style={{ color: "#22C55E", letterSpacing: "0.08em" }}>
                    {t("sc_compare_winner")}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          {fields.map((f) => {
            const w = winnerOf(f.key);
            const av = a[f.key];
            const bv = b[f.key];
            const pct = savingsPct(f.key);
            return (
              <div
                key={f.key}
                data-testid={`compare-row-${f.key}`}
                className="rounded p-2"
                style={{ background: "rgba(20,12,10,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
                  {f.label}
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div
                    data-testid={`compare-val-a-${f.key}`}
                    className="rounded px-2 py-1.5 text-sm font-bold text-center"
                    style={{
                      background: w === "a" ? "rgba(34,197,94,0.18)" : "#1A1210",
                      border: `1px solid ${w === "a" ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.08)"}`,
                      color: w === "a" ? "#4ADE80" : "#F5F0E8",
                    }}
                  >
                    {renderVal(f.key, av)}
                  </div>
                  <div
                    data-testid={`compare-val-b-${f.key}`}
                    className="rounded px-2 py-1.5 text-sm font-bold text-center"
                    style={{
                      background: w === "b" ? "rgba(34,197,94,0.18)" : "#1A1210",
                      border: `1px solid ${w === "b" ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.08)"}`,
                      color: w === "b" ? "#4ADE80" : "#F5F0E8",
                    }}
                  >
                    {renderVal(f.key, bv)}
                  </div>
                </div>
                {w && pct > 0 && (
                  <div className="text-[10px] mt-1 text-center" style={{ color: "#4ADE80" }} data-testid={`compare-savings-${f.key}`}>
                    {t("sc_compare_savings", { pct })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UnitCostModal({ tier, current, onClose }) {
  const { t } = useTranslation();
  const [activeTier, setActiveTier] = useState(tier);
  const [state, setState] = useState({ yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0 });
  const [saving, setSaving] = useState(false);
  const cat = catFor(activeTier);

  const { data: fetched = current } = useSWR(`/unit-costs/${cat}`, fetcher);

  useEffect(() => {
    setState({
      yemek: fetched.yemek || 0,
      odun: fetched.odun || 0,
      celik: fetched.celik || 0,
      benzin: fetched.benzin || 0,
      sure_saniye: fetched.sure_saniye || 0,
    });
  }, [fetched.yemek, fetched.odun, fetched.celik, fetched.benzin, fetched.sure_saniye]);

  const set = (k, v) => setState((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/unit-costs/${cat}`, {
        yemek: Number(state.yemek) || 0,
        odun: Number(state.odun) || 0,
        celik: Number(state.celik) || 0,
        benzin: Number(state.benzin) || 0,
        sure_saniye: Number(state.sure_saniye) || 0,
      });
      globalMutate(`/unit-costs/${cat}`);
      toast.success(t("sc_unit_cost_updated", { tier: activeTier }));
      onClose();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || e2.message);
    } finally { setSaving(false); }
  };

  const fields = [
    { key: "yemek", label: t("sc_unit_food_label") },
    { key: "odun", label: t("sc_unit_wood_label") },
    { key: "celik", label: t("sc_unit_steel_label") },
    { key: "benzin", label: t("sc_unit_gas_label") },
    { key: "sure_saniye", label: t("sc_unit_time_label") },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      data-testid="unit-cost-modal"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #E74C1A", boxShadow: "0 8px 32px rgba(0,0,0,0.9)", maxHeight: "88vh", overflowY: "auto" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-3 uppercase" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("sc_unit_cost_title")}
        </h3>

        {/* Tier selector inside modal */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {TIERS.map((tt) => (
            <button
              key={tt}
              type="button"
              onClick={() => setActiveTier(tt)}
              data-testid={`modal-tier-${tt}`}
              className="py-1.5 rounded font-bold text-xs uppercase"
              style={{
                background: activeTier === tt ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                border: `1px solid ${activeTier === tt ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                color: activeTier === tt ? "#0B0704" : "#F5F0E8",
                fontFamily: "Cinzel, serif",
              }}
            >
              {tt}
            </button>
          ))}
        </div>

        {fields.map((f) => (
          <div key={f.key} className="mb-3">
            <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A" }}>{f.label}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={state[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              data-testid={`unit-${f.key}`}
              className="w-full rounded"
              style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8", padding: "8px 10px" }}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={saving}
          data-testid="save-unit-costs"
          className="w-full mt-2 py-2.5 rounded-lg text-white font-bold"
          style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
        >
          {saving ? t("saving") : t("sc_unit_save_tier", { tier: activeTier })}
        </button>
      </form>
    </div>
  );
}
