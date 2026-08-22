import React from "react";
import MusicButton from "@/components/MusicButton";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

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
        style={{
          flexShrink: 0,
          position: "relative",
          zIndex: 100,
          background: "transparent",
          // v58 — Thin glowing violet hairline below the header. Uses a
          // pseudo-element via inline shadow: a 1px bottom border rendered
          // as a linear-gradient background plus a soft outer glow. Kept
          // ultra-thin (1px) so it reads as a jewel accent, not a heavy bar.
          borderBottom: "1px solid transparent",
          borderImage: "linear-gradient(90deg, transparent 0%, rgba(147,51,234,0.55) 20%, rgba(168,85,247,0.95) 50%, rgba(147,51,234,0.55) 80%, transparent 100%) 1",
          boxShadow: "0 1px 0 0 rgba(147,51,234,0.35), 0 2px 12px -2px rgba(147,51,234,0.45)",
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
        }}
      >
        {children}
        <MusicButton />
        <PwaInstallPrompt />
      </div>
    </>
  );
}
