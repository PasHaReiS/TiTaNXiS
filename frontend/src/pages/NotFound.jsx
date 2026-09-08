import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Shield } from "lucide-react";

// v141 — TiTaNXiS temalı 404. Kırık kalkan + amber tema.
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      data-testid="not-found-page"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(245,158,11,0.12) 0%, #0a0705 55%, #050302 100%)",
      }}
    >
      <div className="max-w-lg text-center">
        <div
          className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-6"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.35)",
            boxShadow: "0 0 40px rgba(245,158,11,0.25)",
          }}
        >
          <Shield className="w-12 h-12" style={{ color: "#F59E0B", transform: "rotate(-15deg)" }} strokeWidth={1.5} />
        </div>
        <div
          className="text-7xl font-bold mb-2"
          style={{
            fontFamily: "Cinzel, serif",
            background: "linear-gradient(180deg,#F5A623,#7C2D12)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.1em",
          }}
        >
          404
        </div>
        <h1
          className="text-2xl font-bold uppercase tracking-widest mb-3"
          style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}
        >
          {t("err_404_title", { defaultValue: "Sayfa Bulunamadı" })}
        </h1>
        <p className="text-sm mb-8 opacity-70 max-w-sm mx-auto leading-relaxed" style={{ color: "#F5F0E8" }}>
          {t("err_404_desc", { defaultValue: "Aradığın kale henüz haritada yok ya da düşmüş olabilir. Ana kampa geri dön." })}
        </p>
        <Link
          to="/"
          data-testid="err-404-home-btn"
          className="inline-flex items-center gap-2 h-11 px-6 rounded-lg font-bold uppercase tracking-widest text-sm"
          style={{
            background: "linear-gradient(135deg,#D4730A,#E74C1A)",
            color: "#0B0704",
            boxShadow: "0 8px 24px rgba(231,76,26,0.35)",
            fontFamily: "Cinzel, serif",
          }}
        >
          <Home className="w-4 h-4" />
          {t("err_home_btn", { defaultValue: "Ana Sayfa" })}
        </Link>
      </div>
    </div>
  );
}
