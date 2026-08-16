import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Loader2, Download, Users, CalendarDays, RefreshCw, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LineChart, Line, Legend, ReferenceLine, ReferenceArea } from "recharts";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

const PERIODS = [
  { key: "all", label: "Tümü" },
  { key: "30d", label: "30 Gün" },
  { key: "90d", label: "90 Gün" },
  { key: "180d", label: "180 Gün" },
];

const STATUS_META = {
  attending: { emoji: "✅", label: "Katılıyor", color: "#22C55E" },
  late: { emoji: "🕒", label: "Geç Kaldı", color: "#F5A623" },
  maybe: { emoji: "❔", label: "Belki", color: "#3B82F6" },
  declined: { emoji: "❌", label: "Katılmıyor", color: "#EF4444" },
  no_response: { emoji: "⚪", label: "Yanıtsız", color: "#78716C" },
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "2-digit" });
};

/**
 * Raporlar Merkezi — Phase 3. Two tabs:
 *   1. Üye Performansı — attendance / participation-rate table + Recharts bar
 *   2. Etkinlik Katılım İstatistikleri — per-event breakdown + editable status
 *
 * Admin-only page. Reachable via the header profile dropdown → 📊 Raporlar.
 */
export default function Reports() {
  const [tab, setTab] = useState("members");
  const [period, setPeriod] = useState("90d");
  return (
    <div data-testid="reports-page">
      <Header title="Raporlar Merkezi" />
      <div className="px-4 space-y-3">
        <ReportTabs tab={tab} setTab={setTab} />
        <PeriodBar period={period} setPeriod={setPeriod} tab={tab} />
        {tab === "members" ? <MembersReport period={period} /> : <EventsReport period={period} />}
      </div>
    </div>
  );
}

function ReportTabs({ tab, setTab }) {
  return (
    <div
      className="flex rounded-lg overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(15,8,20,0.85), rgba(10,5,15,0.95))",
        border: "1px solid rgba(120,53,15,0.35)",
      }}
      data-testid="reports-tabs"
    >
      {[
        { key: "members", emoji: "👥", label: "Üye Performansı" },
        { key: "events", emoji: "📅", label: "Etkinlik Katılım" },
      ].map((t, i) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            data-testid={`reports-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 transition-all"
            style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase",
              background: active
                ? "linear-gradient(180deg, rgba(245,166,35,0.28), rgba(180,83,9,0.45))"
                : "rgba(20,15,25,0.65)",
              color: active ? "#FFEDD5" : "#78716C",
              borderRight: i === 0 ? "1px solid rgba(120,53,15,0.35)" : "none",
              boxShadow: active ? "0 0 10px #F5A623, inset 0 0 16px rgba(245,166,35,0.20)" : "none",
            }}
          >
            <span aria-hidden style={{ fontSize: 14 }}>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PeriodBar({ period, setPeriod, tab }) {
  const downloadCsv = async () => {
    try {
      const url = tab === "members"
        ? `/reports/members/export.csv?period=${period}`
        : `/reports/events/export.csv?period=${period}`;
      const r = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = tab === "members" ? `uye-performans-${period}.csv` : `etkinlik-katilim-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      toast.success("CSV indirildi");
    } catch (e) {
      toast.error(apiErr(e));
    }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="reports-period-bar">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        <Filter className="w-3 h-3" /> Dönem
      </div>
      <div className="flex rounded overflow-hidden"
           style={{ border: "1px solid rgba(120,53,15,0.35)" }}>
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              data-testid={`reports-period-${p.key}`}
              className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                background: active
                  ? "linear-gradient(180deg, rgba(245,166,35,0.35), rgba(180,83,9,0.5))"
                  : "rgba(20,15,25,0.6)",
                color: active ? "#FFEDD5" : "#78716C",
                borderRight: "1px solid rgba(120,53,15,0.25)",
              }}
            >{p.label}</button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={downloadCsv}
        className="chip text-[10px] ml-auto"
        data-testid="reports-download-csv"
      >
        <Download className="w-3 h-3" /> CSV
      </button>
    </div>
  );
}

