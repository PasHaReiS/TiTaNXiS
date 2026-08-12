import React, { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { X, Search, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Reusable member-linking modal.
 *
 * Props:
 *   open, onClose: modal control
 *   currentMemberId?: string
 *   onSaved: (updatedUser) => void
 *   mode: "self" (POST /auth/link-member) or "admin" (PATCH /users/:userId {member_id})
 *   targetUserId?: string    // required for mode="admin"
 *   targetUsername?: string  // display label for mode="admin"
 */
export default function LinkMemberDialog({
  open,
  onClose,
  currentMemberId,
  onSaved,
  mode = "self",
  targetUserId,
  targetUsername,
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(currentMemberId || null);
  const [saving, setSaving] = useState(false);

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
    return arr.slice(0, 100);
  }, [members, q]);

  const doSave = async (memberId) => {
    setSaving(true);
    try {
      let res;
      if (mode === "admin") {
        res = await api.patch(`/users/${targetUserId}`, { member_id: memberId || null });
        mutate("/users");
        mutate("/users/unmatched");
      } else {
        res = await api.post("/auth/link-member", { member_id: memberId || null });
      }
      toast.success(memberId ? t("link_saved") : t("link_removed"));
      onSaved?.(res.data);
      onClose?.();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

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
            t("link_account_desc")
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

        <div className="flex-1 overflow-y-auto space-y-1 mb-3" data-testid="link-member-list">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              data-testid={`link-member-opt-${m.id}`}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
                selected === m.id
                  ? "bg-amber-500/20 border border-amber-500/60"
                  : "bg-black/30 hover:bg-black/50 border border-transparent"
              }`}
            >
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
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">{t("no_match")}</div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          {currentMemberId && (
            <button
              type="button"
              onClick={() => doSave(null)}
              disabled={saving}
              data-testid="link-member-unlink"
              className="chip flex-1 justify-center text-red-400"
              style={{ borderColor: "rgba(220,38,38,0.4)" }}
            >
              <Unlink className="w-3 h-3" /> {t("unlink_account")}
            </button>
          )}
          <button
            type="button"
            onClick={() => doSave(selected)}
            disabled={saving || !selected}
            data-testid="link-member-submit"
            className="btn-gold flex-1 justify-center py-2 text-xs"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
