import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Settings, Save, X, Trash2, ArrowLeft, Shield, ShieldCheck, HardHat,
  Wheat, Boxes, TreePine, Fuel, Swords, Flame, Clock,
} from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const TIERS = ["T11", "T8", "T7", "T6"];
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

// Iconic tile shown to the LEFT of every resource / stat row
function IconTile({ children, tint = "#E74C1A" }) {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 56,
        height: 56,
        borderRadius: 10,
        background: "linear-gradient(160deg,#20140E 0%,#0F0906 100%)",
        border: `1px solid ${tint}55`,
        boxShadow: `inset 0 0 12px rgba(0,0,0,0.7), 0 0 10px ${tint}33`,
        color: tint,
      }}
    >
      {children}
    </div>
  );
}

// Section heading with stone/ember bar treatment
function SectionBar({ children }) {
  return (
    <div
      className="mb-3 mt-4"
      style={{
        padding: "10px 14px",
        background:
          "linear-gradient(90deg, rgba(30,20,16,0.9) 0%, rgba(45,27,14,0.85) 50%, rgba(30,20,16,0.9) 100%)",
        border: "1px solid rgba(231,76,26,0.35)",
        borderRadius: 8,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(231,76,26,0.15)",
        letterSpacing: "0.14em",
        fontFamily: "Cinzel, Rajdhani, serif",
        color: "#F5A623",
        fontWeight: 800,
        textShadow: "0 0 8px rgba(231,76,26,0.35)",
        textTransform: "uppercase",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

export default function SoldierCalculator({ onBack }) {
  const { t } = useTranslation();
  const { isAdmin, canEdit } = useAuth();
  const [tier, setTier] = useState("T11");
  const [soldierCount, setSoldierCount] = useState("");
  const [showUnitModal, setShowUnitModal] = useState(false);

  const category = catFor(tier);
  const { data: unitCosts = { yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0 } } =
    useSWR(`/unit-costs/${category}`, fetcher);

  // Fetch history for all 4 tiers in parallel and merge
  const t11 = useSWR(`/calculations?category=asker_egitim_t11`, fetcher);
  const t8 = useSWR(`/calculations?category=asker_egitim_t8`, fetcher);
  const t7 = useSWR(`/calculations?category=asker_egitim_t7`, fetcher);
  const t6 = useSWR(`/calculations?category=asker_egitim_t6`, fetcher);
  const calculations = [
    ...(t11.data || []), ...(t8.data || []), ...(t7.data || []), ...(t6.data || []),
  ].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const refreshAllHistory = () => {
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

  // Hide global BottomNav while this sub-page is mounted
  useEffect(() => {
    document.body.classList.add("sc-fullpage");
    return () => document.body.classList.remove("sc-fullpage");
  }, []);

  const goBack = () => {
    if (typeof onBack === "function") onBack();
    else window.history.back();
  };

  const save = async () => {
    if (!n || n <= 0) { toast.error(t("sc_need_count")); return; }
    try {
      await api.post("/calculations", {
        category: `asker_egitim_${tier.toLowerCase()}`,
        soldier_count: n,
        yemek: totalYemek, odun: totalOdun, celik: totalCelik, benzin: totalBenzin,
        sure_saniye: totalSure,
      });
      refreshAllHistory();
      toast.success(t("sc_saved"));
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  const removeCalc = async (id) => {
    try { await api.delete(`/calculations/${id}`); refreshAllHistory(); }
    catch (e) { toast.error(e.message); }
  };

  const tierOf = (cat) => {
    const m = /^asker_egitim_(t\d+)$/i.exec(cat || "");
    return m ? m[1].toUpperCase() : "-";
  };

  return (
    <div className="sc-page" data-testid="soldier-calculator">
      {/* HEADER BAR */}
      <div className="sc-header" data-testid="sc-header">
        <button
          type="button"
          onClick={goBack}
          data-testid="sc-back-btn"
          className="sc-back"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <h1 className="sc-title">SOLDIER TRAINING CALCULATOR</h1>
        <div className="sc-brand" data-testid="sc-brand" aria-label="EternalNest">
          <Flame className="w-6 h-6" style={{ color: "#F5A623", filter: "drop-shadow(0 0 6px #E74C1A)" }} />
          <span>EternalNest</span>
        </div>
      </div>

      {/* TIER SELECTION */}
      <SectionBar>{t("sc_tier_label", "Tier Selection")}</SectionBar>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {TIERS.map((tt) => {
          const active = tier === tt;
          return (
            <button
              key={tt}
              onClick={() => setTier(tt)}
              data-testid={`tier-btn-${tt}`}
              aria-pressed={active}
              className="sc-tier-btn"
              style={{
                background: active
                  ? "linear-gradient(180deg,#F5A623 0%,#E74C1A 55%,#8B2E10 100%)"
                  : "linear-gradient(180deg,#2A1A13 0%,#140A07 100%)",
                border: `1px solid ${active ? "#F5A623" : "rgba(231,76,26,0.35)"}`,
                color: active ? "#0B0704" : "#F5F0E8",
                boxShadow: active
                  ? "0 0 18px rgba(231,76,26,0.75), inset 0 1px 0 rgba(255,255,255,0.25)"
                  : "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 6px rgba(231,76,26,0.1)",
              }}
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
              <span>{tt}</span>
            </button>
          );
        })}
      </div>

      {/* Troop Count */}
      <div className="sc-row" data-testid="sc-troop-row">
        <IconTile tint="#F5A623"><HardHat className="w-7 h-7" strokeWidth={1.8} /></IconTile>
        <div className="flex-1 min-w-0">
          <div className="sc-row-label">Troop Count / {t("sc_soldier_count")}</div>
          <input
            type="number"
            value={soldierCount}
            onChange={(e) => setSoldierCount(e.target.value)}
            data-testid="soldier-count-input"
            placeholder="0"
            min="0"
            className="sc-input"
          />
        </div>
      </div>

      {/* RESOURCE INPUT */}
      <SectionBar>Resource Input / {t("sc_resource_count")}</SectionBar>

      {[
        { key: "yemek", label: "Food Cost / Yiyecek", value: totalYemek, tid: "res-yemek", tint: "#E9B457", Icon: Wheat },
        { key: "celik", label: "Steel Cost / Çelik",  value: totalCelik, tid: "res-celik", tint: "#B8B8C0", Icon: Boxes },
        { key: "odun",  label: "Wood Cost / Odun",    value: totalOdun,  tid: "res-odun",  tint: "#8B5A2B", Icon: TreePine },
        { key: "benzin",label: "Fuel Cost / Yakıt",   value: totalBenzin,tid: "res-benzin",tint: "#E74C1A", Icon: Fuel },
      ].map((r) => (
        <div className="sc-row" key={r.key}>
          <IconTile tint={r.tint}><r.Icon className="w-7 h-7" strokeWidth={1.8} /></IconTile>
          <div className="flex-1 min-w-0">
            <div className="sc-row-label">{r.label}</div>
            <div className="sc-input sc-value" data-testid={r.tid}>{fmt(r.value)}</div>
          </div>
        </div>
      ))}

      {/* CALCULATE / HESAPLA */}
      {canEdit && (
        <button
          onClick={save}
          data-testid="save-calculation-btn"
          className="sc-cta"
        >
          <Swords className="w-6 h-6" strokeWidth={2.2} />
          <span>CALCULATE / {t("sc_calc_save", "HESAPLA").toUpperCase()}</span>
        </button>
      )}

      {/* ESTIMATED TIME */}
      <div className="sc-time-wrap" data-testid="sc-time-wrap">
        <div className="sc-time-heading">
          <Clock className="w-4 h-4" /> ESTIMATED TIME / {t("sc_duration", "Tahmini Süre").toUpperCase()}
        </div>
        <div className="sc-time-big">
          {gun} {t("sc_days_u", "gün")}, {saat} {t("sc_hours_u", "saat")}, {dakika} {t("sc_minutes_u", "dakika")}
        </div>
        {/* Hidden 4-box legacy view kept mounted for existing testIds */}
        <div className="grid grid-cols-4 gap-2 mt-2" style={{ opacity: 0.75 }}>
          {[
            { label: t("sc_days_u", "GÜN"), value: gun, tid: "sure-gun" },
            { label: t("sc_hours_u", "SAAT"), value: saat, tid: "sure-saat" },
            { label: t("sc_minutes_u", "DAKİKA"), value: dakika, tid: "sure-dakika" },
            { label: t("sc_seconds_u", "SANİYE"), value: saniye, tid: "sure-saniye" },
          ].map((it) => (
            <div key={it.label} className="text-center">
              <div className="text-[10px] mb-1 uppercase tracking-widest" style={{ color: "#D4730A" }}>{it.label}</div>
              <div data-testid={it.tid} className="sc-time-cell">{pad2(it.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Admin: unit-cost editor button */}
      {isAdmin && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setShowUnitModal(true)}
            data-testid="open-unit-cost-modal"
            className="px-3 py-1.5 rounded text-white text-xs font-bold flex items-center gap-1"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
          >
            <Settings className="w-3.5 h-3.5" /> {t("sc_unit_cost_btn")}
          </button>
        </div>
      )}

      {calculations.length > 0 && (
        <div className="mt-6 overflow-x-auto card-dark p-3" data-testid="calc-history-table">
          <h3 className="text-xs font-bold mb-2 uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("sc_history")}</h3>
          <table className="w-full text-xs" style={{ color: "#F5F0E8" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
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
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
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
      yemek: fetched.yemek || 0, odun: fetched.odun || 0, celik: fetched.celik || 0,
      benzin: fetched.benzin || 0, sure_saniye: fetched.sure_saniye || 0,
    });
  }, [fetched.yemek, fetched.odun, fetched.celik, fetched.benzin, fetched.sure_saniye]);

  const set = (k, v) => setState((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/unit-costs/${cat}`, {
        yemek: Number(state.yemek) || 0, odun: Number(state.odun) || 0,
        celik: Number(state.celik) || 0, benzin: Number(state.benzin) || 0,
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

        <div className="grid grid-cols-4 gap-2 mb-4">
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
              type="number" step="0.01" min="0"
              value={state[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              data-testid={`unit-${f.key}`}
              className="w-full rounded"
              style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8", padding: "8px 10px" }}
            />
          </div>
        ))}
        <button
          type="submit" disabled={saving}
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
