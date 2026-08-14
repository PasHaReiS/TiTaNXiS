import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { X, BellRing, Clock } from "lucide-react";
import { api, apiErr } from "@/lib/api";

/** Modal that schedules a Web-Push reminder for an event, targeting only the
 *  users linked to members currently marked as attending that event.
 *
 *  Props:
 *   - event: { id, name, date }
 *   - onClose(): closes the modal
 */
export default function EventReminderDialog({ event, onClose }) {
  const { t } = useTranslation();
  // Preset "how many minutes before start" — keeps the flow one-tap for common cases.
  const PRESETS = [5, 15, 30, 60, 120, 1440]; // in minutes
  const [leadMin, setLeadMin] = useState(30);
  const [title, setTitle] = useState(`🔔 ${event.name}`);
  const startDate = useMemo(() => new Date(event.date), [event.date]);
  const [body, setBody] = useState(t("event_reminder_body_default", { name: event.name, min: 30 }));
  const [saving, setSaving] = useState(false);

  const scheduledAtLocal = useMemo(() => {
    const ms = startDate.getTime() - leadMin * 60_000;
    if (Number.isNaN(ms)) return null;
    return new Date(ms);
  }, [startDate, leadMin]);

  const isPast = !!(scheduledAtLocal && scheduledAtLocal.getTime() < Date.now() - 30_000);

  const submit = async (e) => {
    e.preventDefault();
    if (!scheduledAtLocal) { toast.error(t("push_sched_past_error")); return; }
    if (isPast) { toast.error(t("push_sched_past_error")); return; }
    setSaving(true);
    try {
      await api.post("/push/scheduled", {
        title: title.trim() || `🔔 ${event.name}`,
        body: body.trim() || t("event_reminder_body_default", { name: event.name, min: leadMin }),
        url: "/etkinlikler",
        scheduled_at: scheduledAtLocal.toISOString(),
        repeat: null,
        event_id: event.id,
        sound: "rally",
      });
      toast.success(t("event_reminder_scheduled", { at: scheduledAtLocal.toLocaleString() }));
      onClose();
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative"
        data-testid="event-reminder-dialog"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
          <BellRing className="w-4 h-4" /> {t("event_reminder_title")}
        </h3>
        <p className="text-xs text-muted-foreground mb-3" data-testid="event-reminder-subtitle">
          {event.name} · {startDate.toLocaleString()}
        </p>

        <label className="block text-[10px] uppercase text-muted-foreground font-bold mb-1 mt-2">
          {t("event_reminder_lead")}
        </label>
        <div className="flex flex-wrap gap-1" data-testid="event-reminder-lead-presets">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setLeadMin(m);
                setBody(t("event_reminder_body_default", { name: event.name, min: m }));
              }}
              data-testid={`event-reminder-lead-${m}`}
              className={`chip text-[11px] ${leadMin === m ? "active" : ""}`}
            >
              {m < 60 ? `${m} dk` : m === 60 ? "1 saat" : m === 120 ? "2 saat" : "24 saat"}
            </button>
          ))}
        </div>

        <label className="block text-[10px] uppercase text-muted-foreground font-bold mb-1 mt-4">
          {t("push_bc_title_label") || "Başlık"}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="event-reminder-title"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />

        <label className="block text-[10px] uppercase text-muted-foreground font-bold mb-1 mt-3">
          {t("push_bc_body_label") || "İçerik"}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          data-testid="event-reminder-body"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />

        <div
          className="mt-3 p-2 rounded text-[11px] flex items-center gap-2"
          style={{ background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.35)" }}
          data-testid="event-reminder-when"
        >
          <Clock className="w-3.5 h-3.5" style={{ color: "#8BD3FF" }} />
          <span className="text-white/80">{t("event_reminder_will_fire")}:</span>
          <span className="font-bold mono" style={{ color: isPast ? "#F87171" : "#8BD3FF" }}>
            {scheduledAtLocal ? scheduledAtLocal.toLocaleString() : "—"}
          </span>
        </div>
        {isPast && (
          <div className="mt-2 text-[11px]" style={{ color: "#F87171" }}>
            {t("push_sched_past_error")}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="chip text-xs"
            data-testid="event-reminder-cancel"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || isPast}
            data-testid="event-reminder-submit"
            className="btn-gold text-xs flex items-center gap-1.5"
            style={{ opacity: (saving || isPast) ? 0.5 : 1 }}
          >
            <BellRing className="w-3.5 h-3.5" /> {saving ? "…" : t("event_reminder_schedule")}
          </button>
        </div>
      </form>
    </div>
  );
}
