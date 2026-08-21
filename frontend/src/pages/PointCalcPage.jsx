import React, { useState, useEffect, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Plus, Trash2, Pencil, Check, X, Settings, ChevronRight, Globe, Download, Upload, Share2, History as HistoryIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { translateUserText } from "@/lib/deeplTranslate";

const fetcher = (url) => api.get(url).then((r) => r.data);

const KINDS = [
  { key: "pre", labelKey: "pc_tab_pre" },
  { key: "diger", labelKey: "pc_tab_other" },
];

const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");

function PCAdminActions({ kind, slot }) {
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  if (!isAdmin) return null;

  const download = async () => {
    setBusy(true);
    try {
      const token = localStorage.getItem("ol_token");
      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/point-calc/export?kind=${kind}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `puan_hesaplama_${kind}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel indirildi");
    } catch (e) {
      toast.error(`Excel indirilemedi: ${e.message}`);
    } finally { setBusy(false); }
  };

  if (slot === "excel") {
    return (
      <button
        onClick={download}
        disabled={busy}
        data-testid={`pc-export-${kind}`}
        className="h-8 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
        style={{ background: "linear-gradient(135deg,#059669,#10B981)", color: "#fff" }}
        title="Excel indir"
      >
        <Download className="w-3 h-3" /> Excel
      </button>
    );
  }
  if (slot === "import") {
    return (
      <>
        <button
          onClick={() => setShowImport(true)}
          disabled={busy}
          data-testid={`pc-import-${kind}`}
          className="h-8 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
          style={{ background: "linear-gradient(135deg,#B45309,#F59E0B)", color: "#0B0704" }}
          title="Excel geri yükle"
        >
          <Upload className="w-3 h-3" /> İçe Aktar
        </button>
        {showImport && (
          <ImportModal
            kind={kind}
            onClose={() => setShowImport(false)}
          />
        )}
      </>
    );
  }
  return null;
}

function ImportModal({ kind, onClose }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/point-calc/import?kind=${kind}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      toast.success(`${res.data.updated} etkinlik güncellendi`);
      globalMutate(`/point-calc?kind=${kind}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      data-testid="pc-import-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #F59E0B", boxShadow: "0 8px 32px rgba(0,0,0,0.9)" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white" data-testid="pc-import-modal-close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-3 uppercase flex items-center gap-2"
          style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          <Upload className="w-4 h-4" style={{ color: "#F59E0B" }} /> Excel İçe Aktar
        </h3>
        <p className="text-[11px] mb-3" style={{ color: "#F5F0E8", opacity: 0.7 }}>
          Dışa aktardığınız Excel'i düzenleyip aynı şablonla yükleyin. Her sayfa (etkinlik) mevcut isimle eşleşir; tablolar sıfırdan yeniden yazılır. Yedek otomatik alınır (Geçmiş'ten geri yüklenebilir).
        </p>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          data-testid="pc-import-file"
          className="w-full mb-3 text-xs"
          style={{ color: "#F5F0E8" }}
        />
        {result && (
          <div className="mb-3 p-2 rounded text-[11px]"
            style={{ background: "rgba(20,12,10,0.7)", border: "1px solid rgba(245,158,11,0.4)", color: "#F5F0E8" }}
            data-testid="pc-import-result">
            <div><b>Güncellenen:</b> {result.updated}</div>
            <div><b>Atlanan:</b> {result.skipped}</div>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 opacity-80">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy || !file}
          data-testid="pc-import-submit"
          className="w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#B45309,#F59E0B)", color: "#0B0704", opacity: (busy || !file) ? 0.6 : 1 }}
        >
          <Upload className="w-4 h-4" /> {busy ? "Yükleniyor..." : "Yükle"}
        </button>
      </div>
    </div>
  );
}

function normalizeTables(day) {
  if (day.tables && day.tables.length > 0) return day.tables;
  const hasLegacy = (day.miktar || 0) > 0 || (day.multipliers && day.multipliers.length > 0) || (day.materials && day.materials.length > 0) || (day.title || "");
  if (hasLegacy) {
    return [{
      id: `legacy-${day.id}`,
      title: day.title || "",
      miktar: day.miktar || 0,
      multipliers: day.multipliers || [],
      materials: day.materials || [],
    }];
  }
  return [];
}

// Look up a translation for a user-supplied string; render with a small globe
// icon so viewers know it's auto-translated. Falls back to source text.
function TranslatedText({ source, translations, testId }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || "tr").toLowerCase();
  const bucket = source && translations ? translations[source] : null;
  const translated = bucket && bucket[lang];
  const showTranslated = translated && translated !== source && lang !== "tr";
  return (
    <span data-testid={testId} className="inline-flex items-center gap-1">
      <span>{showTranslated ? translated : source}</span>
      {showTranslated && (
        <Globe
          className="w-3 h-3 inline-block opacity-60"
          style={{ color: "#A855F7" }}
          data-testid={testId ? `${testId}-globe` : undefined}
        />
      )}
    </span>
  );
}

