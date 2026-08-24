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
  "mudur_ofisi",
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

// Theme-aware delta palette. In dark mode (default) we use vivid tailwind
// 400-level greens/reds so the tiny +/- numbers punch through the dark
// backdrop. Light mode gets deeper 600-level tones to keep contrast on
// pale backgrounds.
function deltaColors() {
  const dark = typeof document !== "undefined"
    && document.documentElement.classList.contains("dark");
  return dark
    ? ["#4ADE80", "#F87171", "#94A3B8"]   // dark: bright
    : ["#16A34A", "#DC2626", "#64748B"];  // light: deep
}

// CSV export/import helpers shared with the Asker compare table. Format:
//   scope,building,level,resource,col1,col2,col3,col4,col5
// where the col header row lists the tier / stage labels; rows are one
// per resource. Round-trip safe.
function exportCsv(scope, building, level, cols, fields, state) {
  const header = ["resource", ...cols.map((c) => scope === "bina" ? `A${c}` : c)].join(",");
  const rows = fields.map((f) => [f.key, ...cols.map((c) => (state[c] || {})[f.key] ?? 0)].join(","));
  const csv = [`# ${scope} ${building || ""} ${level || ""}`.trim(), header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${scope}${building ? "-" + building : ""}${level ? "-" + level : ""}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importCsv(e, cols, fields, setter) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "").trim();
      const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
      if (lines.length < 2) throw new Error("CSV çok kısa");
      const rows = lines.slice(1).map((l) => l.split(","));
      const next = {};
      cols.forEach((c) => { next[c] = {}; });
      const validKeys = new Set(fields.map((f) => f.key));
      rows.forEach((r) => {
        const key = (r[0] || "").trim();
        if (!validKeys.has(key)) return;
        cols.forEach((c, i) => {
          const v = Number(r[i + 1]);
          if (!Number.isNaN(v)) next[c][key] = v;
        });
      });
      setter((prev) => {
        const merged = { ...prev };
        cols.forEach((c) => { merged[c] = { ...(prev[c] || {}), ...(next[c] || {}) }; });
        return merged;
      });
      toast.success(`CSV yüklendi (${rows.length} satır)`);
    } catch (err) {
      toast.error(`CSV hatası: ${err.message}`);
    }
  };
  reader.readAsText(file);
}
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

  // v110 — Toplu Seçim (bulk pick): admins & members alike can tick a mix of
  // F6-F10 × 7 buildings × 5 stages, hit "TAMAM" and get the aggregate cost of
  // every selected upgrade. Each leaf key follows the pattern `${lv}|${slug}|${st}`.
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkLeaves, setBulkLeaves] = useState(() => new Set());
  const [bulkExpanded, setBulkExpanded] = useState(() => new Set(["F9"]));
  const [bulkBuildingExpanded, setBulkBuildingExpanded] = useState(() => new Set());
  const [bulkResult, setBulkResult] = useState(null); // {count, totals:{...}, dhms:{...}}
  const [bulkLoading, setBulkLoading] = useState(false);

  const leafId = (lv, slug, st) => `${lv}|${slug}|${st}`;
  const parseLeaf = (id) => {
    const [lv, slug, st] = id.split("|");
    return { lv, slug, st: Number(st) };
  };

  const leavesForLevel = (lv) =>
    BUILDING_SLUGS.flatMap((slug) => STAGES.map((st) => leafId(lv, slug, st)));
  const leavesForBuilding = (lv, slug) =>
    STAGES.map((st) => leafId(lv, slug, st));

  const isLeafOn = (id) => bulkLeaves.has(id);
  const toggleLeaf = (id) => {
    setBulkLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const setMany = (ids, on) => {
    setBulkLeaves((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => { if (on) next.add(id); else next.delete(id); });
      return next;
    });
  };
  const buildingState = (lv, slug) => {
    const ids = leavesForBuilding(lv, slug);
    const on = ids.filter((id) => bulkLeaves.has(id)).length;
    if (on === 0) return "off";
    if (on === ids.length) return "all";
    return "some";
  };
  const levelState = (lv) => {
    const ids = leavesForLevel(lv);
    const on = ids.filter((id) => bulkLeaves.has(id)).length;
    if (on === 0) return "off";
    if (on === ids.length) return "all";
    return "some";
  };

  const computeBulkTotals = async () => {
    if (bulkLeaves.size === 0) {
      toast.info("Önce en az bir satır seç");
      return;
    }
    setBulkLoading(true);
    try {
      const ids = Array.from(bulkLeaves);
      const results = await Promise.all(
        ids.map((id) => {
          const { lv, slug, st } = parseLeaf(id);
          return api.get(`/unit-costs/${catFor(slug, lv, st)}`).then((r) => r.data).catch(() => EMPTY_COSTS);
        })
      );
      const totals = { yemek: 0, odun: 0, celik: 0, benzin: 0, forticlad: 0, gelismis_forticlad: 0 };
      let sure = 0;
      results.forEach((c) => {
        totals.yemek += Number(c.yemek || 0);
        totals.odun += Number(c.odun || 0);
        totals.celik += Number(c.celik || 0);
        totals.benzin += Number(c.benzin || 0);
        totals.forticlad += Number(c.forticlad || 0);
        totals.gelismis_forticlad += Number(c.gelismis_forticlad || 0);
        sure += Number(c.sure_saniye || 0);
      });
      setBulkResult({ count: ids.length, totals, dhms: secondsToDHMS(sure) });
      toast.success(`${ids.length} satırın toplam maliyeti hesaplandı`);
    } catch (e) {
      toast.error(e?.message || "Toplam hesaplanamadı");
    } finally {
      setBulkLoading(false);
    }
  };

  const clearBulk = () => {
    setBulkLeaves(new Set());
    setBulkResult(null);
  };

  // Reset selections whenever bulk mode is toggled OFF so re-opening starts fresh.
  useEffect(() => {
    if (!bulkMode) {
      setBulkLeaves(new Set());
      setBulkResult(null);
    }
  }, [bulkMode]);

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
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-lg font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("bc_title")}
        </h2>
        <button
          type="button"
          onClick={() => setBulkMode((v) => !v)}
          data-testid="bc-bulk-mode-toggle"
          className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 tracking-widest"
          style={{
            background: bulkMode
              ? "linear-gradient(135deg,#059669,#10B981)"
              : "linear-gradient(135deg,#B45309,#F59E0B)",
            color: bulkMode ? "#FFFFFF" : "#0B0704",
            border: "1.5px solid rgba(0,0,0,0.35)",
            boxShadow: bulkMode
              ? "0 0 12px rgba(16,185,129,0.55)"
              : "0 0 12px rgba(245,158,11,0.55)",
          }}
          title="F6-F10 × 7 bina × 5 aşama arasından çoklu seçim yap"
        >
          <span aria-hidden>{bulkMode ? "✓" : "☑"}</span>
          {bulkMode ? "Toplu Seçim Aktif" : "Toplu Seçim"}
        </button>
      </div>

      {bulkMode && (
        <BulkPicker
          bulkLeaves={bulkLeaves}
          bulkExpanded={bulkExpanded}
          setBulkExpanded={setBulkExpanded}
          bulkBuildingExpanded={bulkBuildingExpanded}
          setBulkBuildingExpanded={setBulkBuildingExpanded}
          isLeafOn={isLeafOn}
          toggleLeaf={toggleLeaf}
          setMany={setMany}
          levelState={levelState}
          buildingState={buildingState}
          leavesForLevel={leavesForLevel}
          leavesForBuilding={leavesForBuilding}
          onCompute={computeBulkTotals}
          onClear={clearBulk}
          loading={bulkLoading}
          result={bulkResult}
          t={t}
        />
      )}

      {!bulkMode && (<>
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
      </>)}

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

