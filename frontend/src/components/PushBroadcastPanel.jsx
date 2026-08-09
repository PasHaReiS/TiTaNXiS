import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Send, BellRing, RotateCw, History } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function PushBroadcastPanel() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [busy, setBusy] = useState(false);
  const { data: history = [], mutate: refreshHistory } = useSWR(isAdmin ? "/push/history" : null, fetcher, { refreshInterval: 20000 });
  if (!isAdmin) return null;

  const doSend = async (payload) => {
    setBusy(true);
    try {
      const res = await api.post("/push/broadcast", payload);
      toast.success(t("push_bc_sent", { sent: res.data.sent, removed: res.data.removed }));
      refreshHistory();
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
      return false;
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast.error(t("push_bc_required")); return; }
    const ok = await doSend({ title: title.trim(), body: body.trim(), url: url.trim() || "/", tag: "manual-broadcast" });
    if (ok) { setTitle(""); setBody(""); }
  };

  const resend = (h) => doSend({ title: h.title, body: h.body, url: h.url || "/", tag: h.tag || "manual-broadcast" });

  return (
    <div
      data-testid="push-broadcast-panel"
      className="p-4 rounded-lg mb-4"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: "1px solid rgba(168,85,247,0.4)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="w-4 h-4" style={{ color: "#A855F7" }} />
        <h3 className="text-xs font-bold uppercase" style={{ color: "#A855F7", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          {t("push_bc_title")}
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="push-bc-title"
          placeholder={t("push_bc_title_placeholder")}
          className="w-full rounded px-3 py-2 text-sm"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          data-testid="push-bc-body"
          placeholder={t("push_bc_body_placeholder")}
          rows={2}
          className="w-full rounded px-3 py-2 text-sm"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          data-testid="push-bc-url"
          placeholder={t("push_bc_url_placeholder")}
          className="w-full rounded px-3 py-2 text-xs mono"
          style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F0E8" }}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy}
          data-testid="push-bc-send"
          className="self-end px-4 py-2 rounded-lg text-white text-xs font-bold flex items-center gap-1.5"
          style={{ background: "linear-gradient(135deg,#7C3AED,#3B82F6)", opacity: busy ? 0.6 : 1 }}
        >
          <Send className="w-3 h-3" /> {busy ? t("push_bc_sending") : t("push_bc_send")}
        </button>
      </div>

      {history.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(168,85,247,0.25)" }} data-testid="push-history-list">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-3.5 h-3.5" style={{ color: "#A855F7" }} />
            <div className="text-[10px] font-bold uppercase" style={{ color: "#A855F7", letterSpacing: "0.08em" }}>
              {t("push_bc_history")}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {history.map((h) => (
              <div
                key={h.id}
                data-testid={`push-history-${h.id}`}
                className="flex items-center justify-between gap-2 p-2 rounded"
                style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: "#F5F0E8" }}>{h.title}</div>
                  <div className="text-[10px] truncate" style={{ color: "#F5F0E8", opacity: 0.6 }}>{h.body}</div>
                  <div className="text-[9px] mt-0.5 flex items-center gap-2" style={{ color: "#F5F0E8", opacity: 0.5 }}>
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                    <span>·</span>
                    <span>{t("push_bc_sent_short", { sent: h.sent })}</span>
                    <span className="mono opacity-70">{h.url}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => resend(h)}
                  disabled={busy}
                  data-testid={`push-history-resend-${h.id}`}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#7C3AED,#3B82F6)", color: "#fff" }}
                >
                  <RotateCw className="w-3 h-3" /> {t("push_bc_resend")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
