import React, { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Settings, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const TIERS = ["T11", "T8", "T7", "T6"];
const catFor = (tier) => `asker_egitim_${tier.toLowerCase()}`;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");
const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

function secondsToGSD(total) {
  const s = Math.max(0, Number(total) || 0);
  const gun = Math.floor(s / 86400);
  const saat = Math.floor((s % 86400) / 3600);
  const dakika = Math.ceil((s % 3600) / 60);
  return { gun, saat, dakika };
}

function formatSureShort(total) {
  const { gun, saat, dakika } = secondsToGSD(total);
  return `${gun}g ${pad2(saat)}s ${pad2(dakika)}d`;
}

export default function SoldierCalculator() {
  const { isAdmin, canEdit } = useAuth();
  const [tier, setTier] = useState("T11");
  const [soldierCount, setSoldierCount] = useState("");
  const [showUnitModal, setShowUnitModal] = useState(false);

  const category = catFor(tier);
  const { data: unitCosts = { yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0 } } =
    useSWR(`/unit-costs/${category}`, fetcher);

  // Fetch history for all 4 tiers in parallel and merge (backend uses exact-match on category)
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
  const { gun, saat, dakika } = secondsToGSD(totalSure);

  const save = async () => {
    if (!n || n <= 0) { toast.error("Asker sayısı girin"); return; }
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
      toast.success("Kaydedildi");
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

  return (
    <div className="p-1" data-testid="soldier-calculator">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          ASKER EĞİTİM HESAPLAYICI
        </h2>
        {isAdmin && (
          <button
            onClick={() => setShowUnitModal(true)}
            data-testid="open-unit-cost-modal"
            className="px-3 py-1.5 rounded text-white text-xs font-bold flex items-center gap-1"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
          >
            <Settings className="w-3.5 h-3.5" /> Birim Maliyet
          </button>
        )}
      </div>

      {/* Tier selector */}
      <div className="mb-4">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Tier</label>
        <div className="grid grid-cols-4 gap-2">
          {TIERS.map((tt) => (
            <button
              key={tt}
              onClick={() => setTier(tt)}
              data-testid={`tier-btn-${tt}`}
              aria-pressed={tier === tt}
              className="py-2 rounded font-bold uppercase transition-all"
              style={{
                background: tier === tt ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                border: `1px solid ${tier === tt ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                color: tier === tt ? "#0B0704" : "#F5F0E8",
                boxShadow: tier === tt ? "0 0 10px rgba(231,76,26,0.5)" : "none",
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.08em",
                fontSize: 13,
              }}
            >
              {tt}
            </button>
          ))}
        </div>
      </div>

      {/* Soldier count */}
      <div className="mb-5">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Asker Sayısı</label>
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
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Kaynak Sayısı</label>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            { label: "Yemek", value: totalYemek, tid: "res-yemek" },
            { label: "Çelik", value: totalCelik, tid: "res-celik" },
            { label: "Odun", value: totalOdun, tid: "res-odun" },
            { label: "Benzin", value: totalBenzin, tid: "res-benzin" },
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

      {/* Time — Gün / Saat / Dakika */}
      <div className="mb-5">
        <label className="block text-xs mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Süre</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "GÜN", value: gun, tid: "sure-gun" },
            { label: "SAAT", value: saat, tid: "sure-saat" },
            { label: "DAKİKA", value: dakika, tid: "sure-dakika" },
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
          <Save className="w-4 h-4" /> Hesapla & Kaydet
        </button>
      )}

      {calculations.length > 0 && (
        <div className="mt-6 overflow-x-auto card-dark p-3" data-testid="calc-history-table">
          <h3 className="text-xs font-bold mb-2 uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Geçmiş Hesaplar</h3>
          <table className="w-full text-xs" style={{ color: "#F5F0E8" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th className="p-2 text-left">Tier</th>
                <th className="p-2 text-left">Asker</th>
                <th className="p-2 text-left">Yemek</th>
                <th className="p-2 text-left">Odun</th>
                <th className="p-2 text-left">Çelik</th>
                <th className="p-2 text-left">Benzin</th>
                <th className="p-2 text-left">Süre</th>
                {canEdit && <th className="p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {calculations.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
                  <td className="p-2 mono font-bold" style={{ color: "#F5A623" }}>{tierOf(c.category)}</td>
                  <td className="p-2">{fmt(c.soldier_count)}</td>
                  <td className="p-2">{fmt(c.yemek)}</td>
                  <td className="p-2">{fmt(c.odun)}</td>
                  <td className="p-2">{fmt(c.celik)}</td>
                  <td className="p-2">{fmt(c.benzin)}</td>
                  <td className="p-2 mono">{formatSureShort(c.sure_saniye)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUnitModal && <UnitCostModal tier={tier} current={unitCosts} onClose={() => setShowUnitModal(false)} />}
    </div>
  );
}

function UnitCostModal({ tier, current, onClose }) {
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
      toast.success(`${activeTier} birim maliyeti güncellendi`);
      onClose();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || e2.message);
    } finally { setSaving(false); }
  };

  const fields = [
    { key: "yemek", label: "1 Asker Yemek Maliyeti" },
    { key: "odun", label: "1 Asker Odun Maliyeti" },
    { key: "celik", label: "1 Asker Çelik Maliyeti" },
    { key: "benzin", label: "1 Asker Benzin Maliyeti" },
    { key: "sure_saniye", label: "1 Asker Eğitim Süresi (saniye)" },
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
          Birim Maliyet Ayarları
        </h3>

        {/* Tier selector inside modal */}
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
          {saving ? "Kaydediliyor..." : `${activeTier} Kaydet`}
        </button>
      </form>
    </div>
  );
}
