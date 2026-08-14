import React, { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import LinkMemberDialog from "@/components/LinkMemberDialog";
import TelegramLinkSection from "@/components/TelegramLinkSection";
import { Switch } from "@/components/ui/switch";
import { KeyRound, Shield, User, LogOut, AlertTriangle, Link2, Bell, BellOff, X as XIcon, Plus, Trophy, Zap, Castle, Crown, Medal, GitCompare } from "lucide-react";
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
  const [removingId, setRemovingId] = useState(null);

  const memberIds = user?.member_ids || [];

  // Bulk-fetch all guild members so we can resolve name/rank/alliance from IDs.
  const { data: allMembers = [] } = useSWR(memberIds.length ? "/members" : null, fetcher);
  // Overall leaderboard to compute each linked member's guild rank position.
  const { data: leaderboard = [] } = useSWR(memberIds.length ? "/leaderboard" : null, fetcher);
  // 7-day trend batch for sparklines.
  const trendUrl = memberIds.length ? `/members/trend?ids=${memberIds.join(",")}&days=7` : null;
  const { data: trendMap = {} } = useSWR(trendUrl, fetcher);
  const linkedMembers = React.useMemo(() => {
    const byId = new Map((allMembers || []).map((m) => [m.id, m]));
    const rankById = new Map();
    (leaderboard || []).forEach((r) => {
      rankById.set(r.member_id, { position: r.position, total_points: r.total_points });
    });
    return memberIds
      .map((id) => {
        const m = byId.get(id);
        if (!m) return null;
        const lb = rankById.get(id);
        return { ...m, position: lb?.position || null, total_points: lb?.total_points || 0 };
      })
      .filter(Boolean);
  }, [allMembers, leaderboard, memberIds]);

  if (!user) return null;

  const removeLinked = async (mid, name) => {
    if (!window.confirm(t("confirm_remove_linked", { name }))) return;
    setRemovingId(mid);
    try {
      await api.post("/auth/link-members/remove", { member_id: mid });
      toast.success(t("link_removed"));
      await refreshMe();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setRemovingId(null);
    }
  };

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

        {/* Linked in-game characters (multi) */}
        <div className="section-title flex items-center gap-2"><Link2 className="w-3 h-3" /> {t("linked_members")}</div>
        <div className="card-dark p-3 mb-4" data-testid="profile-linked-members-card">
          {linkedMembers.length === 0 ? (
            <div className="text-xs text-muted-foreground italic mb-3" data-testid="profile-linked-members-empty">
              {t("linked_member_none")}
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-widest gold-text mb-2">
                {t("linked_member_count", { count: linkedMembers.length })}
              </div>

              {/* Comparison panel — visible only with 2+ linked characters */}
              {linkedMembers.length >= 2 && (() => {
                const strongest = linkedMembers.reduce(
                  (a, b) => ((b.bireysel_guc || 0) > (a.bireysel_guc || 0) ? b : a),
                  linkedMembers[0],
                );
                const ranked = linkedMembers.filter((x) => x.position);
                const topRank = ranked.length
                  ? ranked.reduce((a, b) => (b.position < a.position ? b : a), ranked[0])
                  : null;
                const maxPower = Math.max(1, ...linkedMembers.map((x) => x.bireysel_guc || 0));
                return (
                  <div
                    className="rounded-lg p-3 mb-3"
                    style={{
                      background: "rgba(139,92,246,0.08)",
                      border: "1px solid rgba(139,92,246,0.4)",
                    }}
                    data-testid="profile-compare-panel"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold mb-2" style={{ color: "#A78BFA", letterSpacing: "0.14em" }}>
                      <GitCompare className="w-3 h-3" />
                      {t("compare_title")}
                    </div>
                    {/* Winner badges */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div
                        className="rounded-md px-2 py-1.5"
                        style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.4)" }}
                        data-testid="profile-compare-strongest"
                      >
                        <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest" style={{ color: "#FF6B00" }}>
                          <Crown className="w-3 h-3" /> {t("compare_strongest")}
                        </div>
                        <div className="text-xs text-white font-bold truncate mt-0.5" title={strongest.name}>
                          {strongest.name}
                        </div>
                        <div className="text-[10px] mono truncate" style={{ color: "#FF6B00" }}>
                          {Number(strongest.bireysel_guc || 0).toLocaleString("tr-TR")}
                        </div>
                      </div>
                      <div
                        className="rounded-md px-2 py-1.5"
                        style={{ background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.4)" }}
                        data-testid="profile-compare-toprank"
                      >
                        <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest gold-text">
                          <Medal className="w-3 h-3" /> {t("compare_top_rank")}
                        </div>
                        {topRank ? (
                          <>
                            <div className="text-xs text-white font-bold truncate mt-0.5" title={topRank.name}>
                              {topRank.name}
                            </div>
                            <div className="text-[10px] mono gold-text">#{topRank.position}</div>
                          </>
                        ) : (
                          <div className="text-[10px] text-muted-foreground italic mt-1">—</div>
                        )}
                      </div>
                    </div>
                    {/* Power ratio bars */}
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">
                      {t("compare_power_ratio")}
                    </div>
                    <div className="space-y-1.5" data-testid="profile-compare-bars">
                      {linkedMembers.map((m) => {
                        const pct = Math.round(((m.bireysel_guc || 0) / maxPower) * 100);
                        const isStrongest = m.id === strongest.id;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-2"
                            data-testid={`profile-compare-bar-${m.id}`}
                          >
                            <span className="text-[10px] text-white truncate w-24 flex-shrink-0" title={m.name}>
                              {m.name}
                            </span>
                            <div
                              className="flex-1 h-3 rounded-full overflow-hidden"
                              style={{ background: "rgba(0,0,0,0.4)" }}
                            >
                              <div
                                className="h-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: isStrongest
                                    ? "linear-gradient(90deg, #FF6B00, #F5A623)"
                                    : "linear-gradient(90deg, rgba(139,92,246,0.55), rgba(139,92,246,0.85))",
                                }}
                              />
                            </div>
                            <span
                              className="text-[9px] mono flex-shrink-0 w-9 text-right"
                              style={{ color: isStrongest ? "#FF6B00" : "#A78BFA" }}
                            >
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2 mb-3" data-testid="profile-linked-members-list">
                {linkedMembers.map((m) => {
                  const notifOptCustom = (user.notification_member_ids || []).length > 0;
                  const bellOn = notifOptCustom
                    ? (user.notification_member_ids || []).includes(m.id)
                    : true;
                  const toggleBell = async () => {
                    // Compute new opt-in list based on current state.
                    const current = notifOptCustom
                      ? (user.notification_member_ids || []).slice()
                      : (user.member_ids || []).slice();
                    let next;
                    if (bellOn) next = current.filter((x) => x !== m.id);
                    else next = Array.from(new Set([...current, m.id]));
                    // If next equals all linked → reset to [] (default "all")
                    if (next.length === (user.member_ids || []).length) next = [];
                    try {
                      await api.post("/auth/notification-members", { member_ids: next });
                      await refreshMe();
                      toast.success(bellOn ? t("notif_off_for", { name: m.name }) : t("notif_on_for", { name: m.name }));
                    } catch (e) { toast.error(apiErr(e)); }
                  };
                  const trend = trendMap[m.id] || [];
                  const maxT = Math.max(1, ...trend.map((d) => d.points));
                  return (
                  <div
                    key={m.id}
                    data-testid={`profile-linked-chip-${m.id}`}
                    className="rounded-lg p-2.5"
                    style={{
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.35)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`rank-badge rank-${m.rank || "R1"}`}
                        style={{ width: 28, height: 22, fontSize: 10, borderRadius: 4, fontWeight: 800 }}
                      >{m.rank || "R1"}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm text-white font-bold truncate"
                          title={m.name}
                          data-testid={`profile-linked-name-${m.id}`}
                        >{m.name}</div>
                        {m.alliance_name && (
                          <div className="text-[10px] text-muted-foreground truncate">{m.alliance_name}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid={`profile-linked-bell-${m.id}`}
                        onClick={toggleBell}
                        aria-pressed={bellOn}
                        title={bellOn ? t("notification_on") : t("notification_off")}
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: bellOn ? "rgba(34,197,94,0.2)" : "rgba(107,114,128,0.2)",
                          color: bellOn ? "#4ade80" : "#9ca3af",
                          border: bellOn ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(107,114,128,0.35)",
                        }}
                      >
                        {bellOn ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        data-testid={`profile-linked-remove-${m.id}`}
                        onClick={() => removeLinked(m.id, m.name)}
                        disabled={removingId === m.id}
                        className="w-6 h-6 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-300 flex items-center justify-center flex-shrink-0"
                        aria-label={t("remove_member")}
                        title={t("remove_member")}
                      ><XIcon className="w-3 h-3" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5" data-testid={`profile-linked-stats-${m.id}`}>
                      <div className="rounded-md px-2 py-1.5 flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(245,166,35,0.25)" }} title={t("sort")}>
                        <Trophy className="w-3 h-3 gold-text mb-0.5" />
                        <span className="text-sm font-bold text-white mono leading-none" data-testid={`profile-linked-position-${m.id}`}>{m.position ? `#${m.position}` : "—"}</span>
                        <span className="text-[8px] uppercase text-muted-foreground tracking-widest mt-0.5">{t("sort")}</span>
                      </div>
                      <div className="rounded-md px-2 py-1.5 flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,107,0,0.3)" }} title={t("bireysel_guc")}>
                        <Zap className="w-3 h-3 mb-0.5" style={{ color: "#FF6B00" }} />
                        <span className="text-sm font-bold mono leading-none" style={{ color: "#FF6B00" }} data-testid={`profile-linked-power-${m.id}`}>{m.bireysel_guc ? Number(m.bireysel_guc).toLocaleString("tr-TR") : "0"}</span>
                        <span className="text-[8px] uppercase text-muted-foreground tracking-widest mt-0.5">{t("bireysel_guc")}</span>
                      </div>
                      <div className="rounded-md px-2 py-1.5 flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(139,92,246,0.3)" }} title={t("castle_level")}>
                        <Castle className="w-3 h-3 mb-0.5" style={{ color: "#A78BFA" }} />
                        <span className="text-sm font-bold text-white mono leading-none" data-testid={`profile-linked-castle-${m.id}`}>{m.castle_level ? `F${m.castle_level}` : "—"}</span>
                        <span className="text-[8px] uppercase text-muted-foreground tracking-widest mt-0.5">{t("castle_level")}</span>
                      </div>
                    </div>
                    {/* 7-day sparkline trend */}
                    {trend.length > 0 && (
                      <div className="mt-2 flex items-center gap-2" data-testid={`profile-linked-sparkline-${m.id}`}>
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">{t("trend_7d")}</span>
                        <svg viewBox="0 0 100 24" className="flex-1 h-6" preserveAspectRatio="none">
                          <polyline
                            fill="none"
                            stroke="#F5A623"
                            strokeWidth="2"
                            points={trend.map((d, i) => {
                              const x = (i / (trend.length - 1 || 1)) * 100;
                              const y = 24 - ((d.points / maxT) * 22 + 1);
                              return `${x},${y.toFixed(1)}`;
                            }).join(" ")}
                          />
                        </svg>
                        <span className="text-[9px] mono gold-text flex-shrink-0 w-16 text-right">
                          {Number(trend.reduce((s, d) => s + d.points, 0)).toLocaleString("tr-TR")}
                        </span>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </>
          )}
          <button
            type="button"
            data-testid="profile-link-member-btn"
            onClick={() => setLinkOpen(true)}
            className="btn-gold text-xs px-3 py-2 w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" /> {linkedMembers.length ? t("add_member") : t("link_account")}
          </button>
        </div>

        {/* Notification opt-in/out */}
        <TelegramLinkSection />

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
        currentMemberIds={memberIds}
        onSaved={() => refreshMe()}
      />
    </div>
  );
}
