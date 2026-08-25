import React from "react";
import { Link } from "react-router-dom";
import MusicButton from "@/components/MusicButton";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import RadialMenu from "@/components/RadialMenu";
import CookieBanner from "@/components/CookieBanner";

/**
 * Layout emits TWO siblings that are DIRECT children of `.app-shell`
 * (which is `display:flex; flex-direction:column; height:100dvh; overflow:hidden`):
 *
 *   1. `#titanxis-header-slot` — `flexShrink:0` container. `<Header>` uses
 *      React portal to render its whole block INTO this slot, so the header
 *      is a real flex child (not a sticky descendant). Immune to mobile
 *      Safari's sticky+transform bugs, no positioned-ancestor traps.
 *   2. `#titanxis-scroll` — `flex:1; overflowY:auto`. Sole scroll container
 *      for page content.
 *
 * MusicButton / PwaInstallPrompt live inside the scroll container so they
 * scroll with the page — they are floating overlays anyway.
 */
export default function Layout({ children }) {
  return (
    <>
      <div
        id="titanxis-header-slot"
        data-testid="titanxis-header-slot"
        className="titanxis-floating-header"
        style={{
          flexShrink: 0,
          position: "relative",
          zIndex: 100,
          // v59 — "Elite Cockpit" Floating Glass Header. The slot is now a
          // detached, semi-transparent charcoal panel with rounded corners
          // and a violet→gold neon hairline running along the bottom edge.
          // A small top/side margin lifts it off the viewport edges so it
          // reads as a floating command bar rather than a page-attached
          // slab.
          margin: "8px 10px 0 10px",
          background: "linear-gradient(180deg, rgba(18,12,22,0.82) 0%, rgba(14,10,18,0.86) 100%)",
          borderRadius: 14,
          border: "1px solid rgba(147,51,234,0.32)",
          boxShadow:
            "0 8px 26px -8px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,175,55,0.10) inset, 0 1px 0 rgba(255,220,150,0.10) inset",
        }}
      />
      <div
        id="titanxis-scroll"
        data-testid="layout-scroll-container"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
          WebkitOverflowScrolling: "touch",
          paddingBottom: 80, // reserve space so page content clears the fixed RadialMenu
        }}
      >
        {children}
        {/* v117 — Subtle app-wide footer with Privacy Policy link. Discreet
            (10px muted amber) so it does not compete with page content, but
            always reachable from every route. */}
        <footer
          data-testid="app-footer-privacy"
          style={{
            padding: "16px 12px 8px",
            textAlign: "center",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "rgba(245,166,35,0.55)",
          }}
        >
          <Link
            to="/privacy"
            data-testid="footer-privacy-link"
            style={{
              color: "rgba(245,166,35,0.75)",
              textDecoration: "none",
              borderBottom: "1px dotted rgba(245,166,35,0.35)",
              paddingBottom: 1,
            }}
          >
            Privacy Policy
          </Link>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          <Link
            to="/terms"
            data-testid="footer-terms-link"
            style={{
              color: "rgba(245,166,35,0.75)",
              textDecoration: "none",
              borderBottom: "1px dotted rgba(245,166,35,0.35)",
              paddingBottom: 1,
            }}
          >
            Terms
          </Link>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          <Link
            to="/aydinlatma-metni"
            data-testid="footer-aydinlatma-link"
            style={{
              color: "rgba(245,166,35,0.75)",
              textDecoration: "none",
              borderBottom: "1px dotted rgba(245,166,35,0.35)",
              paddingBottom: 1,
            }}
          >
            Aydınlatma
          </Link>
        </footer>
        <MusicButton />
        <PwaInstallPrompt />
      </div>
      <RadialMenu />
      <CookieBanner />
    </>
  );
}
