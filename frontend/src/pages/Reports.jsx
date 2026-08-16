import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Loader2, Download, Users, CalendarDays, RefreshCw, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
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
  const { data, isLoading, error, mutate } = useSWR(`/reports/members?period=${period}`, fetcher);
  const rows = data?.items || [];
  const total_events = data?.total_events || 0;
  const chartData = useMemo(
    () => rows.slice(0, 15).map((r) => ({
      name: r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name,
      rate: r.participation_rate,
    })),
    [rows]
  );
  if (isLoading) return <LoadingCard testId="members-report-loading" />;
  if (error) return <ErrorCard e={error} testId="members-report-error" />;
  if (rows.length === 0) return <EmptyCard label="Üye yok" testId="members-report-empty" />;
  return (
    <div className="space-y-3" data-testid="members-report">
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
    </div>
  );
}

// ----------- Etkinlik Katılım Tab -----------
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
