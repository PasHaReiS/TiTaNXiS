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
          // Fully transparent per user request (v48). No bg, no blur, no border,
          // no shadow — scrolled content shows through cleanly behind the
          // header. Only the icons/text/buttons inside are visible.
          background: "transparent",
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
