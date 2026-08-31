import React, { useState, useCallback } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mic, MicOff, LogOut, Users, Plus, Lock, Globe, Trash2 } from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
  StartAudio,
} from "@livekit/components-react";
import { Track } from "livekit-client";
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
    try {
      const res = await api.post("/voice/token", { room_id: room.id });
      setActive({ ...res.data, roomDoc: room });
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  }, []);

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
        <ActiveRoomUI roomName={active.roomDoc.name} onLeave={leave} />
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
          {room.is_private ? <Lock size={14} color="#F5A623" /> : <Globe size={14} color="#94A3B8" />}
          <span className="font-bold text-sm truncate" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>{room.name}</span>
        </div>
        {isAdmin && room.created_by !== "system" && (
          <button data-testid={`voice-room-delete-${room.id}`} onClick={doDelete} className="opacity-60 hover:opacity-100">
            <Trash2 size={14} color="#EF4444" />
          </button>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
        {room.is_private ? t("voice_room_private", "🔒 Davetli") : t("voice_room_public", "🌐 Herkese Açık")}
      </div>
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

function CreateRoomButton({ onCreated }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [invitedIds, setInvitedIds] = useState("");
  const { data: members = [] } = useSWR(open ? "/members" : null, fetcher);
  const submit = async () => {
    try {
      await api.post("/voice/rooms", {
        name: name.trim(),
        is_private: isPrivate,
        invited_user_ids: isPrivate ? invitedIds.split(",").map((s) => s.trim()).filter(Boolean) : [],
      });
      toast.success(t("voice_room_created", "Oda oluşturuldu"));
      setOpen(false); setName(""); setInvitedIds(""); setIsPrivate(false);
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80" onClick={() => setOpen(false)}>
          <div
            data-testid="voice-room-new-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl p-5"
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
            <label className="flex items-center gap-2 text-sm mb-3" style={{ color: "#E5E7EB" }}>
              <input
                data-testid="voice-room-private-toggle"
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              {t("voice_room_private_label", "Sadece davetli üyeler girebilsin")}
            </label>
            {isPrivate && (
              <div className="mb-3">
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
                  {t("voice_room_invited", "Davetli User ID'leri (virgülle ayır)")}
                </label>
                <textarea
                  data-testid="voice-room-invited-input"
                  value={invitedIds}
                  onChange={(e) => setInvitedIds(e.target.value)}
                  placeholder="uid-1, uid-2"
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white h-20"
                />
                <div className="text-[9px] mt-1 opacity-60" style={{ color: "#94A3B8" }}>
                  {t("voice_room_invited_hint", "Toplam üye:")} {members.length}
                </div>
              </div>
            )}
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

function ActiveRoomUI({ roomName, onLeave }) {
  const { t } = useTranslation();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: true }]);
  const toggleMic = () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  return (
    <div className="max-w-3xl mx-auto p-6" data-testid="voice-active-room">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-black" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
          🎙️ {roomName}
        </h2>
        <span className="chip text-xs flex items-center gap-1" style={{ borderColor: "#22C55E", color: "#22C55E" }}>
          <Users size={12} /> {participants.length}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {tracks.map((tr, idx) => {
          const p = tr.participant;
          const speaking = p.isSpeaking;
          const muted = !p.isMicrophoneEnabled;
          return (
            <div
              key={p.identity + idx}
              data-testid={`voice-participant-${p.identity}`}
              className="rounded-xl p-4 flex flex-col items-center gap-2"
              style={{
                background: "rgba(15,10,20,0.65)",
                border: `2px solid ${speaking ? "#22C55E" : "rgba(255,255,255,0.08)"}`,
                boxShadow: speaking ? "0 0 20px rgba(34,197,94,0.55)" : "none",
                transition: "all 0.22s ease",
              }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black"
                style={{
                  background: "linear-gradient(135deg, #F5A623, #E74C1A)",
                  color: "#0B0704",
                }}
              >
                {(p.name || p.identity).charAt(0).toUpperCase()}
              </div>
              <span className="text-xs truncate max-w-full" style={{ color: "#F5F0E8" }}>
                {p.name || p.identity}
              </span>
              {muted && <MicOff size={12} color="#EF4444" />}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 justify-center">
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
        <button
          data-testid="voice-leave-btn"
          onClick={onLeave}
          className="chip text-sm flex items-center gap-2 px-4 py-2"
          style={{ borderColor: "#EF4444", color: "#EF4444", background: "rgba(239,68,68,0.10)" }}
        >
          <LogOut size={16} /> {t("voice_leave", "Ayrıl")}
        </button>
      </div>
    </div>
  );
}
