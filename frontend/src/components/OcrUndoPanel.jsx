// v136 — OCR Multi-Select Undo Panel (with History tab)
// Reusable panel used on Members and Events pages.
// Props:
//   scope: "member" | "event"   → filters op_types
//   title: string (optional)
// Backend endpoints:
//   GET  /api/ocr/audit/recent?types=&include_undone=
//   POST /api/ocr/audit/undo-bulk  { op_ids: [] }
import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Undo2, CheckSquare, Square, Loader2, ChevronDown, ChevronRight, History } from "lucide-react";

const SCOPE_TYPES = {
  member: "ocr_add_member,ocr_power,ocr_castle_rank",
  event: "ocr_event_points",
};

const OP_LABEL_KEYS = {
  ocr_add_member: "ocr_op_add_member",
  ocr_power: "ocr_op_power",
  ocr_castle_rank: "ocr_op_castle_rank",
  ocr_event_points: "ocr_op_event_points",
};
const OP_LABEL_FALLBACKS = {
  ocr_add_member: "Üye Ekleme",
  ocr_power: "Güç OCR",
  ocr_castle_rank: "Kale/Rank OCR",
  ocr_event_points: "Etkinlik Puanı",
};

function fmtWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function OcrUndoPanel({ scope = "member", title, defaultOpen = false }) {
  const { t } = useTranslation();
  const types = SCOPE_TYPES[scope] || SCOPE_TYPES.member;
  const [tab, setTab] = React.useState("active"); // "active" | "history"
  const includeUndone = tab === "history";
  const key = `/ocr/audit/recent?limit=50&types=${types}${includeUndone ? "&include_undone=true" : ""}`;
  const { data, mutate: refetch } = useSWR(key, (u) => api.get(u).then((r) => r.data), { refreshInterval: 30000 });
  const rows = data?.items || [];
  const isPasha = !!data?.is_pasha;
  // In history mode, only show undone rows; in active mode, only non-undone.
  const items = includeUndone ? rows.filter((r) => r.undone) : rows.filter((r) => !r.undone);

  const [open, setOpen] = React.useState(defaultOpen);
  const [selected, setSelected] = React.useState(new Set());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  React.useEffect(() => {
    setSelected((prev) => {
      const validIds = new Set(items.map((x) => x.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  // Show panel if either tab has anything. Query only fires for currently active tab,
  // so we fetch a lightweight probe for the opposite tab too when needed.
  const opposite = includeUndone ? "" : "&include_undone=true";
  const probeKey = `/ocr/audit/recent?limit=1&types=${types}${opposite}`;
  const { data: probeData } = useSWR(probeKey, (u) => api.get(u).then((r) => r.data), { refreshInterval: 60000 });
  const oppositeItems = (probeData?.items || []).filter((r) => (includeUndone ? !r.undone : r.undone));
  const activeCount = includeUndone ? oppositeItems.length : rows.filter((r) => !r.undone).length;
  const historyCount = includeUndone ? rows.filter((r) => r.undone).length : oppositeItems.length;

  if (activeCount === 0 && historyCount === 0) return null;

  const toggle = (id) => {
    setSelected((prev) => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id);
      else nx.add(id);
      return nx;
    });
  };
  const selectAll = () => setSelected(new Set(items.map((x) => x.id)));
  const clearAll = () => setSelected(new Set());

  const selectedItems = items.filter((x) => selected.has(x.id));
  const summary = selectedItems.reduce(
    (acc, op) => {
      acc.members += (op.created_member_ids || []).length;
      acc.points += (op.created_point_ids || []).length;
      acc.restored += (op.overwritten_snapshots || []).length;
      return acc;
    },
    { members: 0, points: 0, restored: 0 }
  );

  const runBulkUndo = async () => {
    if (selected.size === 0) return;
    const opIds = Array.from(selected);
    const perTypeCount = selectedItems.reduce((acc, op) => {
      acc[op.op_type] = (acc[op.op_type] || 0) + 1;
      return acc;
    }, {});
    const typeSummary = Object.entries(perTypeCount)
      .map(([k, v]) => `• ${t(OP_LABEL_KEYS[k], OP_LABEL_FALLBACKS[k] || k)}: ${v}`)
      .join("\n");
    const msg = t(
      "ocr_bulk_undo_confirm_v2",
      "{{n}} işlem geri alınacak.\n\n{{typeSummary}}\n\nSilinecek: {{m}} üye · {{p}} puan\nGeri yüklenecek: {{r}} puan (önceki değere)\n\nOnaylıyor musunuz?",
      { n: opIds.length, typeSummary, m: summary.members, p: summary.points, r: summary.restored }
    );
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r = await api.post("/ocr/audit/undo-bulk", { op_ids: opIds });
      const d = r.data || {};
      toast.success(
        t(
          "ocr_bulk_undo_done_v2",
          "Geri alındı: {{u}} işlem · {{m}} üye · {{p}} puan silindi · {{r}} puan geri yüklendi{{skipped}}",
          {
            u: d.undone || 0,
            m: d.deleted_members || 0,
            p: d.deleted_points || 0,
            r: d.restored_points || 0,
            skipped: d.skipped ? ` (${d.skipped} ${t("ocr_undo_skipped_suffix", "atlandı")})` : "",
          }
        )
      );
      setSelected(new Set());
      refetch();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  const heading =
    title ||
    (scope === "event"
      ? t("ocr_undo_panel_event_title", "OCR Puan Girişleri — Toplu Geri Al")
      : t("ocr_undo_panel_member_title", "OCR Üye İşlemleri — Toplu Geri Al"));

  return (
    <div
      className="mx-auto max-w-5xl mt-2 mb-3 rounded-lg overflow-hidden"
      style={{
        background: "rgba(20,12,10,0.75)",
        border: "1px solid rgba(168,85,247,0.45)",
      }}
      data-testid={`ocr-undo-panel-${scope}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        data-testid={`ocr-undo-panel-toggle-${scope}`}
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Undo2 className="w-4 h-4" style={{ color: "#C4B5FD" }} />
        <span className="text-[12px] font-bold" style={{ color: "#C4B5FD", letterSpacing: "0.06em" }}>
          {heading}
        </span>
        <span className="ml-2 text-[10px] px-2 py-0.5 rounded"
              style={{ background: "rgba(168,85,247,0.18)", color: "#DDD6FE" }}>
          {activeCount} {t("ocr_undo_records", "kayıt")}
        </span>
        {selected.size > 0 && (
          <span className="ml-1 text-[10px] px-2 py-0.5 rounded"
                style={{ background: "rgba(245,166,35,0.18)", color: "#FCD34D" }}>
            {t("ocr_undo_selected_count", "{{n}} seçili", { n: selected.size })}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-3 border-b border-white/10 pb-1">
            <button
              type="button"
              onClick={() => setTab("active")}
              className="text-[11px] px-3 py-1.5 rounded-t"
              style={{
                background: tab === "active" ? "rgba(168,85,247,0.28)" : "transparent",
                color: tab === "active" ? "#DDD6FE" : "#94A3B8",
                fontWeight: tab === "active" ? 700 : 500,
                borderBottom: tab === "active" ? "2px solid #A78BFA" : "2px solid transparent",
              }}
              data-testid={`ocr-undo-tab-active-${scope}`}
            >
              <Undo2 className="w-3 h-3 inline mr-1" />
              {t("ocr_undo_tab_active", "Aktif")}
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className="text-[11px] px-3 py-1.5 rounded-t"
              style={{
                background: tab === "history" ? "rgba(148,163,184,0.28)" : "transparent",
                color: tab === "history" ? "#F1F5F9" : "#94A3B8",
                fontWeight: tab === "history" ? 700 : 500,
                borderBottom: tab === "history" ? "2px solid #94A3B8" : "2px solid transparent",
              }}
              data-testid={`ocr-undo-tab-history-${scope}`}
            >
              <History className="w-3 h-3 inline mr-1" />
              {t("ocr_undo_tab_history", "Geçmiş")}
            </button>
          </div>

          {tab === "active" && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <button
                type="button"
                onClick={selectAll}
                className="chip text-[10px]"
                data-testid={`ocr-undo-select-all-${scope}`}
                disabled={items.length === 0}
                style={items.length === 0 ? { opacity: 0.4 } : {}}
              >
                <CheckSquare className="w-3 h-3" /> {t("ocr_undo_select_all", "Tümünü Seç")}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="chip text-[10px]"
                disabled={selected.size === 0}
                style={selected.size === 0 ? { opacity: 0.4 } : {}}
                data-testid={`ocr-undo-clear-${scope}`}
              >
                <Square className="w-3 h-3" /> {t("ocr_undo_clear", "Temizle")}
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={runBulkUndo}
                disabled={busy || selected.size === 0}
                className="btn-gold text-[11px] flex items-center gap-1.5"
                style={
                  busy || selected.size === 0
                    ? { opacity: 0.4 }
                    : { background: "linear-gradient(180deg,#DC2626 0%,#991B1B 100%)", borderColor: "#F87171" }
                }
                data-testid={`ocr-undo-bulk-btn-${scope}`}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                {t("ocr_undo_bulk_apply", "Seçilenleri Geri Al")}
                {selected.size > 0 && (
                  <span className="ml-1 text-[10px] opacity-90">({selected.size})</span>
                )}
              </button>
            </div>
          )}

          {tab === "active" && selected.size > 0 && (
            <div
              className="mb-2 rounded p-2 text-[11px]"
              style={{ background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.4)", color: "#FDE68A" }}
              data-testid={`ocr-undo-preview-${scope}`}
            >
              {t(
                "ocr_undo_preview_v2",
                "Seçili {{n}} işlem geri alındığında: {{m}} üye + {{p}} puan silinecek, {{r}} puan önceki değerine döndürülecek.",
                { n: selected.size, m: summary.members, p: summary.points, r: summary.restored }
              )}
            </div>
          )}

          {items.length === 0 && (
            <div
              className="text-center py-6 text-[11px]"
              style={{ color: "#94A3B8" }}
              data-testid={`ocr-undo-empty-${scope}-${tab}`}
            >
              {tab === "active"
                ? t("ocr_undo_empty_active", "Geri alınabilecek işlem yok.")
                : t("ocr_undo_empty_history", "Henüz geri alınmış işlem yok.")}
            </div>
          )}

          <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
            {items.map((op) => {
              const isSel = selected.has(op.id);
              const nMembers = (op.created_member_ids || []).length;
              const nPoints = (op.created_point_ids || []).length;
              const nSnaps = (op.overwritten_snapshots || []).length;
              const opLabel = t(OP_LABEL_KEYS[op.op_type], OP_LABEL_FALLBACKS[op.op_type] || op.op_type);
              const isHistory = tab === "history";
              return (
                <label
                  key={op.id}
                  className={`flex items-start gap-2 rounded p-2 text-[11px] ${isHistory ? "" : "cursor-pointer"}`}
                  style={{
                    background: isHistory
                      ? "rgba(148,163,184,0.06)"
                      : (isSel ? "rgba(245,166,35,0.14)" : "rgba(148,163,184,0.08)"),
                    border: `1px solid ${
                      isHistory
                        ? "rgba(148,163,184,0.25)"
                        : (isSel ? "rgba(245,166,35,0.55)" : "rgba(148,163,184,0.35)")
                    }`,
                    opacity: isHistory ? 0.85 : 1,
                  }}
                  data-testid={`ocr-undo-item-${op.id}`}
                >
                  {!isHistory && (
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(op.id)}
                      className="mt-0.5 accent-amber-400"
                      data-testid={`ocr-undo-check-${op.id}`}
                    />
                  )}
                  {isHistory && (
                    <History className="w-3 h-3 mt-0.5" style={{ color: "#94A3B8" }} />
                  )}
                  <span className="flex-1 min-w-0 text-white">
                    <div className="truncate">
                      <b>{opLabel}</b>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{fmtWhen(op.created_at)}</span>
                      <span className="ml-2 text-muted-foreground">
                        ({nMembers} {t("ocr_undo_unit_member", "üye")} · {nPoints} {t("ocr_undo_unit_point", "puan")}
                        {nSnaps > 0 && (
                          <>
                            {" "}· {nSnaps} {t("ocr_undo_unit_snapshot", "snapshot")}
                          </>
                        )})
                      </span>
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>
                      {op.user_name && (
                        <span>
                          {t("ocr_undo_field_who", "Yapan")}: <span style={{ color: "#D8B4FE" }}>{op.user_name}</span>
                        </span>
                      )}
                      {op.note && <span className="ml-2">— {op.note}</span>}
                    </div>
                    {isHistory && op.undone && (
                      <div className="text-[10px] mt-0.5 flex flex-wrap gap-x-3" style={{ color: "#86EFAC" }}>
                        <span>
                          <History className="w-3 h-3 inline mr-1" />
                          {t("ocr_undo_field_undone_at", "Geri alındı")}: {fmtWhen(op.undone_at)}
                        </span>
                        {op.undone_by_name && (
                          <span>
                            {t("ocr_undo_field_undone_by", "Geri alan")}: {op.undone_by_name}
                          </span>
                        )}
                        {op.undone_stats && (
                          <span>
                            → {op.undone_stats.deleted_members || 0} {t("ocr_undo_unit_member", "üye")}
                            {" "}+ {op.undone_stats.deleted_points || 0} {t("ocr_undo_unit_point", "puan")} {t("ocr_undo_deleted_short", "silindi")}
                            {op.undone_stats.restored_points > 0 && (
                              <>
                                {" "}· {op.undone_stats.restored_points} {t("ocr_undo_restored_short", "geri yüklendi")}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
