import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mic } from "lucide-react";
import useDraggableFab from "@/hooks/useDraggableFab";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

/**
 * v140.5 — Yüzen "Sesli Kanallar" butonu. `/sesli-kanallar`'a götürür.
 * Sürüklenebilir (mobil + masaüstü, `fab_pos_music` localStorage).
 * Yalnızca giriş yapmış kullanıcı görür.
 *
 * v140.5 eklendi: Canlı "🔴 N" aktif katılımcı rozeti. `/api/voice/active-count`
 * her 20 sn'de polling yapılır; sayı > 0 iken pulsing red badge gösterilir.
 * Sekme arka plandayken polling durdurulur (Page Visibility API).
 */
export default function MusicButton() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth() || {};
  const { pos, hasDragged, dragProps } = useDraggableFab({
    storageKey: "music",
    defaultPos: { top: 70, right: 16 },
    size: 40,
  });
  const [activeCount, setActiveCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const r = await api.get("/voice/active-count");
        if (!cancelled) setActiveCount(Number(r.data?.total || 0));
      } catch {
        // sessiz düş — rozeti gizli tut
        if (!cancelled) setActiveCount(0);
      }
    };
    const start = () => {
      fetchCount();
      timerRef.current = setInterval(fetchCount, 20000);
    };
    const stop = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") { if (!timerRef.current) start(); }
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  if (!user) return null;

  const handleClick = () => {
    if (hasDragged) return;
    nav("/sesli-kanallar");
  };

  return (
    <button
      onClick={handleClick}
      {...dragProps}
      data-testid="floating-voice-btn"
      title={t("voice_rooms_title", "Sesli Kanallar")}
      aria-label={t("voice_rooms_title", "Sesli Kanallar")}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #C0392B 0%, #E74C1A 100%)",
        border: "1.5px solid rgba(245,166,35,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow:
          "0 4px 14px rgba(231,76,26,0.55), 0 0 18px rgba(245,166,35,0.30)",
        zIndex: 9000,
        cursor: "grab",
        touchAction: "none",
        transition: "transform 0.18s ease, box-shadow 0.22s ease",
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
      onMouseOut={(e) => (e.currentTarget.style.transform = "")}
    >
      <Mic size={18} color="#fff" strokeWidth={2.5} />
      {activeCount > 0 && (
        <span
          data-testid="voice-active-badge"
          aria-label={t("voice_active_badge_label", "{{count}} kişi konuşuyor", { count: activeCount })}
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: "#EF4444",
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #0a0a0a",
            boxShadow: "0 0 10px rgba(239,68,68,0.85)",
            animation: "titanxisVoicePulse 1.4s ease-in-out infinite",
            lineHeight: 1,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <span style={{ marginRight: 2 }}>🔴</span>
          {activeCount}
        </span>
      )}
      <style>{`
        @keyframes titanxisVoicePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(239,68,68,0.85); }
          50% { transform: scale(1.12); box-shadow: 0 0 16px rgba(239,68,68,1); }
        }
      `}</style>
    </button>
  );
}
