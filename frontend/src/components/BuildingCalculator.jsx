import React, { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { Settings, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const LEVELS = ["F10", "F9", "F8", "F7", "F6"];
const STAGES = [1, 2, 3, 4, 5];

const BUILDING_SLUGS = [
  "komuta_merkezi",
  "kalkan_kislasi",
  "bombaci_kislasi",
  "tetikci_kislasi",
  "revir",
  "iletisim_merkezi",
  "forticlad_lab",
];

const EMPTY_COSTS = {
  yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0,
  forticlad: 0, gelismis_forticlad: 0,
};

const catFor = (slug, lvl, stage) => `bina_${slug}_${lvl.toLowerCase()}_a${stage}`;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");
const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

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
  const { isAdmin } = useAuth();
  const [level, setLevel] = useState("F9");
  const [stage, setStage] = useState(1);
  const [building, setBuilding] = useState(BUILDING_SLUGS[0]);
  const [showUnitModal, setShowUnitModal] = useState(false);

  const category = catFor(building, level, stage);
  const { data: unitCosts = EMPTY_COSTS } = useSWR(`/unit-costs/${category}`, fetcher);

  // Always compute for 1 upgrade → totals equal the unit cost
  const n = 1;
  const totals = {
    yemek: n * (unitCosts.yemek || 0),
    celik: n * (unitCosts.celik || 0),
    odun: n * (unitCosts.odun || 0),
    benzin: n * (unitCosts.benzin || 0),
    forticlad: n * (unitCosts.forticlad || 0),
    gelismis_forticlad: n * (unitCosts.gelismis_forticlad || 0),
  };
  const totalSure = n * (unitCosts.sure_saniye || 0);
  const dhms = secondsToDHMS(totalSure);

  return (
    <div className="p-1" data-testid="building-calculator">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("bc_title")}
        </h2>
      </div>

      {/* Level selector */}
      <div className="mb-4">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("bc_level")}</label>
        <div className="grid grid-cols-5 gap-2">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              data-testid={`bina-level-btn-${lv}`}
              aria-pressed={level === lv}
              className={`py-2 rounded font-bold uppercase bina-level-btn ${level === lv ? "active" : ""}`}
              style={{
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

      {/* Stage selector — sits between Level and Building. Each level has 5
          progressive stages (Aşama 1 → 5). Category key becomes
          `bina_{slug}_{lvl}_a{stage}` so different stages carry different
          costs without collapsing into one bucket. */}
      <div className="mb-4">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Aşama</label>
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              data-testid={`bina-stage-btn-${s}`}
              aria-pressed={stage === s}
              className={`py-2 rounded font-bold uppercase bina-level-btn ${stage === s ? "active" : ""}`}
              style={{
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.08em",
                fontSize: 13,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Building dropdown */}
      <div className="mb-4">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("bc_building")}</label>
        <div className="relative">
          <select
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            data-testid="bina-select"
            className="w-full rounded appearance-none font-bold uppercase cursor-pointer bina-select"
            style={{
              padding: "12px 40px 12px 14px",
              fontFamily: "Cinzel, serif",
              letterSpacing: "0.06em",
              fontSize: 13,
            }}
          >
            {BUILDING_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {t(`bc_b_${slug}`)}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#A855F7" }} />
        </div>
      </div>

      {/* Edit unit-cost button (admin only) — no label */}
      {isAdmin && (
        <div className="mb-4 flex items-center justify-end">
          <button
            onClick={() => setShowUnitModal(true)}
            data-testid="open-bina-unit-cost-modal"
            className="px-3 py-1 rounded text-white text-[11px] font-bold flex items-center gap-1 bina-shake-btn"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
          >
            <Settings className="w-3 h-3" /> {t("bc_unit_cost_btn")}
          </button>
        </div>
      )}

      {/* Total cost — Forticlad/Gelişmiş first row, then resources */}
      <div className="mb-5">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("bc_total_cost")}</label>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            { label: t("bc_forticlad"), value: totals.forticlad, tid: "bina-res-forticlad" },
            { label: t("bc_gelismis_forticlad"), value: totals.gelismis_forticlad, tid: "bina-res-gelismis" },
            { label: t("bc_food"), value: totals.yemek, tid: "bina-res-yemek" },
            { label: t("bc_steel"), value: totals.celik, tid: "bina-res-celik" },
            { label: t("bc_wood"), value: totals.odun, tid: "bina-res-odun" },
            { label: t("bc_gas"), value: totals.benzin, tid: "bina-res-benzin" },
          ].map((it) => (
            <div key={it.label} style={{ minWidth: 120 }}>
              <div className="text-[10px] mb-1 font-bold uppercase tracking-widest" style={{ color: "#F5F0E8", opacity: 0.7 }}>{it.label}</div>
              <div data-testid={it.tid} className="rounded font-bold text-sm" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5A623", padding: "4px 8px", textAlign: "center" }}>
                {fmt(it.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="mb-2">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>{t("bc_estimated_time")}</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: t("bc_days"), value: dhms.gun, tid: "bina-dhms-gun" },
            { label: t("bc_hours"), value: dhms.saat, tid: "bina-dhms-saat" },
            { label: t("bc_minutes"), value: dhms.dakika, tid: "bina-dhms-dakika" },
            { label: t("bc_seconds"), value: dhms.saniye, tid: "bina-dhms-saniye" },
          ].map((it) => (
            <div key={it.label} className="text-center">
              <div className="text-[10px] mb-1" style={{ color: "#F5F0E8", opacity: 0.7 }}>{it.label}</div>
              <div data-testid={it.tid} className="rounded font-bold text-lg" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5A623", padding: "3px 4px" }}>
                {pad2(it.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showUnitModal && (
        <BinaUnitCostModal
          initialBuilding={building}
          initialLevel={level}
          initialStage={stage}
          onClose={() => setShowUnitModal(false)}
        />
      )}
    </div>
  );
}

function BinaUnitCostModal({ initialBuilding, initialLevel, initialStage, onClose }) {
  const { t } = useTranslation();
  const [activeBuilding, setActiveBuilding] = useState(initialBuilding);
  const [activeLevel, setActiveLevel] = useState(initialLevel);
  const [activeStage, setActiveStage] = useState(initialStage || 1);
  const [state, setState] = useState(EMPTY_COSTS);
  const [saving, setSaving] = useState(false);
  // Comparison mode — swaps the single-stage form out for a 5-column table
  // where each column is a stage (1→5). All 5 stages are fetched in
  // parallel via SWR (same cache the single view uses so switching modes
  // is instant) and saved via Promise.all when the admin hits Save.
  const [compareMode, setCompareMode] = useState(false);
  const [compareState, setCompareState] = useState({});

  const cat = catFor(activeBuilding, activeLevel, activeStage);
  const { data: fetched = EMPTY_COSTS } = useSWR(`/unit-costs/${cat}`, fetcher);

  // Batch-fetch every stage when comparison mode is on. Keyed by activeLevel/
  // activeBuilding so switching either instantly re-hydrates the table.
  const s1 = useSWR(compareMode ? `/unit-costs/${catFor(activeBuilding, activeLevel, 1)}` : null, fetcher);
  const s2 = useSWR(compareMode ? `/unit-costs/${catFor(activeBuilding, activeLevel, 2)}` : null, fetcher);
  const s3 = useSWR(compareMode ? `/unit-costs/${catFor(activeBuilding, activeLevel, 3)}` : null, fetcher);
  const s4 = useSWR(compareMode ? `/unit-costs/${catFor(activeBuilding, activeLevel, 4)}` : null, fetcher);
  const s5 = useSWR(compareMode ? `/unit-costs/${catFor(activeBuilding, activeLevel, 5)}` : null, fetcher);
  useEffect(() => {
    if (!compareMode) return;
    const norm = (d) => ({
      yemek: d?.yemek || 0, odun: d?.odun || 0, celik: d?.celik || 0,
      benzin: d?.benzin || 0, sure_saniye: d?.sure_saniye || 0,
      forticlad: d?.forticlad || 0, gelismis_forticlad: d?.gelismis_forticlad || 0,
    });
    setCompareState({
      1: norm(s1.data), 2: norm(s2.data), 3: norm(s3.data),
      4: norm(s4.data), 5: norm(s5.data),
    });
  }, [compareMode, s1.data, s2.data, s3.data, s4.data, s5.data]);

  const setCompareCell = (stage, key, v) => {
    setCompareState((prev) => ({ ...prev, [stage]: { ...(prev[stage] || {}), [key]: v } }));
  };

  const submitCompare = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all(STAGES.map((s) => {
        const c = compareState[s] || {};
        return api.put(`/unit-costs/${catFor(activeBuilding, activeLevel, s)}`, {
          yemek: Number(c.yemek) || 0,
          odun: Number(c.odun) || 0,
          celik: Number(c.celik) || 0,
          benzin: Number(c.benzin) || 0,
          sure_saniye: Number(c.sure_saniye) || 0,
          forticlad: Number(c.forticlad) || 0,
          gelismis_forticlad: Number(c.gelismis_forticlad) || 0,
        });
      }));
      STAGES.forEach((s) => globalMutate(`/unit-costs/${catFor(activeBuilding, activeLevel, s)}`));
      toast.success(`${t(`bc_b_${activeBuilding}`)} · ${activeLevel} — 5 aşama kaydedildi`);
      onClose();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || e2.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setState({
      yemek: fetched.yemek || 0,
      odun: fetched.odun || 0,
      celik: fetched.celik || 0,
      benzin: fetched.benzin || 0,
      sure_saniye: fetched.sure_saniye || 0,
      forticlad: fetched.forticlad || 0,
      gelismis_forticlad: fetched.gelismis_forticlad || 0,
    });
  }, [fetched.yemek, fetched.odun, fetched.celik, fetched.benzin, fetched.sure_saniye, fetched.forticlad, fetched.gelismis_forticlad]);

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
        forticlad: Number(state.forticlad) || 0,
        gelismis_forticlad: Number(state.gelismis_forticlad) || 0,
      });
      globalMutate(`/unit-costs/${cat}`);
      const bLabel = t(`bc_b_${activeBuilding}`);
      toast.success(t("bc_updated", { building: bLabel, level: activeLevel }));
      onClose();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || e2.message);
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: "yemek", label: t("bc_food") },
    { key: "odun", label: t("bc_wood") },
    { key: "celik", label: t("bc_steel") },
    { key: "benzin", label: t("bc_gas") },
    { key: "forticlad", label: t("bc_forticlad") },
    { key: "gelismis_forticlad", label: t("bc_gelismis_forticlad") },
    { key: "sure_saniye", label: t("bc_time_seconds") },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      data-testid="bina-unit-cost-modal"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #E74C1A", boxShadow: "0 8px 32px rgba(0,0,0,0.9)", maxHeight: "88vh", overflowY: "auto" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white" data-testid="bina-modal-close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-3 uppercase" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("bc_unit_cost_title")}
        </h3>

        {/* Comparison mode toggle */}
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCompareMode((v) => !v)}
            data-testid="bina-compare-toggle"
            className="chip text-[10px] flex-1 justify-center py-2"
            style={compareMode ? {
              borderColor: "#F5A623",
              color: "#FCD34D",
              background: "rgba(245,166,35,0.15)",
              boxShadow: "0 0 8px rgba(245,166,35,0.35)",
            } : { opacity: 0.75 }}
            title="5 aşamayı yan yana tablo olarak göster / kapat"
          >
            {compareMode ? "◧ Tek Aşama" : "▦ 5 Aşamayı Karşılaştır"}
          </button>
        </div>

        {/* Building dropdown inside modal */}
        <div className="mb-3">
          <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A" }}>{t("bc_building")}</label>
          <div className="relative">
            <select
              value={activeBuilding}
              onChange={(e) => setActiveBuilding(e.target.value)}
              data-testid="modal-bina-select"
              className="w-full rounded appearance-none font-bold uppercase cursor-pointer"
              style={{
                background: "#1A1210",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#F5F0E8",
                padding: "10px 36px 10px 12px",
                fontFamily: "Cinzel, serif",
                fontSize: 12,
              }}
            >
              {BUILDING_SLUGS.map((slug) => (
                <option key={slug} value={slug} style={{ background: "#1A1210", color: "#F5F0E8" }}>
                  {t(`bc_b_${slug}`)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#F5A623" }} />
          </div>
        </div>

        {/* Level selector inside modal */}
        <div className="mb-3">
          <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A" }}>{t("bc_level")}</label>
          <div className="grid grid-cols-5 gap-2">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setActiveLevel(lv)}
                data-testid={`modal-bina-level-${lv}`}
                className="py-1.5 rounded font-bold text-xs uppercase"
                style={{
                  background: activeLevel === lv ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                  border: `1px solid ${activeLevel === lv ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  color: activeLevel === lv ? "#0B0704" : "#F5F0E8",
                  fontFamily: "Cinzel, serif",
                }}
              >
                {lv}
              </button>
            ))}
          </div>
        </div>

        {/* Stage selector inside modal (hidden in compare mode — the table
            shows every stage at once). */}
        {!compareMode && (
        <div className="mb-4">
          <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A" }}>Aşama</label>
          <div className="grid grid-cols-5 gap-2">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveStage(s)}
                data-testid={`modal-bina-stage-${s}`}
                className="py-1.5 rounded font-bold text-xs uppercase"
                style={{
                  background: activeStage === s ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                  border: `1px solid ${activeStage === s ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  color: activeStage === s ? "#0B0704" : "#F5F0E8",
                  fontFamily: "Cinzel, serif",
                  letterSpacing: "0.08em",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        )}

        {compareMode ? (
          <div className="mb-2" data-testid="bina-compare-table-wrap">
            <div className="overflow-x-auto rounded" style={{ border: "1px solid rgba(245,166,35,0.35)" }}>
              <table className="w-full text-[10px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="text-left px-1.5 py-1.5 sticky left-0 z-10"
                        style={{ background: "#241812", color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.06em", borderBottom: "1px solid rgba(245,166,35,0.35)", minWidth: 88 }}>
                      MALZEME
                    </th>
                    {STAGES.map((s) => (
                      <th key={s} className="text-center px-1.5 py-1.5"
                          style={{ background: "#241812", color: "#F5A623", fontFamily: "Cinzel, serif", borderBottom: "1px solid rgba(245,166,35,0.35)", minWidth: 60 }}>
                        A{s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.key}>
                      <td className="px-1.5 py-1.5 sticky left-0"
                          style={{ background: "#1A1210", color: "#EAD8B0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        {f.label}
                      </td>
                      {STAGES.map((s) => (
                        <td key={s} className="p-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={(compareState[s] || {})[f.key] ?? 0}
                            onChange={(e) => setCompareCell(s, f.key, e.target.value)}
                            data-testid={`bina-compare-${f.key}-a${s}`}
                            className="w-full text-center rounded font-mono"
                            style={{ background: "#0F0906", border: "1px solid #333", color: "#F5F0E8", padding: "4px 3px", fontSize: 11 }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[9px] text-muted-foreground mt-1.5 leading-snug">
              💡 5 aşamanın maliyetlerini yan yana düzenle. Tek "Tümünü Kaydet" ile 5 satır aynı anda güncellenir.
            </div>
            <button
              type="button"
              onClick={submitCompare}
              disabled={saving}
              data-testid="save-bina-compare"
              className="w-full mt-3 py-2.5 rounded-lg text-white font-bold bina-shake-btn"
              style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
            >
              {saving ? t("bc_saving") : "TÜMÜNÜ KAYDET (5 Aşama)"}
            </button>
          </div>
        ) : (
        <>
        {fields.map((f) => (
          <div key={f.key} className="mb-3">
            <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A" }}>{f.label}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={state[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              data-testid={`bina-unit-${f.key}`}
              className="w-full rounded"
              style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8", padding: "8px 10px" }}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={saving}
          data-testid="save-bina-unit-costs"
          className="w-full mt-2 py-2.5 rounded-lg text-white font-bold bina-shake-btn"
          style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
        >
          {saving ? t("bc_saving") : t("bc_save_pattern", { building: t(`bc_b_${activeBuilding}`), level: activeLevel })}
        </button>
        </>
        )}
      </form>
    </div>
  );
}
