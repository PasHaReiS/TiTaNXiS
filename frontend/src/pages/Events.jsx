import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { EVENTS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, Archive, X, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Events() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: events = [] } = useSWR(`/events?archived=${tab === "archive"}`, fetcher, { refreshInterval: 6000 });

  const activeCount = useSWR("/events?archived=false", fetcher).data?.length || 0;
  const archivedCount = useSWR("/events?archived=true", fetcher).data?.length || 0;

  const grouped = useMemo(() => {
    const g = {};
    events.forEach((e) => {
      if (!g[e.group_name]) g[e.group_name] = [];
      g[e.group_name].push(e);
    });
    // Sort each group's events by date ascending (oldest first, newest last)
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    return g;
  }, [events]);

  const archiveGroup = async (group) => {
    if (!window.confirm(t("confirm_archive_group", { group }))) return;
    await api.post(`/events/archive-group?group_name=${encodeURIComponent(group)}`);
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    mutate("/stats");
    toast.success(t("group_archived"));
  };

  return (
    <div data-testid={EVENTS.container}>
      <Header title={t("nav_events")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground"><span className="gold-text font-bold mono">{activeCount}</span> {t("active")}</p>
          </div>
          <CanEdit>
            <button
              data-testid={EVENTS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
            </button>
          </CanEdit>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            data-testid={EVENTS.tabActive}
            onClick={() => setTab("active")}
            className={`chip ${tab === "active" ? "active" : ""}`}
          >{t("active_upper")} ({activeCount})</button>
          <button
            data-testid={EVENTS.tabArchived}
            onClick={() => setTab("archive")}
            className={`chip ${tab === "archive" ? "active" : ""}`}
          >{t("archive_upper")} ({archivedCount})</button>
        </div>

        {Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="tr-flag" />
                <h3 className="text-sm font-bold uppercase gold-text tracking-wider">{group}</h3>
                <span className="chip">{list.length}</span>
              </div>
              {tab === "active" && (
                <CanEdit>
                  <button onClick={() => archiveGroup(group)} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-red-500/15 red-text border border-red-500/30 hover:bg-red-500/25">
                    Grubu Arşivle
                  </button>
                </CanEdit>
              )}
            </div>

            <div className="space-y-1.5">
              {list.map((e) => {
                const evMs = new Date(e.date).getTime();
                const nowMs = Date.now();
                const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
                const endOfToday = startOfToday.getTime() + 86400000;
                const isTodayEvent = !e.archived && evMs >= startOfToday.getTime() && evMs < endOfToday;
                const isPastActive = !e.archived && evMs <= nowMs && (nowMs - evMs) < 6 * 3600 * 1000; // within 6h
                const highlight = isTodayEvent || isPastActive;
                return (
                <div
                  key={e.id}
                  data-testid={EVENTS.card(e.id)}
                  className="card-dark p-3 flex items-center gap-3 row-hover"
                  style={highlight ? {
                    backgroundImage: "repeating-linear-gradient(45deg, rgba(220,38,38,0.14), rgba(220,38,38,0.14) 6px, transparent 6px, transparent 14px)",
                    borderColor: "rgba(220,38,38,0.55)",
                    boxShadow: "0 0 12px rgba(220,38,38,0.25), inset 0 0 12px rgba(220,38,38,0.1)",
                  } : undefined}
                >
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
                    <div className="text-[10px] text-muted-foreground truncate">
                      Çarpan: <span className="gold-text mono">{e.multiplier}x</span> • {new Date(e.date).toLocaleDateString("tr-TR")} • {e.subtitle}
                    </div>
                  </div>
                  <CanEdit>
                    {!e.archived && (
                      <button
                        data-testid={EVENTS.archiveBtn(e.id)}
                        onClick={async () => {
                          await api.patch(`/events/${e.id}`, { archived: true });
                          mutate((k) => typeof k === "string" && k.startsWith("/events"));
                          toast.success(t("archived"));
                        }}
                        className="w-8 h-8 rounded-md bg-yellow-500/15 hover:bg-yellow-500/30 gold-text flex items-center justify-center"
                        aria-label={t("archive")}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      data-testid={EVENTS.editBtn(e.id)}
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="w-8 h-8 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
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
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </CanEdit>
                </div>
                );
              })}
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">{t("no_events")}</div>
        )}
      </div>

      {showForm && (
        <EventForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
    </div>
  );
}

function EventForm({ initial, onClose }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [multiplier, setMultiplier] = useState(initial?.multiplier || 1);
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [groupName, setGroupName] = useState(initial?.group_name || "SvS vs 10007");
  const [saving, setSaving] = useState(false);
  const { data: activeGroups = [] } = useSWR("/event-groups?active_only=true", fetcher);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("name_field_required")); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), date: new Date(date).toISOString(), multiplier: Number(multiplier), subtitle: subtitle.trim() || null, group_name: groupName };
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
        <input data-testid={EVENTS.formDate} type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("multiplier")}</label>
        <input data-testid={EVENTS.formMultiplier} type="number" step="0.5" value={multiplier} onChange={(e) => setMultiplier(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("subtitle")}</label>
        <input data-testid={EVENTS.formSubtitle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
          placeholder={t("subtitle_example")}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

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

        <button data-testid={EVENTS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : initial ? t("update") : t("add_short")}
        </button>
      </form>
    </div>
  );
}
