import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import useDraggableFab from "@/hooks/useDraggableFab";

/**
 * v138.5 — Yüzen Lonca Sohbeti butonu.
 *
 *   • Yalnızca giriş yapmış üyelere gösterilir (guest & anonim gizli).
 *   • Sürüklenebilir — konum `fab_pos_chat` anahtarıyla localStorage'da.
 *   • Tıklandığında `/sohbet` sayfasına yönlendirir.
 *   • Amber/altın TiTaNXiS temasıyla uyumlu.
 */
export default function ChatFab() {
  const { user } = useAuth() || {};
  const { t } = useTranslation();
  const nav = useNavigate();
  const { pos, hasDragged, dragProps } = useDraggableFab({
    storageKey: "chat",
    defaultPos: { top: 120, right: 16 },
    size: 48,
  });

  if (!user) return null; // Ziyaretçi / anonim → gizli

  const handleClick = () => {
    if (hasDragged) return; // Sürükleme sonrası tıklamayı yut
    nav("/sohbet");
  };

  return (
    <button
      type="button"
      data-testid="chat-fab-btn"
      title={t("chat_fab_title", "Lonca Sohbeti")}
      aria-label={t("chat_fab_title", "Lonca Sohbeti")}
      onClick={handleClick}
      {...dragProps}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: 48,
        height: 48,
        borderRadius: "50%",
        background:
          "linear-gradient(135deg, #F5A623 0%, #D4730A 55%, #E74C1A 100%)",
        border: "1.5px solid rgba(245,166,35,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow:
          "0 6px 18px rgba(231,76,26,0.55), 0 0 22px rgba(245,166,35,0.35)",
        zIndex: 9001,
        cursor: "grab",
        touchAction: "none",
        transition: "transform 0.18s ease, box-shadow 0.22s ease",
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
      onMouseOut={(e) => (e.currentTarget.style.transform = "")}
    >
      <MessageCircle size={22} color="#0B0704" strokeWidth={2.5} />
    </button>
  );
}