function BulkPicker({
  bulkLeaves, bulkExpanded, setBulkExpanded, bulkBuildingExpanded, setBulkBuildingExpanded,
  isLeafOn, toggleLeaf, setMany, levelState, buildingState, leavesForLevel, leavesForBuilding,
  onCompute, onClear, loading, result, t,
}) {
  const toggleExpand = (key, setter) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const CheckSquare = ({ state, onClick, testId }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      data-testid={testId}
      aria-checked={state === "all"}
      className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-black shrink-0"
      style={{
        background: state === "all" ? "#10B981" : state === "some" ? "#F59E0B" : "#1A1210",
        border: `1.5px solid ${state === "off" ? "rgba(245,166,35,0.45)" : state === "some" ? "#F59E0B" : "#10B981"}`,
        color: "#0B0704",
        lineHeight: 1,
      }}
    >
      {state === "all" ? "✓" : state === "some" ? "−" : ""}
    </button>
  );

  return (
    <div data-testid="bc-bulk-picker" className="mb-3 rounded-lg" style={{ background: "rgba(20,12,10,0.55)", border: "1px solid rgba(245,166,35,0.45)", padding: 8 }}>
      <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#F5A623", letterSpacing: "0.14em" }}>
        F6→F10 × 7 Bina × 5 Aşama
      </div>
      <div className="flex flex-col gap-1">
        {LEVELS.slice().reverse().map((lv) => {
          const state = levelState(lv);
          const open = bulkExpanded.has(lv);
          return (
            <div key={lv} className="rounded" style={{ background: "rgba(10,6,4,0.5)", border: "1px solid rgba(245,166,35,0.22)" }}>
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none"
                onClick={() => toggleExpand(lv, setBulkExpanded)}
                data-testid={`bc-bulk-lv-header-${lv}`}
              >
                <CheckSquare
                  state={state}
                  onClick={() => setMany(leavesForLevel(lv), state !== "all")}
                  testId={`bc-bulk-lv-${lv}-check`}
                />
                <span className="font-bold text-sm" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.1em" }}>{lv}</span>
                <span className="ml-auto text-[10px]" style={{ color: "#A855F7" }}>{open ? "▲" : "▼"}</span>
              </div>
              {open && (
                <div className="pl-4 pb-2 flex flex-col gap-1">
                  {BUILDING_SLUGS.map((slug) => {
                    const bstate = buildingState(lv, slug);
                    const bopen = bulkBuildingExpanded.has(`${lv}|${slug}`);
                    return (
                      <div key={slug} className="rounded" style={{ background: "rgba(20,12,10,0.6)" }}>
                        <div
                          className="flex items-center gap-2 px-2 py-1 cursor-pointer select-none"
                          onClick={() => toggleExpand(`${lv}|${slug}`, setBulkBuildingExpanded)}
                          data-testid={`bc-bulk-b-header-${lv}-${slug}`}
                        >
                          <CheckSquare
                            state={bstate}
                            onClick={() => setMany(leavesForBuilding(lv, slug), bstate !== "all")}
                            testId={`bc-bulk-b-${lv}-${slug}-check`}
                          />
                          <span className="text-xs font-semibold" style={{ color: "#EAD8B0" }}>{t(`bc_b_${slug}`)}</span>
                          <span className="ml-auto text-[9px]" style={{ color: "#A855F7" }}>{bopen ? "▲" : "▼"}</span>
                        </div>
                        {bopen && (
                          <div className="pl-4 pb-1.5 flex flex-wrap gap-1">
                            {STAGES.map((st) => {
                              const id = `${lv}|${slug}|${st}`;
                              const on = isLeafOn(id);
                              return (
                                <button
                                  type="button"
                                  key={st}
                                  onClick={() => toggleLeaf(id)}
                                  data-testid={`bc-bulk-leaf-${lv}-${slug}-a${st}`}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"
                                  style={{
                                    background: on ? "#10B981" : "#1A1210",
                                    color: on ? "#0B0704" : "#F5F0E8",
                                    border: `1px solid ${on ? "#10B981" : "rgba(245,166,35,0.35)"}`,
                                  }}
                                >
                                  {on ? "✓" : ""}A{st}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={onCompute}
          disabled={loading}
          data-testid="bc-bulk-compute"
          className="flex-1 py-2 rounded-lg text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#059669,#10B981)", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Hesaplanıyor…" : `TAMAM — ${bulkLeaves.size} SATIR`}
        </button>
        <button
          type="button"
          onClick={onClear}
          data-testid="bc-bulk-clear"
          className="px-3 py-2 rounded-lg text-xs font-bold"
          style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.35)" }}
        >
          Temizle
        </button>
      </div>

      {result && (
        <div data-testid="bc-bulk-result" className="mt-3 rounded-lg p-3" style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.55)" }}>
          <div className="text-[11px] font-bold uppercase mb-2 tracking-widest" style={{ color: "#10B981", letterSpacing: "0.14em" }}>
            Seçilen: {result.count} satır — Toplam Maliyet
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t("bc_forticlad"), value: result.totals.forticlad },
              { label: t("bc_gelismis_forticlad"), value: result.totals.gelismis_forticlad },
              { label: t("bc_food"), value: result.totals.yemek },
              { label: t("bc_steel"), value: result.totals.celik },
              { label: t("bc_wood"), value: result.totals.odun },
              { label: t("bc_gas"), value: result.totals.benzin },
            ].map((it) => (
              <div key={it.label}>
                <div className="text-[9px] uppercase tracking-widest opacity-70" style={{ color: "#F5F0E8" }}>{it.label}</div>
                <div className="rounded font-bold text-sm" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5A623", padding: "3px 6px", textAlign: "center" }}>
                  {fmt(it.value)}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[
              { label: t("bc_days"), value: result.dhms.gun },
              { label: t("bc_hours"), value: result.dhms.saat },
              { label: t("bc_minutes"), value: result.dhms.dakika },
              { label: t("bc_seconds"), value: result.dhms.saniye },
            ].map((it) => (
              <div key={it.label} className="text-center">
                <div className="text-[9px] opacity-70" style={{ color: "#F5F0E8" }}>{it.label}</div>
                <div className="rounded font-bold text-base" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5A623", padding: "2px 4px" }}>
                  {pad2(it.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
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

  // Copy the value from `(fromStage, key)` to every stage strictly to its
  // right so `A2 → A3, A4, A5`. Powers right-click and the small ⤳ chip on
  // each cell so admins can flatten a plateau quickly without retyping.
  const copyRight = (fromStage, key) => {
    const v = (compareState[fromStage] || {})[key];
    const dest = STAGES.filter((s) => s > fromStage);
    if (dest.length === 0) {
      toast.info(`A${fromStage} zaten en sağdaki aşama`);
      return;
    }
    setCompareState((prev) => {
      const next = { ...prev };
      dest.forEach((s) => { next[s] = { ...(next[s] || {}), [key]: v }; });
      return next;
    });
    toast.success(`A${fromStage} → ${dest.map((s) => "A" + s).join(", ")} (${v || 0})`);
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
            {/* Sparkline row per resource — visualizes the A1→A5 trend for
                each cost so admins can spot lopsided curves at a glance. */}
            <div className="mb-2 rounded p-2" style={{ background: "rgba(20,12,10,0.55)", border: "1px solid rgba(245,166,35,0.22)" }} data-testid="bina-compare-sparklines">
              <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "#F5A623", letterSpacing: "0.14em" }}>
                Trend A1 → A5
              </div>
              <div className="grid grid-cols-1 gap-1">
                {fields.map((f) => {
                  const series = STAGES.map((s) => Number((compareState[s] || {})[f.key]) || 0);
                  const max = Math.max(1, ...series);
                  const w = 120, h = 18;
                  const step = w / (series.length - 1);
                  const points = series.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
                  const first = series[0], last = series[series.length - 1];
                  const [green, red, gray] = deltaColors();
                  const color = first === 0 ? (last > 0 ? green : gray) : (last > first ? green : last < first ? red : gray);
                  return (
                    <div key={f.key} className="flex items-center gap-2" data-testid={`bina-compare-spark-${f.key}`}>
                      <div className="text-[9px] uppercase" style={{ color: "#EAD8B0", minWidth: 70, fontWeight: 700 }}>{f.label}</div>
                      <svg width={w} height={h} style={{ display: "block" }}>
                        <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
                        {series.map((v, i) => (
                          <circle key={i} cx={(i * step).toFixed(1)} cy={(h - (v / max) * h).toFixed(1)} r="1.6" fill={color} />
                        ))}
                      </svg>
                      <div className="text-[9px] font-mono" style={{ color }}>
                        {first === 0 ? (last > 0 ? "∞" : "—") : `${last > first ? "+" : ""}${(((last - first) / first) * 100).toFixed(0)}%`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5 mt-2">
                <button type="button" onClick={() => exportCsv("bina", activeBuilding, activeLevel, STAGES, fields, compareState)}
                  data-testid="bina-compare-csv-export"
                  className="chip text-[9px] flex-1 justify-center py-1"
                  style={{ borderColor: "rgba(74,222,128,0.55)", color: "#4ADE80" }}
                >📥 CSV İndir</button>
                <label
                  className="chip text-[9px] flex-1 justify-center py-1 cursor-pointer"
                  style={{ borderColor: "rgba(147,197,253,0.55)", color: "#93C5FD" }}
                  data-testid="bina-compare-csv-import-label"
                >
                  📤 CSV Yükle
                  <input type="file" accept=".csv" data-testid="bina-compare-csv-import" className="hidden"
                    onChange={(e) => importCsv(e, STAGES, fields, setCompareState)} />
                </label>
              </div>
            </div>
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
                    <th className="text-center px-1.5 py-1.5"
                        style={{ background: "#2A1815", color: "#FCD34D", fontFamily: "Cinzel, serif", borderBottom: "1px solid rgba(245,166,35,0.55)", minWidth: 60, borderLeft: "1px solid rgba(245,166,35,0.35)" }}
                        title="A1'den A5'e maliyet artış yüzdesi"
                        data-testid="bina-compare-delta-header">
                      A1→A5 %
                    </th>
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
                        <td key={s} className="p-1 relative group" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={(compareState[s] || {})[f.key] ?? 0}
                            onChange={(e) => setCompareCell(s, f.key, e.target.value)}
                            onContextMenu={(e) => { e.preventDefault(); copyRight(s, f.key); }}
                            data-testid={`bina-compare-${f.key}-a${s}`}
                            title="Sağ tık → sağdaki tüm aşamalara kopyala"
                            className="w-full text-center rounded font-mono"
                            style={{ background: "#0F0906", border: "1px solid #333", color: "#F5F0E8", padding: "4px 3px", fontSize: 11 }}
                          />
                          {s < 5 && (
                            <button
                              type="button"
                              onClick={() => copyRight(s, f.key)}
                              data-testid={`bina-compare-copy-right-${f.key}-a${s}`}
                              className="absolute top-0.5 right-0.5 rounded transition-opacity opacity-0 group-hover:opacity-90 focus:opacity-100"
                              style={{
                                width: 14, height: 14,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: "rgba(245,166,35,0.85)",
                                color: "#0B0704",
                                fontSize: 9,
                                fontWeight: 900,
                                lineHeight: 1,
                              }}
                              title={`Bu değeri A${s + 1}${s < 4 ? "…A5" : ""}'e kopyala`}
                              aria-label={`A${s}'ten sağa kopyala`}
                            >
                              ⤳
                            </button>
                          )}
                        </td>
                      ))}
                      {(() => {
                        // A1→A5 percentage delta cell — same UX as the
                        // Asker Eğitim compare table: positive growth is
                        // green, drops red, undefined baseline shows "—".
                        const v1 = Number((compareState[1] || {})[f.key]) || 0;
                        const v5 = Number((compareState[5] || {})[f.key]) || 0;
                        const [green, red, gray] = deltaColors();
                        let label = "—";
                        let color = gray;
                        if (v1 !== 0) {
                          const pct = ((v5 - v1) / v1) * 100;
                          const sign = pct > 0 ? "+" : "";
                          label = `${sign}${pct.toFixed(0)}%`;
                          color = pct > 0 ? green : pct < 0 ? red : gray;
                        } else if (v5 !== 0) {
                          label = "∞"; color = green;
                        }
                        return (
                          <td
                            key="delta"
                            className="text-center font-mono px-1.5 py-1.5"
                            style={{
                              background: "rgba(42,24,21,0.65)",
                              color,
                              borderTop: "1px solid rgba(255,255,255,0.05)",
                              borderLeft: "1px solid rgba(245,166,35,0.35)",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                            data-testid={`bina-compare-delta-${f.key}`}
                            title="A1'den A5'e maliyet artış yüzdesi"
                          >
                            {label}
                          </td>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[9px] text-muted-foreground mt-1.5 leading-snug">
              💡 5 aşamanın maliyetlerini yan yana düzenle. Hücreye sağ tık veya <span style={{ color: "#F5A623" }}>⤳</span> düğmesi ile değeri sağdaki tüm aşamalara kopyala. Tek "Tümünü Kaydet" ile 5 satır aynı anda güncellenir.
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
