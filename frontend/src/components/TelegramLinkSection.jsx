import React, { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Send, Unlink2, KeyRound } from "lucide-react";
import { api, apiErr } from "@/lib/api";

const fetcher = (u) => api.get(u).then((r) => r.data);
// Bot username registered via @BotFather /setdomain (must match production domain).
const BOT_USERNAME = "TiTaNXiS_BoT";

/** Profile → Telegram Login Widget.
 *
 *  Uses the official Telegram widget script — user clicks "Log in with
 *  Telegram" → confirms in the Telegram app → widget calls our global
 *  ``window.onTelegramAuth`` handler, which POSTs the signed payload to the
 *  backend for HMAC verification.
 */
export default function TelegramLinkSection() {
  const { t } = useTranslation();
  const { data: status, mutate: refreshStatus } = useSWR("/telegram/link/status", fetcher, {
    refreshInterval: 5000,
  });
  const widgetHost = useRef(null);
  const [busy, setBusy] = useState(false);

  const linked = !!status?.linked;

  // Register a global callback for the Telegram widget to invoke. Runs the
  // HMAC verification via our backend, then refreshes link status on success.
  useEffect(() => {
    window.onTelegramAuth = async (userData) => {
      try {
        await api.post("/telegram/login", userData);
        toast.success(t("telegram_link_status_linked"));
        refreshStatus();
      } catch (e) {
        toast.error(apiErr(e));
      }
    };
    return () => { delete window.onTelegramAuth; };
  }, [t, refreshStatus]);

  // Inject the Telegram widget script into our host div (only when NOT linked).
  useEffect(() => {
    if (linked || !widgetHost.current) return;
    widgetHost.current.innerHTML = ""; // reset if lang change or re-mount
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", BOT_USERNAME);
    s.setAttribute("data-size", "medium");
    s.setAttribute("data-userpic", "false");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    widgetHost.current.appendChild(s);
  }, [linked]);

  const unlink = async () => {
    setBusy(true);
    try {
      await api.post("/telegram/link/unlink");
      toast.success(t("telegram_link_unlinked_done"));
      refreshStatus();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="telegram-link-section" className="card-dark p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Send className="w-4 h-4" style={{ color: "#259FEB" }} />
        <h3 className="text-sm font-bold text-white">{t("telegram_link_title")}</h3>
        <span
          data-testid="telegram-link-status"
          className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded"
          style={{
            background: linked ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
            color: linked ? "#4ADE80" : "#94A3B8",
            border: `1px solid ${linked ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
          }}
        >
          {linked ? t("telegram_link_status_linked") : t("telegram_link_status_unlinked")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{t("telegram_link_desc")}</p>

      {linked ? (
        <button
          type="button"
          onClick={unlink}
          disabled={busy}
          data-testid="telegram-link-unlink"
          className="chip text-xs flex items-center gap-1.5"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#F87171" }}
        >
          <Unlink2 className="w-3.5 h-3.5" /> {t("telegram_link_unlink")}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div ref={widgetHost} data-testid="telegram-login-widget-host" />
            <p className="text-[10px] text-muted-foreground max-w-xs">
              {t("telegram_widget_hint")}
            </p>
          </div>
          <ManualLinkFallback onLinked={() => setLinked(true)} />
        </>
      )}
    </div>
  );
}

function ManualLinkFallback({ onLinked }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState("");
  const [uname, setUname] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!chatId.trim()) return;
    setBusy(true);
    try {
      await api.post("/telegram/manual-link", { chat_id: chatId.trim(), username: uname.trim() || null });
      toast.success(t("telegram_manual_linked") || "Telegram bağlandı");
      onLinked && onLinked();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="telegram-manual-toggle"
        className="text-[10px] uppercase font-bold text-muted-foreground hover:text-white flex items-center gap-1"
      >
        <KeyRound className="w-3 h-3" />
        {open ? (t("telegram_manual_hide") || "Manuel bağlantıyı gizle") : (t("telegram_manual_show") || "Widget çalışmıyor mu? Manuel bağlan")}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[10px] text-muted-foreground leading-snug">
            {t("telegram_manual_hint") || "Telegram'da @userinfobot'a herhangi bir mesaj at — sana chat_id'ni verecek. O sayıyı buraya yapıştır."}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={chatId}
              onChange={(e) => setChatId(e.target.value.replace(/[^0-9-]/g, ""))}
              placeholder="123456789"
              data-testid="telegram-manual-chatid"
              className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-white mono outline-none"
            />
            <input
              type="text"
              value={uname}
              onChange={(e) => setUname(e.target.value.replace(/^@+/, ""))}
              placeholder="@kullanıcı_adı"
              data-testid="telegram-manual-username"
              className="w-32 bg-background border border-border rounded px-2 py-1.5 text-xs text-white outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !chatId.trim()}
              data-testid="telegram-manual-submit"
              className="chip text-xs"
              style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", color: "#93C5FD" }}
            >
              {busy ? "…" : (t("telegram_manual_link_btn") || "Bağla")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
