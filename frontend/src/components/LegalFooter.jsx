import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Fixed legal footer — screen'in en altında sabit görünen 3 legal link.
 * z-index 1500 ile RadialMenu (1000) + Toaster (~999) üstünde kalır ama
 * modal dialoglar (9999+) altında. Her sayfada AppShell içinden render
 * edilir. Kullanıcı isteğiyle bottom:0 fixed, koyu taş arka plan, amber
 * ayırıcı ve ortalanmış link seti.
 */
export default function LegalFooter() {
  const { t } = useTranslation();
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
        boxShadow: "0 -4px 12px rgba(0,0,0,0.6)",
        pointerEvents: "auto",
      }}
    >
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
