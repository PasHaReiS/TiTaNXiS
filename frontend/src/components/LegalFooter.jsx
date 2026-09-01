import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Fixed legal footer — screen'in en altında sabit 30px yükseklik bar.
 * z-index 1500 (RadialMenu 1600 üstte kalır, modallar 9998+ hâlâ üstte).
 * v135.7 — Yumuşak gradient fade: üstte 18px'lik amber-siyah geçiş +
 * dış box-shadow ile "haleli" görünüm.
 * v140.17 — `/tanitim` landing sayfasında gizlenir (tek-ekran layout için).
 */
export default function LegalFooter() {
  const { t } = useTranslation();
  const loc = useLocation();
  if (loc.pathname === "/tanitim") return null;
  return (
    <div
      data-testid="legal-footer"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 30,
        background: "rgba(15, 8, 6, 0.92)",
        borderTop: "1px solid rgba(245,166,35,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        zIndex: 1500,
        fontSize: 10,
        letterSpacing: "0.03em",
        color: "rgba(245, 240, 232, 0.72)",
        fontFamily: "'Inter', system-ui, sans-serif",
        boxShadow: "0 -18px 26px -18px rgba(245,166,35,0.55), 0 -4px 12px rgba(0,0,0,0.6)",
        pointerEvents: "auto",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -18,
          left: 0,
          right: 0,
          height: 18,
          pointerEvents: "none",
          background: "linear-gradient(to bottom, rgba(15,8,6,0) 0%, rgba(15,8,6,0.55) 60%, rgba(15,8,6,0.92) 100%)",
        }}
      />
      <Link
        to="/privacy"
        data-testid="legal-footer-privacy"
        style={{ color: "#F5A623", textDecoration: "none", transition: "color 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#FFD680")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#F5A623")}
      >
        {t("legal_privacy", "Gizlilik Politikası")}
      </Link>
      <span style={{ color: "rgba(245,166,35,0.5)" }} aria-hidden>|</span>
      <Link
        to="/terms"
        data-testid="legal-footer-terms"
        style={{ color: "#F5A623", textDecoration: "none", transition: "color 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#FFD680")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#F5A623")}
      >
        {t("legal_terms", "Kullanım Koşulları")}
      </Link>
      <span style={{ color: "rgba(245,166,35,0.5)" }} aria-hidden>|</span>
      <Link
        to="/aydinlatma-metni"
        data-testid="legal-footer-kvkk"
        style={{ color: "#F5A623", textDecoration: "none", transition: "color 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#FFD680")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#F5A623")}
      >
        {t("legal_kvkk", "Aydınlatma Metni")}
      </Link>
    </div>
  );
}
