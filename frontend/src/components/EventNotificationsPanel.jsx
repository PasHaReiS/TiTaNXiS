import React, { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BellRing, Trash2, Clock, Calendar, Users, ChevronDown, ChevronUp, TestTube2 } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import EventReminderDialog from "@/components/EventReminderDialog";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Event Notifications Panel — one-stop control room for scheduling and
 * managing push reminders per event. Lives in the Admin User Management page.
 *
 * Layout (top → bottom):
 *   1. Header + explanation ("her aktif etkinlik için hatırlatma kur")
 *   2. Active events grid — each row shows event name, date, attending count
 *      and a "Bildirim Kur" button that opens the existing EventReminderDialog.
 *   3. Existing scheduled reminders list, grouped by event, with Sil/Snooze.
 */
export default function EventNotificationsPanel() {
  const { t, i18n } = useTranslation();
  const { data: events = [] } = useSWR("/events?archived=false", fetcher);
  const [showPast, setShowPast] = useState(false);
  const { data: scheduled = [] } = useSWR(
    showPast ? "/push/scheduled?include_sent=true" : "/push/scheduled",
    fetcher,
    { refreshInterval: 30000 }
  );
  const [reminderFor, setReminderFor] = useState(null);

  // Only active events (not archived), sorted by date ascending (nearest first).
  const activeEvents = useMemo(() => {
    const now = Date.now();
    return [...(events || [])]
      .filter((e) => !e.archived)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((e) => ({ ...e, _ts: new Date(e.date).getTime(), _isPast: new Date(e.date).getTime() < now }));
  }, [events]);

  // Bucket scheduled pushes by event_id for quick per-event drilldown.
  const scheduledByEvent = useMemo(() => {
    const map = {};
    for (const s of scheduled) {
      const key = s.event_id || "__no_event__";
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    Object.values(map).forEach((arr) => arr.sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
    return map;
  }, [scheduled]);

  const shortWhen = (iso) => {
    try {
      const d = new Date(iso);
      const now = Date.now();
      const dt = d.getTime() - now;
      const abs = Math.abs(dt);
      const mins = Math.round(abs / 60000);
      const past = dt < 0;
      if (mins < 60) return past ? `${mins}dk önce` : `${mins}dk sonra`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return past ? `${hrs}s önce` : `${hrs}s sonra`;
      const days = Math.round(hrs / 24);
      return past ? `${days}g önce` : `${days}g sonra`;
    } catch { return iso; }
  };

  const localFormat = (iso) => {
    try { return new Date(iso).toLocaleString(i18n.language || "tr"); } catch { return iso; }
  };

  const deleteScheduled = async (id) => {
    if (!window.confirm(t("event_notif_delete_confirm") || "Bu hatırlatmayı silmek istediğine emin misin?")) return;
    try {
      await api.delete(`/push/scheduled/${id}`);
      mutate((k) => typeof k === "string" && k.startsWith("/push/scheduled"));
      toast.success(t("event_notif_deleted") || "Hatırlatma silindi");
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const snoozeScheduled = async (id, minutes) => {
    try {
      await api.post(`/push/scheduled/${id}/snooze`, { minutes });
      mutate((k) => typeof k === "string" && k.startsWith("/push/scheduled"));
      toast.success(t("event_notif_snoozed", { minutes }) || `${minutes} dk ertelendi`);
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState(null);
  const runTest = async () => {
    setTesting(true);
    try {
      const r = await api.post("/push/test", {
        title: "🧪 Kurulum Testi",
        body: "Bu bir test bildirimidir. Kanalın, DM'in ve tarayıcı bildirimlerinin çalıştığını doğruluyoruz.",
      });
      setLastTest(r.data);
      const ch = r.data.telegram_channel_sent;
      const dm = r.data.telegram_dm_sent;
      const push = r.data.push_sent;
      const summary = `Kanal:${ch ? "✓" : "✗"} · DM:${dm ? "✓" : "✗"} · Push:${push}`;
      if (ch || dm || push > 0) toast.success(`Test gönderildi — ${summary}`);
      else toast.error(`Hiçbir kanal ulaşmadı — ${summary}`);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setTesting(false);
    }
  };

  // Compact analytics badge for FIRED scheduled reminders — shows Web Push
  // recipient count + Telegram channel status + DM count. Emerald when Telegram
  // channel delivered, muted when not; renders inline next to the timestamp.
  const AnalyticsBadge = ({ s }) => {
    if (!s.sent) return null;
    const push = Number.isFinite(s.push_sent) ? s.push_sent : null;
    const dm = Number.isFinite(s.telegram_dm_sent) ? s.telegram_dm_sent : null;
    const ch = !!s.telegram_channel_sent;
    return (
      <span
        data-testid={`event-notif-analytics-${s.id}`}
        className="ml-1 px-1.5 py-0.5 rounded font-bold text-[9px] flex items-center gap-1"
        style={{
          background: ch ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.12)",
          border: `1px solid ${ch ? "rgba(16,185,129,0.45)" : "rgba(148,163,184,0.30)"}`,
          color: ch ? "#6EE7B7" : "#94A3B8",
        }}
        title={t("event_notif_analytics_tooltip") || "Yayın sonuçları"}
      >
        <span>✈️{ch ? "✓" : "—"}</span>
        {dm !== null && <span>· 📩{dm}</span>}
        {push !== null && <span>· 🔔{push}</span>}
      </span>
    );
  };

  return (
    <div
      data-testid="event-notifications-panel"
      className="rounded-lg p-3 mb-4"
      style={{
        background: "rgba(168,85,247,0.06)",
        border: "1px solid rgba(168,85,247,0.35)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase font-bold" style={{ color: "#A855F7", letterSpacing: "0.14em" }}>
          <BellRing className="w-3.5 h-3.5" />
          {t("event_notif_panel_title") || "Etkinlik Bildirimleri"}
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-bold"
          style={{ background: "rgba(168,85,247,0.25)", color: "#C4B5FD" }}
          data-testid="event-notif-scheduled-count"
        >
          {scheduled.length} {t("event_notif_scheduled_count") || "planlı"}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
        {t("event_notif_panel_desc") || "Her aktif etkinlik için önceden hatırlatma kur (5dk, 15dk, 30dk, 1s, 2s, 24s öncesine kadar). Bildirimler sadece etkinliğe katılıyor olarak işaretlenmiş üyelerin bağlı hesaplarına push olarak gider."}
      </p>

      {/* Test button — instantly delivers a sanity notification across all channels */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          data-testid="event-notif-test-btn"
          className="chip text-[11px] flex items-center gap-1.5"
          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.45)", color: "#C4B5FD", opacity: testing ? 0.5 : 1 }}
        >
          <TestTube2 className="w-3.5 h-3.5" />
          {testing ? (t("event_notif_testing") || "Test gönderiliyor…") : (t("event_notif_test_btn") || "Kanalıma Test At")}
        </button>
        {lastTest && (
          <span data-testid="event-notif-test-result" className="text-[10px] mono flex items-center gap-1.5">
            <span style={{ color: lastTest.telegram_channel_sent ? "#6EE7B7" : "#F87171" }}>
              ✈️{lastTest.telegram_channel_sent ? "✓" : "✗"}
            </span>
            <span style={{ color: lastTest.telegram_dm_sent ? "#6EE7B7" : "#94A3B8" }}>
              · 📩{lastTest.telegram_dm_sent ? "✓" : "✗"}
            </span>
            <span style={{ color: (lastTest.push_sent > 0) ? "#6EE7B7" : "#94A3B8" }}>
              · 🔔{lastTest.push_sent}
            </span>
            {lastTest.dm_pending && (
              <span className="opacity-70">· {lastTest.dm_pending} /start bekliyor</span>
            )}
          </span>
        )}
      </div>

      {/* Active events list */}
      {activeEvents.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic py-3 text-center" data-testid="event-notif-empty">
          {t("event_notif_no_active") || "Aktif etkinlik yok. Önce Etkinlikler sayfasından bir etkinlik ekle."}
        </div>
      ) : (
        <div className="space-y-1.5" data-testid="event-notif-event-list">
          {activeEvents.map((e) => {
            const list = (scheduledByEvent[e.id] || []).filter((s) => showPast || new Date(s.scheduled_at).getTime() > Date.now() - 60_000);
            return (
              <div
                key={e.id}
                data-testid={`event-notif-row-${e.id}`}
                className="rounded p-2"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: e._isPast ? "#F87171" : "#8BD3FF" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate" style={{ textTransform: "none" }}>{e.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate mono">
                      {localFormat(e.date)} · ×{e.multiplier} · {e.group_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReminderFor(e)}
                    data-testid={`event-notif-schedule-${e.id}`}
                    className="chip text-[10px] flex items-center gap-1"
                    style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.45)", color: "#C4B5FD" }}
                    disabled={e._isPast}
                    title={e._isPast ? (t("event_notif_past_event") || "Geçmiş etkinlik") : ""}
                  >
                    <BellRing className="w-3 h-3" />
                    {t("event_notif_schedule_btn") || "Bildirim Kur"}
                  </button>
                </div>

                {/* Already-scheduled reminders for this event */}
                {list.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/5 space-y-1" data-testid={`event-notif-existing-${e.id}`}>
                    {list.map((s) => {
                      const isPast = new Date(s.scheduled_at).getTime() < Date.now() - 60_000;
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-2 text-[10px] flex-wrap"
                          data-testid={`event-notif-scheduled-${s.id}`}
                        >
                          <Clock className="w-3 h-3 flex-shrink-0" style={{ color: isPast ? "#6B7280" : "#F5A623" }} />
                          <span className="mono" style={{ color: isPast ? "#6B7280" : "#F5F5F5", textDecoration: isPast && !s.sent ? "line-through" : "none" }}>
                            {localFormat(s.scheduled_at)}
                          </span>
                          <span className="opacity-60">·</span>
                          <span className="opacity-70">{shortWhen(s.scheduled_at)}</span>
                          {s.country_iso2 && (
                            <span className="ml-1 px-1 py-0.5 rounded uppercase font-bold text-[9px]" style={{ background: "rgba(59,130,246,0.15)", color: "#93C5FD" }}>
                              🌍 {s.country_iso2}
                            </span>
                          )}
                          <AnalyticsBadge s={s} />
                          <div className="flex-1" />
                          {!isPast && !s.sent && (
                            <button
                              type="button"
                              onClick={() => snoozeScheduled(s.id, 10)}
                              data-testid={`event-notif-snooze-${s.id}`}
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                              style={{ background: "rgba(245,166,35,0.15)", color: "#F5A623", border: "1px solid rgba(245,166,35,0.35)" }}
                              title={t("event_notif_snooze_10") || "10 dk ertele"}
                            >
                              +10dk
                            </button>
                          )}
                          {!s.sent && (
                            <button
                              type="button"
                              onClick={() => deleteScheduled(s.id)}
                              data-testid={`event-notif-delete-${s.id}`}
                              className="p-0.5 rounded"
                              style={{ background: "rgba(239,68,68,0.15)", color: "#F87171" }}
                              title={t("event_notif_delete_tooltip") || "Sil"}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Show past-time reminders toggle (helps admins audit what fired) */}
      {scheduled.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          data-testid="event-notif-show-past"
          className="mt-3 flex items-center gap-1 text-[10px] uppercase font-bold text-muted-foreground hover:text-white transition"
        >
          {showPast ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showPast
            ? (t("event_notif_hide_past") || "Geçmiş hatırlatmaları gizle")
            : (t("event_notif_show_past") || "Geçmiş hatırlatmaları göster")}
        </button>
      )}

      {reminderFor && (
        <EventReminderDialog event={reminderFor} onClose={() => { setReminderFor(null); mutate("/push/scheduled"); }} />
      )}
    </div>
  );
}
