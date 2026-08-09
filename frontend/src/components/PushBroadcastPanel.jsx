import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Send, BellRing } from "lucide-react";
import { toast } from "sonner";

export default function PushBroadcastPanel() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast.error(t("push_bc_required")); return; }
    setBusy(true);
    try {
      const res = await api.post("/push/broadcast", {
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/",
        tag: "manual-broadcast",
      });
      toast.success(t("push_bc_sent", { sent: res.data.sent, removed: res.data.removed }));
      setTitle(""); setBody("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

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
    </div>
  );
}
