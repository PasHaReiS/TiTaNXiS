// v136 — Ses odası davet linki landing.
// URL: /ses/:roomName?token=XXXX
// Backend /api/voice/token'a `{room_name, invite_token}` gönderir, LiveKit
// token'ı alır ve doğrudan `<LiveKitRoom>` ile odaya bağlanır. Şifre gerekmez;
// token backend'de tek kullanımlık olarak işaretlenir.
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { LiveKitRoom, RoomAudioRenderer, StartAudio } from "@livekit/components-react";
import "@livekit/components-styles";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { Mic, LogOut, Loader2, Lock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SesInvite() {
  const { t } = useTranslation();
  const { roomName } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const { user } = useAuth() || {};

  const [state, setState] = useState("checking"); // checking | joining | connected | error
  const [errMsg, setErrMsg] = useState("");
  const [lkToken, setLkToken] = useState("");
  const [lkUrl, setLkUrl] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);

  const decodedName = decodeURIComponent(roomName || "");

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrMsg(t("ses_invite_no_token", "Davet token'ı bulunamadı."));
      return;
    }
    // Giriş yapmış kullanıcılar için doğrudan devam et
    if (user) {
      joinNow("");
    } else {
      setState("guest_name");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  const joinNow = useCallback(async (gname) => {
    setBusy(true);
    setState("joining");
    try {
      const body = { room_name: decodedName, invite_token: token };
      if (gname && !user) body.guest_name = gname;
      const r = await api.post("/voice/token", body);
      setLkToken(r.data.token);
      setLkUrl(r.data.url);
      setState("connected");
    } catch (e) {
      const msg = apiErr(e) || (e?.message || "Bilinmeyen hata");
      setErrMsg(msg);
      setState("error");
    } finally {
      setBusy(false);
    }
  }, [decodedName, token, user]);

  if (state === "checking" || state === "joining") {
    return (
      <div data-testid="ses-invite-loading" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#F5A623" }} />
        <div className="text-white text-sm">{t("ses_invite_joining", "Odaya bağlanılıyor…")}</div>
        <div className="text-white/50 text-xs">{decodedName}</div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div data-testid="ses-invite-error" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6">
        <Lock className="w-8 h-8" style={{ color: "#EF4444" }} />
        <div className="text-white text-lg font-bold">{t("ses_invite_failed", "Davete erişilemedi")}</div>
        <div className="text-white/60 text-sm text-center max-w-md">{errMsg}</div>
        <button
          data-testid="ses-invite-back"
          onClick={() => nav("/sesli-kanallar")}
          className="chip text-[11px] mt-2"
          style={{ background: "linear-gradient(135deg,#F5A623,#E74C1A)", color: "#0B0704", fontWeight: 800 }}
        >
          {t("ses_invite_back", "Sesli Kanallara Dön")}
        </button>
      </div>
    );
  }
  if (state === "guest_name") {
    return (
      <div data-testid="ses-invite-guest" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6">
        <Mic className="w-8 h-8" style={{ color: "#F5A623" }} />
        <div className="text-white text-lg font-bold">{t("ses_invite_guest_title", "Ses Odasına Katıl")}</div>
        <div className="text-white/60 text-sm">{decodedName}</div>
        <input
          data-testid="ses-invite-guest-name"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder={t("ses_invite_guest_name_ph", "Görünen adın (opsiyonel)")}
          className="mt-2 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white"
        />
        <button
          data-testid="ses-invite-join-btn"
          onClick={() => joinNow(guestName)}
          disabled={busy}
          className="chip text-xs mt-2 flex items-center gap-1.5"
          style={{
            background: "linear-gradient(135deg,#F5A623,#E74C1A)",
            color: "#0B0704", fontWeight: 800, opacity: busy ? 0.5 : 1,
          }}
        >
          <Mic className="w-4 h-4" />
          {t("ses_invite_join", "Odaya Katıl")}
        </button>
      </div>
    );
  }
  // connected
  return (
    <LiveKitRoom
      token={lkToken}
      serverUrl={lkUrl}
      connect
      audio
      video={false}
      onDisconnected={() => nav("/sesli-kanallar")}
      className="min-h-[60vh]"
      data-testid="ses-invite-livekit"
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6">
        <CheckCircle2 className="w-8 h-8" style={{ color: "#22C55E" }} />
        <div className="text-white text-lg font-bold">
          {t("ses_invite_connected", "Bağlandın: {{room}}", { room: decodedName })}
        </div>
        <StartAudio label={t("ses_invite_start_audio", "Sesi başlat")} />
        <button
          data-testid="ses-invite-leave"
          onClick={() => nav("/sesli-kanallar")}
          className="chip text-[11px] flex items-center gap-1"
          style={{ borderColor: "#EF4444", color: "#F87171" }}
        >
          <LogOut className="w-3 h-3" /> {t("ses_invite_leave", "Ayrıl")}
        </button>
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