// ----------- Üye Performansı Tab -----------
function MembersReport({ period }) {
  const [alliance, setAlliance] = useState("");
  const [country, setCountry] = useState("");
  const qs = new URLSearchParams({ period });
  if (alliance) qs.set("alliance", alliance);
  if (country) qs.set("country", country);
  const { data, isLoading, error, mutate } = useSWR(`/reports/members?${qs.toString()}`, fetcher);
  const { data: alliancesList = [] } = useSWR("/alliances", fetcher);
  const rows = data?.items || [];
  const total_events = data?.total_events || 0;
  // Derive country list from the current (unfiltered by country) rows so
  // admins can only pick countries that actually appear in the pool.
  const countryChoices = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => { if (r.country) set.add(r.country); });
    return Array.from(set).sort();
  }, [rows]);
  const chartData = useMemo(
    () => rows.slice(0, 15).map((r) => ({
      name: r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name,
      rate: r.participation_rate,
    })),
    [rows]
  );
  if (isLoading) return <LoadingCard testId="members-report-loading" />;
  if (error) return <ErrorCard e={error} testId="members-report-error" />;
  return (
    <div className="space-y-3" data-testid="members-report">
      {/* Klan + ülke filtre çubuğu — Faz 3.5 Report Filters */}
      <div className="card-red-gold p-2 flex items-center gap-2 flex-wrap"
           data-testid="members-report-filters">
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1">
          <Filter className="w-3 h-3" /> Klan
        </div>
        <select
          value={alliance}
          onChange={(e) => setAlliance(e.target.value)}
          className="px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
          data-testid="members-report-alliance-filter"
        >
          <option value="">Tümü ({alliancesList.length})</option>
          {alliancesList.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1">
          <span aria-hidden>🌍</span> Ülke
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
          data-testid="members-report-country-filter"
        >
          <option value="">Tümü</option>
          {countryChoices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(alliance || country) && (
          <button type="button"
                  onClick={() => { setAlliance(""); setCountry(""); }}
                  className="chip text-[10px] ml-auto"
                  style={{ borderColor: "rgba(239,68,68,0.4)", color: "#FCA5A5" }}
                  data-testid="members-report-filters-clear">
            Temizle
          </button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto"
              data-testid="members-report-count">
          {rows.length} üye
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyCard label="Filtreye uyan üye yok" testId="members-report-empty" />
      ) : (
        <>
      <TrendChart alliance={alliance} country={country} />
      <div className="card-red-gold p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
            Katılım Oranı (İlk 15) · Toplam {total_events} etkinlik
          </div>
          <button onClick={() => mutate()} className="chip text-[10px]" data-testid="members-report-refresh">
            <RefreshCw className="w-3 h-3" /> Yenile
          </button>
        </div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,53,15,0.25)" />
              <XAxis dataKey="name" stroke="#A8A29E" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis stroke="#A8A29E" tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: "#1C1917", border: "1px solid #78350F", borderRadius: 6, fontSize: 12 }}
                formatter={(v) => [`${v}%`, "Katılım"]}
              />
              <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.rate >= 75 ? "#22C55E" : entry.rate >= 50 ? "#F5A623" : "#EF4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-red-gold p-2 overflow-x-auto">
        <table className="w-full text-xs" data-testid="members-report-table">
          <thead>
            <tr style={{ color: "#F5A623", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.1 }}>
              <th className="text-left px-2 py-1.5">Üye</th>
              <th className="text-left px-2 py-1.5">Klan</th>
              <th className="text-center px-2 py-1.5">✅</th>
              <th className="text-center px-2 py-1.5">🕒</th>
              <th className="text-center px-2 py-1.5">❔</th>
              <th className="text-center px-2 py-1.5">❌</th>
              <th className="text-center px-2 py-1.5">⚪</th>
              <th className="text-right px-2 py-1.5">Katılım %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member_id}
                  data-testid={`members-report-row-${r.member_id}`}
                  className="border-t"
                  style={{ borderColor: "rgba(120,53,15,0.2)" }}>
                <td className="px-2 py-1.5 text-white font-medium">
                  <div className="flex items-center gap-1.5">
                    {r.country && (
                      <img src={`https://flagcdn.com/w20/${r.country.toLowerCase()}.png`}
                           alt={r.country} className="w-4 h-3 rounded-sm"
                           onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                    <span>{r.name}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{r.alliance_name || "—"}</td>
                <td className="px-2 py-1.5 text-center" style={{ color: STATUS_META.attending.color }}>{r.attending}</td>
                <td className="px-2 py-1.5 text-center" style={{ color: STATUS_META.late.color }}>{r.late}</td>
                <td className="px-2 py-1.5 text-center" style={{ color: STATUS_META.maybe.color }}>{r.maybe}</td>
                <td className="px-2 py-1.5 text-center" style={{ color: STATUS_META.declined.color }}>{r.declined}</td>
                <td className="px-2 py-1.5 text-center text-muted-foreground">{r.no_response}</td>
                <td className="px-2 py-1.5 text-right font-bold"
                    style={{ color: r.participation_rate >= 75 ? "#22C55E"
                             : r.participation_rate >= 50 ? "#F5A623"
                             : "#EF4444" }}>
                  {r.participation_rate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}

// ----------- Etkinlik Katılım Tab -----------
function TrendChart({ alliance, country }) {
  const [days, setDays] = useState(30);
  // Client-side smoothing window: 7-day for 30/90d views, 3-day for 7d so
  // the MA still varies across the shorter x-axis. Users can toggle it off.
  const [maOn, setMaOn] = useState(true);
  const [targetOn, setTargetOn] = useState(true);
  const [editingTarget, setEditingTarget] = useState(false);
  const [draftTarget, setDraftTarget] = useState(60);
  const qs = new URLSearchParams({ days: String(days) });
  if (alliance) qs.set("alliance", alliance);
  if (country) qs.set("country", country);
  const { data, isLoading } = useSWR(`/reports/trend?${qs.toString()}`, fetcher);
  const { data: targetResp, mutate: mutateTarget } = useSWR("/settings/guild-target", fetcher);
  const { data: alertState, mutate: mutateAlertState } = useSWR("/reports/trend/alert-state", fetcher, { refreshInterval: 60000 });
  const target = targetResp?.target ?? 60;

  const items = data?.items || [];
  const window = days === 7 ? 3 : 7;
  // Trailing moving average — null when there aren't enough non-null points
  // in the window so the smoothed curve doesn't fabricate data.
  const chart = items.map((d, i, arr) => {
    let ma = null;
    if (maOn) {
      const start = Math.max(0, i - window + 1);
      const slice = arr.slice(start, i + 1).map((x) => x.participation_rate).filter((v) => v != null);
      if (slice.length >= Math.min(window, 2)) {
        ma = Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * 10) / 10;
      }
    }
    return {
      date: d.date.slice(5),
      rate: d.participation_rate,
      ma,
      event_count: d.event_count,
      attending: d.attending,
    };
  });
  const slope = (() => {
    const pts = chart.map((c, i) => (c.rate == null ? null : [i, c.rate])).filter(Boolean);
    if (pts.length < 2) return 0;
    const n = pts.length;
    const sx = pts.reduce((s, p) => s + p[0], 0);
    const sy = pts.reduce((s, p) => s + p[1], 0);
    const sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0);
    const denom = n * sxx - sx * sx;
    return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  })();
  const trendColor = slope > 0.2 ? "#22C55E" : slope < -0.2 ? "#EF4444" : "#F5A623";
  const trendLabel = slope > 0.2 ? "▲ Yükselişte" : slope < -0.2 ? "▼ Düşüşte" : "→ Sabit";

  const saveTarget = async () => {
    const t = Math.max(0, Math.min(100, parseInt(draftTarget, 10) || 0));
    try {
      await api.put("/settings/guild-target", { target: t });
      toast.success(`Hedef %${t} olarak kaydedildi`);
      setEditingTarget(false);
      mutateTarget();
    } catch (e) { toast.error(apiErr(e)); }
  };

  // Snooze controls — hidden unless there's an active breach OR an active
  // snooze so the chart doesn't get cluttered on healthy days.
  const streak = alertState?.streak ?? 0;
  const snoozed = !!alertState?.snoozed;
  const snoozedUntil = alertState?.snoozed_until;
  const showSnoozeStrip = streak >= 3 || snoozed;
  // Weekly digest preview + manual send.
  const [digestOpen, setDigestOpen] = useState(false);
  const snoozeAlert = async (days) => {
    try {
      const r = await api.post("/reports/trend/alert-snooze", { days });
      const until = new Date(r.data.snoozed_until).toLocaleString("tr-TR");
      toast.success(`Uyarılar ${days} gün sessize alındı (→ ${until})`);
      mutateAlertState();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const unsnoozeAlert = async () => {
    try {
      await api.delete("/reports/trend/alert-snooze");
      toast.success("Sessize alma iptal edildi");
      mutateAlertState();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="card-red-gold p-3" data-testid="trend-chart">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-[11px] uppercase font-bold tracking-widest gold-text flex items-center gap-2 flex-wrap">
          <span>Katılım Trendi · Son {days} Gün</span>
          <span className="px-1.5 py-0.5 rounded text-[9px]"
                style={{ background: `${trendColor}22`, color: trendColor }}
                data-testid="trend-direction">
            {trendLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {/* Target editor — admin sets the guild-wide participation goal. */}
          {editingTarget ? (
            <div className="flex items-center gap-1"
                 data-testid="trend-target-editor">
              <input
                type="number" min="0" max="100"
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
                className="w-14 px-1.5 py-0.5 rounded bg-black/40 border border-border text-white text-[11px]"
                data-testid="trend-target-input"
                autoFocus
              />
              <button onClick={saveTarget}
                      className="chip text-[10px]"
                      style={{ borderColor: "#22C55E", color: "#86EFAC" }}
                      data-testid="trend-target-save">Kaydet</button>
              <button onClick={() => setEditingTarget(false)}
                      className="chip text-[10px]">İptal</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setDraftTarget(target); setEditingTarget(true); }}
              className="chip text-[10px]"
              style={{
                background: targetOn ? "rgba(34,197,94,0.15)" : "rgba(20,15,25,0.65)",
                color: targetOn ? "#86EFAC" : "#78716C",
                borderColor: targetOn ? "#22C55E" : "rgba(120,53,15,0.35)",
              }}
              title="Hedefi düzenle"
              data-testid="trend-target-edit"
            >
              🎯 Hedef %{target}
            </button>
          )}
          <button
            onClick={() => setTargetOn((v) => !v)}
            className="chip text-[10px]"
            style={{
              background: targetOn ? "rgba(34,197,94,0.15)" : "rgba(20,15,25,0.65)",
              color: targetOn ? "#86EFAC" : "#78716C",
            }}
            title="Hedef bandını göster/gizle"
            data-testid="trend-target-toggle"
          >{targetOn ? "◉" : "○"} Hedef</button>
          <button
            onClick={() => setMaOn((v) => !v)}
            className="chip text-[10px]"
            style={{
              background: maOn ? "rgba(59,130,246,0.15)" : "rgba(20,15,25,0.65)",
              color: maOn ? "#93C5FD" : "#78716C",
            }}
            title={`${window}-günlük hareketli ortalama`}
            data-testid="trend-ma-toggle"
          >{maOn ? "◉" : "○"} MA{window}</button>
          <div className="flex items-center gap-1 ml-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="chip text-[10px]"
                style={{
                  background: days === d
                    ? "linear-gradient(180deg, rgba(245,166,35,0.28), rgba(180,83,9,0.45))"
                    : "rgba(20,15,25,0.65)",
                  color: days === d ? "#FFEDD5" : "#78716C",
                  borderColor: days === d ? "#F5A623" : "rgba(120,53,15,0.35)",
                }}
                data-testid={`trend-days-${d}`}
              >{d}G</button>
            ))}
          </div>
          <button
            onClick={() => setDigestOpen(true)}
            className="chip text-[10px]"
            title="Haftalık Telegram özetini gör"
            data-testid="trend-digest-open"
          >📊 Özet</button>
        </div>
      </div>
      {isLoading || chart.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-8" data-testid="trend-empty">
          {isLoading ? "Yükleniyor…" : "Bu aralıkta etkinlik yok"}
        </div>
      ) : (
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,53,15,0.25)" />
              <XAxis dataKey="date" stroke="#A8A29E" tick={{ fontSize: 9 }} interval={Math.max(0, Math.floor(chart.length / 10) - 1)} />
              <YAxis stroke="#A8A29E" tick={{ fontSize: 9 }} unit="%" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: "#1C1917", border: "1px solid #78350F", borderRadius: 6, fontSize: 11 }}
                formatter={(v, name, p) => {
                  if (v == null) return ["—", name === "ma" ? `MA${window}` : "Katılım"];
                  if (name === "ma") return [`${v}%`, `MA${window}`];
                  const ev = p?.payload?.event_count || 0;
                  return [`${v}% (${ev} etk.)`, "Katılım"];
                }}
              />
              {/* Benchmark band — subtle green tint above target so
                  "on-goal" days visually pop above the red-tinted danger
                  zone below. */}
              {targetOn && (
                <>
                  <ReferenceArea y1={target} y2={100} fill="#22C55E" fillOpacity={0.06} />
                  <ReferenceArea y1={0} y2={target} fill="#EF4444" fillOpacity={0.04} />
                  <ReferenceLine
                    y={target}
                    stroke="#22C55E"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: `Hedef %${target}`, fontSize: 9, fill: "#86EFAC", position: "insideTopRight" }}
                    data-testid="trend-target-line"
                  />
                </>
              )}
              {maOn && (
                <Line
                  type="monotone"
                  dataKey="ma"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  connectNulls
                  isAnimationActive
                />
              )}
              <Line
                type="monotone"
                dataKey="rate"
                stroke={trendColor}
                strokeWidth={2}
                dot={{ r: 2, fill: trendColor }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Compact legend so the meaning of each colored line is obvious. */}
      {(targetOn || maOn) && chart.length > 0 && (
        <div className="text-[9px] text-muted-foreground flex items-center gap-3 mt-1 flex-wrap"
             data-testid="trend-legend">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5" style={{ background: trendColor }} />
            Günlük
          </span>
          {maOn && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 border-dashed border-t" style={{ borderColor: "#3B82F6" }} />
              {window}-gün ort.
            </span>
          )}
          {targetOn && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 border-dashed border-t" style={{ borderColor: "#22C55E" }} />
              Hedef %{target}
            </span>
          )}
        </div>
      )}
      {/* Alert snooze strip — only rendered on active breach or active snooze. */}
      {showSnoozeStrip && (
        <div
          className="mt-2 rounded p-2 flex items-center gap-2 flex-wrap"
          style={{
            background: snoozed
              ? "rgba(120,113,108,0.15)"
              : "rgba(239,68,68,0.12)",
            border: `1px solid ${snoozed ? "rgba(120,113,108,0.4)" : "rgba(239,68,68,0.4)"}`,
          }}
          data-testid="trend-alert-strip"
        >
          {snoozed ? (
            <>
              <span className="text-xs" aria-hidden>🔕</span>
              <span className="text-xs text-white flex-1">
                Uyarılar sessize alındı →{" "}
                <span className="gold-text font-bold">
                  {new Date(snoozedUntil).toLocaleString("tr-TR")}
                </span>
              </span>
              <button
                type="button"
                onClick={unsnoozeAlert}
                className="chip text-[10px]"
                data-testid="trend-alert-unsnooze"
              >Sessize almayı kaldır</button>
            </>
          ) : (
            <>
              <span className="text-sm" aria-hidden>⚠️</span>
              <span className="text-xs text-white flex-1">
                <span className="font-bold" style={{ color: "#FCA5A5" }}>
                  {streak} gündür
                </span>{" "}
                7-günlük ortalama hedefin altında. Uyarılar admin bell/Telegram/Push'a düşecek.
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => snoozeAlert(1)}
                  className="chip text-[10px]"
                  data-testid="trend-alert-snooze-1d"
                >🔕 1G</button>
                <button
                  type="button"
                  onClick={() => snoozeAlert(7)}
                  className="chip text-[10px]"
                  style={{ background: "rgba(245,166,35,0.2)", borderColor: "#F5A623", color: "#FFEDD5" }}
                  data-testid="trend-alert-snooze-7d"
                >🔕 1 hafta sessize al</button>
                <button
                  type="button"
                  onClick={() => snoozeAlert(30)}
                  className="chip text-[10px]"
                  data-testid="trend-alert-snooze-30d"
                >🔕 30G</button>
              </div>
            </>
          )}
        </div>
      )}
      {digestOpen && <TrendDigestModal onClose={() => setDigestOpen(false)} />}
    </div>
  );
}

