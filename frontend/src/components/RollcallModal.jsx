import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { X, Megaphone, Loader2, ThumbsUp, ThumbsDown, HelpCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Yoklama modalı. Admin bir etkinlik seçer, mesaj yazar → POST /rollcalls.
 * Push + in-app notif tüm üyelere gider. Bu modal aynı zamanda başlatıldıktan
 * sonra canlı sonuçları GET /rollcalls/{id} ile 3sn'de bir polling'le gösterir.
 * UI stringleri i18n `t()` hook üzerinden — 29 dilde tutarlı çıktı.
 */
export default function RollcallModal({ onClose }) {
  const { t } = useTranslation();
  const [step, setStep] = useState("start"); // "start" | "live"
  const [selectedEventId, setSelectedEventId] = useState("");
  const [customName, setCustomName] = useState("");
  const [message, setMessage] = useState(t("rollcall_message_default", "Kim hazır?"));
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const { data: eventsData } = useSWR("/events?archived=false", fetcher);
  const events = Array.isArray(eventsData) ? eventsData : (eventsData?.items || []);
  const upcoming = events
    .filter((e) => e.date && new Date(e.date).getTime() >= Date.now() - 6 * 3600 * 1000)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 30);

  const start = async (e) => {
    e.preventDefault();
    const sel = upcoming.find((x) => x.id === selectedEventId);
    const name = customName.trim() || sel?.name;
    if (!name) { toast.error(t("rollcall_need_event", "Etkinlik seç veya ad yaz")); return; }
    setSending(true);
    try {
      const r = await api.post("/rollcalls", {
        event_id: selectedEventId || null,
        event_name: name,
        message: message.trim() || t("rollcall_message_default", "Kim hazır?"),
      });
      const rc = r.data?.rollcall;
      const fo = r.data?.fanout || {};
      toast.success(t("rollcall_started_toast", "Yoklama başladı — {{push}} push, {{app}} uygulama içi", {
        push: fo.push_sent || 0,
        app: fo.app_notif_sent || 0,
      }));
      setActiveId(rc?.id);
      setStep("live");
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-lg p-5 relative"
        data-testid="rollcall-modal"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <Megaphone className="w-6 h-6 gold-text" />
          <h3 className="text-lg font-bold uppercase gold-text">
            {step === "start"
              ? t("rollcall_start_title", "Yoklama Başlat")
              : t("rollcall_live_title", "Canlı Sonuçlar")}
          </h3>
        </div>

        {step === "start" ? (
          <form onSubmit={start} data-testid="rollcall-start-form">
            <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("rollcall_event_label", "Etkinlik")}</label>
            <select
              data-testid="rollcall-event-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mb-3"
            >
              <option value="">{t("rollcall_event_manual", "— Manuel ad gir —")}</option>
              {upcoming.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {new Date(ev.date).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {ev.name}
                </option>
              ))}
            </select>
            {!selectedEventId && (
              <>
                <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("rollcall_custom_name_label", "Etkinlik Adı")}</label>
                <input
                  data-testid="rollcall-custom-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t("rollcall_custom_name_placeholder", "Örn: Acil Toplanma")}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mb-3"
                />
              </>
            )}
            <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("rollcall_message_label", "Mesaj")}</label>
            <textarea
              data-testid="rollcall-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white resize-y mb-4"
            />
            <button
              type="submit"
              disabled={sending}
              data-testid="rollcall-start-submit"
              className="btn-primary w-full py-2 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              {t("rollcall_submit", "Herkese Gönder")}
            </button>
          </form>
        ) : (
          <LiveRollcall id={activeId} onDone={onClose} t={t} />
        )}
      </div>
    </div>
  );
}

function LiveRollcall({ id, onDone, t }) {
  const { data } = useSWR(id ? `/rollcalls/${id}` : null, fetcher, { refreshInterval: 3000 });
  const rc = data?.rollcall;
  const counts = data?.counts || { yes: 0, no: 0, maybe: 0, total: 0 };
  const responses = data?.responses || [];

  const close = async () => {
    try {
      await api.post(`/rollcalls/${id}/close`);
      toast.success(t("rollcall_closed_toast", "Yoklama kapatıldı"));
      onDone();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div data-testid="rollcall-live">
      <div className="mb-3">
        <div className="text-xs text-muted-foreground">{t("rollcall_event_label", "Etkinlik")}</div>
        <div className="text-sm font-bold gold-text">{rc?.event_name || "…"}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3" data-testid="rollcall-counts">
        <StatBox icon={<ThumbsUp className="w-4 h-4" />} label={t("rollcall_yes", "Katılıyorum")} value={counts.yes} color="#22C55E" />
        <StatBox icon={<HelpCircle className="w-4 h-4" />} label={t("rollcall_maybe", "Belki")} value={counts.maybe} color="#EAB308" />
        <StatBox icon={<ThumbsDown className="w-4 h-4" />} label={t("rollcall_no", "Katılamıyorum")} value={counts.no} color="#EF4444" />
      </div>
      <div className="max-h-52 overflow-y-auto border border-border rounded bg-black/30 mb-3" data-testid="rollcall-responses">
        {responses.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center italic">{t("rollcall_no_responses", "Henüz yanıt yok…")}</div>
        ) : (
          responses.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-1 text-xs border-b border-border/50">
              <span className="text-white">{r.username}</span>
              <span style={{
                color: r.response === "yes" ? "#22C55E" : r.response === "maybe" ? "#EAB308" : "#EF4444",
                fontWeight: 700,
              }}>
                {r.response === "yes"
                  ? t("rollcall_yes_short", "✅ Katılıyor")
                  : r.response === "maybe"
                  ? t("rollcall_maybe_short", "🤔 Belki")
                  : t("rollcall_no_short", "❌ Katılamıyor")}
              </span>
            </div>
          ))
        )}
      </div>
      <button
        onClick={close}
        data-testid="rollcall-close-btn"
        className="btn-outline w-full py-2 text-xs flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-4 h-4" /> {t("rollcall_close_btn", "Yoklamayı Kapat ({{count}} yanıt)", { count: counts.total })}
      </button>
    </div>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <div
      className="rounded p-2 text-center"
      style={{ background: `${color}22`, border: `1px solid ${color}66` }}
    >
      <div style={{ color }} className="flex items-center justify-center gap-1 text-[10px] uppercase font-bold">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
