import React, { useMemo, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, LogOut, Monitor, Smartphone, Tablet, RefreshCw, ShieldOff } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const shortRel = (iso) => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  return `${months} ay önce`;
};

const DeviceIcon = ({ device }) => {
  if (device === "mobile") return <Smartphone className="w-3.5 h-3.5 gold-text" />;
  if (device === "tablet") return <Tablet className="w-3.5 h-3.5 gold-text" />;
  return <Monitor className="w-3.5 h-3.5 gold-text" />;
};

/**
 * Session Management — Yönetim > Oturum Yönetimi tab.
 * Admins see every active session across all users grouped by user with a
 * "Bu kullanıcının tüm oturumları" bulk action. Non-admins can only reach
 * this page if the parent nav lets them; we still guard by fetching from
 * /sessions/me instead.
 */
export default function SessionManagement() {
  const { user, isAdmin } = useAuth();
  const endpoint = isAdmin ? "/sessions/all" : "/sessions/me";
  const { data, isLoading, error } = useSWR(endpoint, fetcher, { refreshInterval: 30000 });
  const [busy, setBusy] = useState(null); // sid being acted upon

  const items = data?.items || [];
  const currentSid = data?.current_sid || null;

  // Group sessions by user_id for the admin view.
  const grouped = useMemo(() => {
    const map = {};
    for (const s of items) {
      const key = s.user_id;
      if (!map[key]) map[key] = { user_id: key, username: s.username, role: s.role, sessions: [] };
      map[key].sessions.push(s);
    }
    return Object.values(map).sort((a, b) => a.username.localeCompare(b.username, "tr"));
  }, [items]);

  const refresh = () => swrMutate(endpoint);

  const revokeOne = async (sid, isMine) => {
    if (isMine && !window.confirm("Bu oturum senin. Şimdi çıkış yapmış olursun. Devam?")) return;
    if (!isMine && !window.confirm("Bu oturumu sonlandırmak istediğine emin misin?")) return;
    setBusy(sid);
    try {
      await api.post(`/sessions/${sid}/revoke`);
      toast.success("Oturum sonlandırıldı");
      refresh();
      // If we just killed our own session, force a logout on next tick so
      // the invalidated token stops making calls.
      if (isMine) {
        setTimeout(() => {
          try { localStorage.removeItem("ol_token"); } catch {}
          window.location.href = "/login";
        }, 500);
      }
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setBusy(null); }
  };

  const revokeUserAll = async (uid, uname) => {
    if (!window.confirm(`${uname} için TÜM oturumlar sonlandırılacak. Devam?`)) return;
    setBusy(`user:${uid}`);
    try {
      const r = await api.post(`/sessions/revoke-user/${uid}`);
      toast.success(`${r.data?.revoked ?? 0} oturum sonlandırıldı`);
      refresh();
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setBusy(null); }
  };

  const revokeOthers = async () => {
    if (!window.confirm("Bu cihaz dışında TÜM oturumlar sonlandırılacak. Devam?")) return;
    setBusy("others");
    try {
      const r = await api.post("/sessions/revoke-others");
      toast.success(`${r.data?.revoked ?? 0} oturum sonlandırıldı`);
      refresh();
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setBusy(null); }
  };

  if (isLoading) {
    return (
      <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
           data-testid="sessions-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-red-gold p-6 text-center text-sm text-red-300" data-testid="sessions-error">
        Oturumlar yüklenemedi. {apiErr(error)}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="session-mgmt">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-widest gold-text font-bold">
          {isAdmin ? `Tüm Aktif Oturumlar (${items.length})` : `Oturumlarım (${items.length})`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="chip text-[10px]"
            data-testid="sessions-refresh"
          >
            <RefreshCw className="w-3 h-3" /> Yenile
          </button>
          {!isAdmin && items.length > 1 && (
            <button
              type="button"
              onClick={revokeOthers}
              disabled={busy === "others"}
              className="chip text-[10px]"
              style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
              data-testid="sessions-revoke-others"
            >
              <ShieldOff className="w-3 h-3" /> Diğerlerini Sonlandır
            </button>
          )}
        </div>
      </div>

      {items.length === 0 && (
        <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
             data-testid="sessions-empty">
          Aktif oturum yok.
        </div>
      )}

      {isAdmin ? (
        grouped.map((g) => (
          <div key={g.user_id} className="card-red-gold p-3" data-testid={`sessions-user-${g.user_id}`}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-white truncate">{g.username}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: g.role === "admin" ? "rgba(245,166,35,0.25)" : "rgba(100,100,100,0.2)",
                               color: g.role === "admin" ? "#F5A623" : "#D6D3D1" }}>
                  {g.role?.toUpperCase() || "USER"}
                </span>
                <span className="text-[10px] text-muted-foreground">· {g.sessions.length} oturum</span>
              </div>
              <button
                type="button"
                onClick={() => revokeUserAll(g.user_id, g.username)}
                disabled={busy === `user:${g.user_id}`}
                className="chip text-[10px]"
                style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
                data-testid={`sessions-revoke-user-${g.user_id}`}
              >
                <ShieldOff className="w-3 h-3" /> Tüm Oturumları Kes
              </button>
            </div>
            <div className="space-y-1.5">
              {g.sessions.map((s) => (
                <SessionRow key={s.id} s={s} currentSid={currentSid} busy={busy} onRevoke={revokeOne} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="space-y-1.5">
          {items.map((s) => (
            <SessionRow key={s.id} s={s} currentSid={currentSid} busy={busy} onRevoke={revokeOne} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({ s, currentSid, busy, onRevoke }) {
  const isMine = currentSid && s.id === currentSid;
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded"
      style={{
        background: isMine ? "rgba(34,197,94,0.08)" : "rgba(0,0,0,0.25)",
        border: `1px solid ${isMine ? "rgba(34,197,94,0.35)" : "rgba(120,53,15,0.25)"}`,
      }}
      data-testid={`session-row-${s.id}`}
    >
      <DeviceIcon device={s.ua_device} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white flex items-center gap-1.5 flex-wrap">
          <span className="font-bold">{s.ua_browser}</span>
          <span className="text-muted-foreground">·</span>
          <span>{s.ua_os}</span>
          {isMine && (
            <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                  style={{ background: "rgba(34,197,94,0.25)", color: "#86EFAC" }}
                  data-testid={`session-current-${s.id}`}>
              BU CİHAZ
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mono truncate">
          IP {s.ip || "?"} · giriş {shortRel(s.created_at)} · son aktif {shortRel(s.last_active_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRevoke(s.id, isMine)}
        disabled={busy === s.id}
        className="chip text-[10px] flex-shrink-0"
        style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
        title={isMine ? "Bu cihazdan çıkış yap" : "Bu oturumu sonlandır"}
        data-testid={`session-revoke-${s.id}`}
      >
        {busy === s.id
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <LogOut className="w-3 h-3" />}
        {isMine ? "Çıkış" : "Sonlandır"}
      </button>
    </div>
  );
}
