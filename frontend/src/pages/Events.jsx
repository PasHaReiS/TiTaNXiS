import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { EVENTS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, Archive, X, Calendar, ArchiveRestore, Check, Camera, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ImageDropzone from "@/components/ImageDropzone";
import OcrDialog from "@/components/OcrDialog";
import EventAttendance from "@/components/EventAttendance";
import EventReminderDialog from "@/components/EventReminderDialog";
import EventCountdown from "@/components/EventCountdown";
import EventResultGallery from "@/components/EventResultGallery";
import { BellRing } from "lucide-react";
import { groupColor, groupBgTint } from "@/lib/groupColors";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Events() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("reminded"); // "reminded" | "unreminded" | "archive"
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [renamingGroup, setRenamingGroup] = useState(null); // group name being renamed
  const [renameValue, setRenameValue] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [reminderFor, setReminderFor] = useState(null); // event object → opens the reminder dialog

  const archived = tab === "archive";
  const { data: events = [] } = useSWR(`/events?archived=${archived}`, fetcher, { refreshInterval: 6000 });

  const allActive = useSWR("/events?archived=false", fetcher).data || [];
  const remindedCount = allActive.filter((e) => e.reminder_enabled !== false).length;
  const unremindedCount = allActive.filter((e) => e.reminder_enabled === false).length;
  const archivedCount = useSWR("/events?archived=true", fetcher).data?.length || 0;

  const filteredEvents = useMemo(() => {
    if (archived) return events;
    if (tab === "reminded") return events.filter((e) => e.reminder_enabled !== false);
    return events.filter((e) => e.reminder_enabled === false);
  }, [events, tab, archived]);

  const grouped = useMemo(() => {
    const g = {};
    filteredEvents.forEach((e) => {
      if (!g[e.group_name]) g[e.group_name] = [];
      g[e.group_name].push(e);
    });
    // Sort each group's events by date ascending (oldest first, newest last)
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    return g;
  }, [filteredEvents]);

  const archiveGroup = async (group) => {
    if (!window.confirm(t("confirm_archive_group", { group }))) return;
    await api.post(`/events/archive-group?group_name=${encodeURIComponent(group)}`);
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    mutate("/stats");
    toast.success(t("group_archived"));
  };

  const unarchiveGroup = async (group) => {
    if (!window.confirm(t("confirm_unarchive_group", { group }))) return;
    await api.post(`/events/unarchive-group?group_name=${encodeURIComponent(group)}`);
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    mutate("/stats");
    toast.success(t("group_unarchived"));
  };

  const deleteGroup = async (group) => {
    if (!window.confirm(t("confirm_delete_group", { group }))) return;
    try {
      const res = await api.delete(`/events/group/${encodeURIComponent(group)}`);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate((k) => typeof k === "string" && k.startsWith("/leaderboard"));
      mutate("/stats");
      mutate("/event-groups");
      toast.success(t("group_deleted", { count: res.data?.events_deleted || 0 }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const startRenameGroup = (group) => {
    setRenamingGroup(group);
    setRenameValue(group);
  };
  const commitRenameGroup = async (group) => {
    const nv = renameValue.trim();
    if (!nv || nv === group) { setRenamingGroup(null); return; }
    try {
      await api.post(`/events/rename-group?old_name=${encodeURIComponent(group)}&new_name=${encodeURIComponent(nv)}`);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate("/event-groups");
      toast.success(t("group_renamed", { old: group, new: nv }));
      setRenamingGroup(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  return (
    <div data-testid={EVENTS.container}>
      <Header title={t("nav_events")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground"><span className="gold-text font-bold mono">{remindedCount + unremindedCount}</span> {t("active")}</p>
          </div>
          <CanEdit>
            <button
              data-testid="events-ocr-btn"
              onClick={() => setOcrOpen(true)}
              className="chip text-xs flex items-center gap-1.5 mr-1"
              style={{ borderColor: "rgba(139,92,246,0.5)", color: "#A78BFA" }}
              title="Ekran Görüntüsünden Aktar"
            >
              <Camera className="w-3.5 h-3.5" /> OCR
            </button>
            <button
              data-testid={EVENTS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
            </button>
          </CanEdit>
        </div>

        <div className="flex mb-4 rounded-lg overflow-hidden" style={{ background: "rgba(15,8,20,0.85)", border: "1px solid rgba(120,53,15,0.30)" }} data-testid="events-tabs">
          <button
            data-testid="events-tab-reminded"
            onClick={() => setTab("reminded")}
            className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] uppercase font-black tracking-widest transition-all"
            style={{
              flex: "42",
              background: tab === "reminded" ? "linear-gradient(180deg, rgba(217,119,6,0.35), rgba(180,83,9,0.55))" : "rgba(20,15,25,0.7)",
              color: tab === "reminded" ? "#FFEDD5" : "#78716C",
              boxShadow: tab === "reminded" ? "inset 0 0 0 2px #F59E0B, 0 0 14px rgba(245,158,11,0.55), inset 0 0 22px rgba(251,146,60,0.20)" : "inset 0 0 0 1px rgba(75,65,55,0.35)",
              textShadow: tab === "reminded" ? "0 1px 6px rgba(0,0,0,0.75)" : "none",
              letterSpacing: "0.12em",
            }}
          >
            <BellRing className="w-3.5 h-3.5" style={{ color: tab === "reminded" ? "#FCD34D" : "#78716C" }} />
            <span>Hatırlatmalı ({remindedCount})</span>
          </button>
          <button
            data-testid="events-tab-unreminded"
            onClick={() => setTab("unreminded")}
            className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] uppercase font-bold tracking-widest transition-all"
            style={{
              flex: "38",
              background: tab === "unreminded" ? "linear-gradient(180deg, rgba(59,130,246,0.25), rgba(76,29,149,0.35))" : "rgba(20,15,25,0.7)",
              color: tab === "unreminded" ? "#DDD6FE" : "#6B7280",
              boxShadow: tab === "unreminded" ? "inset 0 0 0 1px rgba(129,140,248,0.55)" : "inset 0 0 0 1px rgba(55,50,65,0.30)",
              letterSpacing: "0.10em",
            }}
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>Hatırlatmasız ({unremindedCount})</span>
          </button>
          <button
            data-testid={EVENTS.tabArchived}
            onClick={() => setTab("archive")}
            className="flex items-center justify-center gap-1 py-2.5 text-[10px] uppercase font-bold tracking-wider transition-all"
            style={{
              flex: "20",
              background: tab === "archive" ? "linear-gradient(180deg, rgba(75,85,99,0.35), rgba(31,41,55,0.55))" : "rgba(20,15,25,0.7)",
              color: tab === "archive" ? "#E5E7EB" : "#6B7280",
              boxShadow: tab === "archive" ? "inset 0 0 0 1px rgba(148,163,184,0.45)" : "inset 0 0 0 1px rgba(55,50,65,0.30)",
              letterSpacing: "0.08em",
            }}
          >
            <Archive className="w-3 h-3" />
            <span>Arşiv ({archivedCount})</span>
          </button>
        </div>

        {Object.entries(grouped).map(([group, list]) => {
          const gc = groupColor(group);
          return (
          <div key={group} className="mb-5">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  data-testid={`event-group-dot-${group}`}
                  style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: gc, boxShadow: `0 0 6px ${gc}80` }}
                />
                {renamingGroup === group ? (
                  <input
                    autoFocus
                    data-testid={`event-group-rename-input-${group}`}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRenameGroup(group);
                      if (e.key === "Escape") setRenamingGroup(null);
                    }}
                    className="px-2 py-0.5 text-sm rounded"
                    style={{ background: "#1A1210", color: "#F5F0E8", border: `1px solid ${gc}88`, minWidth: 120 }}
                  />
                ) : (
                  <h3 className="text-sm font-bold uppercase tracking-wider truncate" style={{ color: gc, textShadow: `0 0 6px ${gc}55` }}>{group}</h3>
                )}
                <span className="chip" style={{ borderColor: `${gc}55`, color: gc }}>{list.length}</span>
              </div>
              <CanEdit>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {renamingGroup === group ? (
                    <>
                      <button
                        onClick={() => commitRenameGroup(group)}
                        data-testid={`event-group-rename-commit-${group}`}
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> {t("save")}
                      </button>
                      <button
                        onClick={() => setRenamingGroup(null)}
                        data-testid={`event-group-rename-cancel-${group}`}
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-neutral-500/15 text-neutral-300 border border-neutral-500/30 hover:bg-neutral-500/25 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> {t("cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startRenameGroup(group)}
                        data-testid={`event-group-rename-${group}`}
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 flex items-center gap-1"
                        title={t("group_rename")}
                      >
                        <Pencil className="w-3 h-3" /> {t("group_rename")}
                      </button>
                      {tab === "active" ? (
                        <button
                          onClick={() => archiveGroup(group)}
                          data-testid={`event-group-archive-${group}`}
                          className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-yellow-500/15 gold-text border border-yellow-500/30 hover:bg-yellow-500/25 flex items-center gap-1"
                          title={t("archive_group")}
                        >
                          <Archive className="w-3 h-3" /> {t("group_move_archive")}
                        </button>
                      ) : (
                        <button
                          onClick={() => unarchiveGroup(group)}
                          data-testid={`event-group-unarchive-${group}`}
                          className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 flex items-center gap-1"
                          title={t("group_unarchive")}
                        >
                          <ArchiveRestore className="w-3 h-3" /> {t("group_unarchive")}
                        </button>
                      )}
                      <button
                        onClick={() => deleteGroup(group)}
                        data-testid={`event-group-delete-${group}`}
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-red-500/15 red-text border border-red-500/30 hover:bg-red-500/25 flex items-center gap-1"
                        title={t("group_delete")}
                      >
                        <Trash2 className="w-3 h-3" /> {t("group_delete")}
                      </button>
                    </>
                  )}
                </div>
              </CanEdit>
            </div>

            <motion.div
              className="space-y-1.5"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.05 } },
              }}
            >
              {list.map((e) => {
                const evMs = new Date(e.date).getTime();
                const nowMs = Date.now();
                const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
                const endOfToday = startOfToday.getTime() + 86400000;
                const isTodayEvent = !e.archived && evMs >= startOfToday.getTime() && evMs < endOfToday;
                const isPastActive = !e.archived && evMs <= nowMs && (nowMs - evMs) < 6 * 3600 * 1000; // within 6h
                const highlight = isTodayEvent || isPastActive;
                return (
                <motion.div
                  key={e.id}
                  id={`event-${e.id}`}
                  data-testid={EVENTS.card(e.id)}
                  className={`card-dark row-hover ${e.banner_url ? "overflow-hidden" : "p-3 flex flex-col gap-2"}`}
                  variants={{
                    hidden: { opacity: 0, y: 14 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
                  }}
                  style={highlight ? {
                    backgroundImage: "repeating-linear-gradient(45deg, rgba(220,38,38,0.14), rgba(220,38,38,0.14) 6px, transparent 6px, transparent 14px)",
                    borderColor: "rgba(220,38,38,0.55)",
                    boxShadow: "0 0 12px rgba(220,38,38,0.25), inset 0 0 12px rgba(220,38,38,0.1)",
                  } : { borderLeft: `3px solid ${gc}`, background: groupBgTint(group, 0.06) }}
                >
                  {e.banner_url && (
                    <div
                      className="relative w-full"
                      style={{ height: 120 }}
                      data-testid={`event-hero-${e.id}`}
                    >
                      <img
                        src={e.banner_url}
                        alt={e.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(10,0,21,0) 0%, rgba(10,0,21,0.55) 65%, rgba(10,0,21,0.92) 100%)",
                        }}
                      />
                      <div
                        className="absolute left-3 bottom-2 right-3 text-white font-black uppercase tracking-widest truncate"
                        style={{ fontFamily: "Cinzel, serif", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
                      >
                        {e.name}
                      </div>
                    </div>
                  )}
                  <div className={e.banner_url ? "p-3 flex items-center gap-3" : "flex items-center gap-3"}>
                  <div className="tr-flag" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate flex items-center gap-1.5">
                      {e.name}
                      {highlight && (
                        <span
                          data-testid={`event-today-badge-${e.id}`}
                          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                          style={{
                            background: "linear-gradient(135deg,#DC2626,#F97316)",
                            color: "#fff",
                            letterSpacing: "0.08em",
                            animation: "pulse 2s ease-in-out infinite",
                          }}
                        >
                          {isTodayEvent ? t("event_today_badge") : t("event_active_badge")}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">
                      <span>Çarpan: <span className="gold-text mono">{e.multiplier}x</span></span>
                      <span>•</span>
                      <span>{new Date(e.date).toLocaleDateString("tr-TR")}</span>
                      {e.subtitle && <><span>•</span><span>{e.subtitle}</span></>}
                      {!e.archived && <EventCountdown target={e.date} testId={`event-countdown-${e.id}`} />}
                    </div>
                  </div>
                  <CanEdit>
                    {!e.archived ? (
                      <button
                        data-testid={EVENTS.archiveBtn(e.id)}
                        onClick={async () => {
                          await api.patch(`/events/${e.id}`, { archived: true });
                          mutate((k) => typeof k === "string" && k.startsWith("/events"));
                          toast.success(t("archived"));
                        }}
                        className="w-8 h-8 rounded-md bg-yellow-500/15 hover:bg-yellow-500/30 gold-text flex items-center justify-center"
                        aria-label={t("archive")}
                        title={t("archive")}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        data-testid={`event-unarchive-${e.id}`}
                        onClick={async () => {
                          await api.patch(`/events/${e.id}`, { archived: false });
                          mutate((k) => typeof k === "string" && k.startsWith("/events"));
                          toast.success(t("group_unarchived") || "Etkinlik aktife alındı");
                        }}
                        className="w-8 h-8 rounded-md bg-green-500/15 hover:bg-green-500/30 text-green-400 flex items-center justify-center"
                        aria-label={t("group_unarchive")}
                        title={t("group_unarchive")}
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      data-testid={EVENTS.editBtn(e.id)}
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="w-8 h-8 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                      title={t("edit")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      data-testid={EVENTS.deleteBtn(e.id)}
                      onClick={async () => {
                        if (!window.confirm(t("confirm_delete_generic", { name: e.name }))) return;
                        await api.delete(`/events/${e.id}`);
                        mutate((k) => typeof k === "string" && k.startsWith("/events"));
                        mutate("/stats");
                        toast.success(t("event_deleted"));
                      }}
                      className="w-8 h-8 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                      title={t("delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </CanEdit>
                  </div>
                  {e.reminder_enabled !== false && (
                    <EventAttendance eventId={e.id} testIdPrefix={`event-att-${e.id}`} />
                  )}
                  {new Date(e.date).getTime() < Date.now() && (
                    <EventResultGallery event={e} />
                  )}
                </motion.div>
                );
              })}
            </motion.div>
          </div>
          );
        })}

        {events.length === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">{t("no_events")}</div>
        )}
      </div>

      {showForm && (
        <EventForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}

      {reminderFor && (
        <EventReminderDialog event={reminderFor} onClose={() => setReminderFor(null)} />
      )}

      <OcrDialog
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        mode="event"
        title="Etkinlik Puanı — Ekran Görüntüsünden Aktar"
        requireSelection={{
          type: "event",
          label: "Bu puanları hangi etkinliğe eklemek istiyorsun?",
          placeholder: "Etkinlik seç",
          options: (events || [])
            .filter((e) => !e.archived)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((e) => ({
              id: e.id,
              label: `${e.name}${e.date ? ` · ${new Date(e.date).toLocaleDateString("tr-TR")}` : ""}`,
            })),
        }}
        onApply={async (data, extra) => {
          const parts = data.participants || [];
          if (!extra?.event_id) throw new Error("Etkinlik seçilmedi");
          const res = await api.post("/ocr/apply-event-points", {
            event_id: extra.event_id,
            participants: parts,
          });
          mutate("/events");
          mutate((k) => typeof k === "string" && k.startsWith("/points"));
          mutate((k) => typeof k === "string" && k.startsWith("/members"));
          mutate("/stats");
          const errs = (res.data.errors || []).length;
          const newMembers = res.data.new_members_created || 0;
          toast.success(
            `${res.data.created} puan '${res.data.event_name}' etkinliğine eklendi` +
              (newMembers ? ` · ${newMembers} yeni üye oluşturuldu` : "") +
              (errs ? ` · ${errs} hata` : ""),
          );
        }}
      />
    </div>
  );
}

function EventForm({ initial, onClose }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(
    initial?.date
      ? (() => {
          const d = new Date(initial.date);
          const tz = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - tz).toISOString().slice(0, 16);
        })()
      : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [multiplier, setMultiplier] = useState(initial?.multiplier || 1);
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [grouped, setGrouped] = useState(
    initial ? !!(initial.group_name && String(initial.group_name).trim()) : true,
  );
  const [groupName, setGroupName] = useState(initial?.group_name || "SvS vs 10007");
  const [reminderEnabled, setReminderEnabled] = useState(
    initial ? initial.reminder_enabled !== false : true,
  );
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(initial?.banner_url ? [{ id: "existing", url: initial.banner_url, filename: "banner" }] : []);
  const { data: activeGroups = [] } = useSWR("/event-groups?active_only=true", fetcher);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("name_field_required")); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(), date: new Date(date).toISOString(),
        multiplier: Number(multiplier), subtitle: subtitle.trim() || null,
        group_name: grouped ? (groupName || "").trim() || null : "",
        banner_url: banner[0]?.url || null,
        reminder_enabled: reminderEnabled,
      };
      if (initial) await api.patch(`/events/${initial.id}`, body);
      else await api.post("/events", body);
      mutate((k) => typeof k === "string" && (k.startsWith("/events") || k.startsWith("/event-groups")));
      mutate("/stats");
      toast.success(initial ? t("updated") : t("event_added"));
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? t("edit_event") : t("new_event")}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("name_field")}</label>
        <input data-testid={EVENTS.formName} value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("date")}</label>
        <input data-testid={EVENTS.formDate} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("multiplier")}</label>
        <input data-testid={EVENTS.formMultiplier} type="number" step="0.5" value={multiplier} onChange={(e) => setMultiplier(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("subtitle")}</label>
        <input data-testid={EVENTS.formSubtitle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
          placeholder={t("subtitle_example")}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Grup Tipi</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            data-testid="event-form-grouped-yes"
            onClick={() => setGrouped(true)}
            className={`chip justify-center py-2 ${grouped ? "active" : ""}`}
            aria-pressed={grouped}
          >
            Gruplu
          </button>
          <button
            type="button"
            data-testid="event-form-grouped-no"
            onClick={() => setGrouped(false)}
            className={`chip justify-center py-2 ${!grouped ? "active" : ""}`}
            aria-pressed={!grouped}
          >
            Grupsuz
          </button>
        </div>

        {(!grouped || !(groupName || "").trim()) && (
          <div
            data-testid="event-form-groupless-hint"
            className="mt-2 rounded p-2 text-[11px] flex items-start gap-2"
            style={{
              background: "rgba(245,166,35,0.08)",
              border: "1px solid rgba(245,166,35,0.35)",
              color: "#F5A623",
            }}
          >
            <span aria-hidden>ⓘ</span>
            <span>Bu etkinlik <b>kendi adıyla</b> sıralamada görünecek.</span>
          </div>
        )}

        {grouped && (
          <>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("group")}</label>
            {activeGroups.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                {activeGroups.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    data-testid={`event-group-chip-${g.name}`}
                    onClick={() => setGroupName(g.name)}
                    className={`chip ${groupName === g.name ? "active" : ""}`}
                  >
                    {g.name}
                    <span className="ml-1 text-[9px] opacity-70">({g.active})</span>
                  </button>
                ))}
              </div>
            )}
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
              data-testid={EVENTS.formGroup || "event-form-group"}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Etkinlik Görseli</label>
        <ImageDropzone purpose="event" value={banner} onChange={setBanner} max={1} compact />

        <div className="mt-4 rounded p-3" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.30)" }} data-testid="event-form-reminder-toggle">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              data-testid="event-form-reminder-checkbox"
              className="cursor-pointer"
            />
            <span className="flex-1">
              <span className="block text-sm font-bold text-white">
                🔔 {t("event_form_reminder_label") || "Bu etkinlik için hatırlatma kurulabilir"}
              </span>
              <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">
                {reminderEnabled
                  ? (t("event_form_reminder_hint_on") || "Etkinlik 'Hatırlatmalı' sekmesinde görünür — Bildirim Kur butonu aktif olur.")
                  : (t("event_form_reminder_hint_off") || "Etkinlik 'Hatırlatmasız' sekmesine gider — sadece kayıt tutulur, hatırlatma önerilmez.")}
              </span>
            </span>
          </label>
        </div>

        <button data-testid={EVENTS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : initial ? t("update") : t("add_short")}
        </button>
      </form>
    </div>
  );
}
