import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { Bell, Download, Check, X, ChevronRight, Sparkles, Smartphone, Share2, PlusSquare } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const WIZARD_KEY = "titanxis_notif_wizard_seen_v1";

function urlB64ToUint8(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) && !window.MSStream) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function isPWAInstalled() {
  try {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
      || window.navigator.standalone === true;
  } catch { return false; }
}

export default function NotificationSetupWizard() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isPWAInstalled());
  const [busy, setBusy] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (localStorage.getItem(WIZARD_KEY) === "1") return;
    } catch {}
    const id = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(id);
  }, [isAdmin]);

  useEffect(() => {
    const onBeforeInstall = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const onInstalled = () => { setInstalled(true); toast.success(t("wiz_installed_ok")); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [t]);

  const enablePush = async () => {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.warning(t("wiz_push_no_support"));
      setPermission("denied");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { toast.warning(t("wiz_push_denied")); return; }
      const reg = await navigator.serviceWorker.ready;
      const res = await api.get("/push/vapid-public-key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(res.data.key),
      });
      const json = sub.toJSON();
      await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      toast.success(t("wiz_push_granted"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || t("wiz_push_failed"));
    } finally {
      setBusy(false);
    }
  };

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setInstalled(true);
        toast.success(t("wiz_installed_ok"));
      }
      setDeferredPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    setOpen(false);
    try { localStorage.setItem(WIZARD_KEY, "1"); } catch {}
    toast.success(t("wiz_done_toast"));
  };

  const skip = () => {
    setOpen(false);
    try { localStorage.setItem(WIZARD_KEY, "1"); } catch {}
  };

  if (!open || !isAdmin) return null;

  const totalSteps = 3;
  const stepPct = Math.round(((step + 1) / totalSteps) * 100);

  const pushGranted = permission === "granted";
  const pushDenied = permission === "denied";

  const modal = (
    <div
      data-testid="notif-wizard-overlay"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(5,3,2,0.85)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) skip(); }}
    >
      <div
        data-testid="notif-wizard-modal"
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(30,20,16,0.98), rgba(15,10,8,0.98))",
          border: "1px solid rgba(245,166,35,0.5)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(245,166,35,0.15)",
        }}
      >
        <button
          type="button"
          onClick={skip}
          data-testid="notif-wizard-close"
          aria-label="Kapat"
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 hover:bg-white/10"
          style={{ color: "#F5F0E8", opacity: 0.7 }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* progress bar */}
        <div className="h-1 w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            data-testid="notif-wizard-progress"
            className="h-full transition-all"
            style={{ width: `${stepPct}%`, background: "linear-gradient(90deg,#F5A623,#E74C1A)" }}
          />
        </div>

        <div className="p-6">
          {step === 0 && (
            <div data-testid="notif-wizard-step-welcome" className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full p-2" style={{ background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.4)" }}>
                  <Sparkles className="w-5 h-5" style={{ color: "#F5A623" }} />
                </span>
                <h2 className="text-lg font-bold uppercase" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
                  {t("wiz_step_welcome_title")}
                </h2>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#F5F0E8" }}>
                {t("wiz_step_welcome_body")}
              </p>
              <ul className="text-[12px] space-y-1.5" style={{ color: "#F5F0E8", opacity: 0.85 }}>
                <li className="flex items-start gap-2"><Bell className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#F5A623" }} /> {t("wiz_step_welcome_bullet_push")}</li>
                <li className="flex items-start gap-2"><Download className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#F5A623" }} /> {t("wiz_step_welcome_bullet_install")}</li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div data-testid="notif-wizard-step-push" className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full p-2" style={{ background: "rgba(231,76,26,0.15)", border: "1px solid rgba(231,76,26,0.4)" }}>
                  <Bell className="w-5 h-5" style={{ color: "#E74C1A" }} />
                </span>
                <h2 className="text-lg font-bold uppercase" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
                  {t("wiz_step_push_title")}
                </h2>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#F5F0E8" }}>
                {t("wiz_step_push_body")}
              </p>
              <div
                className="rounded-lg p-3 text-[11px] flex items-center gap-2"
                style={{
                  background: pushGranted ? "rgba(34,197,94,0.1)" : pushDenied ? "rgba(239,68,68,0.1)" : "rgba(245,166,35,0.08)",
                  border: `1px solid ${pushGranted ? "rgba(34,197,94,0.4)" : pushDenied ? "rgba(239,68,68,0.4)" : "rgba(245,166,35,0.4)"}`,
                  color: pushGranted ? "#22C55E" : pushDenied ? "#f87171" : "#F5A623",
                }}
                data-testid="notif-wizard-push-status"
              >
                {pushGranted && <Check className="w-3.5 h-3.5" />}
                {pushGranted ? t("wiz_push_granted_hint") : pushDenied ? t("wiz_push_denied_hint") : t("wiz_push_default_hint")}
              </div>
              {!pushGranted && !pushDenied && (
                <button
                  type="button"
                  onClick={enablePush}
                  disabled={busy}
                  data-testid="notif-wizard-push-enable"
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)", color: "#fff" }}
                >
                  <Bell className="w-4 h-4" />
                  {busy ? t("wiz_working") : t("wiz_push_enable_btn")}
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <div data-testid="notif-wizard-step-install" className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full p-2" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)" }}>
                  <Smartphone className="w-5 h-5" style={{ color: "#3B82F6" }} />
                </span>
                <h2 className="text-lg font-bold uppercase" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
                  {t("wiz_step_install_title")}
                </h2>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "#F5F0E8" }}>
                {t("wiz_step_install_body")}
              </p>
              {installed ? (
                <div className="rounded-lg p-3 text-[11px] flex items-center gap-2" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.4)", color: "#22C55E" }} data-testid="notif-wizard-install-installed">
                  <Check className="w-3.5 h-3.5" /> {t("wiz_installed_hint")}
                </div>
              ) : platform === "ios" ? (
                <div className="rounded-lg p-3 text-[12px] space-y-2" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.35)", color: "#F5F0E8" }} data-testid="notif-wizard-install-ios">
                  <div className="text-[11px] font-bold uppercase" style={{ color: "#3B82F6", letterSpacing: "0.06em" }}>iOS Safari</div>
                  <ol className="space-y-1 pl-1 list-decimal list-inside">
                    <li className="flex items-start gap-2"><Share2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#3B82F6" }} /> {t("wiz_install_ios_1")}</li>
                    <li className="flex items-start gap-2"><PlusSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#3B82F6" }} /> {t("wiz_install_ios_2")}</li>
                    <li>{t("wiz_install_ios_3")}</li>
                  </ol>
                </div>
              ) : deferredPrompt ? (
                <button
                  type="button"
                  onClick={triggerInstall}
                  disabled={busy}
                  data-testid="notif-wizard-install-btn"
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#3B82F6,#7C3AED)", color: "#fff" }}
                >
                  <Download className="w-4 h-4" />
                  {busy ? t("wiz_working") : t("wiz_install_btn")}
                </button>
              ) : (
                <div className="rounded-lg p-3 text-[12px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }} data-testid="notif-wizard-install-manual">
                  <div className="text-[11px] font-bold uppercase mb-1" style={{ color: "#F5A623", letterSpacing: "0.06em" }}>
                    {platform === "android" ? "Android Chrome" : "Desktop Chrome / Edge"}
                  </div>
                  {platform === "android" ? t("wiz_install_android_manual") : t("wiz_install_desktop_manual")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4" style={{ background: "rgba(10,7,5,0.6)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            type="button"
            onClick={skip}
            data-testid="notif-wizard-skip"
            className="text-[11px] uppercase font-bold hover:opacity-80"
            style={{ color: "#F5F0E8", opacity: 0.6, letterSpacing: "0.06em" }}
          >
            {t("wiz_skip")}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold" style={{ color: "#F5F0E8", opacity: 0.5, letterSpacing: "0.08em" }} data-testid="notif-wizard-step-indicator">
              {step + 1} / {totalSteps}
            </span>
            {step < totalSteps - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                data-testid="notif-wizard-next"
                className="px-4 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1"
                style={{ background: "linear-gradient(135deg,#F5A623,#E74C1A)", color: "#0B0704" }}
              >
                {t("wiz_next")} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                data-testid="notif-wizard-finish"
                className="px-4 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1"
                style={{ background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#0B0704" }}
              >
                <Check className="w-3.5 h-3.5" /> {t("wiz_finish")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