export default function PointCalcPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState("pre");
  const [selectedId, setSelectedId] = useState(null);

  return (
    <div className="min-h-screen" data-testid="point-calc-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("nav_point_calc")}>
          {/* v49 layout: [İçe Aktar] ← [tabs centered] → [Excel] */}
          <div
            role="tablist"
            className="flex items-center gap-2 border-b pb-1 w-full"
            style={{ borderColor: "rgba(231,76,26,0.35)" }}
            data-testid="pc-kind-tabs"
          >
            <div className="flex-shrink-0"><PCAdminActions kind={kind} slot="excel" /></div>
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              {KINDS.map((k) => {
                const active = kind === k.key;
                return (
                  <button
                    key={k.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setKind(k.key); setSelectedId(null); }}
                    data-testid={`pc-kind-tab-${k.key}`}
                    className="px-3 py-2 rounded-t-lg font-bold uppercase transition-all whitespace-nowrap"
                    style={{
                      background: active ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                      border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                      borderBottom: active ? "1px solid #E74C1A" : "1px solid transparent",
                      color: active ? "#0B0704" : "#F5F0E8",
                      boxShadow: active ? "0 0 10px rgba(231,76,26,0.5)" : "none",
                      fontFamily: "Cinzel, serif",
                      letterSpacing: "0.06em",
                      fontSize: 11,
                    }}
                  >
                    {t(k.labelKey)}
                  </button>
                );
              })}
            </div>
            <div className="flex-shrink-0"><PCAdminActions kind={kind} slot="import" /></div>
          </div>
        </Header>

        <SidebarContent kind={kind} selectedId={selectedId} setSelectedId={setSelectedId} />
      </div>
    </div>
  );
}

