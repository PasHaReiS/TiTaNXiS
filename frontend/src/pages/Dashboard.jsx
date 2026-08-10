import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Trophy, Swords, Calculator, Users, Flag, BarChart2,
  Sparkles, Radio, Activity as ActivityIcon, TrendingUp, TrendingDown, Minus,
  Zap, CheckCircle2, Clock, Crown,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Legend,
  Bar, Line, CartesianGrid,
} from "recharts";
import { api, fmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fetcher = (url) => api.get(url).then((r) => r.data);

const BASE = "#040008";
const VIOLET = "#7C3AED";
const AMBER = "#D97706";
const CYAN = "#67E8F9";

// ---------- helpers ----------
function CountUp({ value, duration = 1500 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const from = 0;
    const to = Number(value) || 0;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{fmt(v)}</>;
}

function relTime(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec} sn önce`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} dk önce`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)} sa önce`;
  return `${Math.round(diffSec / 86400)} gün önce`;
}

const NAV_ITEMS = [
  { to: "/dashboard", Icon: LayoutDashboard, label: "Dashboard" },
  { to: "/",          Icon: Trophy,          label: "Sıralama" },
  { to: "/komutanlar", Icon: Swords,         label: "Komutanlar" },
  { to: "/puan-hesaplama", Icon: Calculator, label: "Hesaplama" },
  { to: "/uyeler",    Icon: Users,           label: "Üyeler" },
  { to: "/etkinlikler", Icon: Flag,          label: "Etkinlikler" },
  { to: "/puanlar-hakkinda", Icon: BarChart2, label: "Puanlar" },
];

function IconRail() {
  return (
    <aside
      className="hidden lg:flex flex-col items-center gap-2 py-4 flex-shrink-0"
      data-testid="dashboard-sidebar"
      style={{
        width: 56, position: "sticky", top: 60, height: "calc(100vh - 60px)",
        background: "rgba(4,0,8,0.65)", borderRight: `1px solid ${VIOLET}33`,
      }}
    >
      {NAV_ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === "/dashboard"}
          data-testid={`dash-nav-${it.to.replace("/", "root")}`}
          title={it.label}
        >
          {({ isActive }) => (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: isActive ? `linear-gradient(135deg, ${VIOLET}, ${VIOLET}88)` : "transparent",
                boxShadow: isActive ? `0 0 20px ${VIOLET}88, inset 0 0 8px ${VIOLET}44` : "none",
                border: isActive ? `1px solid ${VIOLET}` : "1px solid transparent",
              }}
            >
              <it.Icon
                className="w-5 h-5"
                style={{ color: isActive ? "#fff" : "rgba(196,181,253,0.7)" }}
              />
            </div>
          )}
        </NavLink>
      ))}
    </aside>
  );
}

function StatChip({ Icon, label, value, tone = "violet", suffix = "" }) {
  const c = tone === "amber" ? AMBER : tone === "cyan" ? CYAN : VIOLET;
  return (
    <div
      className="rounded-xl p-3 sm:p-4 transition-all hover:translate-y-[-2px]"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        background: `linear-gradient(135deg, ${c}18, rgba(4,0,8,0.7))`,
        border: `1px solid ${c}44`,
        boxShadow: `0 0 24px ${c}22, inset 0 1px 0 ${c}22`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: c }} />
        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "rgba(196,181,253,0.7)" }}>
          {label}
        </span>
      </div>
      <div className="text-2xl sm:text-3xl font-black mono" style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>
        <CountUp value={value} />{suffix}
      </div>
    </div>
  );
}

function ActivityChart({ rows }) {
  return (
    <div className="rounded-xl p-4 h-[320px]"
         style={{ background: "rgba(124,58,237,0.06)", border: `1px solid ${VIOLET}44` }}>
      <h3 className="text-xs uppercase tracking-widest font-black mb-3"
          style={{ color: "#fff", fontFamily: "Cinzel, serif" }}>
        Lonca Aktivite &amp; Güç Trendi
      </h3>
      <ResponsiveContainer width="100%" height="88%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={AMBER} stopOpacity={0.95} />
              <stop offset="100%" stopColor={AMBER} stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(124,58,237,0.15)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis yAxisId="left" tick={{ fill: "#9CA3AF", fontSize: 9 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: "#9CA3AF", fontSize: 9 }}
                 tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
          <Tooltip
            contentStyle={{ background: BASE, border: `1px solid ${VIOLET}`, borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: AMBER }}
            formatter={(val, name) => [fmt(val), name === "logins" ? "Giriş" : "Güç"]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar yAxisId="left" dataKey="logins" fill="url(#barGrad)" name="Giriş" animationDuration={1200} />
          <Line yAxisId="right" type="monotone" dataKey="power" stroke={VIOLET} strokeWidth={2.5}
                dot={{ r: 3, fill: VIOLET }} name="Güç" animationDuration={1200} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WorldMap({ locations }) {
  // Convert lat/lng to SVG viewport coordinates.
  const w = 800, h = 400;
  const project = (lat, lng) => ({
    x: ((lng + 180) / 360) * w,
    y: ((90 - lat) / 180) * h,
  });
  const maxCount = Math.max(1, ...(locations || []).map((l) => l.count || 1));
  return (
    <div className="rounded-xl p-4"
         style={{ background: "rgba(124,58,237,0.06)", border: `1px solid ${VIOLET}44` }}>
      <h3 className="text-xs uppercase tracking-widest font-black mb-3"
          style={{ color: "#fff", fontFamily: "Cinzel, serif" }}>
        Üye Dağılımı
      </h3>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[220px]" data-testid="world-map">
        <defs>
          <radialGradient id="dotGrad">
            <stop offset="0%" stopColor={AMBER} stopOpacity={1} />
            <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
          </radialGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={`${VIOLET}22`} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill={BASE} />
        <rect width={w} height={h} fill="url(#grid)" />
        {/* Stylised continents blobs (decorative). */}
        {[
          { cx: 220, cy: 130, rx: 90, ry: 55 },
          { cx: 380, cy: 150, rx: 60, ry: 40 },
          { cx: 460, cy: 210, rx: 55, ry: 90 },
          { cx: 610, cy: 220, rx: 80, ry: 60 },
          { cx: 660, cy: 320, rx: 45, ry: 30 },
          { cx: 170, cy: 280, rx: 55, ry: 70 },
        ].map((c, i) => (
          <ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
                   fill={`${VIOLET}18`} stroke={`${VIOLET}44`} strokeWidth="0.6" />
        ))}
        {(locations || []).map((loc, i) => {
          const p = project(loc.lat, loc.lng);
          const r = 4 + (loc.count / maxCount) * 12;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={r + 6} fill="url(#dotGrad)" opacity="0.6" />
              <circle cx={p.x} cy={p.y} r={r} fill={AMBER} stroke="#fff" strokeWidth="0.6" opacity="0.9">
                <animate attributeName="r" values={`${r};${r + 2};${r}`} dur="2s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const STATUS_META = {
  active:    { color: "#10B981", bg: "rgba(16,185,129,0.15)", label: "AKTİF" },
  upcoming:  { color: AMBER,      bg: `${AMBER}22`,            label: "YAKLAŞAN" },
  completed: { color: "#9CA3AF", bg: "rgba(156,163,175,0.15)", label: "TAMAMLANDI" },
};

function RecentEvents({ events }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: "rgba(124,58,237,0.06)", border: `1px solid ${VIOLET}44` }}>
      <h3 className="text-xs uppercase tracking-widest font-black mb-3"
          style={{ color: "#fff", fontFamily: "Cinzel, serif" }}>
        Son Etkinlikler
      </h3>
      <div className="space-y-2" data-testid="recent-events">
        {(events || []).length === 0 && (
          <div className="text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>Kayıt yok</div>
        )}
        {(events || []).map((e) => {
          const s = STATUS_META[e.status] || STATUS_META.completed;
          return (
            <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg"
                 style={{ background: "rgba(4,0,8,0.5)", border: `1px solid ${VIOLET}22` }}>
              <Flag className="w-4 h-4" style={{ color: VIOLET }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate" style={{ color: "#fff" }}>{e.name}</div>
                <div className="text-[10px]" style={{ color: "rgba(196,181,253,0.6)" }}>
                  {(e.date || "").slice(0, 10)} · {e.participants || 0} katılımcı
                </div>
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}55` }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];
function TopMembersPodium({ members }) {
  return (
    <div className="rounded-xl p-4"
         style={{ background: "rgba(124,58,237,0.06)", border: `1px solid ${VIOLET}44` }}>
      <h3 className="text-xs uppercase tracking-widest font-black mb-3 flex items-center gap-2"
          style={{ color: "#fff", fontFamily: "Cinzel, serif" }}>
        <Crown className="w-4 h-4" style={{ color: AMBER }} /> Güç Sıralaması
      </h3>
      <div className="space-y-1.5" data-testid="top-members">
        {(members || []).map((m) => {
          const medal = MEDALS[m.rank - 1];
          const Trend = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
          const trendColor = m.trend === "up" ? "#10B981" : m.trend === "down" ? "#EF4444" : "#9CA3AF";
          return (
            <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg"
                 style={{ background: "rgba(4,0,8,0.5)", border: `1px solid ${VIOLET}22` }}>
              <span className="text-lg w-8 text-center">{medal || `#${m.rank}`}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate" style={{ color: "#fff" }}>{m.name}</div>
                <div className="text-[10px] mono" style={{ color: AMBER }}>{fmt(m.bireysel_guc || 0)}</div>
              </div>
              <Trend className="w-3.5 h-3.5" style={{ color: trendColor }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const KIND_ICON = { login: Radio, member_join: Users, score_update: Zap };
function ActivityFeed({ feed }) {
  return (
    <div className="rounded-xl p-4 h-full"
         style={{ background: "rgba(124,58,237,0.06)", border: `1px solid ${VIOLET}44` }}>
      <h3 className="text-xs uppercase tracking-widest font-black mb-3 flex items-center gap-2"
          style={{ color: "#fff", fontFamily: "Cinzel, serif" }}>
        <ActivityIcon className="w-4 h-4" style={{ color: CYAN }} /> Canlı Aktivite
      </h3>
      <div className="space-y-1.5 overflow-y-auto max-h-[280px] pr-1 lang-scroll" data-testid="activity-feed">
        {(feed || []).length === 0 && (
          <div className="text-xs" style={{ color: "rgba(196,181,253,0.5)" }}>Kayıt yok</div>
        )}
        {(feed || []).map((f, i) => {
          const Icon = KIND_ICON[f.kind] || ActivityIcon;
          const tone = f.kind === "login" ? CYAN : f.kind === "score_update" ? AMBER : VIOLET;
          return (
            <div key={`${f.kind}-${i}`} className="flex items-center gap-2 p-1.5 rounded"
                 style={{
                   background: "rgba(4,0,8,0.5)", borderLeft: `2px solid ${tone}`,
                   animation: `slideInRight 0.3s ease ${i * 0.05}s both`,
                 }}>
              <Icon className="w-3 h-3 flex-shrink-0" style={{ color: tone }} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] truncate" style={{ color: "#fff" }}>{f.text}</div>
                <div className="text-[9px]" style={{ color: "rgba(196,181,253,0.5)" }}>{relTime(f.at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopBanner({ stats }) {
  const { user } = useAuth();
  const dateStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("tr-TR", {
        day: "numeric", month: "long", year: "numeric", weekday: "long",
      }).format(new Date());
    } catch { return ""; }
  }, []);
  const total = stats?.total_members || 0;
  const online = stats?.online_now || 0;
  const growthPct = total > 0 ? Math.round((online / total) * 100) : 0;
  return (
    <div
      className="rounded-xl p-4 sm:p-6 mb-4 overflow-hidden relative"
      data-testid="dashboard-banner"
      style={{
        background: `linear-gradient(135deg, ${VIOLET}33 0%, ${BASE} 60%, ${AMBER}22 100%)`,
        border: `1px solid ${VIOLET}66`,
        boxShadow: `0 0 40px ${VIOLET}33, inset 0 0 60px ${VIOLET}18`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(600px 200px at 10% 20%, ${VIOLET}44, transparent), radial-gradient(400px 160px at 90% 80%, ${AMBER}33, transparent)`,
          pointerEvents: "none",
        }}
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1"
              style={{ color: "#fff", fontFamily: "Cinzel, serif", letterSpacing: "0.05em" }}>
            Merhaba {user?.username || "Komutan"} <span style={{ color: AMBER }}>👑</span>
          </h1>
          <div className="text-xs mb-2" style={{ color: "rgba(196,181,253,0.7)" }}>{dateStr}</div>
          <p className="text-sm max-w-2xl leading-relaxed" style={{ color: "rgba(245,240,232,0.85)" }}>
            Gücümüz her geçen gün artıyor! Bugün <b style={{ color: AMBER }}>{online}</b> üye çevrimiçi
            ve loncamız <b style={{ color: AMBER }}>{fmt(total)}</b> savaşçıdan oluşuyor
            {growthPct > 0 && <> — aktiflik oranı <b style={{ color: AMBER }}>%{growthPct}</b></>}.
          </p>
        </div>
        <Sparkles className="w-16 h-16 opacity-30 hidden sm:block" style={{ color: AMBER }} />
      </div>
    </div>
  );
}

// ---------- page ----------
export default function Dashboard() {
  const nav = useNavigate();
  const { data: stats } = useSWR("/dashboard/stats", fetcher, { refreshInterval: 30000 });
  const { data: chartData = [] } = useSWR("/dashboard/activity-chart", fetcher, { refreshInterval: 60000 });
  const { data: events = [] } = useSWR("/dashboard/recent-events", fetcher);
  const { data: topMembers = [] } = useSWR("/dashboard/top-members", fetcher);
  const { data: feed = [] } = useSWR("/dashboard/activity-feed", fetcher, { refreshInterval: 15000 });
  const { data: locations = [] } = useSWR("/dashboard/member-locations", fetcher);

  // Silence unused-var warning for `nav`; kept for future links.
  void nav;

  return (
    <div className="flex" style={{ background: BASE, color: "#F5F0E8", minHeight: "calc(100vh - 120px)" }}>
      <style>{`
        @keyframes slideInRight { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
      `}</style>
      <IconRail />
      <div className="flex-1 min-w-0 p-3 sm:p-5" data-testid="dashboard-page">
        <TopBanner stats={stats} />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4" data-testid="stat-chips">
          <StatChip Icon={Users}         label="Toplam Üye"    value={stats?.total_members || 0} tone="violet" />
          <StatChip Icon={Radio}         label="Çevrimiçi"     value={stats?.online_now || 0}    tone="cyan" />
          <StatChip Icon={Flag}          label="Aktif Etkinlik" value={stats?.active_events || 0} tone="amber" />
          <StatChip Icon={Crown}         label="En Yüksek Güç"  value={stats?.max_power || 0}     tone="amber" />
          <StatChip Icon={BarChart2}     label="Ortalama Güç"   value={stats?.avg_power || 0}     tone="violet" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div className="lg:col-span-2"><ActivityChart rows={chartData} /></div>
          <WorldMap locations={locations} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <RecentEvents events={events} />
          <TopMembersPodium members={topMembers} />
          <ActivityFeed feed={feed} />
        </div>
      </div>
    </div>
  );
}
