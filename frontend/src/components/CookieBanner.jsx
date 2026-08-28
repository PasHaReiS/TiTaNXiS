import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Cookie, X } from "lucide-react";

/**
 * v119 — App-wide cookie consent banner.
 * v135.4 — All UI strings routed through i18n `t()` so the banner renders in
 * the user's chosen language across all 29 supported locales. Turkish
 * fallback baked into every `t()` call for graceful degradation.
 */
const STORAGE_KEY = "ol_cookie_ack";

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch (_e) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch (_e) {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      data-testid="cookie-banner"
      role="dialog"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 42, // v135.4 — sit above the 30px fixed LegalFooter (+12 gap)
        zIndex: 9997,
        background: "linear-gradient(180deg, rgba(18,12,22,0.96) 0%, rgba(10,6,4,0.98) 100%)",
        border: "1px solid rgba(245,166,35,0.55)",
        borderRadius: 12,
        boxShadow:
          "0 12px 32px -8px rgba(0,0,0,0.85), 0 0 24px rgba(245,166,35,0.20), inset 0 1px 0 rgba(255,220,150,0.10)",
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        color: "#F5F0E8",
        fontFamily: "Rajdhani, sans-serif",
      }}
    >
      <Cookie
        className="w-5 h-5 flex-shrink-0"
        style={{ color: "#F5A623", filter: "drop-shadow(0 0 6px rgba(245,166,35,0.55))" }}
        aria-hidden="true"
      />
      <div
        style={{
          flex: 1,
          minWidth: 200,
          fontSize: 12,
          lineHeight: 1.45,
          color: "#EAD8B0",
        }}
        data-testid="cookie-banner-text"
      >
        {t("cookie_banner_text", "Bu site deneyimi iyileştirmek için çerez kullanır. Devam ederek çerez kullanımını kabul etmiş olursunuz.")}{" "}
        <Link
          to="/privacy"
          data-testid="cookie-banner-privacy-link"
          style={{
            color: "#F5A623",
            textDecoration: "none",
            borderBottom: "1px dotted rgba(245,166,35,0.55)",
            paddingBottom: 1,
            fontWeight: 700,
          }}
        >
          {t("legal_privacy", "Gizlilik Politikası")}
        </Link>
      </div>
      <button
        type="button"
        onClick={accept}
        data-testid="cookie-banner-accept"
        style={{
          padding: "8px 18px",
          borderRadius: 8,
          border: "none",
          background: "linear-gradient(135deg, #F5A623 0%, #D4730A 60%, #E74C1A 100%)",
          color: "#0a0a0a",
          fontFamily: "Cinzel, serif",
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.55), 0 0 12px rgba(245,166,35,0.35)",
          whiteSpace: "nowrap",
        }}
      >
        {t("cookie_banner_accept", "Kabul Et")}
      </button>
      <button
        type="button"
        onClick={accept}
        data-testid="cookie-banner-close"
        aria-label={t("cookie_banner_close", "Kapat")}
        style={{
          padding: 4,
          borderRadius: 6,
          background: "transparent",
          border: "1px solid rgba(245,166,35,0.25)",
          color: "rgba(245,166,35,0.75)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
