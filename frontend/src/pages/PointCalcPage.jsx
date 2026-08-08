import React, { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Plus, Trash2, Pencil, Check, X, Settings } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const KINDS = [
  { key: "pre", labelKey: "pc_tab_pre" },
  { key: "diger", labelKey: "pc_tab_other" },
];

const UNIT_KEYS = ["yemek", "odun", "celik", "benzin", "forticlad", "gelismis_forticlad"];

const DEFAULT_UNIT_LABELS = {
  yemek: "Yemek",
  odun: "Odun",
  celik: "Çelik",
  benzin: "Benzin",
  forticlad: "Forticlad",
  gelismis_forticlad: "Gelişmiş Forticlad",
};

const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");

export default function PointCalcPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState("pre");

  return (
    <div className="min-h-screen" data-testid="point-calc-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-5xl mx-auto p-4">
        <h1
          className="text-2xl font-bold mb-4 heading-cinzel"
          style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
        >
          {t("nav_point_calc")}
        </h1>

        {/* Kind tabs */}
        <div
          role="tablist"
          className="flex gap-2 mb-4 border-b"
          style={{ borderColor: "rgba(231,76,26,0.35)" }}
          data-testid="pc-kind-tabs"
        >
          {KINDS.map((k) => {
            const active = kind === k.key;
            return (
              <button
                key={k.key}
                role="tab"
                aria-selected={active}
                onClick={() => setKind(k.key)}
                data-testid={`pc-kind-tab-${k.key}`}
                className="px-4 py-2 rounded-t-lg font-bold uppercase transition-all"
                style={{
                  background: active ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                  border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  borderBottom: active ? "1px solid #E74C1A" : "1px solid transparent",
                  color: active ? "#0B0704" : "#F5F0E8",
                  boxShadow: active ? "0 0 10px rgba(231,76,26,0.5)" : "none",
                  fontFamily: "Cinzel, serif",
                  letterSpacing: "0.06em",
                  fontSize: 12,
                }}
              >
                {t(k.labelKey)}
              </button>
            );
          })}
        </div>

        <DayList kind={kind} />
      </div>
    </div>
  );
}

