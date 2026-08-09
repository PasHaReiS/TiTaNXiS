import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "titanxis_pwa_dismissed_v1";
const DISMISS_HOURS = 72;

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator?.standalone === true
  );
}

function isIos() {
  const ua = window.navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_HOURS * 3600 * 1000;
  } catch {
    return false;
  }
}

export default function PwaInstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBip = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS never fires beforeinstallprompt — show a hint after a short delay
    if (isIos()) {
      const timer = setTimeout(() => { setIosHint(true); setVisible(true); }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setVisible(false);
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      data-testid="pwa-install-prompt"
      className="fixed left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        bottom: 90,
        zIndex: 9500,
        background: "linear-gradient(135deg,#1E1410,#0D0907)",
        border: "1px solid #F5A623",
        boxShadow: "0 8px 24px rgba(0,0,0,0.65), 0 0 20px rgba(231,76,26,0.35)",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{
            width: 36, height: 36,
            background: "linear-gradient(135deg,#C0392B,#E74C1A)",
            boxShadow: "0 0 8px rgba(231,76,26,0.6)",
          }}
        >
          <Download className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div
            className="text-xs font-bold uppercase whitespace-nowrap"
            style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
          >
            {t("pwa_install_title")}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "#F5F0E8", opacity: 0.8 }}>
            {iosHint ? (
              <span className="inline-flex items-center gap-1">
                <Share className="w-3 h-3" /> {t("pwa_ios_hint")}
              </span>
            ) : t("pwa_install_desc")}
          </div>
        </div>
      </div>
      {!iosHint && deferredPrompt && (
        <button
          type="button"
          onClick={install}
          data-testid="pwa-install-btn"
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 flex-shrink-0"
          style={{
            background: "linear-gradient(135deg,#D4730A,#E74C1A)",
            color: "#0B0704",
            fontFamily: "Cinzel, serif",
            letterSpacing: "0.06em",
          }}
        >
          {t("pwa_install_action")}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        data-testid="pwa-install-dismiss"
        className="p-1 rounded flex-shrink-0"
        style={{ color: "#F5F0E8", opacity: 0.7 }}
        aria-label={t("close")}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
