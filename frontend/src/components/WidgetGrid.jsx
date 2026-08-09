import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Crown, Users, Zap, Trophy, Award, Target, Timer, Plus, X, Settings2, GripVertical } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);
const STORAGE_KEY = "titanxis_widgets_v1";
const DEFAULT_WIDGETS = ["top_member", "active_events", "total_power", "personal_points"];

const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");
const fmtBig = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

const WIDGETS = [
  { key: "top_member", labelKey: "wg_top_member", icon: Crown, color: "#F5A623" },
  { key: "active_events", labelKey: "wg_active_events", icon: Trophy, color: "#E74C1A" },
  { key: "total_power", labelKey: "wg_total_power", icon: Zap, color: "#A855F7" },
  { key: "member_count", labelKey: "wg_member_count", icon: Users, color: "#3B82F6" },
  { key: "personal_points", labelKey: "wg_personal_points", icon: Award, color: "#22C55E" },
  { key: "personal_rank", labelKey: "wg_personal_rank", icon: Target, color: "#F97316" },
  { key: "rally_countdown", labelKey: "wg_rally_countdown", icon: Timer, color: "#EF4444" },
];

function useEnabledWidgets() {
  const [enabled, setEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_WIDGETS;
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)); } catch {}
  }, [enabled]);
  return [enabled, setEnabled];
}

