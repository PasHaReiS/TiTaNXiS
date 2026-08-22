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
        }}
      >
        {children}
        <MusicButton />
        <PwaInstallPrompt />
      </div>
    </>
  );
}
