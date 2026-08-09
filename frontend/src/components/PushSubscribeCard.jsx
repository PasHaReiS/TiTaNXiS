import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function urlB64ToUint8(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushSubscribeCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("idle"); // idle | subscribed | not-supported | denied
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setStatus("not-supported"); return; }
      if (Notification.permission === "denied") { setStatus("denied"); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "idle");
    })();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error(t("push_denied")); setStatus("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const res = await api.get("/push/vapid-public-key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(res.data.key),
      });
      const json = sub.toJSON();
      await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      setStatus("subscribed");
      toast.success(t("push_enabled"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await api.post("/push/unsubscribe", { endpoint: json.endpoint, keys: json.keys });
        await sub.unsubscribe();
      }
      setStatus("idle");
      toast.success(t("push_disabled"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  if (status === "not-supported") return null;

  return (
    <div
      data-testid="push-subscribe-card"
      className="p-4 rounded-lg mb-4"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: "1px solid rgba(231,76,26,0.4)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase" style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
            {t("push_title")}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "#F5F0E8", opacity: 0.75 }}>
            {status === "denied"
              ? t("push_perm_denied")
              : status === "subscribed"
                ? t("push_active_desc")
                : t("push_enable_desc")}
          </div>
        </div>
        {status === "subscribed" ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            data-testid="push-disable-btn"
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 flex-shrink-0"
            style={{ background: "#3B1F1B", border: "1px solid rgba(231,76,26,0.4)", color: "#F5F0E8" }}
          >
            <BellOff className="w-3 h-3" /> {t("push_disable")}
          </button>
        ) : status === "denied" ? (
          <span className="text-[10px] opacity-60" style={{ color: "#f87171" }}>
            <BellOff className="w-3 h-3 inline" /> {t("push_denied_short")}
          </span>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            data-testid="push-enable-btn"
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#C0392B,#E74C1A)", color: "#fff" }}
          >
            <BellRing className="w-3 h-3" /> {t("push_enable")}
          </button>
        )}
      </div>
    </div>
  );
}