function SidebarContent({ kind, selectedId, setSelectedId }) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const key = `/point-calc?kind=${kind}`;
  const { data: days = [], mutate } = useSWR(key, fetcher);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (days.length > 0 && !days.find((d) => d.id === selectedId)) {
      setSelectedId(days[0].id);
    }
    if (days.length === 0) setSelectedId(null);
  }, [days, kind, selectedId, setSelectedId]);

  const selectedDay = useMemo(() => days.find((d) => d.id === selectedId), [days, selectedId]);

  const addDay = async () => {
    try {
      const next = (days?.length || 0) + 1;
      const res = await api.post("/point-calc", {
        kind,
        name: `${next}. Etkinlik`,
        order: days.length,
        title: "",
        miktar: 0,
        multipliers: [],
        materials: [],
        tables: [{ id: rid(), title: "", miktar: 0, multipliers: [], materials: [] }],
      });
      await mutate();
      setSelectedId(res.data.id);
      toast.success(t("pc_event_added"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const saveNameInline = async (id, originalName) => {
    const trimmed = editName.trim();
    setEditingId(null);
    if (trimmed && trimmed !== originalName) {
      try {
        await api.patch(`/point-calc/${id}`, { name: trimmed });
        mutate();
      } catch (e) {
        toast.error(e?.response?.data?.detail || e.message);
      }
    }
  };

  const deleteDay = async (id, name) => {
    if (!window.confirm(t("pc_confirm_delete", { name }))) return;
    try {
      await api.delete(`/point-calc/${id}`);
      if (selectedId === id) {
        const rest = days.filter((d) => d.id !== id);
        setSelectedId(rest[0]?.id || null);
      }
      await mutate();
      toast.success(t("pc_deleted"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid={`pc-layout-${kind}`}>
      {/* Horizontal chip strip */}
      <div
        className="rounded-xl p-3"
        data-testid={`pc-sidebar-${kind}`}
        style={{
          background: "linear-gradient(180deg, rgba(76,29,149,0.35), rgba(30,58,138,0.35))",
          border: "1px solid rgba(168,85,247,0.4)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 0 24px rgba(139,92,246,0.15)",
        }}
      >
        <div className="flex flex-row flex-wrap gap-1.5" data-testid={`pc-sidebar-list-${kind}`}>
          {days.map((d) => {
            const active = d.id === selectedId;
            const isEditing = editingId === d.id;
            return (
              <div
                key={d.id}
                data-testid={`pc-sidebar-item-${d.id}`}
                className="group rounded-lg flex items-center gap-1 px-2 py-1.5 transition-all"
                style={{
                  background: active
                    ? "linear-gradient(135deg, rgba(139,92,246,0.85), rgba(59,130,246,0.75))"
                    : "rgba(30,20,35,0.55)",
                  border: `1px solid ${active ? "#A855F7" : "rgba(255,255,255,0.08)"}`,
                  boxShadow: active ? "0 0 12px rgba(168,85,247,0.6)" : "none",
                  cursor: "pointer",
                }}
                onClick={() => !isEditing && setSelectedId(d.id)}
              >
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`pc-sidebar-name-input-${d.id}`}
                      className="rounded px-2 py-0.5 text-xs"
                      style={{ background: "#1A1210", border: "1px solid #A855F7", color: "#F5F0E8", width: 120 }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNameInline(d.id, d.name);
                        if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); saveNameInline(d.id, d.name); }}
                      data-testid={`pc-sidebar-name-save-${d.id}`}
                      className="p-0.5 rounded"
                      style={{ color: "#4ade80" }}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditName(""); }}
                      className="p-0.5 rounded"
                      style={{ color: "#f87171" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="text-xs font-bold whitespace-nowrap"
                      data-testid={`pc-sidebar-name-${d.id}`}
                      style={{
                        color: active ? "#FFFFFF" : "#E0E7FF",
                        fontFamily: "Cinzel, serif",
                        letterSpacing: "0.04em",
                        textShadow: active ? "0 0 8px rgba(255,255,255,0.35)" : "none",
                      }}
                    >
                      {d.name}
                    </span>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingId(d.id); setEditName(d.name); }}
                          data-testid={`pc-sidebar-edit-${d.id}`}
                          className="p-0.5 rounded opacity-70 hover:opacity-100"
                          style={{ color: active ? "#FFFFFF" : "#F5A623" }}
                          title={t("edit")}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await api.get(`/point-calc/${d.id}/share`);
                              const url = `${window.location.origin}/public/puan-hesaplama/${res.data.id}?sig=${res.data.sig}`;
                              await navigator.clipboard.writeText(url);
                              toast.success(t("pc_share_copied"));
                            } catch (e2) {
                              toast.error(t("pc_share_error"));
                            }
                          }}
                          data-testid={`pc-sidebar-share-${d.id}`}
                          className="p-0.5 rounded opacity-70 hover:opacity-100"
                          style={{ color: active ? "#FFFFFF" : "#60A5FA" }}
                          title={t("pc_share_link")}
                        >
                          <Share2 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteDay(d.id, d.name); }}
                          data-testid={`pc-sidebar-delete-${d.id}`}
                          className="p-0.5 rounded opacity-70 hover:opacity-100"
                          style={{ color: active ? "#FFFFFF" : "#f87171" }}
                          title={t("delete")}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {canEdit && (
            <button
              onClick={addDay}
              data-testid={`pc-add-day-${kind}`}
              className="rounded-lg font-bold flex items-center gap-1 px-2 py-1.5 text-xs"
              style={{
                background: "linear-gradient(135deg,#C0392B,#E74C1A)",
                color: "#fff",
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.04em",
              }}
            >
              <Plus className="w-3 h-3" /> {t("pc_add_event")}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0" data-testid={`pc-content-${kind}`}>
        {selectedDay ? (
          <DayCard key={selectedDay.id} day={selectedDay} onChanged={() => mutate()} />
        ) : (
          <div
            className="rounded-xl p-8 text-center text-sm"
            style={{
              color: "#F5F0E8",
              opacity: 0.6,
              background: "rgba(30,20,16,0.6)",
              border: "1px dashed rgba(231,76,26,0.3)",
            }}
            data-testid="pc-content-empty"
          >
            {t("pc_no_selection")}
          </div>
        )}
      </div>
    </div>
  );
}

function DayCard({ day, onChanged }) {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const tables = normalizeTables(day);
  const translations = day.translations || {};
  const [showHistory, setShowHistory] = useState(false);

  const patchTables = async (nextTables, extra = {}) => {
    try {
      await api.patch(`/point-calc/${day.id}`, { tables: nextTables, ...extra });
      onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const addTable = async () => {
    const next = [...tables, { id: rid(), title: "", miktar: 0, multipliers: [], materials: [] }];
    await patchTables(next);
    toast.success(t("pc_table_added"));
  };

  const updateTable = async (tableId, patch) => {
    const { translations: patchTranslations, ...rest } = patch || {};
    const next = tables.map((tb) => (tb.id === tableId ? { ...tb, ...rest } : tb));
    const extra = patchTranslations ? { translations: patchTranslations } : {};
    await patchTables(next, extra);
  };

  const deleteTable = async (tableId) => {
    if (!window.confirm(t("pc_confirm_delete_table"))) return;
    const next = tables.filter((tb) => tb.id !== tableId);
    await patchTables(next);
    toast.success(t("pc_deleted"));
  };

  return (
    <div
      data-testid={`pc-day-${day.id}`}
      className="rounded-xl"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: "1px solid rgba(231,76,26,0.4)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(231,76,26,0.05)",
        padding: "16px",
      }}
    >
      <div className="mb-3 pb-2 border-b flex items-center justify-between gap-2" style={{ borderColor: "rgba(231,76,26,0.25)" }}>
        <h3
          className="text-lg font-bold"
          style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
          data-testid={`pc-day-name-${day.id}`}
        >
          <TranslatedText source={day.name} translations={translations} />
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            data-testid={`pc-day-history-btn-${day.id}`}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold"
            style={{
              background: "linear-gradient(135deg,#7C3AED,#3B82F6)",
              color: "#fff",
              letterSpacing: "0.04em",
            }}
            title={t("pc_history")}
          >
            <HistoryIcon className="w-3 h-3" /> {t("pc_history")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2" data-testid={`pc-tables-${day.id}`}>
        {tables.length === 0 && (
          <div
            className="col-span-full text-[11px] px-3 py-3 rounded text-center"
            style={{ color: "#F5F0E8", opacity: 0.55, background: "#1A1210", border: "1px dashed rgba(255,255,255,0.1)" }}
            data-testid={`pc-tables-empty-${day.id}`}
          >
            {t("pc_no_tables")}
          </div>
        )}

        {tables.map((tb, idx) => (
          <TableCard
            key={tb.id}
            table={tb}
            index={idx}
            canEdit={canEdit}
            translations={translations}
            onUpdate={(p) => updateTable(tb.id, p)}
            onDelete={() => deleteTable(tb.id)}
          />
        ))}
      </div>

      {canEdit && (
        <button
          onClick={addTable}
          data-testid={`pc-add-table-${day.id}`}
          className="mt-4 self-start px-3 py-2 rounded-lg font-bold flex items-center gap-1 text-xs"
          style={{
            background: "rgba(231,76,26,0.15)",
            border: "1px dashed rgba(231,76,26,0.5)",
            color: "#F5A623",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {t("pc_add_table")}
        </button>
      )}

      {showHistory && (
        <HistoryModal
          dayId={day.id}
          onClose={() => setShowHistory(false)}
          onReverted={() => { setShowHistory(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function HistoryModal({ dayId, onClose, onReverted }) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState(null);
  const [reverting, setReverting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/point-calc/${dayId}/history`);
        if (!cancelled) setVersions(res.data || []);
      } catch (e) {
        if (!cancelled) {
          setVersions([]);
          toast.error(e?.response?.data?.detail || e.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [dayId]);

  const revert = async (versionId) => {
    if (!window.confirm(t("pc_history_confirm_revert"))) return;
    setReverting(versionId);
    try {
      await api.post(`/point-calc/${dayId}/revert/${versionId}`);
      toast.success(t("pc_history_reverted"));
      onReverted();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setReverting(null);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
      data-testid="pc-history-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg p-5 rounded-xl relative"
        style={{
          background: "#1E1410",
          border: "1px solid #A855F7",
          boxShadow: "0 8px 32px rgba(0,0,0,0.9)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-white"
          data-testid="pc-history-modal-close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-4 uppercase flex items-center gap-2"
          style={{ color: "#E0E7FF", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          <HistoryIcon className="w-4 h-4" style={{ color: "#A855F7" }} />
          {t("pc_history_title")}
        </h3>

        {versions === null && (
          <div className="text-center py-4 text-sm" style={{ color: "#F5F0E8", opacity: 0.6 }} data-testid="pc-history-loading">
            {t("loading")}
          </div>
        )}

        {versions && versions.length === 0 && (
          <div className="rounded p-4 text-center text-[12px]"
            style={{ background: "#1A1210", border: "1px dashed rgba(255,255,255,0.1)", color: "#F5F0E8", opacity: 0.6 }}
            data-testid="pc-history-empty">
            {t("pc_history_empty")}
          </div>
        )}

        {versions && versions.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="pc-history-list">
            {versions.map((v) => (
              <div
                key={v.version_id}
                data-testid={`pc-history-item-${v.version_id}`}
                className="rounded-lg p-3 flex items-center justify-between gap-2"
                style={{
                  background: "rgba(20,12,10,0.7)",
                  border: "1px solid rgba(168,85,247,0.3)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold" style={{ color: "#E0E7FF" }}>
                    {v.saved_at ? new Date(v.saved_at).toLocaleString() : v.version_id.slice(0, 8)}
                  </div>
                  {v.changed_fields && v.changed_fields.length > 0 && (
                    <div className="text-[10px] mt-1" style={{ color: "#F5F0E8", opacity: 0.7 }}>
                      {t("pc_history_changed_fields")}: {v.changed_fields.join(", ")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => revert(v.version_id)}
                  disabled={reverting === v.version_id}
                  data-testid={`pc-history-revert-${v.version_id}`}
                  className="px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg,#C0392B,#E74C1A)",
                    color: "#fff",
                    opacity: reverting === v.version_id ? 0.6 : 1,
                  }}
                >
                  <RotateCcw className="w-3 h-3" /> {t("pc_history_revert")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableCard({ table, index, canEdit, translations, onUpdate, onDelete }) {
  const { t } = useTranslation();
  const [miktar, setMiktar] = useState(table.miktar || 0);
  const [showModal, setShowModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(table.title || "");

  useEffect(() => {
    setMiktar(table.miktar || 0);
  }, [table.id, table.miktar]);

  useEffect(() => {
    setTitleDraft(table.title || "");
  }, [table.id, table.title]);

  const saveTitleInline = async () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next !== (table.title || "")) {
      try {
        const strings = new Set();
        if (next) strings.add(next);
        const nextTranslations = { ...(translations || {}) };
        if (strings.size > 0) {
          const pairs = await Promise.all(
            [...strings].map(async (s) => [s, await translateUserText(s)])
          );
          pairs.forEach(([src, map]) => {
            if (src && map && Object.keys(map).length > 0) nextTranslations[src] = map;
          });
        }
        await onUpdate({ title: next, translations: nextTranslations });
      } catch (e) {
        toast.error(e?.response?.data?.detail || e.message);
      }
    }
  };

  const mult = (table.multipliers && table.multipliers[0]) || { id: null, name: "", value: 0 };
  const materials = table.materials || [];
  const title = table.title || "";

  const miktarNum = Number(miktar) || 0;
  const multValue = Number(mult.value) || 0;
  const totalPoints = miktarNum * multValue;

  const saveMiktar = async () => {
    const v = Number(miktar) || 0;
    if (v !== table.miktar) await onUpdate({ miktar: v });
  };

  return (
    <div
      data-testid={`pc-table-${table.id}`}
      className="rounded-lg relative"
      style={{
        background: "rgba(20,12,10,0.6)",
        border: "1px solid rgba(231,76,26,0.25)",
        padding: "8px",
      }}
    >
      {/* Table header */}
      <div className="flex items-center justify-between mb-1.5 gap-1.5">
        {editingTitle && canEdit ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveTitleInline(); }
                if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(table.title || ""); }
              }}
              placeholder={`${t("pc_table")} #${index + 1}`}
              data-testid={`pc-table-title-input-${table.id}`}
              className="flex-1 min-w-0 rounded px-2 py-1 text-xs"
              style={{ background: "#1A1210", border: "1px solid #F5A623", color: "#F5F0E8" }}
            />
            <button
              type="button"
              onClick={saveTitleInline}
              data-testid={`pc-table-title-save-${table.id}`}
              className="p-1 rounded"
              style={{ color: "#4ade80" }}
              aria-label="Kaydet"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { setEditingTitle(false); setTitleDraft(table.title || ""); }}
              className="p-1 rounded"
              style={{ color: "#f87171" }}
              aria-label="İptal"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs font-bold flex items-center gap-1.5 min-w-0 flex-1" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.06em" }}>
            <span className="truncate" data-testid={`pc-table-title-${table.id}`}>
              {title ? <TranslatedText source={title} translations={translations} /> : `${t("pc_table")} #${index + 1}`}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                data-testid={`pc-table-title-edit-${table.id}`}
                className="p-0.5 rounded opacity-70 hover:opacity-100 flex-shrink-0"
                style={{ color: "#F5A623" }}
                title="Başlığı Düzenle"
                aria-label="Başlığı Düzenle"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        {canEdit && (
          <button
            onClick={onDelete}
            data-testid={`pc-table-delete-${table.id}`}
            className="p-1 rounded opacity-70 hover:opacity-100 flex-shrink-0"
            style={{ color: "#f87171" }}
            title={t("delete")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Miktar (under title) + edit button */}
      <div className="mb-1.5 flex items-end gap-1.5">
        <div className="flex-1">
          <label className="block text-[9px] mb-0.5 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.06em" }}>
            {t("pc_miktar")}
          </label>
          <input
            type="number"
            value={miktar}
            onChange={(e) => setMiktar(e.target.value)}
            onBlur={saveMiktar}
            onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
            disabled={!canEdit}
            data-testid={`pc-table-miktar-${table.id}`}
            className="w-full rounded px-2 py-1 text-sm font-bold text-center"
            style={{ background: "#1A1210", border: "1px solid #E74C1A", color: "#F5F0E8" }}
          />
        </div>
        {canEdit && (
          <button
            onClick={() => setShowModal(true)}
            data-testid={`pc-table-units-btn-${table.id}`}
            className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 whitespace-nowrap"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)", color: "#fff" }}
          >
            <Pencil className="w-3 h-3" /> {t("edit")}
          </button>
        )}
      </div>

      {/* Multiplier readonly */}
      <div className="mb-1.5">
        <label className="block text-[9px] mb-0.5 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.06em" }}>
          {t("pc_multiplier")}
        </label>
        <div
          data-testid={`pc-table-mult-row-${table.id}`}
          className="flex justify-between items-center rounded px-2 py-1 text-xs"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <span data-testid={`pc-table-mult-name-${table.id}`} className="truncate" style={{ color: "#F5F0E8" }}>
            {mult.name
              ? <TranslatedText source={mult.name} translations={translations} />
              : <span style={{ opacity: 0.4 }}>{t("pc_no_multiplier")}</span>}
          </span>
          <span data-testid={`pc-table-mult-value-${table.id}`} className="font-bold ml-1 flex-shrink-0" style={{ color: "#F5A623" }}>
            {fmt(multValue)}
          </span>
        </div>
      </div>

      {/* Total (miktar × mult) */}
      <div>
        <label className="block text-[9px] mb-0.5 font-bold uppercase" style={{ color: "#D4730A", letterSpacing: "0.06em" }}>
          {t("pc_total_points")}
        </label>
        <div
          data-testid={`pc-table-total-row-${table.id}`}
          className="rounded px-2 py-1 text-center font-bold text-sm"
          style={{
            background: "linear-gradient(135deg, rgba(76,29,149,0.30), rgba(30,58,138,0.30))",
            border: "1px solid rgba(168,85,247,0.45)",
            color: "#F5A623",
            fontFamily: "Cinzel, serif",
          }}
        >
          {fmt(totalPoints)}
        </div>
      </div>

      {showModal && (
        <UnitEditModal
          table={table}
          existingTranslations={translations || {}}
          onClose={() => setShowModal(false)}
          onSaved={async (patch) => { await onUpdate(patch); setShowModal(false); }}
        />
      )}
    </div>
  );
}

function UnitEditModal({ table, existingTranslations, onClose, onSaved }) {
  const { t } = useTranslation();
  const firstMult = (table.multipliers && table.multipliers[0]) || null;
  const [title, setTitle] = useState(table.title || "");
  const [multName, setMultName] = useState(firstMult?.name || "");
  const [multValue, setMultValue] = useState(firstMult?.value ?? 0);
  const [units, setUnits] = useState(table.materials || []);
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

      // Collect every user-supplied string on this table (deduped) and translate
      // in parallel. Store the results in `day.translations` so the DayCard
      // render can show them per current i18n language.
      const strings = new Set();
      if (title.trim()) strings.add(title.trim());
      if (multName.trim()) strings.add(multName.trim());
      materials.forEach((m) => { if (m.name) strings.add(m.name); });

      const translations = { ...(existingTranslations || {}) };
      if (strings.size > 0) {
        const pairs = await Promise.all(
          [...strings].map(async (s) => [s, await translateUserText(s)])
        );
        pairs.forEach(([src, map]) => {
          if (src && map && Object.keys(map).length > 0) translations[src] = map;
        });
      }

      await onSaved({ title, multipliers, materials, translations });
      toast.success(t("pc_unit_saved"));
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
