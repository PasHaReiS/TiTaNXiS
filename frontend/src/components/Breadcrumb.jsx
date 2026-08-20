import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Route path → i18n key (falls back to hardcoded label if missing)
const ROUTE_KEYS = {
  "/": "nav_leaderboard",
  "/anasayfa": "breadcrumb_home",
  "/komutanlar": "nav_commanders",
  "/puanlar": "nav_points",
  "/puan-ekle": "nav_add_points",
  "/puanlar-hakkinda": "nav_points_about",
  "/puan-hesaplama": "nav_point_calc",
  "/uyeler": "nav_members",
  "/etkinlikler": "nav_events",
  "/duyurular": "nav_announcements",
  "/kullanicilar": "user_mgmt",
  "/profil": "my_profile",
  "/gosterge-paneli": "live_dashboard",
  "/vip-destek": "nav_vip_support",
  "/dashboard": "nav_dashboard",
  "/etkinlik-bildirimleri": "nav_notifications_hub",
  "/ocr/history": "nav_ocr_history",
  "/ittifaklar": "alliances_title",
  "/raporlar": "nav_reports",
  "/anketler": "polls_title",
  "/svs": "svs_title",
};

export default function Breadcrumb() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const path = location.pathname;

  // Hide entirely on login and on the anasayfa itself
  if (path === "/login" || path === "/anasayfa") return null;

  const key = ROUTE_KEYS[path];
  const currentLabel = key ? t(key) : (path.startsWith("/kayit/") ? "KAYIT" : path.replace(/^\//, ""));

  return (
    <nav
      data-testid="breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "Cinzel, serif",
      }}
    >
      <button
        type="button"
        onClick={() => navigate("/anasayfa")}
        data-testid="breadcrumb-home"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#F5A623",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          textShadow: "0 0 6px rgba(245,166,35,0.5), 0 1px 3px rgba(0,0,0,0.8)",
        }}
      >
        🏠 {t("breadcrumb_home")}
      </button>
      <span style={{ color: "#666", fontSize: 12 }}>/</span>
      <span
        data-testid="breadcrumb-current"
        style={{
          color: "#F5F0E8",
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          flex: 1,
        }}
      >
        {String(currentLabel).toUpperCase()}
      </span>
      <div style={{ marginLeft: "auto" }} data-testid="breadcrumb-lang">
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
