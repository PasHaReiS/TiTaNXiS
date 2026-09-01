import React from "react";
import { useTranslation } from "react-i18next";
import "./Tanitim.css";

/**
 * Public landing page — `/tanitim` (v140.20 — image-only).
 *
 * Kullanıcı raporu: sayfada içerik iki kez render ediliyordu — hero görselinin
 * içine gömülü (logo, başlık, kartlar, "UYGULAMAYA GİR", titanxis.com) tüm
 * elementler + hemen altında native React versiyonu (H1/subtitle/kartlar/CTA).
 * v140.20 tüm React duplikatlarını sildi; sadece promo hero görseli kaldı.
 *
 * Root: `<a href=titanxis.com target=_blank>` — tüm sayfa tek tıkla uygulama
 * penceresi açar. `.tanitim-root` CSS class'ı defensive `body:has(...)` rule
 * setiyle her türlü global bottom nav / FAB / footer'ı gizler (Tanitim.css).
 * `100vh + overflow:hidden` → mobil scroll yok.
 */

const HERO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/389b9cb896e2412ca2fcd45b85b403cd_titanxis_tanitim.png";

const APP_URL = "https://titanxis.com";

export default function Tanitim() {
  const { t } = useTranslation();

  return (
    <a
      data-testid="tanitim-page"
      className="tanitim-root"
      href={APP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("tanitim_cta", "UYGULAMAYA GİR")}
      style={{
        height: "100vh",
        minHeight: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        background:
          "radial-gradient(1400px 700px at 50% -10%, rgba(255,140,0,0.14), transparent 60%), #0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        boxSizing: "border-box",
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <div
        data-testid="tanitim-cta-btn"
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(255,140,0,0.35)",
          boxShadow:
            "0 0 50px rgba(255,140,0,0.22), 0 14px 32px rgba(0,0,0,0.55)",
          background: "#0f0f0f",
          display: "flex",
        }}
      >
        <img
          data-testid="tanitim-hero-image"
          src={HERO_URL}
          alt={t("tanitim_hero_alt", "TiTaNXiS Lonca Yönetim Uygulaması")}
          loading="eager"
          fetchpriority="high"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>
    </a>
  );
}
