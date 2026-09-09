import { useEffect, useState } from "react";

/**
 * usePwaInstall — v142.7
 * Tracks whether the app can be installed as a PWA on this browser.
 *
 * Behaviour:
 *  - Listens for the global `beforeinstallprompt` event. Because the event
 *    may fire BEFORE this hook mounts, we also read from a cached instance
 *    stashed on `window.__pwaInstallEvent__` by `index.js` at boot.
 *  - Hides itself when the app is already installed (display-mode: standalone
 *    or iOS Safari `navigator.standalone`).
 *  - `install()` triggers the native browser prompt and clears state.
 *
 * Not persisted to localStorage — every browser session gets a fresh event
 * from the OS.
 */
function isStandalone() {
  return (
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (typeof window !== "undefined" && window.navigator?.standalone === true)
  );
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState(
    typeof window !== "undefined" ? window.__pwaInstallEvent__ || null : null,
  );
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault();
      window.__pwaInstallEvent__ = e;
      setDeferred(e);
    };
    const onInstalled = () => {
      window.__pwaInstallEvent__ = null;
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return { outcome: "unavailable" };
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      window.__pwaInstallEvent__ = null;
      setDeferred(null);
      if (choice?.outcome === "accepted") setInstalled(true);
      return choice || { outcome: "dismissed" };
    } catch (err) {
      return { outcome: "error", error: err };
    }
  };

  // canInstall = event fired AND app not yet installed
  const canInstall = !!deferred && !installed;
  return { canInstall, installed, install };
}
