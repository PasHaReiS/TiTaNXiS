import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";

/**
 * v119 — App-wide cookie consent banner.
 * Renders at the very bottom of the viewport (fixed) on first visit.
 * Once the user clicks "Kabul Et", the choice is persisted in localStorage
 * under `ol_cookie_ack` so the banner never reappears on that device.
 */
const STORAGE_KEY = "ol_cookie_ack";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch (_e) {
      // localStorage blocked (private mode / SSR) → still show once per session.
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
        bottom: 12,
        zIndex: 9997, // below modals (9998+), above RadialMenu overlays
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
        Bu site deneyimi iyileştirmek için çerez kullanır. Devam ederek çerez kullanımını kabul
        etmiş olursunuz.{" "}
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
          Gizlilik Politikası
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
        Kabul Et
      </button>
      <button
        type="button"
        onClick={accept}
        data-testid="cookie-banner-close"
        aria-label="Kapat"
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