function WidgetCard({ widgetKey, value, subtitle, onRemove, onDragStart, onDragOver, onDrop, dragging, t }) {
  const meta = WIDGETS.find((w) => w.key === widgetKey);
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <div
      data-testid={`widget-${widgetKey}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(widgetKey); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(widgetKey); }}
      onDrop={(e) => { e.preventDefault(); onDrop(widgetKey); }}
      className="relative rounded-xl p-3 transition-opacity"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
        border: `1px solid ${meta.color}55`,
        boxShadow: `0 4px 14px rgba(0,0,0,0.5), inset 0 0 12px ${meta.color}15`,
        cursor: "grab",
        opacity: dragging === widgetKey ? 0.45 : 1,
      }}
    >
      <div
        data-testid={`widget-drag-${widgetKey}`}
        style={{ position: "absolute", top: 6, left: 4, opacity: 0.4, cursor: "grab", color: "#F5F0E8" }}
        aria-hidden
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        data-testid={`widget-remove-${widgetKey}`}
        className="absolute top-2 right-2 rounded p-0.5 opacity-50 hover:opacity-100"
        style={{ color: "#F5F0E8" }}
        aria-label={t("wg_remove")}
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-center gap-2 mb-1.5 pl-4">
        <div
          className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{ width: 26, height: 26, background: `${meta.color}22`, border: `1px solid ${meta.color}80` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>
        <div className="text-[10px] font-bold uppercase truncate" style={{ color: meta.color, letterSpacing: "0.06em" }}>
          {t(meta.labelKey)}
        </div>
      </div>
      <div className="text-xl font-bold pl-4" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {subtitle && (
        <div className="text-[10px] mt-0.5 pl-4" style={{ color: "#F5F0E8", opacity: 0.6 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function useCountdown(targetIso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  const diff = target - now;
  return diff;
}

function fmtCountdown(diffMs) {
  if (diffMs === null || Number.isNaN(diffMs)) return "—";
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const core = d > 0 ? `${d}g ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return past ? `-${core}` : core;
}

export default function WidgetGrid() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [enabled, setEnabled] = useEnabledWidgets();
  const [picker, setPicker] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 8000 });
  const { data: lb = [] } = useSWR("/leaderboard", fetcher, { refreshInterval: 8000 });
  const { data: events = [] } = useSWR("/events?archived=false", fetcher, { refreshInterval: 30000 });
  const { data: myMember } = useSWR(
    user?.username ? `/members?search=${encodeURIComponent(user.username)}` : null,
    fetcher
  );

  // Find the next upcoming event (date in future, closest)
  const nextEvent = useMemo(() => {
    const nowMs = Date.now();
    const upcoming = (events || [])
      .filter((e) => e.date && new Date(e.date).getTime() > nowMs)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (upcoming.length > 0) return upcoming[0];
    // Fallback: most recent event (may be past)
    const past = (events || [])
      .filter((e) => e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return past[0] || null;
  }, [events]);
  const countdownMs = useCountdown(nextEvent?.date);

  const values = useMemo(() => {
    const top = lb[0];
    const me = Array.isArray(myMember) ? myMember.find((m) => (m.name || "").toLowerCase() === user?.username?.toLowerCase()) : null;
    const myRow = me ? lb.find((r) => r.member_id === me.id) : null;
    const myRank = me ? lb.findIndex((r) => r.member_id === me.id) : -1;
    return {
      top_member: { value: top?.name || "—", subtitle: top ? `${fmtBig(top.total_points)} ${t("wg_points_short")}` : "" },
      active_events: { value: stats?.event_count ?? "—", subtitle: t("wg_events_subtitle") },
      total_power: { value: fmtBig(stats?.total_power || 0), subtitle: fmt(stats?.total_power || 0) },
      member_count: { value: stats?.member_count ?? "—", subtitle: t("wg_members_subtitle") },
      personal_points: {
        value: myRow ? fmtBig(myRow.total_points) : "—",
        subtitle: me ? me.name : t("wg_personal_hint"),
      },
      personal_rank: {
        value: myRank >= 0 ? `#${myRank + 1}` : "—",
        subtitle: me ? me.alliance_name || "" : t("wg_personal_hint"),
      },
      rally_countdown: {
        value: fmtCountdown(countdownMs),
        subtitle: nextEvent ? nextEvent.name : t("wg_no_event"),
      },
    };
  }, [stats, lb, myMember, user, t, nextEvent, countdownMs]);

  const available = WIDGETS.filter((w) => !enabled.includes(w.key));

  const handleDrop = (targetKey) => {
    if (!dragging || dragging === targetKey) {
      setDragging(null); setDragOver(null); return;
    }
    const next = enabled.filter((k) => k !== dragging);
    const idx = next.indexOf(targetKey);
    next.splice(idx, 0, dragging);
    setEnabled(next);
    setDragging(null);
    setDragOver(null);
  };

  return (
    <section data-testid="widget-grid" className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3
          className="text-sm font-bold uppercase"
          style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
        >
          {t("wg_title")}
        </h3>
        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setPicker((v) => !v)}
            data-testid="widget-add-btn"
            className="px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1"
            style={{ background: "linear-gradient(135deg,#7C3AED,#3B82F6)", color: "#fff" }}
          >
            {picker ? <Settings2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {picker ? t("close") : t("wg_add")}
          </button>
        )}
      </div>

      {picker && (
        <div
          className="flex flex-wrap gap-1.5 mb-3 p-2 rounded-lg"
          data-testid="widget-picker"
          style={{ background: "rgba(20,12,10,0.6)", border: "1px dashed rgba(168,85,247,0.4)" }}
        >
          {available.length === 0 ? (
            <span className="text-[10px] opacity-60" style={{ color: "#F5F0E8" }}>{t("wg_all_added")}</span>
          ) : available.map((w) => {
            const Icon = w.icon;
            return (
              <button
                key={w.key}
                type="button"
                onClick={() => { setEnabled([...enabled, w.key]); }}
                data-testid={`widget-pick-${w.key}`}
                className="px-2 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1"
                style={{ background: `${w.color}22`, border: `1px solid ${w.color}`, color: w.color, letterSpacing: "0.06em" }}
              >
                <Icon className="w-3 h-3" /> {t(w.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        {enabled.map((key) => (
          <WidgetCard
            key={key}
            widgetKey={key}
            value={values[key]?.value ?? "—"}
            subtitle={values[key]?.subtitle}
            onRemove={() => setEnabled(enabled.filter((k) => k !== key))}
            onDragStart={setDragging}
            onDragOver={setDragOver}
            onDrop={handleDrop}
            dragging={dragging}
            t={t}
          />
        ))}
        {enabled.length === 0 && (
          <div
            className="col-span-full text-center p-4 rounded-lg text-xs"
            style={{ background: "rgba(20,12,10,0.5)", border: "1px dashed rgba(255,255,255,0.15)", color: "#F5F0E8", opacity: 0.6 }}
            data-testid="widget-empty"
          >
            {t("wg_empty")}
          </div>
        )}
      </div>
    </section>
  );
}
