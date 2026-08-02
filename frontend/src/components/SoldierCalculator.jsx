import React, { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Settings, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const CATEGORY = "asker_egitim";
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");
const pad2 = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

export default function SoldierCalculator() {
  const { isAdmin, canEdit } = useAuth();
  const [soldierCount, setSoldierCount] = useState("");
  const [showUnitModal, setShowUnitModal] = useState(false);

  const { data: unitCosts = { yemek: 0, odun: 0, celik: 0, benzin: 0, sure_saniye: 0 } } =
    useSWR(`/unit-costs/${CATEGORY}`, fetcher);
  const { data: calculations = [] } = useSWR(`/calculations?category=${CATEGORY}`, fetcher);

  const n = Number(soldierCount) || 0;
  const totalYemek = n * (unitCosts.yemek || 0);
  const totalOdun = n * (unitCosts.odun || 0);
  const totalCelik = n * (unitCosts.celik || 0);
  const totalBenzin = n * (unitCosts.benzin || 0);
  const totalSure = n * (unitCosts.sure_saniye || 0);
  const saat = Math.floor(totalSure / 3600);
  const dakika = Math.floor((totalSure % 3600) / 60);
  const saniye = Math.floor(totalSure % 60);

  const save = async () => {
    if (!n || n <= 0) { toast.error("Asker sayısı girin"); return; }
    try {
      await api.post("/calculations", {
        category: CATEGORY,
        soldier_count: n,
        yemek: totalYemek,
        odun: totalOdun,
        celik: totalCelik,
        benzin: totalBenzin,
        sure_saniye: totalSure,
      });
      globalMutate(`/calculations?category=${CATEGORY}`);
      toast.success("Kaydedildi");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const removeCalc = async (id) => {
    try {
      await api.delete(`/calculations/${id}`);
      globalMutate(`/calculations?category=${CATEGORY}`);
    } catch (e) { toast.error(e.message); }
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

      <div className="mb-5">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Kaynak Sayısı</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Yemek", value: totalYemek, tid: "res-yemek" },
            { label: "Odun", value: totalOdun, tid: "res-odun" },
            { label: "Çelik", value: totalCelik, tid: "res-celik" },
            { label: "Benzin", value: totalBenzin, tid: "res-benzin" },
          ].map((it) => (
            <div key={it.label} className="text-center">
              <div className="text-[10px] mb-1" style={{ color: "#F5F0E8", opacity: 0.7 }}>{it.label}</div>
              <div data-testid={it.tid} className="rounded font-bold text-sm" style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8", padding: "8px 4px" }}>
                {fmt(it.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>Süre</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Saat", value: saat, tid: "sure-saat" },
            { label: "Dakika", value: dakika, tid: "sure-dakika" },
            { label: "Saniye", value: saniye, tid: "sure-saniye" },
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
              {calculations.map((c) => {
                const s = Math.floor(c.sure_saniye || 0);
                const sTxt = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
                    <td className="p-2">{fmt(c.soldier_count)}</td>
                    <td className="p-2">{fmt(c.yemek)}</td>
                    <td className="p-2">{fmt(c.odun)}</td>
                    <td className="p-2">{fmt(c.celik)}</td>
                    <td className="p-2">{fmt(c.benzin)}</td>
                    <td className="p-2">{sTxt}</td>
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

      {showUnitModal && <UnitCostModal current={unitCosts} onClose={() => setShowUnitModal(false)} />}
    </div>
  );
}

function UnitCostModal({ current, onClose }) {
  const [state, setState] = useState({
    yemek: current.yemek || 0,
    odun: current.odun || 0,
    celik: current.celik || 0,
    benzin: current.benzin || 0,
    sure_saniye: current.sure_saniye || 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState({
      yemek: current.yemek || 0, odun: current.odun || 0,
      celik: current.celik || 0, benzin: current.benzin || 0,
      sure_saniye: current.sure_saniye || 0,
    });
  }, [current]);

  const set = (k, v) => setState((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/unit-costs/${CATEGORY}`, {
        yemek: Number(state.yemek) || 0,
        odun: Number(state.odun) || 0,
        celik: Number(state.celik) || 0,
        benzin: Number(state.benzin) || 0,
        sure_saniye: Number(state.sure_saniye) || 0,
      });
      globalMutate(`/unit-costs/${CATEGORY}`);
      toast.success("Birim maliyet güncellendi");
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
        style={{ background: "#1E1410", border: "1px solid #E74C1A", boxShadow: "0 8px 32px rgba(0,0,0,0.9)" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-4 uppercase" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          Birim Maliyet Ayarları
        </h3>
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
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </form>
    </div>
  );
}
