import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Users, Wifi, Calendar, Zap, TrendingUp, TrendingDown,
  Smartphone, Monitor, Tablet, Trophy, Clock, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { api, fmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fetcher = (url) => api.get(url).then((r) => r.data);
const BG = "#111111";
const VIOLET = "#8B5CF6";
const AMBER = "#F59E0B";
const CARD = "#1F1F1F";

/* ---------------- helpers ---------------- */
function CountUp({ value, duration = 1200, format = fmt }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const to = Number(value) || 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(v)}</>;
}

function relTime(ts) {
  if (!ts) return "";
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return `${s} sn önce`;
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86400)} gün önce`;
}

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

/* ---------------- header ---------------- */
function DashboardHeader() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const dateStr = useMemo(() => {
    try {
      const d = new Intl.DateTimeFormat("tr-TR", {
        day: "numeric", month: "long", year: "numeric", weekday: "long",
      }).format(now);
      const time = now.toTimeString().slice(0, 5);
      return `${d} · ${time}`;
    } catch { return ""; }
  }, [now]);
  return (
    <div className="pb-4" data-testid="dashboard-header"
         style={{ borderBottom: `1px solid ${AMBER}66`, boxShadow: `0 1px 0 ${AMBER}22` }}>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-black"
            style={{ color: "#fff", fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }}>
          Merhaba {user?.username || "Komutan"} <span style={{ color: AMBER }}>👑</span>
        </h1>
        <div className="text-xs sm:text-sm mono" style={{ color: "#9CA3AF" }}>{dateStr}</div>
      </div>
    </div>
  );
}

/* ---------------- section title ---------------- */
function SectionTitle({ children }) {
  return (
    <h2
      className="text-[11px] uppercase tracking-[.2em] font-black mt-6 mb-3 flex items-center gap-2"
      style={{ color: AMBER, fontFamily: "Cinzel, serif" }}
    >
      <span aria-hidden style={{ width: 24, height: 1, background: AMBER }} />
      {children}
    </h2>
  );
}

/* ---------------- stat card ---------------- */
function StatCard({ Icon, label, value, trend, format = fmt, testId }) {
  const up = (trend ?? 0) >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;
  return (
    <div
      className="rounded-xl p-3 sm:p-4 transition-transform hover:translate-y-[-2px] overflow-hidden"
      data-testid={testId}
      style={{
        background: CARD,
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ background: `${VIOLET}22`, boxShadow: `inset 0 0 12px ${VIOLET}55` }}
        >
          <Icon className="w-5 h-5" style={{ color: VIOLET }} />
        </div>
        <div
          className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: up ? "#10B981" : "#EF4444",
          }}
        >
          <TrendIcon className="w-3 h-3" />
          {Math.abs(trend ?? 0).toFixed(1)}%
        </div>
      </div>
      <div className="text-[11px] uppercase tracking-widest mb-1 truncate" style={{ color: "#9CA3AF" }} title={label}>
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-black mono truncate" style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace" }} title={String(value)}>
        <CountUp value={value} format={format} />
      </div>
    </div>
  );
}

/* ---------------- weekly chart ---------------- */
function WeeklyChart({ rows }) {
  return (
    <div
      className="rounded-xl p-4 h-[320px]"
      style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
      data-testid="weekly-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="metric" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: BG, border: `1px solid ${VIOLET}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: AMBER }}
            cursor={{ fill: "rgba(139,92,246,0.08)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} verticalAlign="top" />
          <Bar dataKey="thisWeek" name="Bu Hafta" fill={VIOLET} radius={[6, 6, 0, 0]} animationDuration={900} />
          <Bar dataKey="lastWeek" name="Geçen Hafta" fill={AMBER} radius={[6, 6, 0, 0]} animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- top members ---------------- */
function TopMembers({ items }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
         data-testid="top-members-card">
      <div className="text-xs uppercase tracking-widest font-black mb-3 flex items-center gap-2"
           style={{ color: "#fff" }}>
        <Trophy className="w-3.5 h-3.5" style={{ color: AMBER }} /> En Güçlü 5
      </div>
      <div className="space-y-2.5">
        {(items || []).map((m) => (
          <div key={m.id} className="flex items-center gap-3 min-w-0">
            <span className="w-5 text-center text-xs font-black flex-shrink-0" style={{ color: AMBER }}>
              #{m.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                <span className="text-xs font-bold truncate min-w-0" title={m.name} style={{ color: "#fff" }}>{m.name}</span>
                <span className="text-[10px] mono whitespace-nowrap flex-shrink-0" style={{ color: "#9CA3AF" }}>{fmt(m.power)}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((m.ratio || 0) * 100)}%`,
                    background: `linear-gradient(90deg, ${VIOLET}, ${VIOLET}88)`,
                    boxShadow: `0 0 10px ${VIOLET}55`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- recent events ---------------- */
const STATUS_PILL = {
  active:    { label: "Aktif",       bg: "rgba(16,185,129,0.15)", color: "#10B981" },
  upcoming:  { label: "Yaklaşan",    bg: `${AMBER}22`,             color: AMBER },
  completed: { label: "Tamamlandı",  bg: "rgba(156,163,175,0.15)", color: "#9CA3AF" },
};
function RecentEvents({ items }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
         data-testid="recent-events-card">
      <div className="text-xs uppercase tracking-widest font-black mb-3" style={{ color: "#fff" }}>
        Son Etkinlikler
      </div>
      <div className="space-y-2">
        {(items || []).length === 0 && <div className="text-xs" style={{ color: "#9CA3AF" }}>Kayıt yok</div>}
        {(items || []).map((e) => {
          const s = STATUS_PILL[e.status] || STATUS_PILL.completed;
          return (
            <div key={e.id} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate" style={{ color: "#fff" }}>{e.name}</div>
                <div className="text-[10px] mono" style={{ color: "#9CA3AF" }}>{(e.date || "").slice(0, 10)}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: s.bg, color: s.color }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- recent logins ---------------- */
function RecentLogins({ items }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
         data-testid="recent-logins-card">
      <div className="text-xs uppercase tracking-widest font-black mb-3" style={{ color: "#fff" }}>
        Son Giriş Yapanlar
      </div>
      <div className="space-y-2">
        {(items || []).length === 0 && <div className="text-xs" style={{ color: "#9CA3AF" }}>Kayıt yok</div>}
        {(items || []).map((u) => (
          <div key={u.username + u.created_at} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
              style={{ background: `${VIOLET}22`, color: VIOLET, border: `1px solid ${VIOLET}55` }}
            >
              {initial(u.username)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate" style={{ color: "#fff" }}>{u.username}</div>
              <div className="text-[10px]" style={{ color: "#9CA3AF" }}>{relTime(u.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- upcoming events (calendar-style) ---------------- */
const MONTHS_TR = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
function Upcoming({ items }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
         data-testid="upcoming-events-card">
      <div className="text-xs uppercase tracking-widest font-black mb-3" style={{ color: "#fff" }}>
        Yaklaşan
      </div>
      <div className="space-y-2.5">
        {(items || []).length === 0 && <div className="text-xs" style={{ color: "#9CA3AF" }}>Yok</div>}
        {(items || []).map((e) => {
          const d = e.date ? new Date(e.date) : null;
          const day = d ? d.getDate() : "?";
          const mon = d ? MONTHS_TR[d.getMonth()] : "";
          return (
            <div key={e.id} className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-lg flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}55` }}
              >
                <span className="text-sm font-black" style={{ color: AMBER }}>{day}</span>
                <span className="text-[8px] uppercase" style={{ color: AMBER }}>{mon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate" style={{ color: "#fff" }}>{e.name}</div>
                {e.subtitle && <div className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>{e.subtitle}</div>}
              </div>
              <ChevronRight className="w-3 h-3" style={{ color: "#9CA3AF" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- activity log ---------------- */
const ACTION_META = {
  login:         { label: "Giriş",              bg: "rgba(16,185,129,0.15)", color: "#10B981" },
  score_update:  { label: "Puan Güncelleme",    bg: `${VIOLET}22`,           color: VIOLET },
  event_join:    { label: "Etkinlik Katılım",   bg: `${AMBER}22`,            color: AMBER },
  member_added:  { label: "Üye Eklendi",        bg: "rgba(103,232,249,0.15)", color: "#67E8F9" },
  rank_change:   { label: "Sıralama Değişimi",  bg: "rgba(236,72,153,0.15)", color: "#EC4899" },
};
const DEVICE_ICON = { mobile: Smartphone, desktop: Monitor, tablet: Tablet };

function ActivityLog() {
  const [filter, setFilter] = useState("all");
  const [visible, setVisible] = useState(false);
  const { data: rows = [] } = useSWR(
    visible ? `/dashboard/activity-log?filter=${filter}` : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const tabs = [
    { key: "all", label: "Tümü" },
    { key: "logins", label: "Girişler" },
    { key: "scores", label: "Puanlar" },
    { key: "events", label: "Etkinlikler" },
  ];
  const reset = () => { setFilter("all"); setVisible(false); };
  return (
    <div className="rounded-xl p-3 sm:p-4 overflow-hidden"
         style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
         data-testid="activity-log-card">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          data-testid="activity-log-toggle"
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
          style={{
            background: visible ? `${VIOLET}22` : "rgba(255,255,255,0.04)",
            color: visible ? "#fff" : "#9CA3AF",
            border: `1px solid ${visible ? VIOLET : "rgba(255,255,255,0.08)"}`,
          }}
        >
          <span aria-hidden>{visible ? "🙈" : "👁"}</span>
          <span>Son İşlemleri {visible ? "Gizle" : "Göster"}</span>
        </button>
        <button
          type="button"
          onClick={reset}
          data-testid="activity-log-reset"
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(245,158,11,0.1)",
            color: AMBER,
            border: `1px solid ${AMBER}55`,
          }}
        >
          <span aria-hidden>🔄</span>
          <span>Sıfırla</span>
        </button>
        {visible && (
          <div className="ml-auto flex items-center gap-1 flex-wrap" data-testid="activity-filter-pills">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                data-testid={`activity-filter-${t.key}`}
                className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full transition-all"
                style={{
                  background: filter === t.key ? VIOLET : "rgba(139,92,246,0.1)",
                  color: filter === t.key ? "#fff" : VIOLET,
                  border: `1px solid ${VIOLET}55`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {visible && (
        <div className="overflow-x-auto">
          <table
            className="w-full text-[11px]"
            style={{ tableLayout: "fixed", borderCollapse: "collapse" }}
            data-testid="activity-log-table"
          >
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "26%" }} className="hidden sm:table-column" />
              <col style={{ width: "16%" }} />
              <col style={{ width: "8%" }} className="hidden sm:table-column" />
            </colgroup>
            <thead>
              <tr className="text-left uppercase text-[9px] tracking-widest" style={{ color: "#9CA3AF" }}>
                <th className="pb-2 pr-2">Kullanıcı</th>
                <th className="pb-2 pr-2">İşlem</th>
                <th className="pb-2 pr-2 hidden sm:table-cell">Detay</th>
                <th className="pb-2 pr-2">Zaman</th>
                <th className="pb-2 pr-2 hidden sm:table-cell">Cihaz</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center" style={{ color: "#9CA3AF" }}>Kayıt yok</td></tr>
              )}
              {rows.map((r, i) => {
                const meta = ACTION_META[r.action_type] || { label: r.action_type, bg: "rgba(255,255,255,0.05)", color: "#9CA3AF" };
                const DevIcon = DEVICE_ICON[r.device] || Monitor;
                return (
                  <tr key={r.id || i} className="border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    <td className="py-2 pr-2 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
                          style={{ background: `${VIOLET}22`, color: VIOLET, border: `1px solid ${VIOLET}55` }}
                        >
                          {initial(r.member_name)}
                        </div>
                        <span className="truncate min-w-0" title={r.member_name} style={{ color: "#fff" }}>
                          {r.member_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 overflow-hidden">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block max-w-full truncate"
                            title={meta.label}
                            style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                    </td>
                    <td className="py-2 pr-2 hidden sm:table-cell overflow-hidden" style={{ color: "#9CA3AF" }}>
                      <span className="block truncate" title={r.details}>{r.details}</span>
                    </td>
                    <td className="py-2 pr-2 overflow-hidden" style={{ color: "#9CA3AF" }}>
                      <span className="block truncate" title={r.timestamp}>{relTime(r.timestamp)}</span>
                    </td>
                    <td className="py-2 pr-2 hidden sm:table-cell">
                      <DevIcon className="w-3.5 h-3.5" style={{ color: "#9CA3AF" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- skeleton ---------------- */
function Skeleton({ height = 80 }) {
  return (
    <div className="rounded-xl animate-pulse"
         style={{ height, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }} />
  );
}

/* ---------------- draggable grid + layout templates ---------------- */
const ORDER_KEY = "dash_grid_order_v1";
const LAYOUTS_KEY = "dash_grid_layouts_v1";
const ACTIVE_LAYOUT_KEY = "dash_grid_active_v1";

function DraggableGrid({ items }) {
  const defaultOrder = items.map((it) => it.key);
  const [order, setOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (!raw) return defaultOrder;
      const parsed = JSON.parse(raw);
      const valid = parsed.filter((k) => defaultOrder.includes(k));
      defaultOrder.forEach((k) => { if (!valid.includes(k)) valid.push(k); });
      return valid;
    } catch { return defaultOrder; }
  });
  const [draggingKey, setDraggingKey] = useState(null);
  const [layouts, setLayouts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || "[]"); }
    catch { return []; }
  });
  const [activeLayout, setActiveLayout] = useState(() =>
    localStorage.getItem(ACTIVE_LAYOUT_KEY) || "",
  );
  const [newName, setNewName] = useState("");
  const isCustomOrder = useMemo(
    () => order.join("|") !== defaultOrder.join("|"),
    [order, defaultOrder],
  );

  const byKey = useMemo(() => Object.fromEntries(items.map((it) => [it.key, it.node])), [items]);

  const persist = (next) => {
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch {}
  };
  const persistLayouts = (next) => {
    setLayouts(next);
    try { localStorage.setItem(LAYOUTS_KEY, JSON.stringify(next)); } catch {}
  };
  const setActiveLayoutPersist = (name) => {
    setActiveLayout(name);
    try {
      if (name) localStorage.setItem(ACTIVE_LAYOUT_KEY, name);
      else localStorage.removeItem(ACTIVE_LAYOUT_KEY);
    } catch {}
  };

  const resetOrder = () => {
    try {
      localStorage.removeItem(ORDER_KEY);
      localStorage.removeItem(ACTIVE_LAYOUT_KEY);
    } catch {}
    window.location.reload();
  };

  const saveLayout = () => {
    const name = newName.trim();
    if (!name) return;
    const next = layouts.filter((l) => l.name !== name);
    next.push({ name, order: [...order] });
    persistLayouts(next);
    setActiveLayoutPersist(name);
    setNewName("");
  };
  const applyLayout = (name) => {
    const found = layouts.find((l) => l.name === name);
    if (!found) return;
    setActiveLayoutPersist(name);
    persist(found.order);
  };
  const deleteLayout = (name) => {
    persistLayouts(layouts.filter((l) => l.name !== name));
    if (activeLayout === name) setActiveLayoutPersist("");
  };

  const onDragStart = (key) => (e) => {
    setDraggingKey(key);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", key); } catch {}
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (targetKey) => (e) => {
    e.preventDefault();
    const sourceKey = draggingKey || e.dataTransfer.getData("text/plain");
    setDraggingKey(null);
    if (!sourceKey || sourceKey === targetKey) return;
    const next = [...order];
    const from = next.indexOf(sourceKey);
    const to = next.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, sourceKey);
    persist(next);
    // Reordering breaks the active template link — clear it.
    if (activeLayout) setActiveLayoutPersist("");
  };

  return (
    <>
      <div
        className="md:col-span-2 flex flex-wrap items-center gap-2 p-2 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        data-testid="dash-layouts-bar"
      >
        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#9CA3AF" }}>
          Şablonlar:
        </span>
        {layouts.length === 0 && (
          <span className="text-[10px]" style={{ color: "#6B7280" }}>henüz yok</span>
        )}
        {layouts.map((l) => (
          <span key={l.name} className="flex items-center gap-1 rounded-full"
                style={{
                  background: activeLayout === l.name ? VIOLET : "rgba(139,92,246,0.1)",
                  border: `1px solid ${VIOLET}55`,
                }}>
            <button
              type="button"
              onClick={() => applyLayout(l.name)}
              data-testid={`dash-layout-apply-${l.name}`}
              className="text-[11px] font-bold px-2.5 py-1"
              style={{ color: activeLayout === l.name ? "#fff" : VIOLET }}
            >
              {l.name}
            </button>
            <button
              type="button"
              onClick={() => deleteLayout(l.name)}
              data-testid={`dash-layout-del-${l.name}`}
              className="text-[10px] px-1.5 py-1 opacity-70 hover:opacity-100"
              style={{ color: activeLayout === l.name ? "#fff" : VIOLET }}
              title="Sil"
            >
              ×
            </button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveLayout(); }}
            placeholder="Şablon adı (örn. Sabah)"
            data-testid="dash-layout-name-input"
            className="text-[11px] px-2 py-1 rounded outline-none"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: `1px solid ${VIOLET}44`,
              color: "#fff",
              width: 160,
            }}
          />
          <button
            type="button"
            onClick={saveLayout}
            disabled={!newName.trim()}
            data-testid="dash-layout-save"
            className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-40"
            style={{
              background: `${VIOLET}22`,
              color: "#C4B5FD",
              border: `1px solid ${VIOLET}66`,
            }}
          >
            💾 Kaydet
          </button>
          {isCustomOrder && (
            <button
              type="button"
              onClick={resetOrder}
              data-testid="dash-cards-reset-order"
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(245,158,11,0.1)",
                color: AMBER,
                border: `1px solid ${AMBER}55`,
              }}
            >
              <span aria-hidden>↺</span>
              <span>Varsayılan</span>
            </button>
          )}
        </div>
      </div>
      {order.map((key) => (
        <div
          key={key}
          draggable
          onDragStart={onDragStart(key)}
          onDragOver={onDragOver}
          onDrop={onDrop(key)}
          onDragEnd={() => setDraggingKey(null)}
          data-testid={`dash-card-${key}`}
          style={{
            cursor: "grab",
            opacity: draggingKey === key ? 0.5 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {byKey[key]}
        </div>
      ))}
    </>
  );
}

/* ---------------- page ---------------- */
export default function Dashboard() {
  const opts = { refreshInterval: 60000 };
  const { data: stats } = useSWR("/dashboard/stats", fetcher, opts);
  const { data: weekly = [] } = useSWR("/dashboard/weekly", fetcher, opts);
  const { data: topMembers = [] } = useSWR("/dashboard/top-members", fetcher, opts);
  const { data: recentEvents = [] } = useSWR("/dashboard/recent-events", fetcher, opts);
  const { data: recentLogins = [] } = useSWR("/dashboard/recent-logins", fetcher, opts);
  const { data: upcoming = [] } = useSWR("/dashboard/upcoming-events", fetcher, opts);

  const trends = stats?.trends || {};

  return (
    <div className="min-h-[calc(100vh-120px)] p-3 sm:p-5" style={{ background: BG, color: "#fff" }}
         data-testid="dashboard-page">
      <DashboardHeader />

      <SectionTitle>Bugün</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {!stats && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={128} />)}
        {stats && (
          <>
            <StatCard Icon={Users}    label="Toplam Üye"     value={stats.total_members} trend={trends.members} testId="stat-total-members" />
            <StatCard Icon={Wifi}     label="Çevrimiçi"      value={stats.online_count}  trend={trends.online}  testId="stat-online" />
            <StatCard Icon={Calendar} label="Aktif Etkinlik" value={stats.active_events} trend={trends.events}  testId="stat-active-events" />
            <StatCard Icon={Zap}      label="Toplam Güç"     value={stats.total_power}   trend={trends.power}   testId="stat-total-power" />
          </>
        )}
      </div>

      <SectionTitle>Haftalık Görünüm</SectionTitle>
      {weekly.length === 0 ? <Skeleton height={320} /> : <WeeklyChart rows={weekly} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3" data-testid="dashboard-cards-grid">
        <DraggableGrid
          items={[
            { key: "top",      node: <TopMembers items={topMembers} /> },
            { key: "recent",   node: <RecentEvents items={recentEvents} /> },
            { key: "logins",   node: <RecentLogins items={recentLogins} /> },
            { key: "upcoming", node: <Upcoming items={upcoming} /> },
          ]}
        />
      </div>

      <SectionTitle>Kullanıcı İşlemleri</SectionTitle>
      <ActivityLog />

      <div className="h-8" />
    </div>
  );
}
