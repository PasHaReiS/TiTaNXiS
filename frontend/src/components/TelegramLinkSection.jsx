import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Send, ExternalLink, Copy, Unlink2 } from "lucide-react";
import { api, apiErr } from "@/lib/api";

const fetcher = (u) => api.get(u).then((r) => r.data);

/** Profile → Telegram DM linking flow.
 *  Users tap "Get Code" → issued a 6-char token → send `/link CODE` in the bot chat →
 *  once handled by telegram_bot.py, /telegram/link/status flips to linked. */
export default function TelegramLinkSection() {
  const { t } = useTranslation();
  const { data: status, mutate: refreshStatus } = useSWR("/telegram/link/status", fetcher, {
    refreshInterval: 5000, // poll every 5s so the UI flips right after the user runs /link
  });
  const [token, setToken] = useState(null);
  const [botUsername, setBotUsername] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);

  // Countdown from expires_at so users see the token expire in real time.
  useEffect(() => {
    if (!expiresAt) return;
    const iv = setInterval(() => {
      const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(s);
      if (s <= 0) { setToken(null); setExpiresAt(null); clearInterval(iv); }
    }, 500);
    return () => clearInterval(iv);
  }, [expiresAt]);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post("/telegram/link/generate");
      setToken(res.data.token);
      setBotUsername(res.data.bot_username);
      setDeepLink(res.data.deep_link);
      setExpiresAt(res.data.expires_at);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(`/link ${token}`);
      toast.success(t("telegram_link_copied"));
    } catch { /* ignore */ }
  };

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

  const linked = !!status?.linked;

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
      ) : token ? (
        <div className="space-y-2">
          <p className="text-[11px] text-white/80">{t("telegram_link_instructions")}</p>
          <div className="flex items-center gap-2">
            <code
              data-testid="telegram-link-token"
              className="flex-1 px-3 py-2 rounded font-bold text-lg tracking-widest text-center"
              style={{ background: "#1A1210", color: "#F5A623", border: "1px solid rgba(245,166,35,0.4)", fontFamily: "monospace" }}
            >
              /link {token}
            </code>
            <button
              type="button"
              onClick={copyCode}
              data-testid="telegram-link-copy"
              className="chip text-xs px-3"
              title={t("telegram_link_copy")}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span data-testid="telegram-link-countdown">
              {remaining > 0 ? t("telegram_link_expires_in", { sec: remaining }) : "…"}
            </span>
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="telegram-link-open-bot"
                className="flex items-center gap-1"
                style={{ color: "#259FEB" }}
              >
                <ExternalLink className="w-3 h-3" /> @{botUsername || "TiTaNXiS_BoT"}
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            data-testid="telegram-link-regenerate"
            className="chip text-[10px]"
          >
            {t("telegram_link_regen")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          data-testid="telegram-link-generate"
          className="btn-gold text-xs flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> {t("telegram_link_generate")}
        </button>
      )}
    </div>
  );
}
