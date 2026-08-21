import React from "react";
import MusicButton from "@/components/MusicButton";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

/**
 * Layout provides the SCROLLABLE content wrapper. `.app-shell` is a flex
 * column with `height:100vh; overflow:hidden`, so this inner wrapper
 * (`flex:1; overflow-y:auto`) becomes the ONLY scroll container. The Header
 * inside pages uses `position: sticky; top: 0` and pins to this container's
 * top edge — its containing block spans the entire page height, so sticky
 * works reliably.
 */
export default function Layout({ children }) {
  return (
    <div
      data-testid="layout-scroll-container"
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        minHeight: 0, // required for flex child scroll containers
      }}
    >
      {children}
      <MusicButton />
      <PwaInstallPrompt />
    </div>
  );
}
