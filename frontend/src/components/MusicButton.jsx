import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mic } from "lucide-react";
import useDraggableFab from "@/hooks/useDraggableFab";
import { useAuth } from "@/context/AuthContext";

/**
 * v138.9 — Yüzen "Sesli Kanallar" butonu. Eskiden fon müziği aç/kapat idi;
 * artık `/sesli-kanallar` sayfasına yönlendiriyor. Sürüklenebilir (mobil +
 * masaüstü, `fab_pos_music` localStorage). Yalnızca giriş yapmış kullanıcı
 * (ziyaretçi giremediği için).
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
    </button>
  );
}
