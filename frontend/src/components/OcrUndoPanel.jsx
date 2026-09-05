// v136 — OCR Multi-Select Undo Panel
// Reusable panel used on Members and Events pages.
// Props:
//   scope: "member" | "event"   → filters op_types
//   title: string (optional)
// Backend endpoints:
//   GET  /api/ocr/audit/recent?types=...
//   POST /api/ocr/audit/undo-bulk  { op_ids: [] }
import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Undo2, CheckSquare, Square, Loader2, ChevronDown, ChevronRight } from "lucide-react";

const SCOPE_TYPES = {
  member: "ocr_add_member,ocr_power,ocr_castle_rank",
  event: "ocr_event_points",
};

const OP_LABELS = {
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
  const key = `/ocr/audit/recent?limit=50&types=${types}`;
  const { data, mutate: refetch } = useSWR(key, (u) => api.get(u).then((r) => r.data), { refreshInterval: 30000 });
  const items = data?.items || [];
  const isPasha = !!data?.is_pasha;

  const [open, setOpen] = React.useState(defaultOpen);
  const [selected, setSelected] = React.useState(new Set());
  const [busy, setBusy] = React.useState(false);

  // Only non-undone items are shown (backend already filters).
  const selectableItems = items;

  // Auto-clean stale selections when items change.
  React.useEffect(() => {
    setSelected((prev) => {
      const validIds = new Set(items.map((x) => x.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  if (!items.length) return null;

  const toggle = (id) => {
    setSelected((prev) => {
      const nx = new Set(prev);
      if (nx.has(id)) nx.delete(id);
      else nx.add(id);
      return nx;
    });
  };
  const selectAll = () => setSelected(new Set(selectableItems.map((x) => x.id)));
  const clearAll = () => setSelected(new Set());

  const selectedItems = items.filter((x) => selected.has(x.id));
  const summary = selectedItems.reduce(
    (acc, op) => {
      acc.members += (op.created_member_ids || []).length;
      acc.points += (op.created_point_ids || []).length;
      return acc;
    },
    { members: 0, points: 0 }
  );

  const runBulkUndo = async () => {
    if (selected.size === 0) return;
    const opIds = Array.from(selected);
    const perTypeCount = selectedItems.reduce((acc, op) => {
      acc[op.op_type] = (acc[op.op_type] || 0) + 1;
      return acc;
    }, {});
    const typeSummary = Object.entries(perTypeCount)
      .map(([k, v]) => `• ${OP_LABELS[k] || k}: ${v} işlem`)
      .join("\n");
    const msg = t(
      "ocr_bulk_undo_confirm",
      "{{n}} işlem geri alınacak.\n\n{{typeSummary}}\n\nToplam silinecek: {{m}} üye · {{p}} puan\n\nOnaylıyor musunuz?",
      { n: opIds.length, typeSummary, m: summary.members, p: summary.points }
    );
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const r = await api.post("/ocr/audit/undo-bulk", { op_ids: opIds });
      const d = r.data || {};
      toast.success(
        t(
          "ocr_bulk_undo_done",
          "Geri alındı: {{u}} işlem · {{m}} üye · {{p}} puan silindi{{skipped}}",
          {
            u: d.undone || 0,
            m: d.deleted_members || 0,
            p: d.deleted_points || 0,
            skipped: d.skipped ? ` (${d.skipped} atlandı)` : "",
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
          {items.length} {t("ocr_undo_records", "kayıt")}
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
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <button
              type="button"
              onClick={selectAll}
              className="chip text-[10px]"
              data-testid={`ocr-undo-select-all-${scope}`}
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

          {selected.size > 0 && (
            <div
              className="mb-2 rounded p-2 text-[11px]"
              style={{ background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.4)", color: "#FDE68A" }}
              data-testid={`ocr-undo-preview-${scope}`}
            >
              {t(
                "ocr_undo_preview",
                "Seçili {{n}} işlem geri alındığında {{m}} üye ve {{p}} puan silinecek.",
                { n: selected.size, m: summary.members, p: summary.points }
              )}
            </div>
          )}

          <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
            {items.map((op) => {
              const isSel = selected.has(op.id);
              const nMembers = (op.created_member_ids || []).length;
              const nPoints = (op.created_point_ids || []).length;
              return (
                <label
                  key={op.id}
                  className="flex items-center gap-2 rounded p-1.5 text-[11px] cursor-pointer"
                  style={{
                    background: isSel ? "rgba(245,166,35,0.14)" : "rgba(148,163,184,0.08)",
                    border: `1px solid ${isSel ? "rgba(245,166,35,0.55)" : "rgba(148,163,184,0.35)"}`,
                  }}
                  data-testid={`ocr-undo-item-${op.id}`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(op.id)}
                    className="accent-amber-400"
                    data-testid={`ocr-undo-check-${op.id}`}
                  />
                  <span className="flex-1 min-w-0 truncate text-white">
                    <b>{OP_LABELS[op.op_type] || op.op_type}</b>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{fmtWhen(op.created_at)}</span>
                    <span className="ml-2 text-muted-foreground">
                      ({nMembers} üye · {nPoints} puan)
                    </span>
                    {op.note && (
                      <span className="ml-2 text-[10px]" style={{ color: "#94A3B8" }}>
                        — {op.note}
                      </span>
                    )}
                    {isPasha && op.user_name && (
                      <span className="ml-2 text-[10px]" style={{ color: "#D8B4FE" }}>
                        · {op.user_name}
                      </span>
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
