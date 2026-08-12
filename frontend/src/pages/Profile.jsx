import React, { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import LinkMemberDialog from "@/components/LinkMemberDialog";
import { Switch } from "@/components/ui/switch";
import { KeyRound, Shield, User, LogOut, AlertTriangle, Link2, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Profile() {
  const { user, logout, refreshMe } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  // Pull linked member details when user has one, so we can show the character name.
  const { data: linkedMember } = useSWR(
    user?.member_id ? `/members/${user.member_id}` : null,
    fetcher,
  );

  if (!user) return null;

  const toggleNotifications = async (enabled) => {
    setNotifBusy(true);
    try {
      await api.post("/auth/notification-preference", { enabled });
      toast.success(enabled ? t("notification_on") : t("notification_off"));
      await refreshMe();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setNotifBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (newPwd !== confirm) { toast.error(t("pwd_mismatch")); return; }
    if (newPwd.length < 6) { toast.error(t("pwd_min_length")); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { old_password: oldPwd, new_password: newPwd });
      toast.success(t("password_changed"));
      setOldPwd(""); setNewPwd(""); setConfirm("");
      await refreshMe();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="profile-page">
      <Header title={t("my_profile")} />
      <div className="px-4">
        <div className="card-red-gold p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`rank-badge ${user.role === "admin" ? "rank-GOW" : user.can_edit ? "rank-R3" : "rank-R2"}`}>
              {user.role === "admin" ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-lg truncate">{user.username}</div>
              {user.email && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
              <div className="flex flex-wrap gap-1 mt-1">
                {user.role === "admin" ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">{t("admin_upper")}</span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-white font-bold">{t("user_upper")}</span>
                )}
                {user.role !== "admin" && user.can_edit && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">{t("can_edit_upper")}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {user.must_change_password && (
          <div className="card-dark p-3 mb-4 border-yellow-500/40 flex items-start gap-2" style={{ borderColor: "rgba(245,166,35,0.4)", background: "rgba(245,166,35,0.05)" }}>
            <AlertTriangle className="w-4 h-4 gold-text mt-0.5 flex-shrink-0" />
            <p className="text-xs text-white">{t("first_login_warning")}</p>
          </div>
        )}

        {/* Linked in-game character */}
        <div className="section-title flex items-center gap-2"><Link2 className="w-3 h-3" /> {t("linked_member")}</div>
        <div className="card-dark p-3 mb-4 flex items-center justify-between gap-3" data-testid="profile-linked-member-card">
          <div className="flex-1 min-w-0">
            {user.member_id && linkedMember ? (
              <div>
                <div className="font-bold text-white truncate" data-testid="profile-linked-member-name">
                  {linkedMember.name}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {linkedMember.rank || "-"} · {linkedMember.alliance_name || "—"}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic" data-testid="profile-linked-member-empty">
                {t("linked_member_none")}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="profile-link-member-btn"
            onClick={() => setLinkOpen(true)}
            className="btn-gold text-xs px-3 py-2 flex-shrink-0"
          >
            <Link2 className="w-3.5 h-3.5" /> {t("link_account")}
          </button>
        </div>

        {/* Notification opt-in/out */}
        <div className="section-title flex items-center gap-2">
          {user.notification_enabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
          {t("notification_toggle_title")}
        </div>
        <div className="card-dark p-3 mb-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-semibold">{t("notification_toggle_title")}</div>
            <div className="text-[11px] text-muted-foreground">{t("notification_toggle_desc")}</div>
          </div>
          <Switch
            data-testid="profile-notification-toggle"
            checked={user.notification_enabled !== false}
            disabled={notifBusy}
            onCheckedChange={(v) => toggleNotifications(!!v)}
          />
        </div>

        <div className="section-title flex items-center gap-2"><KeyRound className="w-3 h-3" /> {t("change_password_title")}</div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("current_password")}</label>
            <input data-testid="profile-old-pwd" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("new_password")}</label>
            <input data-testid="profile-new-pwd" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={6}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("new_password_again")}</label>
            <input data-testid="profile-confirm-pwd" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </div>
          <button data-testid="profile-change-pwd-submit" type="submit" disabled={saving} className="btn-gold w-full">
            {saving ? t("saving") : t("update_password")}
          </button>
        </form>

        <button
          data-testid="profile-logout"
          onClick={() => { logout(); nav("/"); toast.success(t("logout_done")); }}
          className="btn-red w-full mt-6 flex items-center justify-center gap-2 py-2.5"
        >
          <LogOut className="w-4 h-4" />
          {t("logout")}
        </button>
      </div>

      <LinkMemberDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        currentMemberId={user.member_id}
        onSaved={() => refreshMe()}
      />
    </div>
  );
}