function TrendDigestModal({ onClose }) {
  const [days, setDays] = useState(7);
  const { data, isLoading, mutate } = useSWR(`/reports/trend/digest/preview?days=${days}`, fetcher);
  const { data: recData, mutate: mutateRecipients } = useSWR("/reports/trend/digest/recipients", fetcher);
  const recipients = recData?.items || [];
  const { data: schedule, mutate: mutateSchedule } = useSWR("/reports/trend/digest/schedule", fetcher);
  const [newChatId, setNewChatId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingRec, setSavingRec] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const addRecipient = async (e) => {
    e.preventDefault();
    const cid = newChatId.trim();
    if (!cid) return;
    setSavingRec(true);
    try {
      await api.post("/reports/trend/digest/recipients", { chat_id: cid, label: newLabel.trim() || cid });
      toast.success(`Alıcı eklendi: ${newLabel.trim() || cid}`);
      setNewChatId(""); setNewLabel("");
      mutateRecipients();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSavingRec(false); }
  };
  const removeRecipient = async (cid, label) => {
    if (!window.confirm(`"${label}" alıcısını çıkarmak istediğine emin misin?`)) return;
    try {
      await api.delete(`/reports/trend/digest/recipients/${encodeURIComponent(cid)}`);
      toast.success("Alıcı çıkarıldı");
      mutateRecipients();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const testRecipient = async (cid, label) => {
    setTestingId(cid);
    try {
      const r = await api.post(`/reports/trend/digest/recipients/${encodeURIComponent(cid)}/test`);
      if (r.data.ok) toast.success(`✅ Test mesajı gönderildi → ${label}`);
      else toast.error(`❌ Test başarısız → ${label} (bot erişemedi)`);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setTestingId(null); }
  };
  const send = async () => {
    if (!window.confirm(`Özet ${recipients.length} kanal + tüm admin DM'lerine gönderilecek. Devam?`)) return;
    setSending(true);
    try {
      const r = await api.post(`/reports/trend/digest/send?days=${days}`);
      toast.success(`Özet gönderildi — DM ${r.data.tg_sent} · Kanal ${r.data.channels_sent} · Bell ${r.data.bell_sent}`);
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSending(false); }
  };

  const testSend = async () => {
    // Personal preview — no schedule/state touched, only me gets the ping.
    setTesting(true);
    try {
      const r = await api.post(`/reports/trend/digest/test-send?days=${days}`);
      if (r.data.tg_sent) {
        toast.success("🧪 Telegram DM ve bell'ine gönderildi");
      } else {
        toast.warning(`🧪 Bell'e düştü. Telegram: ${r.data.tg_err_reason || "başarısız"}`);
      }
    } catch (e) { toast.error(apiErr(e)); }
    finally { setTesting(false); }
  };

  const saveSchedule = async (weekday, hour, tz) => {
    try {
      await api.put("/reports/trend/digest/schedule", { weekday, hour, tz });
      toast.success("Program güncellendi");
      mutateSchedule();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.85)" }}
         onClick={onClose}
         data-testid="trend-digest-modal">
      <div className="card-red-gold p-4 max-w-lg w-full max-h-[90vh] overflow-auto space-y-3"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-widest gold-text font-bold">
            📊 Haftalık Katılım Özeti
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-white"
                  data-testid="trend-digest-close">
            ✕
          </button>
        </div>
        <div className="flex items-center gap-1">
          {[7, 14, 30].map((d) => (
            <button key={d}
                    onClick={() => setDays(d)}
                    className="chip text-[10px]"
                    style={{
                      background: days === d ? "rgba(245,166,35,0.25)" : "rgba(20,15,25,0.65)",
                      color: days === d ? "#FFEDD5" : "#78716C",
                      borderColor: days === d ? "#F5A623" : "rgba(120,53,15,0.35)",
                    }}
                    data-testid={`trend-digest-days-${d}`}>
              {d}G
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="text-center text-xs text-muted-foreground py-6"
               data-testid="trend-digest-loading">Yükleniyor…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <StatMini emoji="⚠️" label="Uyarı" n={data?.breaches ?? 0} color="#FCA5A5" />
              <StatMini emoji="🎯" label="Toparlanma" n={data?.recoveries ?? 0} color="#86EFAC" />
              <StatMini emoji="🔕" label="Sessize" n={data?.snoozes ?? 0} color="#D6D3D1" />
            </div>
            <div className="rounded p-3 text-xs whitespace-pre-wrap font-mono"
                 style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(120,53,15,0.35)",
                          color: "#E7E5E4", lineHeight: 1.4 }}
                 data-testid="trend-digest-preview">
              {data?.text || "—"}
            </div>
            {data?.last_state?.last_sent_at && (
              <div className="text-[10px] text-muted-foreground">
                Son gönderim: {new Date(data.last_state.last_sent_at).toLocaleString("tr-TR")}
                {" · "}DM {data.last_state.last_tg_sent ?? 0}
                {" · "}Kanal {data.last_state.last_channels_sent ?? 0}
                {" · "}Bell {data.last_state.last_bell_sent ?? 0}
              </div>
            )}

            {/* Program — hangi gün / saat / zaman dilimi. */}
            <div className="rounded p-2 space-y-2"
                 style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(120,53,15,0.35)" }}
                 data-testid="trend-digest-schedule">
              <div className="text-[10px] uppercase tracking-widest gold-text font-bold flex items-center gap-1">
                <span>🗓️ Otomatik Program</span>
                {schedule && (
                  <span className="text-muted-foreground normal-case tracking-normal">
                    · {DAYS[schedule.weekday]} {String(schedule.hour).padStart(2, "0")}:00 · {schedule.tz}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <select
                  value={schedule?.weekday ?? 6}
                  onChange={(e) => saveSchedule(parseInt(e.target.value), schedule?.hour ?? 20, schedule?.tz || "Europe/Istanbul")}
                  className="px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
                  data-testid="trend-digest-schedule-weekday"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <select
                  value={schedule?.hour ?? 20}
                  onChange={(e) => saveSchedule(schedule?.weekday ?? 6, parseInt(e.target.value), schedule?.tz || "Europe/Istanbul")}
                  className="px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
                  data-testid="trend-digest-schedule-hour"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                  ))}
                </select>
                <select
                  value={schedule?.tz || "Europe/Istanbul"}
                  onChange={(e) => saveSchedule(schedule?.weekday ?? 6, schedule?.hour ?? 20, e.target.value)}
                  className="px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
                  data-testid="trend-digest-schedule-tz"
                >
                  <option value="Europe/Istanbul">TR (Istanbul)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Berlin">Berlin</option>
                  <option value="America/New_York">New York</option>
                </select>
              </div>
              <div className="text-[9px] text-muted-foreground">
                Değişiklikler anında kaydedilir. Sonraki tetikleme belirtilen gün + saatte gerçekleşir.
              </div>
            </div>

            {/* Alıcı yönetimi — Telegram kanalı/grubu ekleme. */}
            <div className="rounded p-2 space-y-2"
                 style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(120,53,15,0.35)" }}
                 data-testid="trend-digest-recipients">
              <div className="text-[10px] uppercase tracking-widest gold-text font-bold flex items-center gap-1">
                <span>📡 Telegram Alıcıları</span>
                <span className="text-muted-foreground">· {recipients.length}</span>
              </div>
              {recipients.length === 0 && (
                <div className="text-[10px] text-muted-foreground italic">
                  Sadece admin DM'lerine gidiyor. Kanal/grup ekleyerek liderlik sohbetine de düşürebilirsin.
                </div>
              )}
              {recipients.map((r) => (
                <div key={r.chat_id}
                     className="flex items-center gap-1 text-xs"
                     data-testid={`trend-digest-recipient-${r.chat_id}`}>
                  <span className="flex-1 min-w-0 truncate">
                    <span className="text-white font-bold">{r.label || r.chat_id}</span>
                    {r.label && r.label !== r.chat_id && (
                      <span className="text-muted-foreground ml-1 font-mono text-[10px]">{r.chat_id}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => testRecipient(r.chat_id, r.label || r.chat_id)}
                    disabled={testingId === r.chat_id}
                    className="chip text-[10px]"
                    data-testid={`trend-digest-recipient-test-${r.chat_id}`}
                  >{testingId === r.chat_id ? "…" : "🧪 Test"}</button>
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.chat_id, r.label || r.chat_id)}
                    className="chip text-[10px]"
                    style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
                    data-testid={`trend-digest-recipient-remove-${r.chat_id}`}
                  >Sil</button>
                </div>
              ))}
              <form onSubmit={addRecipient} className="flex items-center gap-1 pt-1"
                    style={{ borderTop: recipients.length ? "1px solid rgba(120,53,15,0.25)" : "none" }}>
                <input
                  type="text"
                  value={newChatId}
                  onChange={(e) => setNewChatId(e.target.value)}
                  placeholder="chat_id (örn: -1001234567890 veya @kanal)"
                  className="flex-1 min-w-0 px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px] font-mono"
                  data-testid="trend-digest-recipient-chatid"
                />
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Etiket"
                  className="w-24 px-2 py-1 rounded bg-black/40 border border-border text-white text-[11px]"
                  data-testid="trend-digest-recipient-label"
                />
                <button
                  type="submit"
                  disabled={savingRec || !newChatId.trim()}
                  className="chip text-[10px]"
                  data-testid="trend-digest-recipient-add"
                >{savingRec ? "…" : "+ Ekle"}</button>
              </form>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={testSend}
                disabled={testing}
                className="chip text-[11px] flex-shrink-0"
                title="Sadece sana gönderir — program/liste dokunulmaz"
                data-testid="trend-digest-test-send"
              >{testing ? "…" : "🧪 Test Mesajı"}</button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="btn-gold flex-1 py-2 flex items-center justify-center gap-2 text-sm"
                data-testid="trend-digest-send"
              >
                {sending ? "Gönderiliyor…" : "Şimdi Gönder"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatMini({ emoji, label, n, color }) {
  return (
    <div className="rounded py-2"
         style={{ background: `${color}15`, border: `1px solid ${color}44` }}>
      <div className="text-lg" aria-hidden>{emoji}</div>
      <div className="text-xl font-bold" style={{ color }}>{n}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function EventsReport({ period }) {
  const { data, isLoading, error, mutate } = useSWR(`/reports/events?period=${period}`, fetcher);
  const [expandedId, setExpandedId] = useState(null);
  const rows = data?.items || [];
  if (isLoading) return <LoadingCard testId="events-report-loading" />;
  if (error) return <ErrorCard e={error} testId="events-report-error" />;
  if (rows.length === 0) return <EmptyCard label="Etkinlik yok" testId="events-report-empty" />;
  return (
    <div className="space-y-2" data-testid="events-report">
      {rows.map((ev) => {
        const expanded = expandedId === ev.id;
        return (
          <div key={ev.id} className="card-red-gold" data-testid={`events-report-row-${ev.id}`}>
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : ev.id)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 flex-wrap"
              data-testid={`events-report-toggle-${ev.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-bold flex items-center gap-1.5 flex-wrap">
                  <span>{ev.name}</span>
                  <span className="text-[10px] text-muted-foreground">· {fmtDate(ev.date)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: "rgba(245,166,35,0.15)", color: "#F5A623" }}>
                    {ev.group_name || "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 flex-wrap">
                  <StatusChip status="attending" n={ev.attending} />
                  <StatusChip status="late" n={ev.late} />
                  <StatusChip status="maybe" n={ev.maybe} />
                  <StatusChip status="declined" n={ev.declined} />
                  <StatusChip status="no_response" n={ev.no_response} />
                  <span className="text-[10px] ml-auto font-bold"
                        style={{ color: ev.participation_rate >= 75 ? "#22C55E"
                                : ev.participation_rate >= 50 ? "#F5A623"
                                : "#EF4444" }}>
                    {ev.participation_rate}% · {ev.responded}/{ev.member_pool}
                  </span>
                </div>
              </div>
              <span className="text-lg" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▸</span>
            </button>
            {expanded && (
              <EventAttendanceDetail
                eventId={ev.id}
                onChanged={() => mutate()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusChip({ status, n }) {
  const m = STATUS_META[status];
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1"
          style={{ background: `${m.color}22`, color: m.color }}
          data-testid={`event-status-chip-${status}`}>
      <span aria-hidden>{m.emoji}</span>
      <span>{n}</span>
    </span>
  );
}

function EventAttendanceDetail({ eventId, onChanged }) {
  const { data, isLoading, error, mutate } = useSWR(
    `/reports/events/${eventId}/attendance`,
    fetcher
  );
  const [busy, setBusy] = useState(null);
  const items = data?.items || [];
  const setStatus = async (memberId, status) => {
    setBusy(memberId);
    try {
      await api.patch(`/events/${eventId}/attendance/${memberId}`, { status });
      toast.success("Durum güncellendi");
      await mutate();
      onChanged?.();
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setBusy(null); }
  };
  if (isLoading) return <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2"
                              data-testid={`event-detail-loading-${eventId}`}>
    <Loader2 className="w-3 h-3 animate-spin" /> Yükleniyor…
  </div>;
  if (error) return <div className="px-3 py-3 text-xs text-red-300">{apiErr(error)}</div>;
  return (
    <div className="px-3 pb-3 space-y-1.5" data-testid={`event-detail-${eventId}`}>
      <div className="text-[10px] uppercase tracking-widest gold-text font-bold pt-1">
        Üye Durumları ({items.length})
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {items.map((m) => (
          <div key={m.member_id}
               className="flex items-center gap-1.5 px-2 py-1 rounded"
               style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(120,53,15,0.2)" }}
               data-testid={`event-detail-row-${m.member_id}`}>
            {m.country && (
              <img src={`https://flagcdn.com/w20/${m.country.toLowerCase()}.png`}
                   alt={m.country} className="w-4 h-3 rounded-sm flex-shrink-0"
                   onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <span className="text-xs text-white truncate flex-1">{m.name}</span>
            {busy === m.member_id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <select
                value={m.status || ""}
                onChange={(e) => setStatus(m.member_id, e.target.value || null)}
                data-testid={`event-detail-status-${m.member_id}`}
                className="text-[10px] rounded px-1.5 py-0.5 font-bold"
                style={{
                  background: "rgba(20,15,25,0.9)",
                  border: `1px solid ${STATUS_META[m.status]?.color || "rgba(120,53,15,0.4)"}`,
                  color: STATUS_META[m.status]?.color || "#A8A29E",
                }}>
                <option value="">⚪ Yanıtsız</option>
                <option value="attending">✅ Katılıyor</option>
                <option value="late">🕒 Geç Kaldı</option>
                <option value="maybe">❔ Belki</option>
                <option value="declined">❌ Katılmıyor</option>
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------- Shared helpers -----------
function LoadingCard({ testId }) {
  return (
    <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
         data-testid={testId}>
      <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
    </div>
  );
}
function ErrorCard({ e, testId }) {
  return (
    <div className="card-red-gold p-6 text-center text-sm text-red-300" data-testid={testId}>
      {apiErr(e)}
    </div>
  );
}
function EmptyCard({ label, testId }) {
  return (
    <div className="card-red-gold p-6 text-center text-sm text-muted-foreground" data-testid={testId}>
      {label}
    </div>
  );
}
