import React, { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import LinkMemberDialog from "@/components/LinkMemberDialog";
import TelegramLinkSection from "@/components/TelegramLinkSection";
import CropDialog from "@/components/CropDialog";
import { Switch } from "@/components/ui/switch";
import { KeyRound, Shield, User, LogOut, AlertTriangle, Link2, Bell, BellOff, Volume2, VolumeX, X as XIcon, Plus, Trophy, Zap, Castle, Crown, Medal, GitCompare, Flame, Trash2, Camera, Upload as UploadIcon } from "lucide-react";
import BadgeAISuggestions from "@/components/BadgeAISuggestions";
import { BADGES_ENABLED } from "@/lib/features";
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
  // v120 — Delete-account modal state (password confirm + irreversibility ack).
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [delPwd, setDelPwd] = useState("");
  const [delAck, setDelAck] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  // v120 — Fetch user's RSVP consecutive-yes streak for the 🔥 badge.
  const { data: streakData } = useSWR("/auth/me/rsvp-streak", fetcher, { refreshInterval: 60000 });
  // v124 — Notification preferences (per-channel toggles).
  const { data: notifPrefs, mutate: mutateNotifPrefs } = useSWR("/auth/me/notification-prefs", fetcher);
  // v135.28 — Optional birthday (MM-DD, no year for privacy).
  const { data: bdayData, mutate: mutateBday } = useSWR("/auth/me/birthday", fetcher);
  const [bdayInput, setBdayInput] = useState("");
  const [bdayBusy, setBdayBusy] = useState(false);
  // v135.29 — Optional public bio (max 280 chars).
  const { data: bioData, mutate: mutateBio } = useSWR("/auth/me/bio", fetcher);
  const [bioInput, setBioInput] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  React.useEffect(() => {
    if (bioData && typeof bioData.bio === "string") setBioInput(bioData.bio);
  }, [bioData]);
  const saveBio = async () => {
    setBioBusy(true);
    try {
      const res = await api.put("/auth/me/bio", { bio: bioInput || "" });
      mutateBio(res?.data, false);
      toast.success(bioInput
        ? t("profile_bio_saved", "Biyografi kaydedildi")
        : t("profile_bio_cleared", "Biyografi temizlendi"));
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBioBusy(false); }
  };
  // Sync local input from backend value on first load / roundtrip.
  React.useEffect(() => {
    if (bdayData && typeof bdayData.birthday_mmdd === "string") {
      setBdayInput(bdayData.birthday_mmdd);
    } else if (bdayData && bdayData.birthday_mmdd == null) {
      setBdayInput("");
    }
  }, [bdayData]);
  const saveBirthday = async (val) => {
    setBdayBusy(true);
    try {
      const res = await api.put("/auth/me/birthday",
        { birthday_mmdd: val || null });
      mutateBday(res?.data, false);
      toast.success(val
        ? t("profile_birthday_saved", "Doğum günü kaydedildi 🎂")
        : t("profile_birthday_cleared", "Doğum günü kaldırıldı"));
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBdayBusy(false); }
  };
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [prefBusy, setPrefBusy] = useState(false);
  // v130 — Avatar crop flow. Users pick a file → we open CropDialog with a
  // 1:1 square selection so the portrait always fits a circular frame; the
  // cropped File is then uploaded via `/api/uploads/image?purpose=avatar`.
  const [cropSrc, setCropSrc] = useState(null);       // data:URL preview
  const [cropFile, setCropFile] = useState(null);     // original File
  // Radial menu whoosh sound preference (persisted per browser)
  const [radialMuted, setRadialMuted] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("ol_radial_mute") === "1")
  );
  const toggleRadialMute = (nextMuted) => {
    setRadialMuted(nextMuted);
    localStorage.setItem("ol_radial_mute", nextMuted ? "1" : "0");
  };

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

  // v124 — Per-channel notification preferences (rsvp / announcement /
  // streak / sadıklar). Updates the local SWR cache optimistically so the
  // toggle feels instant.
  const updateNotifPref = async (key, value) => {
    setPrefBusy(true);
    const next = { ...(notifPrefs || {}), [key]: value };
    mutateNotifPrefs(next, false);
    try {
      await api.put("/auth/me/notification-prefs", next);
      toast.success("Bildirim tercihi kaydedildi");
    } catch (e) {
      toast.error(apiErr(e));
      mutateNotifPrefs();
    } finally { setPrefBusy(false); }
  };

  // v124/v130 — Avatar upload. Pick a file → read as data URL → open the
  // CropDialog for a square trim → upload the cropped file to
  // `/api/uploads/image?purpose=avatar` → PUT the returned URL onto the
  // user doc via `/api/auth/me/avatar`. Clearing goes through removeAvatar().
  const onAvatarChange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";  // allow re-picking the same file
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error("Görsel 8 MB'tan büyük olamaz"); return; }
    // Feed the file to CropDialog as a data URL.
    const reader = new FileReader();
    reader.onload = () => { setCropFile(f); setCropSrc(reader.result); };
    reader.onerror = () => toast.error("Görsel okunamadı");
    reader.readAsDataURL(f);
  };

  const uploadCroppedAvatar = async (croppedFile) => {
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", croppedFile);
      const up = await api.post("/uploads/image?purpose=avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const rawUrl = up.data.url;
      // The uploads router returns `/api/uploads/{id}` (relative). Convert
      // to an absolute preview URL so <img src> works regardless of route.
      const absUrl = rawUrl?.startsWith("http")
        ? rawUrl
        : `${process.env.REACT_APP_BACKEND_URL}${rawUrl}`;
      await api.put("/auth/me/avatar", { avatar_url: absUrl });
      toast.success("Avatar güncellendi");
      await refreshMe();
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setAvatarBusy(false);
      setCropSrc(null);
      setCropFile(null);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await api.put("/auth/me/avatar", { avatar_url: null });
      toast.success("Avatar kaldırıldı");
      await refreshMe();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setAvatarBusy(false); }
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

  // v120 — Hard-delete the current account after password confirmation.
  // The backend cascades RSVPs, sessions, push subs, telegram links, and
  // notifications; guild-side member docs stay put.
  const deleteAccount = async () => {
    if (!delAck) { toast.error("Onay kutusunu işaretlemelisin"); return; }
    if (!delPwd) { toast.error("Şifren gerekli"); return; }
    setDeletingAccount(true);
    try {
      await api.delete("/auth/me", { data: { password: delPwd } });
      toast.success("Hesabın kalıcı olarak silindi");
      // Cascade UI: logout + redirect to home. AuthContext.logout() clears
      // the local JWT so subsequent SWR calls will 401 → landing page.
      logout();
      nav("/", { replace: true });
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div data-testid="profile-page">
      <Header title={t("my_profile")} />
      <div className="px-4">
        <div className="card-red-gold p-4 mb-4">
          <div className="flex items-center gap-3">
            {/* v124 — Avatar block replaces the plain rank badge. Users
                can upload their own image; falls back to the rank-based
                icon when no avatar is set. */}
            <div className="relative flex-shrink-0" data-testid="profile-avatar-block">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="avatar"
                  data-testid="profile-avatar-img"
                  className="w-12 h-12 rounded-full object-cover"
                  style={{ border: "2px solid #F5A623", boxShadow: "0 0 10px rgba(245,166,35,0.45)" }}
                />
              ) : (
                <div className={`rank-badge ${user.role === "admin" ? "rank-GOW" : user.can_edit ? "rank-R3" : "rank-R2"}`}>
                  {user.role === "admin" ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
              )}
              <label
                data-testid="profile-avatar-upload-label"
                className="absolute -bottom-1 -right-1 rounded-full p-1 cursor-pointer"
                title="Avatar yükle"
                style={{ background: "linear-gradient(135deg, #F5A623, #B45309)", border: "1px solid #0B0704" }}
              >
                <Camera className="w-3 h-3" style={{ color: "#0B0704" }} />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={avatarBusy}
                  onChange={onAvatarChange}
                  data-testid="profile-avatar-input"
                />
              </label>
              {user.avatar_url && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={avatarBusy}
                  data-testid="profile-avatar-remove"
                  className="absolute -top-1 -right-1 rounded-full p-1 disabled:opacity-40"
                  title="Avatarı kaldır"
                  style={{ background: "rgba(0,0,0,0.75)", border: "1px solid rgba(239,68,68,0.6)", color: "#FCA5A5" }}
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
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
                {/* v120 — RSVP streak badge. Only renders when streak >= 5
                    (threshold from backend). Fiery orange glow so it reads
                    as an earned achievement, not a system chip. */}
                {streakData && streakData.has_badge && BADGES_ENABLED && (
                  <span
                    data-testid="profile-rsvp-streak-badge"
                    className="text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1"
                    title={`Üst üste ${streakData.streak} etkinliğe Evet dedin`}
                    style={{
                      background: "linear-gradient(135deg, rgba(245,166,35,0.35), rgba(231,76,26,0.35))",
                      color: "#FFF7ED",
                      border: "1px solid rgba(245,166,35,0.7)",
                      boxShadow: "0 0 8px rgba(245,166,35,0.55)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    <Flame className="w-2.5 h-2.5" style={{ color: "#FFB347" }} /> {streakData.streak} ETKİNLİK SERİSİ
                  </span>
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
                    {/* v142.3 — AI Badge Suggestion panel per linked member */}
                    {BADGES_ENABLED && (
                      <div className="mt-2">
                        <BadgeAISuggestions memberId={m.id} memberName={m.name} />
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

        {/* v124 — Per-channel notification preferences. Only visible when
            master notifications are on. Users can silence a specific
            channel (streak celebrations, sadıklar mentions) without
            disabling everything. */}
        {user.notification_enabled !== false && notifPrefs && (
          <div className="card-dark p-3 mb-4" data-testid="profile-notification-prefs-panel">
            <div className="text-[10px] uppercase tracking-widest gold-text mb-2">
              Bildirim Türleri
            </div>
            <div className="space-y-2">
              {[
                { key: "rsvp",         label: "🔔 RSVP hatırlatmaları",   hint: "Etkinlik yaklaşırken cevap ver hatırlatması" },
                { key: "reminder",     label: "⏰ Etkinlik hatırlatmaları", hint: "Etkinlik başlamadan 15dk/30dk/1sa/2sa önce otomatik bildirim" },
                { key: "announcement", label: "📢 Genel duyurular",         hint: "Lonca duyuruları ve önemli haberler" },
                { key: "streak",       label: "🔥 Streak kutlamaları",     hint: "Üst üste RSVP serin arttıkça bilgi" },
                { key: "sadiklar",     label: "🏅 Sadıklar başarısı",       hint: "Etkinlik eşiğini geçtiğinde tebrik" },
              ].map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 py-1" data-testid={`profile-notification-pref-${row.key}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white font-semibold truncate">{row.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug">{row.hint}</div>
                  </div>
                  <Switch
                    data-testid={`profile-notification-pref-${row.key}-switch`}
                    checked={notifPrefs[row.key] !== false}
                    disabled={prefBusy}
                    onCheckedChange={(v) => updateNotifPref(row.key, !!v)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="section-title flex items-center gap-2">
          {radialMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          {t("radial_menu_sound_title")}
        </div>
        <div className="card-dark p-3 mb-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-semibold">{t("radial_menu_sound_title")}</div>
            <div className="text-[11px] text-muted-foreground">{t("radial_menu_sound_desc")}</div>
          </div>
          <Switch
            data-testid="profile-radial-sound-toggle"
            checked={!radialMuted}
            onCheckedChange={(v) => toggleRadialMute(!v)}
          />
        </div>

        {/* v135.29 — Optional public bio (max 280 chars, herkese açık). */}
        <div className="section-title flex items-center gap-2">
          ✍️ {t("profile_bio_title", "Biyografi")}
        </div>
        <div className="card-dark p-3 mb-4 space-y-2" data-testid="profile-bio-card">
          <div className="text-[11px] text-muted-foreground leading-snug">
            {t("profile_bio_hint",
               "İsteğe bağlı — profil kartında herkese açık gösterilir. Kısa savaş çığlığı ya da tanıtım (max 280 karakter).")}
          </div>
          <textarea
            value={bioInput}
            onChange={(e) => setBioInput(e.target.value.slice(0, 280))}
            placeholder={t("profile_bio_placeholder",
              "Kaleyi sağlam tut, saflar bozulmasın.")}
            data-testid="profile-bio-textarea"
            rows={3}
            maxLength={280}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[10px] text-muted-foreground font-mono">
              {t("profile_bio_count",
                "{{count}} / 280", { count: bioInput.length })}
            </div>
            <button
              type="button"
              onClick={saveBio}
              disabled={bioBusy}
              className="btn-gold text-xs px-3 py-1.5 ml-auto"
              data-testid="profile-bio-save"
            >
              {bioBusy
                ? t("saving", "Kaydediliyor…")
                : t("profile_bio_save_btn", "Kaydet")}
            </button>
          </div>
        </div>

        {/* v135.34 — Performance card (30-day metrics) + Certificates */}
        <ProfilePerformanceAndCerts user={user} />

        {/* v135.28 — Optional birthday (MM-DD only). Sending an empty string
            clears the field and mutes the daily celebration loop for this
            user until they set a new date. */}
        <div className="section-title flex items-center gap-2">
          🎂 {t("profile_birthday_title", "Doğum Günü")}
        </div>
        <div className="card-dark p-3 mb-4 space-y-2" data-testid="profile-birthday-card">
          <div className="text-[11px] text-muted-foreground leading-snug">
            {t("profile_birthday_hint",
               "İsteğe bağlı — yıl paylaşılmıyor. Bugüne denk gelirse Telegram grubunda kutlarız 🎉")}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              inputMode="numeric"
              placeholder={t("profile_birthday_placeholder", "MM-DD (örn 05-14)")}
              value={bdayInput}
              onChange={(e) => setBdayInput(e.target.value)}
              maxLength={5}
              pattern="\d{2}-\d{2}"
              data-testid="profile-birthday-input"
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-white font-mono"
              style={{ minWidth: 140 }}
            />
            <button
              type="button"
              onClick={() => saveBirthday(bdayInput.trim())}
              disabled={bdayBusy}
              className="btn-gold text-xs px-3 py-2"
              data-testid="profile-birthday-save"
            >
              {bdayBusy
                ? t("saving", "Kaydediliyor…")
                : t("profile_birthday_save_btn", "Kaydet")}
            </button>
            {bdayInput && (
              <button
                type="button"
                onClick={() => { setBdayInput(""); saveBirthday(""); }}
                disabled={bdayBusy}
                className="chip text-[10px]"
                data-testid="profile-birthday-clear"
              >
                {t("profile_birthday_clear_btn", "Temizle")}
              </button>
            )}
          </div>
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

        {/* v120 — Delete-account (KVKK "silme hakkı"). Renders below logout
            in a discrete danger zone; opens a confirm modal so a stray tap
            can't nuke the user's data. */}
        <div
          className="mt-6 rounded-lg p-3"
          data-testid="profile-danger-zone"
          style={{
            background: "rgba(239,68,68,0.05)",
            border: "1px dashed rgba(239,68,68,0.35)",
          }}
        >
          <div className="text-[10px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5" style={{ color: "#FCA5A5" }}>
            <AlertTriangle className="w-3 h-3" /> Tehlikeli Bölge
          </div>
          <div className="text-[11px] text-muted-foreground mb-2 leading-snug">
            Hesabını sildiğinde tüm RSVP kayıtların, oturumların, push abonelikleri ve Telegram bağlantıların kalıcı olarak silinir. Lonca üye kaydın (skorlar, ittifak) yerinde kalır.
          </div>
          <button
            type="button"
            data-testid="profile-delete-account-open"
            onClick={() => { setShowDeleteAccount(true); setDelPwd(""); setDelAck(false); }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase tracking-widest"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "#FCA5A5",
              border: "1px solid rgba(239,68,68,0.5)",
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Hesabımı Sil
          </button>
        </div>

        {showDeleteAccount && (
          <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            onClick={() => !deletingAccount && setShowDeleteAccount(false)}
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
            data-testid="delete-account-modal-backdrop"
          >
            <div
              className="w-full max-w-sm card-red-gold p-5 space-y-3"
              onClick={(e) => e.stopPropagation()}
              data-testid="delete-account-modal"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" style={{ color: "#F87171" }} />
                <h2 className="font-bold uppercase tracking-widest text-sm" style={{ fontFamily: "Cinzel, serif", color: "#FCA5A5" }}>
                  Hesabı Kalıcı Sil
                </h2>
              </div>
              <div className="text-xs text-white leading-relaxed">
                Bu işlem <b>geri alınamaz</b>. Devam etmek için şifreni gir ve onay kutusunu işaretle.
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Şifren</label>
                <input
                  data-testid="delete-account-password"
                  type="password"
                  value={delPwd}
                  onChange={(e) => setDelPwd(e.target.value)}
                  disabled={deletingAccount}
                  autoFocus
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-red-400"
                />
              </div>
              <label className="flex items-start gap-2 cursor-pointer" data-testid="delete-account-ack-label">
                <input
                  type="checkbox"
                  data-testid="delete-account-ack"
                  checked={delAck}
                  onChange={(e) => setDelAck(e.target.checked)}
                  disabled={deletingAccount}
                  className="mt-0.5 flex-shrink-0 accent-red-500"
                  style={{ width: 13, height: 13 }}
                />
                <span className="text-[11px] leading-snug text-white">
                  Verilerimin kalıcı olarak silineceğini ve bu işlemin geri alınamayacağını anladım.
                </span>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  data-testid="delete-account-cancel"
                  onClick={() => setShowDeleteAccount(false)}
                  disabled={deletingAccount}
                  className="flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-widest"
                  style={{ background: "rgba(148,163,184,0.15)", color: "#CBD5E1", border: "1px solid rgba(148,163,184,0.35)" }}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  data-testid="delete-account-confirm"
                  onClick={deleteAccount}
                  disabled={deletingAccount || !delAck || !delPwd}
                  className="flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5"
                  style={{
                    background: (deletingAccount || !delAck || !delPwd) ? "rgba(239,68,68,0.25)" : "linear-gradient(135deg, #DC2626, #991B1B)",
                    color: "#FEF2F2",
                    border: "1px solid rgba(239,68,68,0.6)",
                    opacity: (deletingAccount || !delAck || !delPwd) ? 0.6 : 1,
                    cursor: (deletingAccount || !delAck || !delPwd) ? "not-allowed" : "pointer",
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                  {deletingAccount ? "Siliniyor…" : "Kalıcı Sil"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <LinkMemberDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        currentMemberIds={memberIds}
        onSaved={() => refreshMe()}
      />

      {/* v130 — Square avatar crop dialog. Opens after picking a file; on
          confirm we upload the trimmed square file so the circular avatar
          frame always renders cleanly. */}
      <CropDialog
        open={!!cropSrc}
        imageUrl={cropSrc}
        originalFile={cropFile}
        aspect={1}
        title="Avatarı Kırp"
        description="Kare bir bölge seç — avatarın her yerde yuvarlak çerçeveye tam otursun."
        onCancel={() => { setCropSrc(null); setCropFile(null); }}
        onConfirm={(file) => uploadCroppedAvatar(file)}
      />
    </div>
  );
}

// v135.34 — Performance card + Certificates showcase. Rendered inside the
// Profile page below the bio card.
function ProfilePerformanceAndCerts({ user }) {
  const { t } = useTranslation();
  const primaryMemberId = (user?.member_ids && user.member_ids[0]) || user?.member_id || null;
  const { data: perf } = useSWR(
    primaryMemberId ? `/members/${primaryMemberId}/performance` : null,
    fetcher,
  );
  const { data: certsData } = useSWR("/auth/me/certificates", fetcher);
  const certs = certsData?.items || [];
  const backend = process.env.REACT_APP_BACKEND_URL;
  return (
    <>
      {perf && (
        <>
          <div className="section-title flex items-center gap-2">
            📊 {t("profile_perf_title", "Performans (Son 30 Gün)")}
          </div>
          <div className="card-dark p-3 mb-4" data-testid="profile-perf-card">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-widest">
                  {t("profile_perf_rsvp_rate", "RSVP Oranı")}
                </div>
                <div className="text-2xl font-bold gold-text font-mono">%{perf.rsvp_rate_pct}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t("profile_perf_rsvp_breakdown",
                    "✅ {{y}} · 🤔 {{m}} · ❌ {{n}} / {{total}}",
                    { y: perf.rsvp_yes_count, m: perf.rsvp_maybe_count,
                      n: perf.rsvp_no_count, total: perf.recent_events_count })}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-widest">
                  {t("profile_perf_avg_score", "Ortalama Puan")}
                </div>
                <div className="text-2xl font-bold text-emerald-400 font-mono">{perf.avg_score_30d}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t("profile_perf_attendance", "{{count}} yoklama",
                    { count: perf.attendance_count_30d })}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-widest">
                  {t("profile_perf_streak", "🔥 Streak")}
                </div>
                <div className="text-2xl font-bold text-orange-400 font-mono">{perf.current_streak}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-widest">
                  {t("profile_perf_best_month", "En İyi Ay")}
                </div>
                <div className="text-2xl font-bold text-purple-300 font-mono">{perf.best_month || "—"}</div>
                {perf.best_month_score > 0 && (
                  <div className="text-[10px] text-muted-foreground font-mono">{perf.best_month_score} p</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {certs.length > 0 && (
        <>
          <div className="section-title flex items-center gap-2">
            🏆 {t("profile_certs_title", "Sertifikalar")}
          </div>
          <div className="card-dark p-3 mb-4 space-y-2" data-testid="profile-certs-card">
            {certs.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded p-2"
                style={{ background: "rgba(245,166,35,0.06)",
                         border: "1px solid rgba(245,166,35,0.25)" }}
                data-testid={`profile-cert-${c.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-bold truncate">{c.title}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {c.event_name} · {new Date(c.issued_at).toLocaleDateString("tr-TR")}
                  </div>
                </div>
                <a
                  href={`${backend}/api/certificates/${c.id}/image.png`}
                  download={`titanxis-cert-${c.id}.png`}
                  className="chip text-[10px]"
                  data-testid={`profile-cert-download-${c.id}`}
                  target="_blank" rel="noreferrer"
                >
                  💾 {t("profile_cert_download", "İndir")}
                </a>
                {c.verify_token && (
                  <a
                    href={`https://twitter.com/intent/tweet?${new URLSearchParams({
                      text: `🏆 ${c.title} — TiTaNXiS Loncası`,
                      url: `${window.location.origin}/sertifika/${c.verify_token}`,
                    }).toString()}`}
                    target="_blank" rel="noreferrer"
                    className="chip text-[10px]"
                    style={{ color: "#93C5FD", borderColor: "rgba(59,130,246,0.55)" }}
                    data-testid={`profile-cert-share-x-${c.id}`}
                    title={t("profile_cert_share_x_hint", "X'te paylaş")}
                  >
                    𝕏 {t("profile_cert_share_x", "Paylaş")}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

