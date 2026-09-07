import React, { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mic, MicOff, LogOut, Users, Plus, Lock, Globe, Trash2, Eye, EyeOff, Copy, Check } from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
  useDataChannel,
  useRoomContext,
  useConnectionState,
  useSpeakingParticipants,
  StartAudio,
} from "@livekit/components-react";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
import "@livekit/components-styles";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * v138.8 — Sesli Kanallar sayfası. LiveKit ile P2P/SFU sesli oda.
 * - Adminler oda açar (Genel/SvS/Strateji seed edilir).
 * - Private oda için davetli listesi.
 * - Ziyaretçi giremez (RequireAuth wrapper üzerinden).
 */
export default function VoiceRooms() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth() || {};
  const { data: rooms = [], mutate: refetch } = useSWR("/voice/rooms", fetcher);
  const [active, setActive] = useState(null); // { token, url, room }

  const join = useCallback(async (room) => {
    // v140.3 — Tarayıcı mikrofon iznini ODAYA GİRMEDEN önce iste. Bazı
    // tarayıcılarda (özellikle iOS Safari + Firefox) LiveKit'in kendi
    // getUserMedia çağrısı prompt açmadan hemen "Permission denied" fırlatıyor.
    // Prompt'u burada tetiklediğimizde kullanıcı UI'da net bir tercih yapar;
    // reddederse token bile istemeyip açıklayıcı toast döneriz.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Track'i hemen serbest bırak; LiveKit odayla birlikte kendi track'ini açar.
      stream.getTracks().forEach((tr) => tr.stop());
    } catch (permErr) {
      const name = permErr?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        // v140.4 — OS/tarayıcı algılayıp doğru rehber sayfasına yönlendir.
        const ua = navigator.userAgent || "";
        const isIOS = /iP(hone|od|ad)/.test(ua);
        const isAndroid = /Android/.test(ua);
        const isFirefox = /Firefox/i.test(ua);
        const isEdge = /Edg\//i.test(ua);
        const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua) && !isIOS === false ? true : /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg/.test(ua);
        let helpUrl = "https://support.google.com/chrome/answer/2693767"; // default Chrome desktop
        if (isIOS) {
          helpUrl = "https://support.apple.com/guide/iphone/control-access-to-hardware-features-iph168c4bbd5/ios";
        } else if (isAndroid) {
          helpUrl = "https://support.google.com/chrome/answer/2693767?hl=tr&co=GENIE.Platform%3DAndroid";
        } else if (isFirefox) {
          helpUrl = "https://support.mozilla.org/tr/kb/tarayicinizda-web-sitesi-kamera-mikrofon-izinleri";
        } else if (isEdge) {
          helpUrl = "https://support.microsoft.com/tr-tr/microsoft-edge/microsoft-edge-de-kameran%C4%B1z%C4%B1-veya-mikrofonunuzu-etkinle%C5%9Ftirme-b9c88377-40cf-42d9-b6c7-8c69dee7e60d";
        } else if (isSafari) {
          helpUrl = "https://support.apple.com/guide/safari/websites-ibrwe2159f50/mac";
        }
        toast.error(
          t(
            "voice_mic_permission_denied",
            "🎙️ Mikrofon izni reddedildi. Sesli kanala katılmak için tarayıcı adres çubuğundaki kilit simgesinden mikrofon iznini 'İzin Ver' yapman gerekiyor."
          ),
          {
            duration: 12000,
            action: {
              label: t("voice_mic_help_action", "Nasıl açarım?"),
              onClick: () => window.open(helpUrl, "_blank", "noopener,noreferrer"),
            },
          }
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast.error(
          t(
            "voice_mic_not_found",
            "🎧 Sistemde mikrofon bulunamadı. Bir mikrofon bağla ve tekrar dene."
          ),
          { duration: 8000 }
        );
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        toast.error(
          t(
            "voice_mic_busy",
            "🎙️ Mikrofon başka bir uygulama tarafından kullanılıyor. Diğer uygulamayı kapat ve tekrar dene."
          ),
          { duration: 8000 }
        );
      } else {
        toast.error(
          t("voice_mic_error", "Mikrofon açılamadı: {{msg}}", { msg: permErr?.message || name || "bilinmeyen hata" }),
          { duration: 8000 }
        );
      }
      return;
    }

    let password = null;
    let guestName = null;
    // v140.35 — Erişim kuralları:
    //   • Admin           → şifre/davet gerekmez
    //   • Davetli üye     → şifre gerekmez (backend `is_invited: true` döndü)
    //   • Davetsiz üye    → şifre girmeli
    //   • Ziyaretçi       → şifre girmeli
    const skipPrompt = isAdmin || !!room.is_invited;
    if (!skipPrompt) {
      if (!user) {
        guestName = window.prompt(t("voice_guest_name_prompt", "Ziyaretçi adın (görünecek isim):"), "Ziyaretçi");
        if (guestName === null) return;
      }
      password = window.prompt(t("voice_room_password_prompt", "Oda şifresini gir:"));
      if (password === null) return;
    }
    try {
      const res = await api.post("/voice/token", { room_id: room.id, password, guest_name: guestName });
      setActive({ ...res.data, roomDoc: room });
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 403 && !password) {
        const retry = window.prompt(t("voice_room_password_prompt", "Oda şifresini gir:"));
        if (retry === null) return;
        try {
          const res2 = await api.post("/voice/token", { room_id: room.id, password: retry, guest_name: guestName });
          setActive({ ...res2.data, roomDoc: room });
        } catch (e2) { toast.error(e2?.response?.data?.detail || e2.message); }
        return;
      }
      toast.error(detail || e.message);
    }
  }, [user, isAdmin, t]);

  const leave = () => setActive(null);

  if (active) {
    return (
      <LiveKitRoom
        data-lk-theme="default"
        token={active.token}
        serverUrl={active.url}
        connect
        audio
        video={false}
        onDisconnected={leave}
        style={{ minHeight: "calc(100vh - 120px)" }}
      >
        <ActiveRoomUI
          roomId={active.roomDoc.id}
          roomName={active.roomDoc.name}
          isAdmin={isAdmin}
          onLeave={leave}
          onInvitedChange={() => refetch()}
        />
        <RoomAudioRenderer />
        <StartAudio label={t("voice_start_audio", "🔊 Sesi Başlat")} />
      </LiveKitRoom>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6" data-testid="voice-rooms-page">
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-2xl font-black uppercase tracking-widest"
          style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}
          data-testid="voice-rooms-title"
        >
          🎙️ {t("voice_rooms_title", "Sesli Kanallar")}
        </h1>
        {isAdmin && (
          <CreateRoomButton onCreated={() => refetch()} />
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rooms.map((r) => (
          <RoomCard key={r.id} room={r} onJoin={() => join(r)} isAdmin={isAdmin} onDeleted={() => refetch()} />
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full text-center text-sm opacity-70" style={{ color: "#94A3B8" }}>
            {t("voice_rooms_empty", "Henüz oda yok. Bir admin oluşturmalı.")}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomCard({ room, onJoin, isAdmin, onDeleted }) {
  const { t } = useTranslation();
  // v140.8 — Admin şifre göster/gizle + tek dokunuşla kopyala.
  const [pwd, setPwd] = useState(null); // fetch cache
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPwd = useCallback(async () => {
    if (pwd !== null) return pwd;
    setLoading(true);
    try {
      const r = await api.get(`/voice/rooms/${room.id}/password`);
      const p = r.data?.password || "";
      setPwd(p);
      return p;
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [pwd, room.id]);

  const toggleReveal = async () => {
    if (revealed) { setRevealed(false); return; }
    const p = await fetchPwd();
    if (p !== null) setRevealed(true);
  };

  const copyPwd = async () => {
    const p = await fetchPwd();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setCopied(true);
      toast.success(t("voice_room_pwd_copied", "Şifre kopyalandı"));
      setTimeout(() => setCopied(false), 1800);
    } catch { toast.error(t("voice_room_pwd_copy_failed", "Kopyalanamadı")); }
  };

  const doDelete = async () => {
    if (!window.confirm(t("voice_room_delete_confirm", "Bu odayı silmek istediğine emin misin?"))) return;
    try {
      await api.delete(`/voice/rooms/${room.id}`);
      toast.success(t("voice_room_deleted", "Oda silindi"));
      onDeleted();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };
  return (
    <div
      data-testid={`voice-room-card-${room.id}`}
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "linear-gradient(180deg, rgba(245,166,35,0.10), rgba(15,10,20,0.65))",
        border: "1px solid rgba(245,166,35,0.35)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Lock size={14} color="#F5A623" />
          <span className="font-bold text-sm truncate" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>{room.name}</span>
        </div>
        {/* v140.8 — Sistem odaları dahil TÜM odalar admin tarafından silinebilir. */}
        {isAdmin && (
          <button data-testid={`voice-room-delete-${room.id}`} onClick={doDelete} className="opacity-60 hover:opacity-100" title={t("voice_room_delete", "Odayı sil")}>
            <Trash2 size={14} color="#EF4444" />
          </button>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
        {t("voice_room_password_badge", "🔒 Şifreli")}
        {isAdmin && <span className="ml-2" style={{ color: "#F5A623" }}>{t("voice_room_admin_bypass", "· 👑 Admin (şifresiz)")}</span>}
        {!isAdmin && room.is_invited && (
          <span
            data-testid={`voice-room-invited-badge-${room.id}`}
            className="ml-2 font-bold"
            style={{ color: "#22C55E" }}
          >
            {t("voice_room_invited_badge", "· 🎫 Davetlisin (şifresiz)")}
          </span>
        )}
        {isAdmin && typeof room.invited_count === "number" && room.invited_count > 0 && (
          <span
            data-testid={`voice-room-invited-count-${room.id}`}
            className="ml-2"
            style={{ color: "#86EFAC" }}
          >
            {t("voice_room_invited_count", "· 🎫 {{n}} davetli", { n: room.invited_count })}
          </span>
        )}
      </div>

      {/* v140.8 — Admin şifre paylaşım paneli */}
      {isAdmin && (
        <div
          data-testid={`voice-room-pwd-panel-${room.id}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5"
          style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(245,166,35,0.25)" }}
        >
          <span
            data-testid={`voice-room-pwd-value-${room.id}`}
            className="flex-1 text-xs truncate select-all"
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              color: revealed ? "#F5A623" : "#94A3B8",
              letterSpacing: revealed ? "0.05em" : "0.35em",
            }}
          >
            {loading && pwd === null ? "…" : (revealed ? (pwd || "—") : "••••••••")}
          </span>
          <button
            data-testid={`voice-room-pwd-toggle-${room.id}`}
            onClick={toggleReveal}
            title={revealed ? t("voice_room_pwd_hide", "Gizle") : t("voice_room_pwd_reveal", "Göster")}
            aria-label={revealed ? t("voice_room_pwd_hide", "Gizle") : t("voice_room_pwd_reveal", "Göster")}
            className="opacity-75 hover:opacity-100 transition-opacity"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            {revealed ? <EyeOff size={14} color="#F5A623" /> : <Eye size={14} color="#94A3B8" />}
          </button>
          <button
            data-testid={`voice-room-pwd-copy-${room.id}`}
            onClick={copyPwd}
            title={t("voice_room_pwd_copy", "Şifreyi kopyala")}
            aria-label={t("voice_room_pwd_copy", "Şifreyi kopyala")}
            className="opacity-75 hover:opacity-100 transition-opacity"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            {copied ? <Check size={14} color="#22C55E" /> : <Copy size={14} color="#94A3B8" />}
          </button>
        </div>
      )}

      <button
        data-testid={`voice-room-join-${room.id}`}
        onClick={onJoin}
        className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest"
        style={{
          background: "linear-gradient(135deg, #F5A623 0%, #D4730A 60%, #E74C1A 100%)",
          color: "#0B0704",
          border: "none",
          cursor: "pointer",
          fontFamily: "Cinzel, serif",
        }}
      >
        {t("voice_room_join", "Katıl")}
      </button>
    </div>
  );
}


// v136 — Ses odası davet linki paneli. `voice_invite_tokens` üzerinden aktif
// linkleri gösterir; oluştur / kopyala / sil aksiyonları. Mevcut şifre / davetli
// akışına dokunmaz — sadece ek bir bypass yoludur.
function InviteLinksPanel({ roomId, roomName }) {
  const { t } = useTranslation();
  const { data, mutate: refetch } = useSWR(
    roomId ? `/voice/rooms/${roomId}/invite-links` : null,
    fetcher,
    { refreshInterval: 45000 },
  );
  const items = data?.items || [];
  const [busy, setBusy] = useState(false);
  const [copiedTok, setCopiedTok] = useState(null);

  const create = async () => {
    setBusy(true);
    try {
      await api.post(`/voice/rooms/${roomId}/invite-link`, {});
      toast.success(t("voice_invite_created", "Davet linki oluşturuldu"));
      await refetch();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async (link, tok) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedTok(tok);
      setTimeout(() => setCopiedTok(null), 1500);
      toast.success(t("voice_invite_copied", "Bağlantı panoya kopyalandı"));
    } catch {
      toast.error(t("voice_invite_copy_fail", "Kopyalanamadı"));
    }
  };
  const del = async (tok) => {
    if (!window.confirm(t("voice_invite_delete_confirm", "Bu davet linkini devre dışı bırak?"))) return;
    try {
      await api.delete(`/voice/rooms/${roomId}/invite-link/${tok}`);
      toast.success(t("voice_invite_deleted", "Davet linki devre dışı bırakıldı"));
      await refetch();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <div
      data-testid={`voice-room-invites-${roomId}`}
      className="rounded-lg px-2 py-2 space-y-1.5"
      style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.35)" }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#C4B5FD" }}>
          🔗 {t("voice_invite_links_title", "Davet Linkleri")}
          {items.length > 0 && <span className="ml-1 opacity-70">({items.length})</span>}
        </span>
        <button
          data-testid={`voice-room-invite-create-${roomId}`}
          onClick={create}
          disabled={busy}
          className="chip text-[10px] flex items-center gap-1"
          style={{
            background: "linear-gradient(135deg,#A78BFA,#7C3AED)",
            color: "#0B0704", fontWeight: 800, borderColor: "#A78BFA",
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Plus className="w-3 h-3" />
          {busy ? t("adding", "Ekleniyor…") : t("voice_invite_create_btn", "Davet Linki Oluştur")}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-[10px] italic text-center py-1" style={{ color: "#94A3B8" }}>
          {t("voice_invite_empty", "Aktif davet linki yok — oluştur ve paylaş")}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((r) => (
            <div
              key={r.token}
              data-testid={`voice-room-invite-row-${r.token}`}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px]"
              style={{ background: "rgba(15,10,20,0.55)", border: "1px solid rgba(148,163,184,0.25)" }}
            >
              <span className="flex-1 min-w-0 truncate font-mono" style={{ color: "#DDD6FE" }}>
                {r.link || `${r.token.slice(0, 12)}…`}
              </span>
              <button
                onClick={() => copyLink(r.link, r.token)}
                data-testid={`voice-room-invite-copy-${r.token}`}
                title={t("voice_invite_copy", "Kopyala")}
                className="opacity-75 hover:opacity-100"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                {copiedTok === r.token
                  ? <Check size={12} color="#22C55E" />
                  : <Copy size={12} color="#94A3B8" />}
              </button>
              <button
                onClick={() => del(r.token)}
                data-testid={`voice-room-invite-delete-${r.token}`}
                title={t("voice_invite_delete", "Sil")}
                className="opacity-75 hover:opacity-100"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <Trash2 size={12} color="#F87171" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateRoomButton({ onCreated }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const { data: usersList = [] } = useSWR(open ? "/users" : null, fetcher);
  const filteredUsers = React.useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const arr = Array.isArray(usersList) ? usersList : (usersList.items || []);
    if (!q) return arr;
    return arr.filter((u) =>
      (u.username || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  }, [usersList, userSearch]);

  const toggleInvite = (id) => {
    setInvitedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!password.trim()) {
      toast.error(t("voice_password_required", "Şifre zorunludur"));
      return;
    }
    try {
      await api.post("/voice/rooms", {
        name: name.trim(),
        password: password.trim(),
        invited_user_ids: invitedIds,
      });
      toast.success(t("voice_room_created", "Oda oluşturuldu"));
      setOpen(false); setName(""); setPassword(""); setInvitedIds([]); setUserSearch("");
      onCreated();
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };
  return (
    <>
      <button
        data-testid="voice-room-new-btn"
        onClick={() => setOpen(true)}
        className="chip text-xs flex items-center gap-1"
        style={{ borderColor: "#F5A623", color: "#F5A623", background: "rgba(245,166,35,0.15)" }}
      >
        <Plus size={14} /> {t("voice_room_new", "Yeni Oda")}
      </button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <div
            data-testid="voice-room-new-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl p-5 max-h-[90vh] overflow-y-auto"
            style={{ background: "#1E1410", border: "1px solid rgba(245,166,35,0.55)" }}
          >
            <h3 className="text-lg font-bold mb-4" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
              {t("voice_room_new", "Yeni Oda")}
            </h3>
            <input
              data-testid="voice-room-name-input"
              placeholder={t("voice_room_name_ph", "Oda adı")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white mb-3"
            />
            <input
              data-testid="voice-room-password-input"
              type="text"
              placeholder={t("voice_room_password_ph", "Oda şifresi (zorunlu)")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-amber-500/40 rounded px-3 py-2 text-sm text-white mb-3"
            />

            {/* v140.35 — Üye davet listesi */}
            <div
              data-testid="voice-room-invite-picker"
              className="mb-3 rounded-lg p-3"
              style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(34,197,94,0.35)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#22C55E" }}>
                  🎫 {t("voice_room_invite_title", "Davet Et (Opsiyonel)")}
                </span>
                <span className="text-[10px]" style={{ color: "#94A3B8" }}>
                  {invitedIds.length > 0 ? t("voice_room_invited_selected", "{{n}} seçildi", { n: invitedIds.length }) : ""}
                </span>
              </div>
              <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#94A3B8" }}>
                {t("voice_room_invite_hint", "Davetli üyeler odaya şifre girmeden doğrudan katılabilir.")}
              </p>
              <input
                data-testid="voice-room-invite-search"
                placeholder={t("voice_room_invite_search_ph", "Üye ara…")}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs text-white mb-2"
              />
              <div
                className="max-h-40 overflow-y-auto rounded"
                style={{ background: "rgba(0,0,0,0.25)" }}
              >
                {filteredUsers.length === 0 ? (
                  <div className="text-[10px] text-center py-3" style={{ color: "#94A3B8" }}>
                    {t("voice_room_invite_no_users", "Üye bulunamadı")}
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <label
                      key={u.id}
                      data-testid={`voice-room-invite-row-${u.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <input
                        type="checkbox"
                        data-testid={`voice-room-invite-check-${u.id}`}
                        checked={invitedIds.includes(u.id)}
                        onChange={() => toggleInvite(u.id)}
                        className="accent-amber-500"
                        style={{ width: 12, height: 12 }}
                      />
                      <span className="text-xs" style={{ color: "#F5F0E8" }}>{u.username}</span>
                      {u.role === "admin" && (
                        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(245,166,35,0.20)", color: "#F5A623" }}>ADMIN</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            <p className="text-[10px] mb-4 leading-relaxed" style={{ color: "#94A3B8" }}>
              {t("voice_room_password_hint_v2", "Davetsiz üyeler ve ziyaretçiler için bu şifre gerekli. Adminler ve davetliler şifresiz girer.")}
            </p>
            <div className="flex gap-2">
              <button
                data-testid="voice-room-create-submit"
                onClick={submit}
                className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest"
                style={{ background: "linear-gradient(135deg, #F5A623, #E74C1A)", color: "#0B0704", border: "none", cursor: "pointer" }}
              >
                {t("voice_room_create", "Oluştur")}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="chip text-xs"
                style={{ borderColor: "rgba(148,163,184,0.5)", color: "#E5E7EB" }}
              >
                {t("cancel", "İptal")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ActiveRoomUI({ roomId, roomName, isAdmin, onLeave, onInvitedChange }) {
  const { t } = useTranslation();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: true }]);
  // v140.40 — RTC race koruması: Room fully connected olmadan mikrofon aç/kapat
  // ya da data broadcast yapma. `useConnectionState` LiveKit'in resmi hook'u;
  // "PC manager is closed" hatası (connect() tamamlanmadan önce publish, veya
  // disconnect sonrası track işlemi) böylece önlenir.
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  // v140.45 — Aktif konuşanları (VAD) canlı takip et → tile üstünde pulsing
  // "Konuşuyor…" rozeti. LiveKit VAD API'si.
  const speakingParticipants = useSpeakingParticipants();
  const speakingIds = React.useMemo(
    () => new Set((speakingParticipants || []).map((p) => p?.identity).filter(Boolean)),
    [speakingParticipants],
  );

  // v140.48 — Kendi kümülatif konuşma süren (bu oturum). Local participant
  // isSpeaking transitions'ını izler, saniye cinsinden toplar. Odaya girince
  // 0'dan başlar, ayrılınca ActiveRoomUI unmount → state kaybolur.
  const [talkSeconds, setTalkSeconds] = useState(0);
  const talkAccumRef = useRef(0);        // toplam ms
  const talkStartRef = useRef(null);     // konuşmaya başlanan an (ms) veya null
  const localIdentity = localParticipant?.identity;
  const localIsSpeaking = !!(localIdentity && speakingIds.has(localIdentity));
  useEffect(() => {
    if (localIsSpeaking) {
      if (talkStartRef.current === null) {
        talkStartRef.current = Date.now();
      }
    } else if (talkStartRef.current !== null) {
      talkAccumRef.current += Date.now() - talkStartRef.current;
      talkStartRef.current = null;
      setTalkSeconds(Math.floor(talkAccumRef.current / 1000));
    }
  }, [localIsSpeaking]);
  useEffect(() => {
    // Konuşurken UI'ı saniyede bir güncelle.
    const iv = setInterval(() => {
      if (talkStartRef.current !== null) {
        setTalkSeconds(
          Math.floor((talkAccumRef.current + (Date.now() - talkStartRef.current)) / 1000)
        );
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  const talkTimeLabel = React.useMemo(() => {
    const m = Math.floor(talkSeconds / 60);
    const s = talkSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [talkSeconds]);

  // v140.36 — Admin controls: kick + in-room invite management.
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data: adminRoomDetail, mutate: refetchRoomDetail } = useSWR(
    isAdmin && roomId && inviteOpen ? `/voice/rooms/${roomId}` : null,
    fetcher,
  );
  const invitedIds = adminRoomDetail?.invited_user_ids || [];
  const { data: usersData } = useSWR(
    isAdmin && inviteOpen ? "/users" : null,
    fetcher,
  );
  const usersList = Array.isArray(usersData) ? usersData : (usersData?.items || []);
  const [inviteSearch, setInviteSearch] = useState("");
  const filteredUsers = React.useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return usersList;
    return usersList.filter((u) =>
      (u.username || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  }, [usersList, inviteSearch]);

  // v140.37 — Ban list + password change (in-room admin).
  const { data: bansData, mutate: refetchBans } = useSWR(
    isAdmin && roomId && inviteOpen ? `/voice/rooms/${roomId}/bans` : null,
    fetcher,
  );
  const banItems = bansData?.items || [];
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const toggleInvitedUser = async (uid) => {
    const next = invitedIds.includes(uid)
      ? invitedIds.filter((x) => x !== uid)
      : [...invitedIds, uid];
    try {
      const r = await api.patch(`/voice/rooms/${roomId}/invited`, { invited_user_ids: next });
      // Optimistic update + refetch
      refetchRoomDetail({ ...adminRoomDetail, invited_user_ids: next }, false);
      refetchRoomDetail();
      if (onInvitedChange) onInvitedChange();
      const notified = r?.data?.notified_new || 0;
      if (invitedIds.includes(uid)) {
        toast.success(t("voice_invite_removed", "Davet iptal edildi"));
      } else if (notified > 0) {
        toast.success(t("voice_invite_added_notified", "Üye davet edildi ve bildirim gönderildi"));
      } else {
        toast.success(t("voice_invite_added", "Üye davet edildi"));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const kickParticipant = async (p) => {
    if (!p?.identity) return;
    if (!window.confirm(t("voice_kick_confirm", "\"{{name}}\" adlı katılımcıyı odadan atmak istediğine emin misin? Bu odaya yasaklanacak.", { name: p.name || p.identity }))) return;
    // v140.42 — Kick sebebi (opsiyonel). Cancel → boş sebeple devam; iptal etmek
    // için önceki confirm'de "Cancel" seçilir.
    const reason = window.prompt(
      t("voice_kick_reason_prompt", "Kick sebebi (opsiyonel, boş bırakılabilir):"),
      ""
    );
    // window.prompt Cancel = null; OK = string ("" olabilir). Cancel = iptal.
    if (reason === null) return;
    try {
      const r = await api.post(`/voice/rooms/${roomId}/kick`, {
        identity: p.identity,
        reason: reason.trim() || null,
      });
      if (r.data?.banned_user_id) {
        toast.success(t("voice_kick_and_ban_success", "Katılımcı atıldı ve yasaklandı"));
        refetchBans();
      } else if (r.data?.is_guest) {
        toast.success(t("voice_kick_guest_note", "Ziyaretçi atıldı (ban etkisiz — kimliği rastgeledir)"));
      } else {
        toast.success(t("voice_kick_success", "Katılımcı odadan atıldı"));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const unbanUser = async (userId, username) => {
    if (!window.confirm(t("voice_unban_confirm", "\"{{name}}\" için yasağı kaldırmak istediğine emin misin?", { name: username }))) return;
    try {
      await api.delete(`/voice/rooms/${roomId}/bans/${userId}`);
      toast.success(t("voice_unban_success", "Yasak kaldırıldı"));
      refetchBans();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const submitPasswordChange = async () => {
    const pw = newPwd.trim();
    if (pw.length < 4) {
      toast.error(t("voice_pwd_change_too_short", "Şifre en az 4 karakter olmalı"));
      return;
    }
    setPwdBusy(true);
    try {
      await api.patch(`/voice/rooms/${roomId}/password`, { password: pw });
      toast.success(t("voice_pwd_change_success", "Şifre değiştirildi (mevcut katılımcılar etkilenmez)"));
      setPwdOpen(false);
      setNewPwd("");
      if (onInvitedChange) onInvitedChange(); // parent refresh so password_plain gets updated for admin
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setPwdBusy(false);
    }
  };

  // v140.24 — Mic mode: "continuous" (default) or "ptt" (push-to-talk).
  // localStorage kalıcılığı per-user (aynı tarayıcı üzerinde).
  const [micMode, setMicMode] = useState(() => {
    try { return localStorage.getItem("voice_mic_mode") || "continuous"; } catch { return "continuous"; }
  });
  const [pttHeld, setPttHeld] = useState(false);

  // Mode değişince mic state'i ayarla: continuous → mic aç; ptt → mic kapa.
  // v140.40 — Sadece `isConnected` iken track işlemi yap.
  useEffect(() => {
    try { localStorage.setItem("voice_mic_mode", micMode); } catch {}
    if (!isConnected || !localParticipant) return;
    if (micMode === "continuous") {
      if (!isMicrophoneEnabled) localParticipant.setMicrophoneEnabled(true).catch(() => {});
    } else {
      // PTT: default OFF, sadece basılı tutunca aç
      if (isMicrophoneEnabled && !pttHeld) localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micMode, isConnected]);

  const toggleMic = () => {
    if (!isConnected || !localParticipant) return;
    if (micMode === "ptt") return; // PTT modunda toggle disable
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {});
  };

  // v140.33 — PTT ses efekti: hafif "beep on/off" tonu (Web Audio API).
  // v140.39 — pttPress/pttRelease deps'inde referanslandığı için bu blok
  // temporal dead zone'u önlemek amacıyla PTT handler'larından ÖNCE deklare
  // ediliyor.
  const audioCtxRef = useRef(null);
  const ensureAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtxRef.current = new AC();
      } catch {}
    }
    return audioCtxRef.current;
  }, []);
  const playBeep = useCallback((freq = 880, durationMs = 55, volume = 0.09) => {
    try {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0;
      const now = ctx.currentTime;
      gain.gain.linearRampToValueAtTime(volume, now + 0.005);
      gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.02);
    } catch {}
  }, [ensureAudioCtx]);

  // PTT press/release handlers — pointer (mouse + touch), plus Spacebar hold.
  // v140.33 — beep on/off geri bildirimi eklendi.
  // v140.40 — RTC guard: bağlantı hazır değilse track operasyonu yapma.
  const pttPress = useCallback(() => {
    if (micMode !== "ptt" || !localParticipant || !isConnected) return;
    setPttHeld((prev) => {
      if (prev) return prev; // zaten basılı — çift beep yok
      try { playBeep(880, 55, 0.09); } catch {}
      return true;
    });
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
  }, [micMode, localParticipant, playBeep, isConnected]);
  const pttRelease = useCallback(() => {
    if (micMode !== "ptt" || !localParticipant || !isConnected) return;
    setPttHeld((prev) => {
      if (!prev) return prev; // zaten kapalı
      try { playBeep(440, 55, 0.09); } catch {}
      return false;
    });
    localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }, [micMode, localParticipant, playBeep, isConnected]);

  useEffect(() => {
    if (micMode !== "ptt") return undefined;
    const onKD = (e) => {
      if (e.code === "Space" && !e.repeat && !e.target.matches("input, textarea")) {
        e.preventDefault();
        pttPress();
      }
    };
    const onKU = (e) => {
      if (e.code === "Space") { e.preventDefault(); pttRelease(); }
    };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    return () => {
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
    };
  }, [micMode, pttPress, pttRelease]);

  // v140.32 — Local mute: kullanıcı bir başkasının sesini sadece kendi için
  // kısabilir (LiveKit `RemoteParticipant.setVolume(0)` — server-side kimseyi
  // etkilemez). State: identity → boolean.
  const [localMutes, setLocalMutes] = useState({});

  // v140.33 — Uzak katılımcıların aktif mikrofon modunu (PTT vs Continuous)
  // LiveKit veri kanalı üzerinden takip et. Kendimiz `micMode` state'ini
  // kullanıyoruz; diğerleri identity → mode map'inde.
  const [remoteModes, setRemoteModes] = useState({});
  const room = useRoomContext();

  // v140.33 — Data channel: mic-mode broadcast.
  const { send: sendMicMode } = useDataChannel("mic-mode", (msg) => {
    try {
      const raw = new TextDecoder().decode(msg.payload);
      const parsed = JSON.parse(raw);
      const from = msg.from?.identity;
      if (parsed && parsed.mode && from) {
        setRemoteModes((prev) => (prev[from] === parsed.mode ? prev : { ...prev, [from]: parsed.mode }));
      }
    } catch {}
  });

  const broadcastMode = useCallback((mode) => {
    try {
      if (!sendMicMode) return;
      const payload = new TextEncoder().encode(JSON.stringify({ mode }));
      sendMicMode(payload, { reliable: true });
    } catch {}
  }, [sendMicMode]);

  // Kendi modun değişince odaya duyur.
  // v140.40 — Data channel de connect sonrası açılır; broadcast'ı gate'le.
  useEffect(() => {
    if (!isConnected) return;
    broadcastMode(micMode);
  }, [micMode, broadcastMode, isConnected]);

  // Yeni bir katılımcı bağlandığında kendi modunu tekrar duyur (yeni gelen
  // rozeti hemen görebilsin).
  useEffect(() => {
    if (!room || !isConnected) return undefined;
    const onJoin = () => {
      // küçük gecikme: peer'in data channel'ı hazır olsun
      setTimeout(() => broadcastMode(micMode), 300);
    };
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => { room.off(RoomEvent.ParticipantConnected, onJoin); };
  }, [room, micMode, broadcastMode, isConnected]);

  // Ayrılan katılımcının modunu temizle.
  useEffect(() => {
    if (!room) return undefined;
    const onLeave = (p) => {
      setRemoteModes((prev) => {
        if (!p?.identity || !(p.identity in prev)) return prev;
        const next = { ...prev };
        delete next[p.identity];
        return next;
      });
    };
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => { room.off(RoomEvent.ParticipantDisconnected, onLeave); };
  }, [room]);

  const toggleLocalMute = useCallback((p) => {
    // Kendini local-mute etme; kendi susturman için normal mute butonu var.
    if (!p || (localParticipant && p.identity === localParticipant.identity)) return;
    setLocalMutes((prev) => {
      const nowMuted = !prev[p.identity];
      const next = { ...prev, [p.identity]: nowMuted };
      try {
        if (typeof p.setVolume === "function") {
          p.setVolume(nowMuted ? 0 : 1);
        } else {
          // fallback: iterate audio track publications and set volume on each
          const pubs = p.audioTrackPublications || p.audioTracks || new Map();
          const iter = pubs.forEach ? pubs : Object.values(pubs);
          (iter.forEach ? iter : [...iter]).forEach((pub) => {
            const tr = pub?.track;
            if (tr && typeof tr.setVolume === "function") tr.setVolume(nowMuted ? 0 : 1);
          });
        }
      } catch {}
      return next;
    });
  }, [localParticipant]);

  return (
    <div className="max-w-3xl mx-auto p-6" data-testid="voice-active-room">
      <div className="mb-6">
        <h2 className="text-xl font-black mb-3" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
          🎙️ {roomName}
        </h2>
        {/* v136 — İki satırlı buton düzeni (mobilde taşmasın).
            Satır 1: Admin aksiyonları (Davetleri Yönet + Şifre Değiştir).
            Satır 2: Bilgi + Davet Linki (katılımcı, oturum sayacı, davet linki). */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="voice-actions-row-1">
            <button
              data-testid="voice-invite-panel-toggle"
              onClick={() => setInviteOpen((v) => !v)}
              className="chip text-xs flex items-center gap-1"
              style={{
                borderColor: inviteOpen ? "#22C55E" : "rgba(34,197,94,0.5)",
                color: "#22C55E",
                background: inviteOpen ? "rgba(34,197,94,0.15)" : "transparent",
              }}
              title={t("voice_invite_manage_title", "Davetlileri yönet")}
            >
              🎫 {t("voice_invite_manage_btn", "Davetleri Yönet")}
              {invitedIds.length > 0 && (
                <span
                  className="ml-1 px-1.5 rounded-full text-[9px] font-bold"
                  style={{ background: "rgba(34,197,94,0.30)", color: "#86EFAC" }}
                >
                  {invitedIds.length}
                </span>
              )}
            </button>
            <button
              data-testid="voice-pwd-change-toggle"
              onClick={() => setPwdOpen((v) => !v)}
              className="chip text-xs flex items-center gap-1"
              style={{
                borderColor: pwdOpen ? "#F5A623" : "rgba(245,166,35,0.5)",
                color: "#F5A623",
                background: pwdOpen ? "rgba(245,166,35,0.15)" : "transparent",
              }}
              title={t("voice_pwd_change_title", "Oda şifresini değiştir")}
            >
              🔑 {t("voice_pwd_change_btn", "Şifre Değiştir")}
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2" data-testid="voice-actions-row-2">
          <span className="chip text-xs flex items-center gap-1" style={{ borderColor: "#22C55E", color: "#22C55E" }}>
            <Users size={12} /> {participants.length}
          </span>
          <span
            data-testid="voice-talk-time-self"
            className="chip text-xs flex items-center gap-1"
            style={{
              borderColor: "rgba(168,85,247,0.55)",
              color: "#C4B5FD",
              background: localIsSpeaking ? "rgba(168,85,247,0.20)" : "transparent",
            }}
            title={t("voice_talk_time_title", "Bu oturumdaki toplam konuşma süren")}
          >
            🕒 {t("voice_talk_time_label", "Bu oturum")}: {talkTimeLabel}
          </span>
          {isAdmin && (
            <button
              data-testid="voice-invite-link-quick"
              onClick={async () => {
                try {
                  const r = await api.post(`/voice/rooms/${roomId}/invite-link`, {});
                  const link = r.data?.link;
                  if (link) {
                    try {
                      await navigator.clipboard.writeText(link);
                      toast.success(t("voice_invite_link_copied", "Davet linki oluşturuldu ve kopyalandı"));
                    } catch {
                      toast.success(t("voice_invite_created", "Davet linki oluşturuldu"));
                    }
                  }
                } catch (e) {
                  toast.error(e?.response?.data?.detail || e.message);
                }
              }}
              className="chip text-xs flex items-center gap-1"
              style={{
                borderColor: "rgba(168,85,247,0.55)",
                color: "#C4B5FD",
                background: "transparent",
              }}
              title={t("voice_invite_link_btn_title", "Tek tıkla davet linki oluştur ve kopyala")}
            >
              🔗 {t("voice_invite_link_btn", "Davet Linki")}
            </button>
          )}
        </div>
      </div>

      {/* v140.37 — Admin: in-room password change */}
      {isAdmin && pwdOpen && (
        <div
          data-testid="voice-pwd-change-panel"
          className="mb-6 rounded-lg p-4 flex items-center gap-2 flex-wrap"
          style={{
            background: "rgba(10,6,4,0.72)",
            border: "1px solid rgba(245,166,35,0.35)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#F5A623" }}>
            🔑 {t("voice_pwd_change_title", "Oda şifresini değiştir")}:
          </span>
          <input
            data-testid="voice-pwd-change-input"
            type="text"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder={t("voice_pwd_change_placeholder", "Yeni şifre (en az 4 karakter)")}
            className="flex-1 min-w-[180px] bg-black/40 border border-amber-500/40 rounded px-3 py-1.5 text-xs text-white"
          />
          <button
            data-testid="voice-pwd-change-submit"
            onClick={submitPasswordChange}
            disabled={pwdBusy}
            className="chip text-xs font-bold"
            style={{
              background: "linear-gradient(135deg, #F5A623, #E74C1A)",
              color: "#0B0704",
              border: "none",
              cursor: pwdBusy ? "not-allowed" : "pointer",
              opacity: pwdBusy ? 0.6 : 1,
            }}
          >
            {pwdBusy ? t("voice_pwd_change_saving", "Kaydediliyor…") : t("save", "Kaydet")}
          </button>
          <button
            onClick={() => { setPwdOpen(false); setNewPwd(""); }}
            className="chip text-xs"
            style={{ borderColor: "rgba(148,163,184,0.5)", color: "#E5E7EB" }}
          >
            {t("cancel", "İptal")}
          </button>
          <p className="w-full text-[10px] mt-1" style={{ color: "#94A3B8" }}>
            {t("voice_pwd_change_note", "Mevcut katılımcılar etkilenmez; yeni girişlerde bu şifre geçerli olacak.")}
          </p>
        </div>
      )}

      {/* v140.36 — Admin: in-room invite management panel */}
      {isAdmin && inviteOpen && (
        <div
          data-testid="voice-invite-panel"
          className="mb-6 rounded-lg p-4"
          style={{
            background: "rgba(10,6,4,0.72)",
            border: "1px solid rgba(34,197,94,0.35)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#22C55E" }}>
              🎫 {t("voice_invite_panel_title", "Davet Yönetimi")}
            </h3>
            <span className="text-[10px]" style={{ color: "#94A3B8" }}>
              {t("voice_invite_selected_count", "{{n}} davetli", { n: invitedIds.length })}
            </span>
          </div>
          <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "#94A3B8" }}>
            {t("voice_invite_panel_hint", "Değişiklikler anında uygulanır. Davetli üyeler şifresiz katılabilir.")}
          </p>
          <input
            data-testid="voice-invite-search"
            placeholder={t("voice_room_invite_search_ph", "Üye ara…")}
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs text-white mb-2"
          />
          <div
            className="max-h-48 overflow-y-auto rounded"
            style={{ background: "rgba(0,0,0,0.25)" }}
          >
            {filteredUsers.length === 0 ? (
              <div className="text-[10px] text-center py-3" style={{ color: "#94A3B8" }}>
                {t("voice_room_invite_no_users", "Üye bulunamadı")}
              </div>
            ) : (
              filteredUsers.map((u) => {
                const checked = invitedIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    data-testid={`voice-invite-row-${u.id}`}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <input
                      type="checkbox"
                      data-testid={`voice-invite-check-${u.id}`}
                      checked={checked}
                      onChange={() => toggleInvitedUser(u.id)}
                      className="accent-emerald-500"
                      style={{ width: 12, height: 12 }}
                    />
                    <span className="text-xs flex-1" style={{ color: "#F5F0E8" }}>{u.username}</span>
                    {u.role === "admin" && (
                      <span className="text-[9px] px-1 rounded" style={{ background: "rgba(245,166,35,0.20)", color: "#F5A623" }}>ADMIN</span>
                    )}
                    {checked && (
                      <span className="text-[9px] px-1 rounded" style={{ background: "rgba(34,197,94,0.20)", color: "#86EFAC" }}>
                        {t("voice_invite_checked_badge", "DAVETLİ")}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {/* v140.37 — Ban list (yasaklılar) */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(239,68,68,0.25)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#F87171" }}>
                🚫 {t("voice_ban_list_title", "Yasaklı Üyeler")}
              </span>
              <span className="text-[10px]" style={{ color: "#94A3B8" }}>
                {t("voice_ban_list_count", "{{n}} yasaklı", { n: banItems.length })}
              </span>
            </div>
            {banItems.length === 0 ? (
              <div
                data-testid="voice-ban-list-empty"
                className="text-[10px] text-center py-2 rounded"
                style={{ background: "rgba(0,0,0,0.25)", color: "#94A3B8" }}
              >
                {t("voice_ban_list_empty", "Bu odada yasaklı üye yok.")}
              </div>
            ) : (
              <div
                data-testid="voice-ban-list"
                className="rounded"
                style={{ background: "rgba(0,0,0,0.25)" }}
              >
                {banItems.map((b) => (
                  <div
                    key={b.user_id}
                    data-testid={`voice-ban-row-${b.user_id}`}
                    className="flex items-start gap-2 px-2 py-1.5"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <span className="text-[10px] px-1 rounded font-bold mt-0.5" style={{ background: "rgba(239,68,68,0.20)", color: "#F87171" }}>
                      🚫
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs" style={{ color: "#F5F0E8" }}>{b.username}</span>
                      {/* v140.42 — Sebep + banlayan admin + tarih */}
                      {b.reason && (
                        <div
                          data-testid={`voice-ban-reason-${b.user_id}`}
                          className="text-[10px] italic mt-0.5"
                          style={{ color: "#FCA5A5" }}
                        >
                          "{b.reason}"
                        </div>
                      )}
                      {(b.banned_by_username || b.banned_at) && (
                        <div className="text-[9px] opacity-60 mt-0.5" style={{ color: "#94A3B8" }}>
                          {b.banned_by_username && <span>{t("voice_ban_by", "Yasaklayan")}: {b.banned_by_username}</span>}
                          {b.banned_at && (
                            <span className="ml-2">{new Date(b.banned_at).toLocaleString("tr-TR")}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      data-testid={`voice-unban-${b.user_id}`}
                      onClick={() => unbanUser(b.user_id, b.username)}
                      className="chip text-[10px]"
                      style={{ borderColor: "rgba(34,197,94,0.6)", color: "#86EFAC" }}
                      title={t("voice_unban_btn_title", "Yasağı kaldır")}
                    >
                      {t("voice_unban_btn", "Yasağı Kaldır")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* v136 — Davet Linkleri bölümü (aktif odada Davet Yönetimi paneli) */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(168,85,247,0.25)" }}>
            <InviteLinksPanel roomId={roomId} roomName={roomName} />
          </div>
        </div>
      )}

      {/* v140.24 — Mikrofon modu seçici */}
      <div
        data-testid="voice-mic-mode-selector"
        className="mb-4 flex items-center justify-center gap-2"
        role="tablist"
        aria-label={t("voice_mic_mode_label", "Mikrofon Modu")}
      >
        <span className="text-[11px] uppercase tracking-widest" style={{ color: "#94A3B8" }}>
          {t("voice_mic_mode_label", "Mikrofon Modu")}
        </span>
        <button
          data-testid="voice-mic-mode-continuous"
          role="tab"
          aria-selected={micMode === "continuous"}
          onClick={() => setMicMode("continuous")}
          className="chip text-xs flex items-center gap-1 px-3 py-1.5"
          style={{
            borderColor: micMode === "continuous" ? "#22C55E" : "rgba(148,163,184,0.5)",
            color: micMode === "continuous" ? "#22C55E" : "#94A3B8",
            background: micMode === "continuous" ? "rgba(34,197,94,0.10)" : "transparent",
          }}
        >
          <Mic size={12} /> {t("voice_mic_mode_continuous", "Sürekli Açık")}
        </button>
        <button
          data-testid="voice-mic-mode-ptt"
          role="tab"
          aria-selected={micMode === "ptt"}
          onClick={() => setMicMode("ptt")}
          className="chip text-xs flex items-center gap-1 px-3 py-1.5"
          style={{
            borderColor: micMode === "ptt" ? "#F5A623" : "rgba(148,163,184,0.5)",
            color: micMode === "ptt" ? "#F5A623" : "#94A3B8",
            background: micMode === "ptt" ? "rgba(245,166,35,0.10)" : "transparent",
          }}
        >
          🎤 {t("voice_mic_mode_ptt", "Push to Talk")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {tracks.map((tr, idx) => {
          const p = tr.participant;
          const speaking = p.isSpeaking;
          const muted = !p.isMicrophoneEnabled;
          const isSelf = localParticipant && p.identity === localParticipant.identity;
          const locallyMuted = !!localMutes[p.identity];
          return (
            <div
              key={p.identity + idx}
              data-testid={`voice-participant-${p.identity}`}
              className="rounded-xl p-4 flex flex-col items-center gap-2 relative"
              style={{
                background: "rgba(15,10,20,0.65)",
                border: `2px solid ${speaking ? "#22C55E" : "rgba(255,255,255,0.08)"}`,
                boxShadow: speaking ? "0 0 20px rgba(34,197,94,0.55)" : "none",
                transition: "all 0.22s ease",
              }}
            >
              {!isSelf && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  {/* v140.36 — Admin kick */}
                  {isAdmin && (
                    <button
                      data-testid={`voice-kick-${p.identity}`}
                      onClick={() => kickParticipant(p)}
                      title={t("voice_kick_title", "Bu kişiyi odadan at")}
                      aria-label={t("voice_kick_title", "Bu kişiyi odadan at")}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-colors font-bold"
                      style={{
                        background: "rgba(239,68,68,0.20)",
                        border: "1px solid #EF4444",
                        color: "#F87171",
                        fontSize: 10,
                        cursor: "pointer",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {t("voice_kick_short", "AT")}
                    </button>
                  )}
                  <button
                    data-testid={`voice-local-mute-${p.identity}`}
                    onClick={() => toggleLocalMute(p)}
                    title={locallyMuted
                      ? t("voice_local_unmute_title", "Bu kişinin sesini benim için aç")
                      : t("voice_local_mute_title", "Bu kişinin sesini sadece benim için sustur")}
                    aria-label={locallyMuted
                      ? t("voice_local_unmute_title", "Bu kişinin sesini benim için aç")
                      : t("voice_local_mute_title", "Bu kişinin sesini sadece benim için sustur")}
                    aria-pressed={locallyMuted}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{
                      background: locallyMuted ? "rgba(239,68,68,0.20)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${locallyMuted ? "#EF4444" : "rgba(255,255,255,0.15)"}`,
                      color: locallyMuted ? "#EF4444" : "#94A3B8",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {locallyMuted ? "🔇" : "🔊"}
                  </button>
                </div>
              )}
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black"
                style={{
                  background: "linear-gradient(135deg, #F5A623, #E74C1A)",
                  color: "#0B0704",
                  opacity: locallyMuted ? 0.55 : 1,
                }}
              >
                {(p.name || p.identity).charAt(0).toUpperCase()}
              </div>
              <span className="text-xs truncate max-w-full" style={{ color: "#F5F0E8" }}>
                {p.name || p.identity}
              </span>
              {/* v140.33 — Mic mode rozeti (PTT vs Continuous) */}
              {(() => {
                const mode = isSelf ? micMode : remoteModes[p.identity];
                if (!mode) return null;
                const isPtt = mode === "ptt";
                return (
                  <span
                    data-testid={`voice-mic-mode-badge-${p.identity}`}
                    className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                    style={{
                      border: `1px solid ${isPtt ? "#F5A623" : "#22C55E"}`,
                      color: isPtt ? "#F5A623" : "#22C55E",
                      background: isPtt ? "rgba(245,166,35,0.10)" : "rgba(34,197,94,0.10)",
                      letterSpacing: "0.08em",
                    }}
                    title={isPtt
                      ? t("voice_mic_mode_ptt", "Push to Talk")
                      : t("voice_mic_mode_continuous", "Sürekli Açık")}
                  >
                    {isPtt
                      ? `🎤 ${t("voice_mic_mode_badge_ptt", "PTT")}`
                      : `🔊 ${t("voice_mic_mode_badge_live", "Live")}`}
                  </span>
                );
              })()}
              {/* v140.45 — Speaking rozeti (VAD): sadece o an konuşurken göster,
                  pulsing yeşil, tile altında dikkat çekici. */}
              {speakingIds.has(p.identity) && (
                <span
                  data-testid={`voice-speaking-badge-${p.identity}`}
                  className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded animate-pulse flex items-center gap-1"
                  style={{
                    background: "rgba(34,197,94,0.20)",
                    color: "#86EFAC",
                    border: "1px solid #22C55E",
                    boxShadow: "0 0 8px rgba(34,197,94,0.55)",
                    letterSpacing: "0.08em",
                  }}
                  aria-live="polite"
                >
                  🎙️ {t("voice_speaking_label", "Konuşuyor…")}
                </span>
              )}
              <div className="flex items-center gap-1">
                {muted && <MicOff size={12} color="#EF4444" />}
                {locallyMuted && (
                  <span
                    data-testid={`voice-local-muted-badge-${p.identity}`}
                    className="text-[9px] uppercase tracking-widest"
                    style={{ color: "#EF4444" }}
                  >
                    {t("voice_local_muted_badge", "Yerel Susturuldu")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 justify-center">
        {micMode === "continuous" ? (
          <button
            data-testid="voice-mute-btn"
            onClick={toggleMic}
            className="chip text-sm flex items-center gap-2 px-4 py-2"
            style={{
              borderColor: isMicrophoneEnabled ? "#22C55E" : "#EF4444",
              color: isMicrophoneEnabled ? "#22C55E" : "#EF4444",
              background: isMicrophoneEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
            }}
          >
            {isMicrophoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            {isMicrophoneEnabled ? t("voice_mute", "Sustur") : t("voice_unmute", "Aç")}
          </button>
        ) : (
          <button
            data-testid="voice-ptt-btn"
            onMouseDown={pttPress}
            onMouseUp={pttRelease}
            onMouseLeave={pttRelease}
            onTouchStart={(e) => { e.preventDefault(); pttPress(); }}
            onTouchEnd={(e) => { e.preventDefault(); pttRelease(); }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={t("voice_ptt_hint", "Basılı tut → konuş, bırak → kapat")}
            className="chip text-sm flex items-center gap-2 px-6 py-3 select-none"
            style={{
              borderColor: pttHeld ? "#22C55E" : "#F5A623",
              color: pttHeld ? "#22C55E" : "#F5A623",
              background: pttHeld ? "rgba(34,197,94,0.20)" : "rgba(245,166,35,0.15)",
              boxShadow: pttHeld ? "0 0 24px rgba(34,197,94,0.55)" : "none",
              userSelect: "none",
              touchAction: "none",
              transition: "all 120ms ease-out",
              cursor: pttHeld ? "grabbing" : "grab",
            }}
          >
            <Mic size={18} />
            {pttHeld
              ? t("voice_ptt_active", "🔴 Konuşuyorsun...")
              : t("voice_ptt_hold", "Basılı Tut → Konuş")}
          </button>
        )}
        <button
          data-testid="voice-leave-btn"
          onClick={onLeave}
          className="chip text-sm flex items-center gap-2 px-4 py-2"
          style={{ borderColor: "#EF4444", color: "#EF4444", background: "rgba(239,68,68,0.10)" }}
        >
          <LogOut size={16} /> {t("voice_leave", "Ayrıl")}
        </button>
      </div>

      {micMode === "ptt" && (
        <p className="mt-3 text-center text-[11px] opacity-70" style={{ color: "#94A3B8" }} data-testid="voice-ptt-help">
          {t("voice_ptt_help", "Push to Talk aktif — konuşurken butona basılı tut (veya Boşluk tuşuna). Bırakınca mikrofon kapanır.")}
        </p>
      )}
    </div>
  );
}