function DayList({ kind }) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const key = `/point-calc?kind=${kind}`;
  const { data: days = [], mutate } = useSWR(key, fetcher);

  const addDay = async () => {
    try {
      const next = (days?.length || 0) + 1;
      await api.post("/point-calc", {
        kind,
        name: `${next}. Gün`,
        order: days.length,
        title: "",
        miktar: 0,
        multipliers: [],
        materials: [],
      });
      mutate();
      toast.success(t("pc_day_added"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid={`pc-day-list-${kind}`}>
      {days.map((d) => (
        <DayCard key={d.id} day={d} kind={kind} onChanged={() => mutate()} />
      ))}

      {canEdit && (
        <button
          onClick={addDay}
          data-testid={`pc-add-day-${kind}`}
          className="self-start px-4 py-2 rounded-lg font-bold flex items-center gap-2"
          style={{
            background: "linear-gradient(135deg,#C0392B,#E74C1A)",
            color: "#fff",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
          }}
        >
          <Plus className="w-4 h-4" /> {t("pc_add_day")}
        </button>
      )}
    </div>
  );
}

function DayCard({ day, kind, onChanged }) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(day.name);
  const [title, setTitle] = useState(day.title || "");
  const [miktar, setMiktar] = useState(day.miktar || 0);
  const [multipliers, setMultipliers] = useState(day.multipliers || []);
  const [materials, setMaterials] = useState(day.materials || []);
  const [unitLabels, setUnitLabels] = useState({ ...DEFAULT_UNIT_LABELS, ...(day.unit_labels || {}) });
  const [showUnitModal, setShowUnitModal] = useState(false);

  useEffect(() => {
    setName(day.name);
    setTitle(day.title || "");
    setMiktar(day.miktar || 0);
    setMultipliers(day.multipliers || []);
    setMaterials(day.materials || []);
    setUnitLabels({ ...DEFAULT_UNIT_LABELS, ...(day.unit_labels || {}) });
  }, [day.id]);

  const totalMult = multipliers.reduce((sum, m) => sum + (Number(m.value) || 0), 0);
  const totalPoints = (Number(miktar) || 0) * totalMult;

  const patch = async (body) => {
    try {
      await api.patch(`/point-calc/${day.id}`, body);
      onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const saveName = async () => {
    setEditingName(false);
    if (name.trim() && name !== day.name) await patch({ name: name.trim() });
  };

  const saveTitle = async () => {
    if ((title || "") !== (day.title || "")) await patch({ title });
  };

  const saveMiktar = async () => {
    const v = Number(miktar) || 0;
    if (v !== day.miktar) await patch({ miktar: v });
  };

  const saveMultipliers = async (next) => {
    setMultipliers(next);
    await patch({ multipliers: next });
  };

  const saveMaterials = async (next) => {
    setMaterials(next);
    await patch({ materials: next });
  };

  const saveUnitLabels = async (next) => {
    setUnitLabels(next);
    await patch({ unit_labels: next });
  };

  const deleteDay = async () => {
    if (!window.confirm(t("pc_confirm_delete", { name: day.name }))) return;
    try {
      await api.delete(`/point-calc/${day.id}`);
      onChanged();
      toast.success(t("pc_deleted"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <div
      data-testid={`pc-day-${day.id}`}
      className="rounded-xl relative"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: "1px solid rgba(231,76,26,0.4)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(231,76,26,0.05)",
        padding: "16px",
      }}
    >
      {/* Header: name (editable) + delete */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: "rgba(231,76,26,0.25)" }}>
        {editingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid={`pc-day-name-input-${day.id}`}
              autoFocus
              className="flex-1 rounded px-2 py-1"
              style={{ background: "#1A1210", border: "1px solid #E74C1A", color: "#F5F0E8", fontFamily: "Cinzel, serif" }}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setName(day.name); setEditingName(false); } }}
            />
            <button onClick={saveName} data-testid={`pc-day-name-save-${day.id}`} className="p-1 rounded" style={{ color: "#4ade80" }}><Check className="w-4 h-4" /></button>
            <button onClick={() => { setName(day.name); setEditingName(false); }} className="p-1 rounded" style={{ color: "#f87171" }}><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h3
              className="text-lg font-bold"
              style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
              data-testid={`pc-day-name-${day.id}`}
            >
              {day.name}
            </h3>
            {canEdit && (
              <button
                onClick={() => setEditingName(true)}
                data-testid={`pc-day-name-edit-${day.id}`}
                className="p-1 rounded hover:bg-white/5"
                style={{ color: "#D4730A" }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {canEdit && (
          <button
            onClick={deleteDay}
            data-testid={`pc-day-delete-${day.id}`}
            className="p-1 rounded hover:bg-red-500/10"
            style={{ color: "#f87171" }}
            title={t("delete")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table title (editable) */}
      <div className="mb-3">
        <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
          {t("pc_table_title")}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          placeholder={t("pc_title_placeholder")}
          data-testid={`pc-day-title-${day.id}`}
          disabled={!canEdit}
          className="w-full rounded px-3 py-2"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
      </div>

      {/* Miktar + Birim Maliyet button */}
      <div className="mb-3 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
            {t("pc_miktar")}
          </label>
          <input
            type="number"
            value={miktar}
            onChange={(e) => setMiktar(e.target.value)}
            onBlur={saveMiktar}
            disabled={!canEdit}
            data-testid={`pc-day-miktar-${day.id}`}
            className="w-full rounded px-3 py-2 text-lg font-bold text-center"
            style={{ background: "#1A1210", border: "1px solid #E74C1A", color: "#F5F0E8" }}
          />
        </div>
        {canEdit && (
          <button
            onClick={() => setShowUnitModal(true)}
            data-testid={`pc-day-units-btn-${day.id}`}
            className="px-3 py-2 rounded text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)", color: "#fff" }}
          >
            <Settings className="w-3 h-3" /> {t("pc_unit_labels_btn")}
          </button>
        )}
      </div>

      {/* Multipliers */}
      <div className="mb-3">
        <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
          {t("pc_multipliers")}
        </label>
        <div className="flex flex-col gap-2" data-testid={`pc-day-multipliers-${day.id}`}>
          {multipliers.map((m, idx) => (
            <div key={m.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={m.name}
                onChange={(e) => {
                  const next = [...multipliers];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setMultipliers(next);
                }}
                onBlur={() => saveMultipliers(multipliers)}
                placeholder={t("pc_multiplier_name")}
                disabled={!canEdit}
                data-testid={`pc-mult-name-${m.id}`}
                className="flex-1 rounded px-2 py-1.5 text-sm"
                style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
              />
              <input
                type="number"
                value={m.value}
                onChange={(e) => {
                  const next = [...multipliers];
                  next[idx] = { ...next[idx], value: e.target.value };
                  setMultipliers(next);
                }}
                onBlur={() => saveMultipliers(multipliers.map((mm) => ({ ...mm, value: Number(mm.value) || 0 })))}
                disabled={!canEdit}
                data-testid={`pc-mult-value-${m.id}`}
                className="w-24 rounded px-2 py-1.5 text-sm text-center font-bold"
                style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5A623" }}
              />
              {canEdit && (
                <button
                  onClick={() => saveMultipliers(multipliers.filter((_, i) => i !== idx))}
                  data-testid={`pc-mult-del-${m.id}`}
                  className="p-1 rounded"
                  style={{ color: "#f87171" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <button
              onClick={() => saveMultipliers([...multipliers, { id: rid(), name: "", value: 0 }])}
              data-testid={`pc-add-mult-${day.id}`}
              className="self-start px-3 py-1 rounded text-[11px] font-bold flex items-center gap-1"
              style={{ background: "rgba(231,76,26,0.15)", border: "1px dashed rgba(231,76,26,0.5)", color: "#F5A623" }}
            >
              <Plus className="w-3 h-3" /> {t("pc_add_multiplier")}
            </button>
          )}
        </div>
      </div>

      {/* Total Points */}
      <div
        className="mb-3 p-3 rounded-lg flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, rgba(76,29,149,0.35), rgba(30,58,138,0.35))",
          border: "1px solid rgba(168,85,247,0.4)",
        }}
        data-testid={`pc-day-total-${day.id}`}
      >
        <span className="text-xs font-bold uppercase" style={{ color: "#E0E7FF", letterSpacing: "0.08em" }}>
          {t("pc_total_points")}
        </span>
        <span
          className="text-2xl font-bold"
          style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}
          data-testid={`pc-day-total-value-${day.id}`}
        >
          {fmt(totalPoints)}
        </span>
      </div>

      {/* Materials */}
      <div>
        <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
          {t("pc_materials")}
        </label>
        <div className="flex flex-col gap-2" data-testid={`pc-day-materials-${day.id}`}>
          {materials.map((mat, idx) => (
            <div key={mat.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={mat.name}
                onChange={(e) => {
                  const next = [...materials];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setMaterials(next);
                }}
                onBlur={() => saveMaterials(materials)}
                placeholder={t("pc_material_name")}
                disabled={!canEdit}
                data-testid={`pc-mat-name-${mat.id}`}
                className="flex-1 rounded px-2 py-1.5 text-sm"
                style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
              />
              <input
                type="text"
                value={mat.amount}
                onChange={(e) => {
                  const next = [...materials];
                  next[idx] = { ...next[idx], amount: e.target.value };
                  setMaterials(next);
                }}
                onBlur={() => saveMaterials(materials)}
                placeholder={t("pc_material_amount")}
                disabled={!canEdit}
                data-testid={`pc-mat-amount-${mat.id}`}
                className="w-28 rounded px-2 py-1.5 text-sm text-center"
                style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
              />
              {canEdit && (
                <button
                  onClick={() => saveMaterials(materials.filter((_, i) => i !== idx))}
                  data-testid={`pc-mat-del-${mat.id}`}
                  className="p-1 rounded"
                  style={{ color: "#f87171" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <button
              onClick={() => saveMaterials([...materials, { id: rid(), name: "", amount: "" }])}
              data-testid={`pc-add-mat-${day.id}`}
              className="self-start px-3 py-1 rounded text-[11px] font-bold flex items-center gap-1"
              style={{ background: "rgba(231,76,26,0.15)", border: "1px dashed rgba(231,76,26,0.5)", color: "#F5A623" }}
            >
              <Plus className="w-3 h-3" /> {t("pc_add_material")}
            </button>
          )}
        </div>
      </div>

      {showUnitModal && (
        <UnitLabelsModal
          initial={unitLabels}
          onClose={() => setShowUnitModal(false)}
          onSave={async (next) => { await saveUnitLabels(next); setShowUnitModal(false); }}
        />
      )}
    </div>
  );
}

function UnitLabelsModal({ initial, onClose, onSave }) {
  const { t } = useTranslation();
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(state);
      toast.success(t("pc_unit_labels_saved"));
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      data-testid="pc-unit-modal"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #E74C1A", boxShadow: "0 8px 32px rgba(0,0,0,0.9)", maxHeight: "88vh", overflowY: "auto" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white" data-testid="pc-unit-modal-close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-3 uppercase" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("pc_unit_labels_title")}
        </h3>

        <p className="text-[11px] mb-3" style={{ color: "#F5F0E8", opacity: 0.65 }}>
          {t("pc_unit_labels_help")}
        </p>

        {UNIT_KEYS.map((k) => (
          <div key={k} className="mb-3">
            <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A" }}>
              {k}
            </label>
            <input
              type="text"
              value={state[k] || ""}
              onChange={(e) => setState((s) => ({ ...s, [k]: e.target.value }))}
              data-testid={`pc-unit-label-${k}`}
              className="w-full rounded px-3 py-2"
              style={{ background: "#1A1210", border: "1px solid #333", color: "#F5F0E8" }}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={saving}
          data-testid="pc-unit-modal-save"
          className="w-full mt-2 py-2.5 rounded-lg text-white font-bold"
          style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)" }}
        >
          {saving ? t("bc_saving") : t("save")}
        </button>
      </form>
    </div>
  );
}
