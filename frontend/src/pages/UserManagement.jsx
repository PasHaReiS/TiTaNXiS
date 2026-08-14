import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import LinkMemberDialog from "@/components/LinkMemberDialog";
import { Plus, Trash2, KeyRound, Shield, User, X, ShieldCheck, PencilLine, Link2, AlertTriangle, Upload, Clock } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

/** Format an ISO timestamp as a compact "N minutes/hours/days/months ago" string. */
function useRelativeTime() {
  const { t } = useTranslation();
  return (iso) => {
    if (!iso) return t("pwd_never");
    const then = new Date(iso).getTime();
    if (!then) return t("pwd_never");
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return t("time_ago_now");
    if (mins < 60) return t("time_ago_minutes", { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("time_ago_hours", { n: hrs });
    const days = Math.floor(hrs / 24);
    if (days < 60) return t("time_ago_days", { n: days });
    const months = Math.floor(days / 30);
    return t("time_ago_months", { n: months });
  };
}

/** Parse `password_updated_by` string into a human-readable actor label. */
function useActorLabel() {
  const { t } = useTranslation();
  return (by, currentUsername) => {
    if (!by) return null;
    if (by === "system-seed") return t("pwd_by_system");
    if (by.startsWith("admin:")) return `${t("pwd_by_admin")} ${by.slice(6)}`;
    if (by === currentUsername) return t("pwd_by_self");
    return by;
  };
}

export default function UserManagement() {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const relTime = useRelativeTime();
  const actorLabel = useActorLabel();
  const { data: users = [] } = useSWR("/users", fetcher);
  const { data: unmatched = [] } = useSWR("/users/unmatched", fetcher);
  const { data: members = [] } = useSWR("/members", fetcher);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null); // { userId, username, currentMemberIds }
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importInputRef = React.useRef(null);

  const handleImportFile = async (file) => {
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/users/link-members/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      mutate("/users");
      mutate("/users/unmatched");
      toast.success(t("bulk_import_result", res.data));
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setImportBusy(false);
    }
  };

  // Quick lookup: member_id → member doc (for showing linked character name on each row)
  const memberById = React.useMemo(() => {
    const map = {};
    for (const m of members) map[m.id] = m;
    return map;
  }, [members]);

  return (
    <div data-testid="user-management-page">
      <Header title={t("users_page_title")} />
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("users_total", { count: users.length })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="user-bulk-import-btn"
              onClick={() => { setImportOpen(true); setImportResult(null); }}
              className="chip text-xs flex items-center gap-1.5"
              style={{ borderColor: "rgba(139,92,246,0.5)", color: "#A78BFA" }}
            >
              <Upload className="w-3.5 h-3.5" /> {t("bulk_import")}
            </button>
            <button
              data-testid="user-add-btn"
              onClick={() => setShowForm(true)}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
            </button>
          </div>
        </div>

        {/* Event Notifications control room — dedicated per-event push reminder panel */}
        <div
          data-testid="unmatched-users-panel"
          className="rounded-lg p-3 mb-4"
          style={{
            background: "rgba(245,166,35,0.08)",
            border: "1px solid rgba(245,166,35,0.4)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs uppercase font-bold gold-text" style={{ letterSpacing: "0.14em" }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {t("unmatched_users")}
            </div>
            <span
              data-testid="unmatched-users-count"
              className="text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "rgba(245,166,35,0.25)", color: "#F5A623" }}
            >
              {unmatched.length}
            </span>
          </div>
          {unmatched.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2" data-testid="unmatched-users-empty">
              {t("unmatched_users_empty")}
            </div>
          ) : (
            <div className="space-y-1.5">
              {unmatched.map((u) => (
                <div
                  key={u.id}
                  data-testid={`unmatched-row-${u.id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/30"
                >
                  <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-white truncate flex-1">{u.username}</span>
                  <button
                    type="button"
                    data-testid={`unmatched-link-${u.id}`}
                    onClick={() => setLinkTarget({ userId: u.id, username: u.username, currentMemberIds: [] })}
                    className="chip text-[10px] py-1"
                  >
                    <Link2 className="w-3 h-3" /> {t("admin_link_member")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {users.map((u) => {
            const linkedList = (u.member_ids || []).map((mid) => memberById[mid]).filter(Boolean);
            return (
            <div key={u.id} data-testid={`user-row-${u.id}`} className="card-dark p-3">
              <div className="flex items-center gap-3">
                <div className={`rank-badge ${u.role === "admin" ? "rank-GOW" : u.can_edit ? "rank-R3" : "rank-R2"}`}>
                  {u.role === "admin" ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate flex items-center gap-2">
                    {u.username}
                    {u.role === "admin" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">{t("admin_upper")}</span>
                    )}
                    {u.role !== "admin" && u.can_edit && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">{t("can_edit_upper")}</span>
                    )}
                    {u.notification_enabled === false && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold" title={t("notification_off")}>
                        🔕
                      </span>
                    )}
                  </div>
                  {u.email && <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>}
                  <div className="text-[10px] mt-0.5" data-testid={`user-linked-${u.id}`}>
                    <Link2 className="w-2.5 h-2.5 inline mr-1 opacity-70" />
                    {linkedList.length > 0 ? (
                      <span className="text-green-400 font-semibold">
                        {linkedList.map((m) => m.name).join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">{t("linked_member_none")}</span>
                    )}
                  </div>
                  {/* Password rotation history */}
                  <div className="text-[10px] mt-0.5 text-muted-foreground" data-testid={`user-pwd-log-${u.id}`}>
                    <Clock className="w-2.5 h-2.5 inline mr-1 opacity-70" />
                    <span className="uppercase tracking-widest text-[9px]">{t("pwd_updated")}:</span>{" "}
                    <span className="text-white/70">{relTime(u.password_updated_at)}</span>
                    {u.password_updated_by && (
                      <span className="text-white/50"> · {actorLabel(u.password_updated_by, u.username)}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`user-link-btn-${u.id}`}
                  onClick={() => setLinkTarget({ userId: u.id, username: u.username, currentMemberIds: u.member_ids || [] })}
                  className="w-8 h-8 rounded-md bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 flex items-center justify-center flex-shrink-0"
                  title={t("admin_link_member")}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {u.role !== "admin" && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                    <PencilLine className="w-3 h-3" />
                    {t("can_change")}
                  </label>
                  <Switch
                    data-testid={`user-toggle-edit-${u.id}`}
                    checked={u.can_edit}
                    onCheckedChange={async (checked) => {
                      try {
                        await api.patch(`/users/${u.id}`, { can_edit: checked });
                        mutate("/users");
                        toast.success(checked ? t("permission_granted") : t("permission_removed"));
                      } catch (e) { toast.error(apiErr(e)); }
                    }}
                  />
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  data-testid={`user-reset-pwd-${u.id}`}
                  onClick={() => setResetTarget(u)}
                  className="chip flex-1 justify-center text-[10px]"
                >
                  <KeyRound className="w-3 h-3" /> {t("reset_password")}
                </button>
                {u.id !== me.id && u.username !== "admin" && (
                  <button
                    data-testid={`user-delete-${u.id}`}
                    onClick={async () => {
                      if (!window.confirm(t("confirm_delete_generic", { name: u.username }))) return;
                      try {
                        await api.delete(`/users/${u.id}`);
                        mutate("/users");
                        toast.success(t("user_deleted"));
                      } catch (e) { toast.error(apiErr(e)); }
                    }}
                    className="w-8 h-8 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {showForm && <UserForm onClose={() => setShowForm(false)} />}
      {resetTarget && <ResetPwdForm user={resetTarget} onClose={() => setResetTarget(null)} />}
      {importOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !importBusy && setImportOpen(false)}
          data-testid="bulk-import-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-red-gold w-full max-w-md p-5 fade-in relative"
            data-testid="bulk-import-dialog"
          >
            <button
              type="button"
              onClick={() => !importBusy && setImportOpen(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-white"
            ><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
              <Upload className="w-4 h-4" /> {t("bulk_import_title")}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{t("bulk_import_desc")}</p>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              data-testid="bulk-import-file-input"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) handleImportFile(f);
              }}
            />
            <button
              type="button"
              disabled={importBusy}
              onClick={() => importInputRef.current?.click()}
              data-testid="bulk-import-select-file"
              className="btn-gold w-full py-3 justify-center"
            >
              <Upload className="w-4 h-4" />
              {importBusy ? t("saving") : t("bulk_import")}
            </button>
            {importResult && (
              <div
                data-testid="bulk-import-result"
                className="mt-4 rounded-lg p-3 text-xs"
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,166,35,0.35)" }}
              >
                <div className="font-bold text-white mb-1">
                  {t("bulk_import_result", importResult)}
                </div>
                {importResult.report && importResult.report.length > 0 && (
                  <div className="max-h-32 overflow-y-auto text-[10px] text-red-300 space-y-0.5">
                    {importResult.report.slice(0, 20).map((r, i) => (
                      <div key={i}>· {r.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {linkTarget && (
        <LinkMemberDialog
          open={!!linkTarget}
          onClose={() => setLinkTarget(null)}
          mode="admin"
          targetUserId={linkTarget.userId}
          targetUsername={linkTarget.username}
          currentMemberIds={linkTarget.currentMemberIds || []}
          onSaved={() => {
            mutate("/users");
            mutate("/users/unmatched");
          }}
        />
      )}
    </div>
  );
}

function UserForm({ onClose }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users", { username, password, email: email || null, role, can_edit: canEdit });
      mutate("/users");
      toast.success(t("user_created"));
      onClose();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{t("new_user")}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("username")}</label>
        <input data-testid="user-form-username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("password")}</label>
        <input data-testid="user-form-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("email_optional")}</label>
        <input data-testid="user-form-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("role")}</label>
        <div data-testid="user-form-role" className="flex gap-2">
          <button type="button" onClick={() => setRole("user")} className={`chip ${role === "user" ? "active" : ""}`}>{t("user")}</button>
          <button type="button" onClick={() => setRole("admin")} className={`chip ${role === "admin" ? "active" : ""}`}>
            <Shield className="w-3 h-3" /> {t("admin")}
          </button>
        </div>

        {role === "user" && (
          <label className="flex items-center gap-2 mt-3 text-xs">
            <input data-testid="user-form-canedit" type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} className="w-4 h-4 accent-red-500" />
            <span className="text-white">{t("can_change_short")}</span>
          </label>
        )}

        <button data-testid="user-form-submit" type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : t("create")}
        </button>
      </form>
    </div>
  );
}

function ResetPwdForm({ user, onClose }) {
  const { t } = useTranslation();
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: pwd });
      toast.success(t("password_reset_for", { name: user.username }));
      onClose();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{t("reset_password_for", { name: user.username })}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("new_password")}</label>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={6}
          data-testid="reset-pwd-input"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button type="submit" disabled={saving} data-testid="reset-pwd-submit" className="btn-gold w-full mt-5">
          {saving ? t("saving") : t("reset")}
        </button>
      </form>
    </div>
  );
}
