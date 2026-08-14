import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { X, BellRing, Clock, Volume2 } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { playPushSound } from "@/lib/pushSound";

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
  // Multi-select: user may pick several leads (e.g. 60dk + 30dk + 15dk) and one
  // scheduled push is created per lead in a single submit.
  const [leadMinSet, setLeadMinSet] = useState(() => new Set([30]));
  const [title, setTitle] = useState(`🔔 ${event.name}`);
  const startDate = useMemo(() => new Date(event.date), [event.date]);
  // Body uses the LARGEST selected lead so the copy reads sensibly ("starts in 60 min").
  const largestLead = useMemo(() => Math.max(...Array.from(leadMinSet)), [leadMinSet]);
  const [body, setBody] = useState(t("event_reminder_body_default", { name: event.name, min: 30 }));
  // Multi-channel fan-out toggles (default: both ON so admins don't miss delivery).
  const [sendChannel, setSendChannel] = useState(true);
  const [sendDm, setSendDm] = useState(true);
  const [sound, setSound] = useState("rally");
  const [previewing, setPreviewing] = useState(null);
  const SOUNDS = [
    { key: "rally",   label: "⚔️ Rally",   color: "#E74C1A" },
    { key: "victory", label: "🏆 Zafer",   color: "#22C55E" },
    { key: "dungeon", label: "🐉 Zindan",  color: "#A855F7" },
    { key: "alarm",   label: "🚨 Alarm",   color: "#F5A623" },
  ];
  const preview = async (k) => {
    setPreviewing(k);
    try { await playPushSound(k); } catch {}
    setPreviewing(null);
  };
  const [saving, setSaving] = useState(false);

  const toggleLead = (m) => {
    setLeadMinSet((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      // If the user cleared everything, put the middle-ish preset back.
      if (next.size === 0) next.add(30);
      return next;
    });
  };

  // Compute fire-times for every selected lead. Past leads are flagged red.
  const fireTimes = useMemo(() => {
    const now = Date.now();
    return Array.from(leadMinSet).sort((a, b) => b - a).map((min) => {
      const at = new Date(startDate.getTime() - min * 60_000);
      return { min, at, isPast: at.getTime() < now - 30_000 };
    });
  }, [leadMinSet, startDate]);

  const anyFuture = fireTimes.some((x) => !x.isPast);
  const allPast = fireTimes.every((x) => x.isPast);

  const submit = async (e) => {
    e.preventDefault();
    if (!anyFuture) { toast.error(t("push_sched_past_error")); return; }
    setSaving(true);
    let ok = 0, skipped = 0;
    try {
      for (const ft of fireTimes) {
        if (ft.isPast) { skipped += 1; continue; } // silently skip past leads
        await api.post("/push/scheduled", {
          title: title.trim() || `🔔 ${event.name}`,
          body: body.trim() || t("event_reminder_body_default", { name: event.name, min: ft.min }),
          url: "/etkinlikler",
          scheduled_at: ft.at.toISOString(),
          repeat: null,
          event_id: event.id,
          sound: sound,
          send_channel: sendChannel,
          send_dm: sendDm,
        });
        ok += 1;
      }
      toast.success(t("event_reminder_multi_scheduled", { count: ok, skipped }));
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
          {t("event_reminder_lead")} <span className="opacity-60 normal-case font-normal">({t("event_reminder_lead_hint")})</span>
        </label>
        <div className="flex flex-wrap gap-1" data-testid="event-reminder-lead-presets">
          {PRESETS.map((m) => {
            const on = leadMinSet.has(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  toggleLead(m);
                  // Keep body copy in sync with the largest selected lead.
                  const nextSet = new Set(leadMinSet);
                  on ? nextSet.delete(m) : nextSet.add(m);
                  if (nextSet.size === 0) nextSet.add(30);
                  const largest = Math.max(...Array.from(nextSet));
                  setBody(t("event_reminder_body_default", { name: event.name, min: largest }));
                }}
                data-testid={`event-reminder-lead-${m}`}
                className={`chip text-[11px] ${on ? "active" : ""}`}
              >
                {on && <span aria-hidden>✓ </span>}
                {m < 60 ? `${m} dk` : m === 60 ? "1 saat" : m === 120 ? "2 saat" : "24 saat"}
              </button>
            );
          })}
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
          className="mt-3 p-2 rounded text-[11px]"
          style={{ background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.35)" }}
          data-testid="event-reminder-when"
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-3.5 h-3.5" style={{ color: "#8BD3FF" }} />
            <span className="text-white/80 uppercase tracking-widest font-bold text-[10px]">
              {t("event_reminder_will_fire")} ({fireTimes.length})
            </span>
          </div>
          <div className="flex flex-col gap-1" data-testid="event-reminder-firetimes">
            {fireTimes.map((ft) => (
              <div key={ft.min} className="flex items-center gap-2" data-testid={`fire-${ft.min}`}>
                <span className="mono w-14 text-[10px]" style={{ color: "#94A3B8" }}>
                  −{ft.min < 60 ? `${ft.min}dk` : ft.min === 60 ? "1s" : ft.min === 120 ? "2s" : "24s"}
                </span>
                <span className="font-bold mono flex-1" style={{ color: ft.isPast ? "#F87171" : "#8BD3FF", textDecoration: ft.isPast ? "line-through" : "none" }}>
                  {ft.at.toLocaleString()}
                </span>
                {ft.isPast && (
                  <span className="text-[9px] uppercase" style={{ color: "#F87171" }}>
                    {t("event_reminder_past_skip")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        {allPast && (
          <div className="mt-2 text-[11px]" style={{ color: "#F87171" }}>
            {t("push_sched_past_error")}
          </div>
        )}

        {/* Multi-channel fan-out toggles */}
        <div className="mt-3 rounded p-2 space-y-1.5" style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.20)" }} data-testid="event-reminder-channels">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
            {t("event_reminder_channels_title") || "Nereye Gönderilsin?"}
          </div>
          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              checked={sendChannel}
              onChange={(e) => setSendChannel(e.target.checked)}
              data-testid="event-reminder-send-channel"
              className="cursor-pointer"
            />
            <span className="flex-1">✈️ {t("event_reminder_send_channel") || "Telegram Kanalı"}</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              checked={sendDm}
              onChange={(e) => setSendDm(e.target.checked)}
              data-testid="event-reminder-send-dm"
              className="cursor-pointer"
            />
            <span className="flex-1">📩 {t("event_reminder_send_dm") || "Katılan Üyelere Direkt Mesaj"}</span>
          </label>
          <p className="text-[9px] text-muted-foreground leading-tight">
            🔔 {t("event_reminder_webpush_always") || "Web Push (tarayıcı bildirimi) her durumda gönderilir."}
          </p>
        </div>

        {/* Sound picker with preview */}
        <div className="mt-3 rounded p-2" style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.20)" }} data-testid="event-reminder-sound-picker">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1.5 flex items-center gap-1">
            <Volume2 className="w-3 h-3" /> {t("event_reminder_sound_title") || "Bildirim Sesi"}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SOUNDS.map((s) => (
              <div key={s.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSound(s.key)}
                  data-testid={`event-reminder-sound-${s.key}`}
                  className="flex-1 text-[11px] px-2 py-1 rounded font-bold flex items-center justify-center gap-1"
                  style={{
                    background: sound === s.key ? `${s.color}22` : "transparent",
                    color: sound === s.key ? s.color : "#94A3B8",
                    border: `1px solid ${sound === s.key ? s.color : "rgba(148,163,184,0.30)"}`,
                  }}
                >
                  {sound === s.key && "✓"} {s.label}
                </button>
                <button
                  type="button"
                  onClick={() => preview(s.key)}
                  data-testid={`event-reminder-sound-preview-${s.key}`}
                  disabled={previewing === s.key}
                  className="px-1.5 py-1 rounded"
                  style={{ background: "rgba(148,163,184,0.15)", color: s.color, opacity: previewing === s.key ? 0.5 : 1 }}
                  title={t("event_reminder_sound_preview") || "Dinle"}
                >
                  {previewing === s.key ? "…" : "▶"}
                </button>
              </div>
            ))}
          </div>
        </div>

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
            disabled={saving || allPast}
            data-testid="event-reminder-submit"
            className="btn-gold text-xs flex items-center gap-1.5"
            style={{ opacity: (saving || allPast) ? 0.5 : 1 }}
          >
            <BellRing className="w-3.5 h-3.5" />
            {saving ? "…" : t("event_reminder_schedule_multi", { count: fireTimes.filter((x) => !x.isPast).length })}
          </button>
        </div>
      </form>
    </div>
  );
}
