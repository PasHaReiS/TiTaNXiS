import React from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";

/**
 * v138.5 — Lonca sohbeti placeholder. FAB tıklandığında bu sayfa açılır.
 * Gerçek chat implementasyonu (websocket + backend) sonraki iterasyonda.
 */
export default function GuildChat() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="guild-chat-page"
      className="max-w-3xl mx-auto p-6 mt-6"
    >
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background:
            "linear-gradient(180deg, rgba(245,166,35,0.10) 0%, rgba(15,10,20,0.65) 100%)",
          border: "1px solid rgba(245,166,35,0.35)",
          boxShadow: "0 0 40px rgba(245,166,35,0.15)",
        }}
      >
        <div
          className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(245,166,35,0.15)",
            border: "1.5px solid rgba(245,166,35,0.55)",
          }}
        >
          <MessageCircle size={38} color="#F5A623" strokeWidth={2} />
        </div>
        <h1
          className="text-2xl font-black mb-3"
          style={{
            color: "#F5F0E8",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
          }}
          data-testid="guild-chat-title"
        >
          {t("guild_chat_title", "Lonca Sohbeti")}
        </h1>
        <p
          className="text-sm mb-2"
          style={{ color: "#D1B892" }}
          data-testid="guild-chat-subtitle"
        >
          {t("guild_chat_subtitle", "Tüm lonca üyelerinin sohbet alanı")}
        </p>
        <p className="text-xs opacity-70" style={{ color: "#94A3B8" }}>
          {t("guild_chat_coming_soon", "Bu özellik yakında etkinleşecek. Şu anda etkinlik-bazlı sohbetler her etkinlik detayında mevcut.")}
        </p>
      </div>
    </div>
  );
}
