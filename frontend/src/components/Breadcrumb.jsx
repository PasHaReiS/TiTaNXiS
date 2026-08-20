import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Route path → visible name (uppercase, TR)
const ROUTE_LABELS = {
  "/": "SIRALAMA",
  "/anasayfa": "ANASAYFA",
  "/komutanlar": "LOJ HAKKINDA",
  "/puanlar": "PUANLAR",
  "/puan-ekle": "PUAN EKLE",
  "/puanlar-hakkinda": "PUANLAR HAKKINDA",
  "/puan-hesaplama": "PUAN HESAPLA",
  "/uyeler": "ÜYELER",
  "/etkinlikler": "ETKİNLİKLER",
  "/duyurular": "DUYURULAR",
  "/kullanicilar": "KULLANICILAR",
  "/profil": "PROFİL",
  "/gosterge-paneli": "GÖSTERGE PANELİ",
  "/vip-destek": "VIP DESTEK",
  "/dashboard": "DASHBOARD",
  "/etkinlik-bildirimleri": "ETKİNLİK BİLDİRİMLERİ",
  "/ocr/history": "OCR GEÇMİŞİ",
  "/ittifaklar": "İTTİFAKLAR",
  "/raporlar": "RAPORLAR",
  "/anketler": "ANKETLER",
  "/svs": "SvS TAKİPÇİSİ",
};

export default function Breadcrumb() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  // Hide on login page and on the anasayfa itself (home doesn't crumb to itself)
  if (path === "/login" || path === "/anasayfa") return null;

  const currentLabel =
    ROUTE_LABELS[path] ||
    (path.startsWith("/kayit/") ? "KAYIT" : path.replace(/^\//, "").toUpperCase());

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
        🏠 Anasayfa
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
        }}
      >
        {currentLabel}
      </span>
    </nav>
  );
}
