import React, { useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mic, MicOff, LogOut, Users, Plus, Lock, LockOpen, KeyRound, Globe, Trash2, Eye, EyeOff, Copy, Check, Pencil, Settings, X, Radio, Volume2, VolumeX, Grid2X2, Grid3X3, Timer } from "lucide-react";
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
      // v143.4 — Cihaz kimliği (sessionStorage): ziyaretçi oturumu, aynı sekmede
      // açık kaldığı sürece odaya tekrar şifre sormaz. Sekme/uygulama kapanınca sıfırlanır.
      let deviceId = "";
      try {
        deviceId = window.sessionStorage.getItem("ol_voice_device") || "";
        if (!deviceId) {
          deviceId = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + "-" + Date.now().toString(36);
          window.sessionStorage.setItem("ol_voice_device", deviceId);
        }
      } catch {}
      const res = await api.post("/voice/token", { room_id: room.id, password, guest_name: guestName, device_id: deviceId, lazy: true });
      setActive({ ...res.data, roomDoc: room, connectStartedAt: Date.now() });
    } catch (e) {
      const detail = e?.response?.data?.detail;
      // v143.8 — Kilitli oda: şifre girmesin, doğrudan hata göster.
      if (e?.response?.status === 403 && typeof detail === "string" && detail.toLowerCase().includes("kilit")) {
        toast.error(detail);
        return;
      }
      if (e?.response?.status === 403 && !password) {
        const retry = window.prompt(t("voice_room_password_prompt", "Oda şifresini gir:"));
        if (retry === null) return;
        try {
          const res2 = await api.post("/voice/token", { room_id: room.id, password: retry, guest_name: guestName, device_id: deviceId, lazy: true });
          setActive({ ...res2.data, roomDoc: room, connectStartedAt: Date.now() });
        } catch (e2) { toast.error(e2?.response?.data?.detail || e2.message); }
        return;
      }
      toast.error(detail || e.message);
    }
  }, [user, isAdmin, t]);

  const leave = () => setActive(null);
  // v143.9 — Lazy validation: eğer connect başladıktan sonra 3sn içinde
  // disconnect olursa "geçersiz şifre/davet kodu" olarak yorumla.
  const handleDisconnect = useCallback(() => {
    const startedAt = active?.connectStartedAt || 0;
    const elapsed = startedAt ? Date.now() - startedAt : Infinity;
    if (active?.lazy && elapsed < 3000) {
      toast.error(t("voice_lazy_invalid", "Geçersiz şifre veya davet kodu"), { duration: 6000 });
    }
    setActive(null);
  }, [active, t]);

  if (active) {
    return (
      <LiveKitRoom
        data-lk-theme="default"
        token={active.token}
        serverUrl={active.url}
        connect
        audio
        video={false}
        onDisconnected={handleDisconnect}
        style={{ minHeight: "calc(100vh - 120px)" }}
      >
        <ActiveRoomUI
          roomId={active.roomDoc.id}
          roomName={active.roomDoc.name}
          timerEnabled={!!active.roomDoc.countdown_enabled}
          roomStartedAt={active.roomDoc.created_at}
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

function TempMuteMenu({ identity, roomId, t }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);
  const doMute = async (secs) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.patch(`/voice/rooms/${roomId}/mute`, { participant_id: identity, duration_seconds: secs });
      const label = secs >= 60 ? `${Math.round(secs / 60)} dk` : `${secs} sn`;
      toast.success(t("voice_temp_muted_ok", "Katılımcı {{d}} susturuldu", { d: label }));
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        data-testid={`voice-temp-mute-menu-${identity}`}
        onClick={() => setOpen((v) => !v)}
        title={t("voice_temp_mute_menu", "Geçici Sustur")}
        aria-label={t("voice_temp_mute_menu", "Geçici Sustur")}
        className="w-7 h-7 rounded-full flex items-center justify-center"
        style={{
          background: open ? "rgba(200,134,10,0.20)" : "transparent",
          border: `1px solid ${open ? "#C8860A" : "rgba(255,255,255,0.15)"}`,
          color: open ? "#F5A623" : "#94A3B8",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          data-testid={`voice-temp-mute-panel-${identity}`}
          className="absolute right-0 top-8 rounded-lg overflow-hidden"
          style={{
            background: "rgba(18,18,26,0.98)",
            border: "1px solid rgba(200,134,10,0.55)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.65)",
            zIndex: 1700,
            minWidth: 150,
          }}
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest"
               style={{ color: "#C8860A", borderBottom: "1px solid rgba(200,134,10,0.20)" }}>
            {t("voice_temp_mute_title", "Geçici Sustur")}
          </div>
          {[
            { secs: 30, label: "30 sn" },
            { secs: 60, label: "1 dk" },
            { secs: 300, label: "5 dk" },
          ].map((opt) => (
            <button
              key={opt.secs}
              data-testid={`voice-temp-mute-${opt.secs}s-${identity}`}
              onClick={() => doMute(opt.secs)}
              disabled={busy}
              className="w-full px-3 py-2 text-left text-xs font-bold"
              style={{
                background: "transparent",
                border: "none",
                color: "#E5E7EB",
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              🔇 {opt.label}
            </button>
          ))}
        </div>
      )}
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
  // v143.8 — Odaya girmeden şifre değiştirme popup'ı.
  const [pwdEditOpen, setPwdEditOpen] = useState(false);
  const [newPwdInput, setNewPwdInput] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  // v143.8 — Oda kilit durumu (locked bool, optimistic UI).
  const [locked, setLocked] = useState(!!room.locked);
  const [lockBusy, setLockBusy] = useState(false);
  useEffect(() => { setLocked(!!room.locked); }, [room.locked]);

  const savePwd = async () => {
    const pw = (newPwdInput || "").trim();
    if (pw.length < 4) {
      toast.error(t("voice_pwd_min", "Şifre en az 4 karakter olmalı"));
      return;
    }
    setPwdSaving(true);
    try {
      await api.patch(`/voice/rooms/${room.id}/password`, { password: pw });
      setPwd(pw);
      setPwdEditOpen(false);
      setNewPwdInput("");
      toast.success(t("voice_pwd_updated", "Oda şifresi güncellendi"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setPwdSaving(false);
    }
  };

  const toggleLock = async () => {
    setLockBusy(true);
    const next = !locked;
    try {
      await api.post(`/voice/rooms/${room.id}/${next ? "lock" : "unlock"}`);
      setLocked(next);
      toast.success(next
        ? t("voice_room_locked_toast", "Oda kilitlendi (yeni katılımcı giremez)")
        : t("voice_room_unlocked_toast", "Oda kilidi açıldı"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setLockBusy(false);
    }
  };

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
          {locked && (
            <span
              data-testid={`voice-room-locked-badge-${room.id}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0"
              style={{
                background: "rgba(239,68,68,0.18)",
                border: "1px solid rgba(239,68,68,0.55)",
                color: "#F87171",
                letterSpacing: "0.08em",
              }}
              title={t("voice_room_locked_hint", "Bu oda kilitli — yeni katılımcı giremez")}
            >
              🔒 {t("voice_room_locked_label", "Kilitli")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <>
              <button
                data-testid={`voice-room-pwd-edit-${room.id}`}
                onClick={() => setPwdEditOpen((v) => !v)}
                className="opacity-70 hover:opacity-100"
                title={t("voice_room_pwd_edit_title", "Şifreyi değiştir")}
                aria-label={t("voice_room_pwd_edit_title", "Şifreyi değiştir")}
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <KeyRound size={14} color="#F5A623" />
              </button>
              <button
                data-testid={`voice-room-lock-toggle-${room.id}`}
                onClick={toggleLock}
                disabled={lockBusy}
                className="opacity-70 hover:opacity-100"
                title={locked
                  ? t("voice_room_unlock_title", "Kilidi aç")
                  : t("voice_room_lock_title", "Odayı kilitle")}
                aria-label={locked
                  ? t("voice_room_unlock_title", "Kilidi aç")
                  : t("voice_room_lock_title", "Odayı kilitle")}
                style={{ background: "transparent", border: "none", cursor: "pointer", opacity: lockBusy ? 0.4 : 0.7 }}
              >
                {locked
                  ? <Lock size={14} color="#F87171" />
                  : <LockOpen size={14} color="#94A3B8" />}
              </button>
              <button data-testid={`voice-room-delete-${room.id}`} onClick={doDelete} className="opacity-60 hover:opacity-100" title={t("voice_room_delete", "Odayı sil")} style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Trash2 size={14} color="#EF4444" />
              </button>
            </>
          )}
        </div>
      </div>
      {/* v143.8 — Şifre değiştir popup */}
      {isAdmin && pwdEditOpen && (
        <div
          data-testid={`voice-room-pwd-edit-panel-${room.id}`}
          className="rounded-lg px-2 py-2 flex items-center gap-2"
          style={{
            background: "rgba(245,166,35,0.08)",
            border: "1px solid rgba(245,166,35,0.45)",
          }}
        >
          <input
            data-testid={`voice-room-pwd-edit-input-${room.id}`}
            type="text"
            autoFocus
            value={newPwdInput}
            onChange={(e) => setNewPwdInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") savePwd(); if (e.key === "Escape") { setPwdEditOpen(false); setNewPwdInput(""); } }}
            placeholder={t("voice_room_pwd_new_placeholder", "Yeni şifre (min. 4 karakter)")}
            className="flex-1 text-xs px-2 py-1 rounded"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(245,166,35,0.35)",
              color: "#F5F0E8",
              fontFamily: "ui-monospace, monospace",
            }}
          />
          <button
            data-testid={`voice-room-pwd-edit-save-${room.id}`}
            onClick={savePwd}
            disabled={pwdSaving}
            className="text-[10px] font-black uppercase px-2 py-1 rounded"
            style={{
              background: "linear-gradient(135deg,#F5A623,#D4730A)",
              color: "#0B0704", border: "none", cursor: "pointer",
              letterSpacing: "0.06em", opacity: pwdSaving ? 0.5 : 1,
            }}
          >
            {pwdSaving ? t("saving", "Kaydediliyor…") : t("save", "Kaydet")}
          </button>
          <button
            data-testid={`voice-room-pwd-edit-cancel-${room.id}`}
            onClick={() => { setPwdEditOpen(false); setNewPwdInput(""); }}
            className="text-[10px] px-1 py-1 rounded"
            style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer" }}
            aria-label={t("cancel", "İptal")}
          >
            <X size={12} />
          </button>
        </div>
      )}
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
  const [showPwd, setShowPwd] = useState(false);
  const [capacity, setCapacity] = useState(15);
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const CAPACITIES = [5, 10, 15, 20, 30, 50];

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("voice_room_name_required", "Oda adı zorunludur"));
      return;
    }
    // v143.2 — Şifre zorunlu (min 4 karakter).
    const pw = (password || "").trim();
    if (!pw) {
      toast.error(t("voice_room_password_required", "Şifre zorunludur"));
      return;
    }
    if (pw.length < 4) {
      toast.error(t("voice_room_password_short", "Şifre en az 4 karakter olmalı"));
      return;
    }
    try {
      await api.post("/voice/rooms", {
        name: name.trim(),
        password: pw,
        max_capacity: capacity,
        countdown_enabled: countdownEnabled,
      });
      toast.success(t("voice_room_created", "Oda oluşturuldu"));
      setOpen(false);
      setName(""); setPassword(""); setShowPwd(false);
      setCapacity(15); setCountdownEnabled(false);
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <>
      <button
        data-testid="voice-room-new-btn"
        onClick={() => setOpen(true)}
        className="chip text-xs flex items-center gap-1"
        style={{ borderColor: "#FFD700", color: "#FFD700", background: "rgba(255,215,0,0.10)" }}
      >
        <Plus size={14} /> {t("voice_room_new", "Yeni Oda")}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            data-testid="voice-room-new-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
            style={{
              background: "rgba(18,18,26,0.94)",
              border: "1px solid rgba(255,215,0,0.35)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 10px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,215,0,0.08) inset",
            }}
          >
            <h3
              className="text-lg font-black mb-4 uppercase"
              style={{
                background: "linear-gradient(135deg, #FFD700 0%, #C8860A 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "0.10em",
                fontFamily: "'Rajdhani', system-ui, sans-serif",
              }}
            >
              {t("voice_room_new", "Yeni Oda")}
            </h3>

            <label className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: "#C8860A" }}>
              {t("voice_room_field_name", "Oda Adı")}
            </label>
            <input
              data-testid="voice-room-name-input"
              placeholder={t("voice_room_name_ph", "Oda adı")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm text-white mb-4"
              style={{ background: "rgba(8,8,15,0.75)", border: "1px solid rgba(255,215,0,0.25)" }}
              maxLength={80}
              autoFocus
            />

            <label className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: "#C8860A" }}>
              {t("voice_room_field_password", "Şifre")}
            </label>
            <div className="relative mb-4">
              <input
                data-testid="voice-room-password-input"
                type={showPwd ? "text" : "password"}
                placeholder={t("voice_room_password_ph_req", "Zorunlu — en az 4 karakter")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 pr-10 text-sm text-white"
                style={{ background: "rgba(8,8,15,0.75)", border: "1px solid rgba(255,215,0,0.25)" }}
                maxLength={40}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                data-testid="voice-room-password-eye"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-75 hover:opacity-100"
                aria-label={showPwd ? t("hide", "Gizle") : t("show", "Göster")}
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                {showPwd ? <EyeOff size={14} color="#C8860A" /> : <Eye size={14} color="#C8860A" />}
              </button>
            </div>

            <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: "#C8860A" }}>
              {t("voice_room_field_max_capacity", "Maksimum Kapasite")}
            </label>
            <div className="flex flex-wrap gap-2 mb-5" data-testid="voice-room-capacity-picker">
              {CAPACITIES.map((c) => {
                const sel = c === capacity;
                return (
                  <button
                    key={c}
                    onClick={() => setCapacity(c)}
                    data-testid={`voice-room-capacity-${c}`}
                    className="px-4 py-1.5 rounded-full text-xs font-black transition-all"
                    style={{
                      background: sel ? "linear-gradient(135deg, #FFD700, #C8860A)" : "rgba(8,8,15,0.65)",
                      color: sel ? "#08080F" : "#94A3B8",
                      border: sel ? "1px solid #FFD700" : "1px solid rgba(148,163,184,0.35)",
                      cursor: "pointer",
                      boxShadow: sel ? "0 0 12px rgba(255,215,0,0.45)" : "none",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <div
              className="flex items-center justify-between mb-5 rounded-lg px-3 py-2.5"
              style={{ background: "rgba(8,8,15,0.55)", border: "1px solid rgba(255,215,0,0.20)" }}
            >
              <div className="flex items-center gap-2">
                <Timer size={14} color="#FFD700" />
                <div>
                  <div className="text-sm font-bold text-white">
                    {t("voice_room_field_countdown", "Sayaç")}
                  </div>
                  <div className="text-[10px]" style={{ color: "#94A3B8" }}>
                    {t("voice_room_field_countdown_hint_up", "Oda açılışından itibaren yukarı sayar")}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCountdownEnabled((v) => !v)}
                data-testid="voice-room-countdown-toggle"
                aria-pressed={countdownEnabled}
                className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                style={{
                  background: countdownEnabled ? "#FFD700" : "rgba(148,163,184,0.35)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: countdownEnabled ? "#08080F" : "#E5E7EB",
                    left: countdownEnabled ? "22px" : "2px",
                  }}
                />
              </button>
            </div>

            <button
              data-testid="voice-room-create-submit"
              onClick={submit}
              className="w-full py-3 rounded-lg text-sm font-black uppercase"
              style={{
                background: "linear-gradient(135deg, #FFD700 0%, #C8860A 100%)",
                color: "#08080F",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.14em",
                boxShadow: "0 6px 20px rgba(255,215,0,0.35)",
              }}
            >
              {t("voice_room_create_full", "Oda Oluştur")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ActiveRoomUI({ roomId, roomName, timerEnabled, roomStartedAt, isAdmin, onLeave, onInvitedChange }) {
  const { t } = useTranslation();
  const { user, refreshMe } = useAuth() || {};
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

  // v143.8 — Aktif oda içinden kilit/kilit-aç butonu için oda durumu.
  const { data: roomMeta, mutate: refetchRoomMeta } = useSWR(
    isAdmin && roomId ? `/voice/rooms/${roomId}` : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const [roomLocked, setRoomLocked] = useState(false);
  const [roomLockBusy, setRoomLockBusy] = useState(false);
  useEffect(() => {
    if (roomMeta && typeof roomMeta.locked !== "undefined") setRoomLocked(!!roomMeta.locked);
  }, [roomMeta]);
  const toggleRoomLock = async () => {
    if (roomLockBusy) return;
    setRoomLockBusy(true);
    const next = !roomLocked;
    try {
      await api.post(`/voice/rooms/${roomId}/${next ? "lock" : "unlock"}`);
      setRoomLocked(next);
      refetchRoomMeta();
      toast.success(next
        ? t("voice_room_locked_toast", "Oda kilitlendi (yeni katılımcı giremez)")
        : t("voice_room_unlocked_toast", "Oda kilidi açıldı"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setRoomLockBusy(false);
    }
  };

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
      } else if (r.data?.banned_device_id) {
        toast.success(t("voice_kick_guest_banned", "Ziyaretçi atıldı ve cihazı kara listeye eklendi"));
        refetchBans();
      } else if (r.data?.is_guest) {
        toast.success(t("voice_kick_guest_note", "Ziyaretçi atıldı (cihaz oturumu bulunamadı — ban uygulanamadı)"));
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

  // v142.22 — PTT beep sesi tamamen kaldırıldı (kullanıcı isteği).
  // Eskiden Web Audio API ile 880Hz/440Hz on/off tonu çalıyordu; artık yok.

  // PTT press/release handlers — pointer (mouse + touch), plus Spacebar hold.
  // v140.40 — RTC guard: bağlantı hazır değilse track operasyonu yapma.
  const pttPress = useCallback(() => {
    if (micMode !== "ptt" || !localParticipant || !isConnected) return;
    setPttHeld((prev) => (prev ? prev : true));
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
  }, [micMode, localParticipant, isConnected]);
  const pttRelease = useCallback(() => {
    if (micMode !== "ptt" || !localParticipant || !isConnected) return;
    setPttHeld((prev) => (!prev ? prev : false));
    localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }, [micMode, localParticipant, isConnected]);

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

  // v143.9 — Admin geçici susturma bildirimi (data channel `admin-action`).
  useDataChannel("admin-action", (msg) => {
    try {
      const raw = new TextDecoder().decode(msg.payload);
      const parsed = JSON.parse(raw);
      if (parsed?.kind === "admin_temp_mute") {
        const secs = Number(parsed.duration_seconds || 0);
        const mins = secs >= 60 ? Math.round(secs / 60) : 0;
        const label = mins > 0
          ? t("voice_temp_muted_min", "Admin tarafından {{n}} dakika susturuldunuz", { n: mins })
          : t("voice_temp_muted_sec", "Admin tarafından {{n}} saniye susturuldunuz", { n: secs });
        toast.error(label, { duration: Math.max(4000, Math.min(8000, secs * 1000)) });
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

  // v143 — Ayarlar dropdown, grid sütun sayısı (2/3), deafen (tümünü sustur), count-up sayaç.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gridCols, setGridCols] = useState(2);
  const [deafenAll, setDeafenAll] = useState(false);
  const [timerLabel, setTimerLabel] = useState("");
  // v143.1 — Geri sayım yerine ARTAN sayaç. Oda açıldığı andan (roomStartedAt)
  // itibaren geçen süreyi HH:MM:SS olarak gösterir. `timerEnabled` false ise
  // sayaç görünmez. Fallback: roomStartedAt yoksa katılım anını başlangıç al.
  const timerAnchorRef = useRef(null);
  useEffect(() => {
    if (!timerEnabled) { setTimerLabel(""); return undefined; }
    const parsed = roomStartedAt ? new Date(roomStartedAt).getTime() : NaN;
    const anchor = Number.isFinite(parsed) ? parsed : (timerAnchorRef.current ?? Date.now());
    timerAnchorRef.current = anchor;
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - anchor) / 1000));
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setTimerLabel(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerEnabled, roomStartedAt]);
  // v143 — Deafen all: uzak katılımcıların yerel sesini kıs/aç.
  useEffect(() => {
    if (!participants || participants.length === 0) return;
    participants.forEach((p) => {
      if (localParticipant && p.identity === localParticipant.identity) return;
      try {
        if (typeof p.setVolume === "function") {
          p.setVolume(deafenAll ? 0 : 1);
        }
      } catch {}
    });
  }, [deafenAll, participants, localParticipant]);

  // v143.2 — Kara liste (blacklist) yönetimi: admin görüntüler + kullanıcı silebilir.
  // v143.7 — Guest cihazları da (`banned_devices`) listelenir.
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blacklistData, setBlacklistData] = useState([]);
  const [blacklistDevices, setBlacklistDevices] = useState([]);
  const [blacklistBusy, setBlacklistBusy] = useState(false);
  const fetchBlacklist = useCallback(async () => {
    if (!isAdmin) return;
    setBlacklistBusy(true);
    try {
      const r = await api.get(`/voice/rooms/${roomId}/blacklist`);
      setBlacklistData(r.data?.banned || []);
      setBlacklistDevices(r.data?.banned_devices || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBlacklistBusy(false);
    }
  }, [isAdmin, roomId]);
  const openBlacklist = useCallback(() => {
    setBlacklistOpen(true);
    setSettingsOpen(false);
    fetchBlacklist();
  }, [fetchBlacklist]);
  const removeDeviceFromBlacklist = useCallback(async (deviceId) => {
    try {
      await api.delete(`/voice/rooms/${roomId}/blacklist-device/${deviceId}`);
      toast.success(t("voice_blacklist_device_removed", "Ziyaretçi cihazı kara listeden çıkarıldı"));
      fetchBlacklist();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  }, [roomId, fetchBlacklist, t]);
  const removeFromBlacklist = useCallback(async (userId) => {
    try {
      await api.delete(`/voice/rooms/${roomId}/blacklist/${userId}`);
      toast.success(t("voice_blacklist_removed", "Kara listeden çıkarıldı"));
      fetchBlacklist();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  }, [roomId, fetchBlacklist, t]);

  // v141 — Aktif oda mount edildiğinde LegalFooter'ı gizle. Global legal footer
  // z-1500'da sabit ve bar ile çakışıyor; body class ile CSS üzerinden kapatıyoruz.
  useEffect(() => {
    document.body.classList.add("voice-room-active");
    return () => { document.body.classList.remove("voice-room-active"); };
  }, []);

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

  // v141 — Kalıcı görünen ad düzenleme (kalem ikonu). Modal input açar,
  // Kaydet → PUT /auth/me/display-name → refreshMe. Yeni değer tüm sistemde
  // (leaderboard, chat, LiveKit `.with_name()`) geçerli olur.
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const openNameEdit = useCallback(() => {
    setNameDraft((user?.display_name || user?.username || "").slice(0, 40));
    setNameEditOpen(true);
  }, [user]);
  const submitNameEdit = useCallback(async () => {
    const trimmed = (nameDraft || "").trim();
    if (trimmed.length > 40) {
      toast.error(t("voice_display_name_too_long", "Görünen ad en fazla 40 karakter olabilir"));
      return;
    }
    setNameSaving(true);
    try {
      await api.put("/auth/me/display-name", { display_name: trimmed });
      if (refreshMe) await refreshMe();
      toast.success(t("voice_display_name_saved", "Görünen ad güncellendi. Yeni ad sonraki katılımlarda geçerli olacak."));
      setNameEditOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setNameSaving(false);
    }
  }, [nameDraft, refreshMe, t]);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: "#08080F", zIndex: 1550 }}
      data-testid="voice-active-room"
    >
      {/* v143 — Top Bar (56px, obsidian #08080f) — sol katılımcı sayısı badge, orta oda adı gold gradient, sağ countdown + gear */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 relative"
        style={{
          height: 56,
          background: "#08080F",
          borderBottom: "1px solid rgba(255,215,0,0.20)",
        }}
        data-testid="voice-top-bar"
      >
        <span
          data-testid="voice-participant-count-badge"
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-black shrink-0"
          style={{
            background: "rgba(255,215,0,0.10)",
            border: "1px solid rgba(255,215,0,0.40)",
            color: "#FFD700",
          }}
        >
          <Users size={11} /> {participants.length}
        </span>
        <div className="flex-1 min-w-0 text-center">
          <span
            className="block text-base font-black truncate uppercase"
            style={{
              background: "linear-gradient(135deg, #FFD700 0%, #C8860A 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "'Rajdhani', system-ui, sans-serif",
              letterSpacing: "0.10em",
            }}
            data-testid="voice-top-bar-title"
          >
            {roomName}
          </span>
          {user && (
            <button
              data-testid="voice-display-name-edit-btn"
              onClick={openNameEdit}
              className="flex items-center gap-1 mx-auto text-[10px] mt-0.5"
              style={{
                background: "transparent",
                border: "none",
                color: "#C8860A",
                cursor: "pointer",
                lineHeight: 1,
              }}
              title={t("voice_display_name_edit_title", "Görünen adını düzenle")}
            >
              <Pencil size={9} />
              <span className="truncate max-w-[130px]">
                {user.display_name || user.username}
              </span>
            </button>
          )}
        </div>
        {timerLabel && (
          <span
            data-testid="voice-countdown"
            className="text-xs font-black tabular-nums shrink-0 px-2 py-1 rounded-md"
            style={{
              color: "#C8860A",
              background: "rgba(200,134,10,0.10)",
              border: "1px solid rgba(200,134,10,0.35)",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              letterSpacing: "0.05em",
            }}
          >
            {timerLabel}
          </span>
        )}
        <button
          data-testid="voice-settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
          style={{
            background: settingsOpen ? "rgba(255,215,0,0.20)" : "rgba(255,215,0,0.08)",
            border: "1px solid rgba(255,215,0,0.40)",
            color: "#FFD700",
            cursor: "pointer",
          }}
          aria-label={t("voice_settings_open", "Ayarlar")}
          title={t("voice_settings_open", "Ayarlar")}
        >
          <Settings size={16} />
        </button>
        {isAdmin && (
          <button
            data-testid="voice-room-lock-active-toggle"
            onClick={toggleRoomLock}
            disabled={roomLockBusy}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ml-1"
            style={{
              background: roomLocked ? "rgba(239,68,68,0.20)" : "rgba(148,163,184,0.10)",
              border: `1px solid ${roomLocked ? "rgba(239,68,68,0.55)" : "rgba(148,163,184,0.35)"}`,
              color: roomLocked ? "#F87171" : "#94A3B8",
              cursor: roomLockBusy ? "wait" : "pointer",
              opacity: roomLockBusy ? 0.55 : 1,
            }}
            aria-label={roomLocked
              ? t("voice_room_unlock_title", "Kilidi aç")
              : t("voice_room_lock_title", "Odayı kilitle")}
            title={roomLocked
              ? t("voice_room_unlock_title", "Kilidi aç")
              : t("voice_room_lock_title", "Odayı kilitle")}
          >
            {roomLocked ? <Lock size={16} /> : <LockOpen size={16} />}
          </button>
        )}

        {/* v143 — Ayarlar dropdown paneli */}
        {settingsOpen && (
          <div
            data-testid="voice-settings-panel"
            className="absolute right-3 top-[60px] w-[280px] rounded-2xl overflow-hidden"
            style={{
              background: "rgba(18,18,26,0.96)",
              border: "1px solid rgba(255,215,0,0.35)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,215,0,0.08) inset",
              zIndex: 1600,
            }}
          >
            <div className="p-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,215,0,0.15)" }}>
              <span
                className="text-xs font-black uppercase"
                style={{ color: "#FFD700", letterSpacing: "0.12em", fontFamily: "'Rajdhani', system-ui, sans-serif" }}
              >
                {t("voice_settings_title", "Ayarlar")}
              </span>
              <button
                onClick={() => setSettingsOpen(false)}
                data-testid="voice-settings-close-x"
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer" }}
                aria-label={t("close", "Kapat")}
              >
                <X size={14} />
              </button>
            </div>
            {isAdmin && (
              <>
                <button
                  data-testid="voice-settings-invite-manage"
                  onClick={() => { setInviteOpen((v) => !v); setSettingsOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-3 text-left"
                  style={{ background: "transparent", border: "none", color: "#E5E7EB", cursor: "pointer" }}
                >
                  <span className="text-xs font-bold">🎫 {t("voice_invite_manage_btn", "Davetleri Yönet")}</span>
                  {invitedIds.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(255,215,0,0.20)", color: "#FFD700" }}>
                      {invitedIds.length}
                    </span>
                  )}
                </button>
                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }} />
                <button
                  data-testid="voice-settings-pwd-change"
                  onClick={() => { setPwdOpen((v) => !v); setSettingsOpen(false); }}
                  className="w-full flex items-center px-3 py-3 text-left text-xs font-bold"
                  style={{ background: "transparent", border: "none", color: "#E5E7EB", cursor: "pointer" }}
                >
                  🔑 {t("voice_pwd_change_btn", "Şifre Değiştir")}
                </button>
                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }} />
                <button
                  data-testid="voice-settings-invite-link"
                  onClick={async () => {
                    try {
                      const r = await api.post(`/voice/rooms/${roomId}/invite-link`, {});
                      const link = r.data?.link;
                      if (link) {
                        try {
                          await navigator.clipboard.writeText(link);
                          toast.success(t("voice_invite_link_copied", "Davet linki oluşturuldu ve kopyalandı"));
                        } catch { toast.success(t("voice_invite_created", "Davet linki oluşturuldu")); }
                      }
                      setSettingsOpen(false);
                    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
                  }}
                  className="w-full flex items-center px-3 py-3 text-left text-xs font-bold"
                  style={{ background: "transparent", border: "none", color: "#E5E7EB", cursor: "pointer" }}
                >
                  🔗 {t("voice_invite_link_copy", "Davet Linki Kopyala")}
                </button>
                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }} />
                <button
                  data-testid="voice-settings-blacklist"
                  onClick={openBlacklist}
                  className="w-full flex items-center px-3 py-3 text-left text-xs font-bold"
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer" }}
                >
                  🚫 {t("voice_blacklist_manage_btn", "Kara Liste")}
                </button>
                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }} />
              </>
            )}
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest" style={{ color: "#C8860A" }}>
              {t("voice_mic_mode_label", "Mikrofon Modu")}
            </div>
            <button
              data-testid="voice-settings-mic-continuous"
              onClick={() => setMicMode("continuous")}
              className="w-full flex items-center justify-between px-3 py-2.5"
              style={{ background: "transparent", border: "none", color: "#E5E7EB", cursor: "pointer" }}
            >
              <span className="text-xs font-bold flex items-center gap-2"><Mic size={12} /> {t("voice_mic_mode_continuous", "Sürekli Açık")}</span>
              <span
                className="relative w-10 h-5 rounded-full transition-colors shrink-0"
                aria-hidden
                style={{ background: micMode === "continuous" ? "#FFD700" : "rgba(148,163,184,0.35)" }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: micMode === "continuous" ? "#08080F" : "#E5E7EB",
                    left: micMode === "continuous" ? "22px" : "2px",
                  }}
                />
              </span>
            </button>
            <button
              data-testid="voice-settings-mic-ptt"
              onClick={() => setMicMode("ptt")}
              className="w-full flex items-center justify-between px-3 py-2.5"
              style={{ background: "transparent", border: "none", color: "#E5E7EB", cursor: "pointer" }}
            >
              <span className="text-xs font-bold flex items-center gap-2">🎤 {t("voice_mic_mode_ptt", "Push to Talk")}</span>
              <span
                className="relative w-10 h-5 rounded-full transition-colors shrink-0"
                aria-hidden
                style={{ background: micMode === "ptt" ? "#FFD700" : "rgba(148,163,184,0.35)" }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                  style={{
                    background: micMode === "ptt" ? "#08080F" : "#E5E7EB",
                    left: micMode === "ptt" ? "22px" : "2px",
                  }}
                />
              </span>
            </button>
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }} />
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest" style={{ color: "#C8860A" }}>
              {t("voice_grid_label", "Sütun Sayısı")}
            </div>
            <div className="px-3 pb-3 flex items-center gap-2" data-testid="voice-grid-toggle">
              {[2, 3].map((n) => {
                const sel = gridCols === n;
                return (
                  <button
                    key={n}
                    onClick={() => setGridCols(n)}
                    data-testid={`voice-grid-${n}`}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs font-black"
                    style={{
                      background: sel ? "linear-gradient(135deg, #FFD700, #C8860A)" : "rgba(8,8,15,0.65)",
                      color: sel ? "#08080F" : "#94A3B8",
                      border: sel ? "1px solid #FFD700" : "1px solid rgba(148,163,184,0.35)",
                      cursor: "pointer",
                    }}
                  >
                    {n === 2 ? <Grid2X2 size={12} /> : <Grid3X3 size={12} />}
                    {n === 2 ? t("voice_grid_2", "2'li") : t("voice_grid_3", "3'lü")}
                  </button>
                );
              })}
            </div>
            <button
              data-testid="voice-settings-close"
              onClick={() => setSettingsOpen(false)}
              className="w-full py-2.5 text-xs font-black uppercase tracking-widest"
              style={{
                background: "rgba(255,215,0,0.08)",
                borderTop: "1px solid rgba(255,215,0,0.20)",
                border: "none",
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: "rgba(255,215,0,0.20)",
                color: "#FFD700",
                cursor: "pointer",
              }}
            >
              {t("close", "Kapat")}
            </button>
          </div>
        )}
      </div>

      {/* Scrollable middle content (leaves room for fixed bottom bar) */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="max-w-3xl mx-auto px-3 pt-3">


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

      {/* v143 — Tek liste, 2 veya 3 sütun (gridCols), tüm satırlar 48px sabit yükseklik.
          Konuşuyor: altın halka + altın isim + equalizer. Sessiz: gri isim + mic-off. */}
      {(() => {
        const fmtName = (raw) => {
          if (!raw) return "?";
          const s = String(raw);
          return s.includes("@") ? s.split("@")[0] : s;
        };
        const parseMeta = (p) => {
          try {
            const raw = p?.metadata || "";
            if (!raw) return {};
            return JSON.parse(raw) || {};
          } catch { return {}; }
        };

        const renderRow = (tr, idx) => {
          const p = tr.participant;
          const isSpeaking = !!p.isSpeaking;
          const isSilent = !p.isMicrophoneEnabled;
          const isSelf = localParticipant && p.identity === localParticipant.identity;
          const locallyMuted = !!localMutes[p.identity];
          const meta = parseMeta(p);
          const displayName = fmtName(p.name || p.identity);
          const initial = (displayName || "?").charAt(0).toUpperCase();
          const alliance = meta.alliance;
          const role = meta.role;
          const roleTag = alliance
            ? alliance
            : role === "admin"
              ? t("voice_admin_tag", "ADMIN")
              : role === "guest"
                ? t("voice_guest_tag", "ZİYARETÇİ")
                : t("voice_member_tag", "ÜYE");
          const nameColor = isSpeaking ? "#FFD700" : "#AAAAAA";
          return (
            <div
              key={p.identity + idx}
              data-testid={`voice-participant-${p.identity}`}
              className="flex items-center gap-2 h-12 px-2 rounded-lg"
              style={{
                background: "rgba(18,18,26,0.75)",
                border: `1px solid ${isSpeaking ? "rgba(255,215,0,0.35)" : "rgba(255,255,255,0.05)"}`,
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                transition: "all 0.22s ease",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 relative"
                style={{
                  background: `linear-gradient(135deg, #FFD700, #C8860A)`,
                  color: "#08080F",
                  boxShadow: isSpeaking
                    ? "0 0 0 2px #FFD700, 0 0 12px rgba(255,215,0,0.55)"
                    : "none",
                  opacity: locallyMuted ? 0.55 : 1,
                }}
              >
                {initial}
                {locallyMuted && (
                  <span
                    data-testid={`voice-local-mute-badge-${p.identity}`}
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
                    style={{
                      background: "#EF4444",
                      border: "2px solid #0a0608",
                      color: "#FFFFFF",
                      lineHeight: 1,
                    }}
                    aria-label={t("voice_local_muted_hint", "Bu kişinin sesi sadece senin cihazında kısıldı")}
                    title={t("voice_local_muted_hint", "Bu kişinin sesi sadece senin cihazında kısıldı")}
                  >
                    🔇
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <div
                    className="text-[13px] font-bold truncate leading-tight"
                    style={{ color: nameColor }}
                    data-testid={`voice-participant-name-${p.identity}`}
                  >
                    {displayName}
                  </div>
                  {isSpeaking ? (
                    <span
                      className="inline-flex items-end gap-[2px] shrink-0"
                      style={{ height: 12, width: 14, marginLeft: 2 }}
                      data-testid={`voice-eq-${p.identity}`}
                      aria-hidden
                    >
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          style={{
                            display: "inline-block",
                            width: 2,
                            borderRadius: 1,
                            background: "linear-gradient(180deg, #FFE066 0%, #FFD700 45%, #C8860A 100%)",
                            boxShadow: "0 0 4px rgba(255,215,0,0.75), 0 0 8px rgba(255,180,0,0.35)",
                            animation: `voiceEqBounce 0.85s ease-in-out ${i * 0.12}s infinite`,
                            transformOrigin: "bottom",
                          }}
                        />
                      ))}
                    </span>
                  ) : isSilent ? (
                    <MicOff size={11} color="#666666" className="shrink-0" />
                  ) : null}
                </div>
                <div
                  className="text-[10px] truncate leading-tight"
                  style={{ color: "#C8860A", fontWeight: 600, letterSpacing: "0.04em" }}
                  data-testid={`voice-participant-tag-${p.identity}`}
                >
                  {roleTag}
                </div>
              </div>
              {isSelf && user && (
                <button
                  data-testid="voice-display-name-edit-tile"
                  onClick={openNameEdit}
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: "rgba(255,215,0,0.15)",
                    border: "1px solid #FFD700",
                    color: "#FFD700",
                    cursor: "pointer",
                  }}
                  title={t("voice_display_name_edit_title", "Görünen adını düzenle")}
                >
                  <Pencil size={12} />
                </button>
              )}
              {!isSelf && (
                <button
                  data-testid={`voice-local-mute-${p.identity}`}
                  onClick={() => toggleLocalMute(p)}
                  aria-pressed={locallyMuted}
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: locallyMuted ? "rgba(239,68,68,0.20)" : "transparent",
                    color: locallyMuted ? "#EF4444" : "#94A3B8",
                    border: `1px solid ${locallyMuted ? "#EF4444" : "rgba(255,255,255,0.15)"}`,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                  title={locallyMuted
                    ? t("voice_local_unmute_title", "Sesi tekrar aç (sadece senin için)")
                    : t("voice_local_mute_title", "Sesi kıs (sadece senin için)")}
                >
                  {locallyMuted ? "🔇" : "🔊"}
                </button>
              )}
              {!isSelf && isAdmin && (
                <TempMuteMenu identity={p.identity} roomId={roomId} t={t} />
              )}
              {!isSelf && isAdmin && (
                <button
                  data-testid={`voice-kick-${p.identity}`}
                  onClick={() => kickParticipant(p)}
                  title={t("voice_kick_title", "Bu kişiyi odadan at")}
                  className="text-[10px] font-bold px-2 py-1 rounded shrink-0"
                  style={{
                    background: "rgba(239,68,68,0.20)",
                    border: "1px solid #EF4444",
                    color: "#F87171",
                    cursor: "pointer",
                    letterSpacing: "0.06em",
                  }}
                >
                  {t("voice_kick_short", "AT")}
                </button>
              )}
            </div>
          );
        };

        const colsClass = gridCols === 3 ? "grid-cols-3" : "grid-cols-2";
        return (
          <div
            className={`grid ${colsClass} gap-2 mb-4`}
            data-testid="voice-members-grid"
          >
            {tracks.map(renderRow)}
            {tracks.length === 0 && (
              <div className="col-span-full text-[10px] italic py-4 text-center" style={{ color: "#64748B" }}>
                {t("voice_no_participants", "Henüz kimse yok")}
              </div>
            )}
          </div>
        );
      })()}

        </div>
      </div>

      {/* v143 — Fixed Bottom Bar (72px + safe-area) — gold hairline separator + deafen left + 54px gold mic + crimson AYRIL pill right */}
      <div
        data-testid="voice-bottom-bar"
        className="fixed left-0 right-0 bottom-0 flex items-center gap-3 px-4"
        style={{
          height: `calc(72px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "#08080F",
          borderTop: "1px solid rgba(255,215,0,0.35)",
          boxShadow: "0 -8px 24px rgba(255,215,0,0.06), 0 -1px 0 rgba(255,215,0,0.15)",
          zIndex: 1560,
        }}
      >
        <button
          data-testid="voice-deafen-toggle"
          onClick={() => setDeafenAll((v) => !v)}
          aria-pressed={deafenAll}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors"
          style={{
            background: deafenAll ? "rgba(239,68,68,0.20)" : "rgba(255,215,0,0.08)",
            border: `1px solid ${deafenAll ? "#EF4444" : "rgba(255,215,0,0.35)"}`,
            color: deafenAll ? "#EF4444" : "#C8860A",
            cursor: "pointer",
          }}
          title={deafenAll ? t("voice_undeafen_all", "Herkesin sesini aç") : t("voice_deafen_all", "Herkesi sustur")}
          aria-label={deafenAll ? t("voice_undeafen_all", "Herkesin sesini aç") : t("voice_deafen_all", "Herkesi sustur")}
        >
          {deafenAll ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        <div className="flex-1 flex items-center justify-center">
          {micMode === "continuous" ? (
            <button
              data-testid="voice-mute-btn"
              onClick={toggleMic}
              className="rounded-full flex items-center justify-center transition-all"
              style={{
                width: 54,
                height: 54,
                background: isMicrophoneEnabled
                  ? "linear-gradient(135deg, #FFD700 0%, #C8860A 100%)"
                  : "#EF4444",
                border: "none",
                cursor: "pointer",
                boxShadow: isMicrophoneEnabled
                  ? "0 0 24px rgba(255,215,0,0.60), 0 0 8px rgba(255,215,0,0.35)"
                  : "0 0 14px rgba(239,68,68,0.55)",
                color: "#FFFFFF",
              }}
              aria-label={isMicrophoneEnabled ? t("voice_mute", "Sustur") : t("voice_unmute", "Aç")}
              title={isMicrophoneEnabled ? t("voice_mute", "Sustur") : t("voice_unmute", "Aç")}
            >
              {isMicrophoneEnabled ? <Mic size={22} color="#08080F" /> : <MicOff size={22} color="#FFFFFF" />}
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
              title={t("voice_ptt_hint", "Basılı tut → konuş, bırak → kapat")}
              className="rounded-full flex items-center justify-center select-none transition-all"
              style={{
                width: 54,
                height: 54,
                background: pttHeld
                  ? "linear-gradient(135deg, #FFD700 0%, #C8860A 100%)"
                  : "#EF4444",
                border: "none",
                boxShadow: pttHeld
                  ? "0 0 32px rgba(255,215,0,0.75), 0 0 12px rgba(255,215,0,0.55)"
                  : "0 0 12px rgba(239,68,68,0.45)",
                userSelect: "none",
                touchAction: "none",
                cursor: pttHeld ? "grabbing" : "grab",
              }}
            >
              <Mic size={22} color={pttHeld ? "#08080F" : "#FFFFFF"} />
            </button>
          )}
        </div>

        <button
          data-testid="voice-leave-btn"
          onClick={onLeave}
          className="flex items-center gap-2 py-2 px-4 text-xs font-black uppercase shrink-0 rounded-full"
          style={{
            background: "linear-gradient(135deg, #8B0000 0%, #5A0000 100%)",
            border: "1px solid rgba(139,0,0,0.65)",
            color: "#FFFFFF",
            cursor: "pointer",
            letterSpacing: "0.14em",
            fontFamily: "'Rajdhani', system-ui, sans-serif",
            boxShadow: "0 4px 12px rgba(139,0,0,0.35)",
          }}
          aria-label={t("voice_leave", "Ayrıl")}
        >
          <LogOut size={14} /> {t("voice_leave", "Ayrıl")}
        </button>
      </div>

      {/* v143.2 — Kara liste modalı (admin) */}
      {blacklistOpen && (
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setBlacklistOpen(false)}
        >
          <div
            data-testid="voice-blacklist-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: "rgba(18,18,26,0.96)",
              border: "1px solid rgba(239,68,68,0.35)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(239,68,68,0.08) inset",
              maxHeight: "80vh",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(239,68,68,0.30)" }}
            >
              <h3
                className="text-sm font-black uppercase"
                style={{
                  color: "#F87171",
                  letterSpacing: "0.12em",
                  fontFamily: "'Rajdhani', system-ui, sans-serif",
                }}
              >
                🚫 {t("voice_blacklist_title", "Kara Liste")}
              </h3>
              <button
                onClick={() => setBlacklistOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer" }}
                aria-label={t("close", "Kapat")}
                data-testid="voice-blacklist-close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "#94A3B8" }}>
                {t(
                  "voice_blacklist_hint",
                  "Bu odadan atılanlar burada listelenir. Kara listedeki üye şifre veya davet ile bile odaya giremez. Silmek için ✕ butonuna bas."
                )}
              </p>
              <div
                className="overflow-y-auto rounded-lg"
                style={{ background: "rgba(8,8,15,0.55)", border: "1px solid rgba(255,255,255,0.05)", maxHeight: "50vh" }}
                data-testid="voice-blacklist-list"
              >
                {blacklistBusy ? (
                  <div className="text-[11px] italic text-center py-4" style={{ color: "#64748B" }}>
                    {t("loading", "Yükleniyor…")}
                  </div>
                ) : blacklistData.length === 0 && blacklistDevices.length === 0 ? (
                  <div className="text-[11px] italic text-center py-6" style={{ color: "#64748B" }}>
                    {t("voice_blacklist_empty", "Kara liste boş")}
                  </div>
                ) : (
                  <>
                  {blacklistData.map((b) => (
                    <div
                      key={b.user_id}
                      data-testid={`voice-blacklist-row-${b.user_id}`}
                      className="flex items-center gap-3 px-3 py-2.5"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                        style={{
                          background: "linear-gradient(135deg, #EF4444, #991B1B)",
                          color: "#FFF",
                        }}
                      >
                        {(b.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {b.username || b.user_id.slice(0, 8)}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: "#94A3B8" }}>
                          {b.reason
                            ? `${b.reason}`
                            : t("voice_blacklist_no_reason", "Sebep belirtilmedi")}
                          {b.banned_by_username && (
                            <span> · {t("voice_blacklist_by", "Atan")}: {b.banned_by_username}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromBlacklist(b.user_id)}
                        data-testid={`voice-blacklist-remove-${b.user_id}`}
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: "rgba(34,197,94,0.15)",
                          border: "1px solid #22C55E",
                          color: "#22C55E",
                          cursor: "pointer",
                        }}
                        title={t("voice_blacklist_remove_title", "Kara listeden çıkar")}
                        aria-label={t("voice_blacklist_remove_title", "Kara listeden çıkar")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {blacklistDevices.map((d) => (
                    <div
                      key={`dev-${d.device_id}`}
                      data-testid={`voice-blacklist-device-row-${d.device_id}`}
                      className="flex items-center gap-3 px-3 py-2.5"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                        style={{
                          background: "linear-gradient(135deg, #6B7280, #374151)",
                          color: "#FFF",
                        }}
                        title={t("voice_blacklist_guest_device", "Ziyaretçi cihazı")}
                      >
                        📱
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {d.guest_name || t("voice_blacklist_guest", "Ziyaretçi")}
                          <span className="text-[9px] font-normal ml-1" style={{ color: "#94A3B8" }}>
                            · {(d.device_id || "").slice(0, 10)}…
                          </span>
                        </div>
                        <div className="text-[10px] truncate" style={{ color: "#94A3B8" }}>
                          {d.reason
                            ? `${d.reason}`
                            : t("voice_blacklist_no_reason", "Sebep belirtilmedi")}
                          {d.banned_by_username && (
                            <span> · {t("voice_blacklist_by", "Atan")}: {d.banned_by_username}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeDeviceFromBlacklist(d.device_id)}
                        data-testid={`voice-blacklist-device-remove-${d.device_id}`}
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: "rgba(34,197,94,0.15)",
                          border: "1px solid #22C55E",
                          color: "#22C55E",
                          cursor: "pointer",
                        }}
                        title={t("voice_blacklist_remove_title", "Kara listeden çıkar")}
                        aria-label={t("voice_blacklist_remove_title", "Kara listeden çıkar")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => setBlacklistOpen(false)}
              data-testid="voice-blacklist-done"
              className="w-full py-3 text-xs font-black uppercase"
              style={{
                background: "rgba(239,68,68,0.10)",
                borderTop: "1px solid rgba(239,68,68,0.30)",
                border: "none",
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: "rgba(239,68,68,0.30)",
                color: "#F87171",
                cursor: "pointer",
                letterSpacing: "0.12em",
              }}
            >
              {t("close", "Kapat")}
            </button>
          </div>
        </div>
      )}

      {/* v141 — Kalıcı görünen ad düzenleme modalı */}
      {nameEditOpen && (
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/80 p-4"
          onClick={() => !nameSaving && setNameEditOpen(false)}
        >
          <div
            data-testid="voice-display-name-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl p-5"
            style={{ background: "#1E1410", border: "1px solid rgba(245,166,35,0.55)" }}
          >
            <h3 className="text-base font-bold mb-2" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
              ✍️ {t("voice_display_name_title", "Görünen Adını Düzenle")}
            </h3>
            <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "#94A3B8" }}>
              {t("voice_display_name_hint", "Bu ad tüm sistemde (ses odaları, sohbet, sıralama) görünecek. Kalıcı olarak güncellenir; sonraki katılımlarda geçerli olur.")}
            </p>
            <input
              data-testid="voice-display-name-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              maxLength={40}
              placeholder={user?.username || t("voice_display_name_placeholder", "Yeni görünen ad")}
              className="w-full bg-black/40 border border-amber-500/40 rounded px-3 py-2 text-sm text-white mb-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !nameSaving) { e.preventDefault(); submitNameEdit(); }
                if (e.key === "Escape" && !nameSaving) { setNameEditOpen(false); }
              }}
            />
            <div className="text-[10px] text-right mb-3" style={{ color: "#64748B" }}>
              {(nameDraft || "").length}/40
            </div>
            <div className="flex gap-2">
              <button
                data-testid="voice-display-name-save"
                onClick={submitNameEdit}
                disabled={nameSaving}
                className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest"
                style={{
                  background: "linear-gradient(135deg, #F5A623, #E74C1A)",
                  color: "#0B0704",
                  border: "none",
                  cursor: nameSaving ? "not-allowed" : "pointer",
                  opacity: nameSaving ? 0.6 : 1,
                }}
              >
                {nameSaving ? t("saving", "Kaydediliyor…") : t("save", "Kaydet")}
              </button>
              <button
                onClick={() => setNameEditOpen(false)}
                disabled={nameSaving}
                className="chip text-xs"
                style={{ borderColor: "rgba(148,163,184,0.5)", color: "#E5E7EB" }}
              >
                {t("cancel", "İptal")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
