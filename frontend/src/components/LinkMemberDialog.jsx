import React, { useMemo, useState, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { X, Search, Link2, Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Reusable multi-select member-linking modal.
 *
 * Props:
 *   open, onClose: modal control
 *   currentMemberIds?: string[]
 *   onSaved: (updatedUser) => void
 *   mode: "self" (POST /auth/link-members) or "admin" (PATCH /users/:userId {member_ids})
 *   targetUserId?: string    // required for mode="admin"
 *   targetUsername?: string  // display label for mode="admin"
 */
export default function LinkMemberDialog({
  open,
  onClose,
  currentMemberIds = [],
  onSaved,
  mode = "self",
  targetUserId,
  targetUsername,
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set(currentMemberIds || []));
  const [saving, setSaving] = useState(false);

  // Reset selection when opened (so re-opens reflect latest currentMemberIds).
  useEffect(() => {
    if (open) setSelected(new Set(currentMemberIds || []));
    if (!open) setQ("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: members = [] } = useSWR(open ? "/members" : null, fetcher);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = s
      ? members.filter(
          (m) =>
            (m.name || "").toLowerCase().includes(s) ||
            (m.alliance_name || "").toLowerCase().includes(s) ||
            (m.member_id || "").toLowerCase().includes(s),
        )
      : members;
    return arr.slice(0, 200);
  }, [members, q]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const ids = Array.from(selected);
      let res;
      if (mode === "admin") {
        res = await api.patch(`/users/${targetUserId}`, { member_ids: ids });
        mutate("/users");
        mutate("/users/unmatched");
      } else {
        res = await api.post("/auth/link-members", { member_ids: ids });
      }
      toast.success(t("link_saved"));
      onSaved?.(res.data);
      onClose?.();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selectedCount = selected.size;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      data-testid="link-member-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative max-h-[85vh] flex flex-col"
        data-testid="link-member-dialog"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-white"
          data-testid="link-member-close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
          <Link2 className="w-4 h-4" /> {t("link_account_title")}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {mode === "admin" && targetUsername ? (
            <span className="red-text font-semibold">{targetUsername}</span>
          ) : (
            t("link_account_desc_multi")
          )}
        </p>

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="link-member-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("link_search_placeholder")}
            autoFocus
            className="w-full card-dark pl-9 pr-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="text-[10px] uppercase tracking-widest gold-text mb-2 flex items-center justify-between">
          <span data-testid="link-member-count">
            {t("selected_count", { count: selectedCount })}
          </span>
          {selectedCount > 0 && (
            <button
              type="button"
              data-testid="link-member-clear-selection"
              onClick={() => setSelected(new Set())}
              className="text-[10px] uppercase font-bold text-muted-foreground hover:text-red-400"
            >
              {t("deselect_all")}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 mb-3" data-testid="link-member-list">
          {filtered.map((m) => {
            const isSel = selected.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                data-testid={`link-member-opt-${m.id}`}
                aria-pressed={isSel}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
                  isSel
                    ? "bg-amber-500/20 border border-amber-500/60"
                    : "bg-black/30 hover:bg-black/50 border border-transparent"
                }`}
              >
                <span
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    border: isSel ? "2px solid #F5A623" : "2px solid rgba(255,255,255,0.25)",
                    background: isSel ? "rgba(245,166,35,0.9)" : "transparent",
                  }}
                >
                  {isSel && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                </span>
                <span
                  className={`rank-badge rank-${m.rank || "R1"} flex-shrink-0`}
                  style={{ width: 26, height: 20, fontSize: 10, borderRadius: 4, fontWeight: 800 }}
                >
                  {m.rank || "R1"}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-white truncate block leading-tight">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate block leading-tight">
                    {m.alliance_name || "—"}
                    {m.member_id ? ` · ${m.member_id}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">{t("no_match")}</div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            data-testid="link-member-cancel"
            className="chip flex-1 justify-center"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={doSave}
            disabled={saving}
            data-testid="link-member-submit"
            className="btn-gold flex-1 justify-center py-2 text-xs"
          >
            {saving ? t("saving") : t("save")} ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
