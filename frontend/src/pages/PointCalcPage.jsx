import React, { useState, useEffect } from "react";
import useSWR from "swr";
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
        <DayCard key={d.id} day={d} onChanged={() => mutate()} />
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

function DayCard({ day, onChanged }) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(day.name);
  const [miktar, setMiktar] = useState(day.miktar || 0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setName(day.name);
    setMiktar(day.miktar || 0);
  }, [day.id, day.name, day.miktar]);

  // Only the first multiplier is used
  const mult = (day.multipliers && day.multipliers[0]) || { id: null, name: "", value: 0 };
  const materials = day.materials || [];
  const title = day.title || "";

  const miktarNum = Number(miktar) || 0;
  const multValue = Number(mult.value) || 0;
  const totalPoints = miktarNum * multValue;

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

  const saveMiktar = async () => {
    const v = Number(miktar) || 0;
    if (v !== day.miktar) await patch({ miktar: v });
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

      {/* Optional Title display */}
      {title && (
        <div
          className="mb-3 text-sm font-bold"
          data-testid={`pc-day-title-${day.id}`}
          style={{ color: "#F5F0E8", opacity: 0.85 }}
        >
          {title}
        </div>
      )}

      {/* Miktar + Modal button */}
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
            onClick={() => setShowModal(true)}
            data-testid={`pc-day-units-btn-${day.id}`}
            className="px-3 py-2 rounded text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)", color: "#fff" }}
          >
            <Settings className="w-3 h-3" /> {t("pc_add_unit_btn")}
          </button>
        )}
      </div>

      {/* Çarpan display (readonly) */}
      <div className="mb-3">
        <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
          {t("pc_multiplier")}
        </label>
        <div
          data-testid={`pc-day-mult-row-${day.id}`}
          className="flex justify-between items-center rounded px-3 py-2"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <span data-testid={`pc-day-mult-name-${day.id}`} style={{ color: "#F5F0E8" }}>
            {mult.name || <span style={{ opacity: 0.4 }}>{t("pc_no_multiplier")}</span>}
          </span>
          <span data-testid={`pc-day-mult-value-${day.id}`} className="font-bold" style={{ color: "#F5A623" }}>
            {fmt(multValue)}
          </span>
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

      {/* Birimler (readonly with computed totals) */}
      <div>
        <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
          {t("pc_units")}
        </label>
        {materials.length === 0 ? (
          <div
            className="text-[11px] px-3 py-2 rounded"
            style={{ color: "#F5F0E8", opacity: 0.5, background: "#1A1210", border: "1px dashed rgba(255,255,255,0.1)" }}
            data-testid={`pc-day-units-empty-${day.id}`}
          >
            {t("pc_units_empty")}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid={`pc-day-units-${day.id}`}>
            {/* Table header */}
            <div
              className="grid gap-2 text-[10px] font-bold uppercase px-2"
              style={{ gridTemplateColumns: "2fr 1fr 1fr", color: "#D4730A", opacity: 0.8, letterSpacing: "0.06em" }}
            >
              <span>{t("pc_unit_name")}</span>
              <span className="text-center">{t("pc_unit_amount")}</span>
              <span className="text-right">{t("pc_unit_total")}</span>
            </div>
            {materials.map((u) => {
              const amt = Number(u.amount) || 0;
              const total = miktarNum * amt;
              return (
                <div
                  key={u.id}
                  data-testid={`pc-unit-row-${u.id}`}
                  className="grid gap-2 items-center rounded px-2 py-1.5 text-sm"
                  style={{
                    gridTemplateColumns: "2fr 1fr 1fr",
                    background: "#1A1210",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span data-testid={`pc-unit-name-${u.id}`} style={{ color: "#F5F0E8" }}>
                    {u.name || <span style={{ opacity: 0.4 }}>—</span>}
                  </span>
                  <span data-testid={`pc-unit-amount-${u.id}`} className="text-center" style={{ color: "#F5F0E8", opacity: 0.85 }}>
                    {fmt(amt)}
                  </span>
                  <span data-testid={`pc-unit-total-${u.id}`} className="text-right font-bold" style={{ color: "#F5A623" }}>
                    {fmt(total)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <UnitEditModal
          day={day}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function UnitEditModal({ day, onClose, onSaved }) {
  const { t } = useTranslation();
  const firstMult = (day.multipliers && day.multipliers[0]) || null;
  const [title, setTitle] = useState(day.title || "");
  const [multName, setMultName] = useState(firstMult?.name || "");
  const [multValue, setMultValue] = useState(firstMult?.value ?? 0);
  const [units, setUnits] = useState(day.materials || []);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const multipliers = (multName.trim() || Number(multValue) !== 0)
        ? [{ id: firstMult?.id || rid(), name: multName.trim(), value: Number(multValue) || 0 }]
        : [];
      const materials = units.map((u) => ({
        id: u.id || rid(),
        name: (u.name || "").trim(),
        amount: String(u.amount ?? ""),
      }));
      await api.patch(`/point-calc/${day.id}`, {
        title,
        multipliers,
        materials,
      });
      toast.success(t("pc_unit_saved"));
      onSaved();
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
        className="w-full max-w-lg p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #E74C1A", boxShadow: "0 8px 32px rgba(0,0,0,0.9)", maxHeight: "88vh", overflowY: "auto" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white" data-testid="pc-unit-modal-close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-3 uppercase" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("pc_add_unit_btn")}
        </h3>

        {/* Table title */}
        <div className="mb-4">
          <label className="block text-[10px] mb-1 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
            {t("pc_table_title")}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("pc_title_placeholder")}
            data-testid="pc-modal-title"
            className="w-full rounded px-3 py-2"
            style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
          />
        </div>

        {/* Multiplier (single) */}
        <div className="mb-4">
          <label className="block text-[10px] mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
            {t("pc_multiplier")}
          </label>
          <div className="grid gap-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <input
              type="text"
              value={multName}
              onChange={(e) => setMultName(e.target.value)}
              placeholder={t("pc_multiplier_name")}
              data-testid="pc-modal-mult-name"
              className="rounded px-3 py-2"
              style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
            />
            <input
              type="number"
              value={multValue}
              onChange={(e) => setMultValue(e.target.value)}
              placeholder="0"
              data-testid="pc-modal-mult-value"
              className="rounded px-3 py-2 text-center font-bold"
              style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5A623" }}
            />
          </div>
        </div>

        {/* Units */}
        <div className="mb-4">
          <label className="block text-[10px] mb-2 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.08em" }}>
            {t("pc_units")}
          </label>
          <div className="flex flex-col gap-2">
            {units.map((u, idx) => (
              <div key={u.id || idx} className="grid gap-2 items-center" style={{ gridTemplateColumns: "2fr 1fr auto" }}>
                <input
                  type="text"
                  value={u.name}
                  onChange={(e) => {
                    const next = [...units];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setUnits(next);
                  }}
                  placeholder={t("pc_unit_name")}
                  data-testid={`pc-modal-unit-name-${idx}`}
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
                />
                <input
                  type="number"
                  value={u.amount}
                  onChange={(e) => {
                    const next = [...units];
                    next[idx] = { ...next[idx], amount: e.target.value };
                    setUnits(next);
                  }}
                  placeholder="0"
                  data-testid={`pc-modal-unit-amount-${idx}`}
                  className="rounded px-3 py-2 text-sm text-center"
                  style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
                />
                <button
                  type="button"
                  onClick={() => setUnits(units.filter((_, i) => i !== idx))}
                  data-testid={`pc-modal-unit-del-${idx}`}
                  className="p-1.5 rounded"
                  style={{ color: "#f87171" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setUnits([...units, { id: rid(), name: "", amount: "" }])}
              data-testid="pc-modal-add-unit"
              className="self-start px-3 py-1 rounded text-[11px] font-bold flex items-center gap-1"
              style={{ background: "rgba(231,76,26,0.15)", border: "1px dashed rgba(231,76,26,0.5)", color: "#F5A623" }}
            >
              <Plus className="w-3 h-3" /> {t("pc_add_unit")}
            </button>
          </div>
        </div>

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
