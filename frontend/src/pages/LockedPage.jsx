import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, LogIn } from "lucide-react";

// v136 — Ziyaretçi (guest) modu için kilit ekranı. RequireAuth / RequireAdmin
// wrapper'ları giriş yapmamış ama misafir olarak devam eden kullanıcıları
// buraya düşürüyor. Tüm metinler useTranslation ile 29 dile çevrilebiliyor.
export default function LockedPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { t } = useTranslation();
  return (
    <div
      className="min-h-[calc(100vh-120px)] flex items-center justify-center p-6"
      data-testid="locked-page"
    >
      <div
        className="max-w-md w-full text-center p-8 rounded-2xl"
        style={{
          background: "rgba(245,166,35,0.06)",
          border: "1px solid rgba(245,166,35,0.35)",
          boxShadow: "0 0 40px rgba(245,166,35,0.15)",
        }}
      >
        <div
          className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(245,166,35,0.15)",
            border: "1.5px solid rgba(245,166,35,0.55)",
            boxShadow: "0 0 24px rgba(245,166,35,0.35)",
          }}
          data-testid="locked-page-icon"
        >
          <Lock className="w-9 h-9" style={{ color: "#F5A623" }} />
        </div>
        <h1
          className="text-xl font-black mb-3"
          style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.06em" }}
          data-testid="locked-page-title"
        >
          {t("locked_page_title", "Bu Sayfa Kilitli")}
        </h1>
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: "#D1B892" }}
          data-testid="locked-page-message"
        >
          {t("locked_page_message", "Bu sayfayı görüntülemek için giriş yapmalısınız")}
        </p>
        <button
          type="button"
          onClick={() => nav("/login", { state: { from: loc } })}
          data-testid="locked-page-login-btn"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold uppercase tracking-widest"
          style={{
            background: "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)",
            color: "#0a0a0a",
            fontFamily: "Cinzel, serif",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 0 20px rgba(245,166,35,0.4)",
          }}
        >
          <LogIn className="w-4 h-4" />
          {t("locked_page_login_btn", "Giriş Yap")}
        </button>
      </div>
    </div>
  );
}
