// v136 — Push Notification Analytics dashboard.
// Route: /admin/push-analytics (admin-only). Reads GET /api/push/analytics.
// Funnel: Sent → Viewed → Clicked, per-type breakdown, recent broadcasts.
import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { BarChart3, Send, Eye, MousePointerClick, Filter, RefreshCw } from "lucide-react";

const fetcher = (u) => api.get(u).then((r) => r.data);

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

const TYPE_LABEL_FALLBACKS = {
  general: "Genel",
  announcement: "Duyuru",
  event: "Etkinlik",
  reminder: "Hatırlatma",
  poll: "Anket",
  chat: "Sohbet",
  system: "Sistem",
};

export default function PushAnalytics() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [notifPref, setNotifPref] = useState("");
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("days", String(days));
    if (notifPref) p.set("notif_pref", notifPref);
    return p.toString();
  }, [days, notifPref]);
  const { data, mutate, isLoading } = useSWR(`/push/analytics?${qs}`, fetcher, { refreshInterval: 60000 });

  const totals = data?.totals || { sent: 0, viewed: 0, clicked: 0, view_rate: 0, ctr: 0 };
  const byType = data?.by_type || [];
  const recent = data?.recent || [];
  const types = data?.types || [];

  const typeLabel = (k) => t(`push_type_${k}`, TYPE_LABEL_FALLBACKS[k] || k);

  const maxSent = Math.max(totals.sent || 1, 1);
  const viewedWidth = totals.sent ? (totals.viewed / totals.sent) * 100 : 0;
  const clickedWidth = totals.sent ? (totals.clicked / totals.sent) * 100 : 0;

  return (
    <div data-testid="push-analytics-page">
      <Header title={t("push_analytics_page_title", "Push Analitik")}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5" data-testid="push-analytics-days-filter">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className="chip text-[10px]"
                data-testid={`push-analytics-days-${d}`}
                style={days === d
                  ? { background: "linear-gradient(135deg,#F5A623,#E74C1A)", color: "#0B0704", fontWeight: 800 }
                  : {}}
              >
                {t("push_analytics_days_x", "{{n}} gün", { n: d })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            className="chip text-[10px] flex items-center gap-1"
            data-testid="push-analytics-refresh"
            title={t("refresh", "Yenile")}
          >
            <RefreshCw className="w-3 h-3" /> {t("refresh", "Yenile")}
          </button>
        </div>
      </Header>

      <div className="px-4 space-y-4">
        {/* Type filter */}
        <div
          className="rounded-lg p-3 flex items-center gap-2 flex-wrap"
          style={{ background: "rgba(20,12,10,0.65)", border: "1px solid rgba(56,189,248,0.35)" }}
          data-testid="push-analytics-type-filter"
        >
          <Filter className="w-4 h-4" style={{ color: "#38BDF8" }} />
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#38BDF8" }}>
            {t("push_analytics_filter_type", "Bildirim Türü")}:
          </span>
          <button
            type="button"
            onClick={() => setNotifPref("")}
            className="chip text-[10px]"
            data-testid="push-analytics-type-all"
            style={notifPref === ""
              ? { background: "rgba(56,189,248,0.28)", color: "#E0F2FE", fontWeight: 700 }
              : {}}
          >
            {t("push_analytics_type_all", "Tümü")}
          </button>
          {types.map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setNotifPref(tp)}
              className="chip text-[10px]"
              data-testid={`push-analytics-type-${tp}`}
              style={notifPref === tp
                ? { background: "rgba(56,189,248,0.28)", color: "#E0F2FE", fontWeight: 700 }
                : {}}
            >
              {typeLabel(tp)}
            </button>
          ))}
        </div>

        {/* Funnel */}
        <div
          className="rounded-lg p-4 space-y-3"
          style={{ background: "rgba(20,12,10,0.7)", border: "1px solid rgba(168,85,247,0.4)" }}
          data-testid="push-analytics-funnel"
        >
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4" style={{ color: "#C4B5FD" }} />
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#C4B5FD" }}>
              {t("push_analytics_funnel_title", "Bildirim Hunisi")}
            </span>
            <span className="ml-auto text-[10px]" style={{ color: "#94A3B8" }}>
              {t("push_analytics_last_x_days", "Son {{n}} gün", { n: days })}
              {notifPref && ` · ${typeLabel(notifPref)}`}
            </span>
          </div>

          <FunnelBar
            icon={<Send className="w-4 h-4" style={{ color: "#F5A623" }} />}
            label={t("push_analytics_step_sent", "Gönderildi")}
            value={totals.sent}
            pct={100}
            color="#F5A623"
            testid="push-analytics-step-sent"
          />
          <FunnelBar
            icon={<Eye className="w-4 h-4" style={{ color: "#38BDF8" }} />}
            label={t("push_analytics_step_viewed", "Görüntülendi")}
            value={totals.viewed}
            pct={viewedWidth}
            rate={totals.view_rate}
            color="#38BDF8"
            testid="push-analytics-step-viewed"
          />
          <FunnelBar
            icon={<MousePointerClick className="w-4 h-4" style={{ color: "#22C55E" }} />}
            label={t("push_analytics_step_clicked", "Tıklandı")}
            value={totals.clicked}
            pct={clickedWidth}
            rate={totals.ctr}
            color="#22C55E"
            testid="push-analytics-step-clicked"
          />
        </div>

        {/* Per-type breakdown */}
        <div
          className="rounded-lg p-4"
          style={{ background: "rgba(20,12,10,0.7)", border: "1px solid rgba(148,163,184,0.35)" }}
          data-testid="push-analytics-by-type"
        >
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#F1F5F9" }}>
            {t("push_analytics_by_type_title", "Türe Göre Kırılım")}
          </div>
          {byType.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#94A3B8" }}>
              {t("push_analytics_no_data", "Bu aralıkta veri yok.")}
            </div>
          ) : (
            <div className="space-y-2">
              {byType.map((row) => (
                <div
                  key={row.notif_pref}
                  className="rounded p-2 flex items-center gap-3 flex-wrap"
                  style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.25)" }}
                  data-testid={`push-analytics-type-row-${row.notif_pref}`}
                >
                  <div className="flex-1 min-w-[120px]">
                    <div className="text-[11px] font-bold" style={{ color: "#F1F5F9" }}>
                      {typeLabel(row.notif_pref)}
                    </div>
                    <div className="text-[9px]" style={{ color: "#94A3B8" }}>
                      {row.count} {t("push_analytics_broadcast_short", "yayın")}
                    </div>
                  </div>
                  <div className="flex-[3] min-w-[220px]">
                    <div className="h-6 rounded overflow-hidden flex" style={{ background: "rgba(0,0,0,0.35)" }}>
                      <div
                        style={{
                          width: `${row.sent ? 100 : 0}%`,
                          background: "linear-gradient(90deg,#F5A62366,#F5A62310)",
                          borderRight: "1px solid rgba(245,166,35,0.6)",
                        }}
                        title={`sent ${row.sent}`}
                      />
                    </div>
                    <div className="h-3 mt-1 rounded overflow-hidden flex" style={{ background: "rgba(0,0,0,0.35)" }}>
                      <div
                        style={{
                          width: `${row.view_rate}%`,
                          background: "linear-gradient(90deg,#38BDF8,#0EA5E9)",
                        }}
                        title={`view ${row.view_rate}%`}
                      />
                    </div>
                    <div className="h-3 mt-1 rounded overflow-hidden flex" style={{ background: "rgba(0,0,0,0.35)" }}>
                      <div
                        style={{
                          width: `${row.ctr}%`,
                          background: "linear-gradient(90deg,#22C55E,#16A34A)",
                        }}
                        title={`ctr ${row.ctr}%`}
                      />
                    </div>
                  </div>
                  <div className="text-[10px]" style={{ minWidth: 200 }}>
                    <div style={{ color: "#F5A623" }}>
                      <Send className="w-3 h-3 inline mr-0.5" /> {row.sent}
                    </div>
                    <div style={{ color: "#38BDF8" }}>
                      <Eye className="w-3 h-3 inline mr-0.5" /> {row.viewed} ({row.view_rate}%)
                    </div>
                    <div style={{ color: "#22C55E" }}>
                      <MousePointerClick className="w-3 h-3 inline mr-0.5" /> {row.clicked} ({row.ctr}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent broadcasts */}
        <div
          className="rounded-lg p-4"
          style={{ background: "rgba(20,12,10,0.7)", border: "1px solid rgba(148,163,184,0.35)" }}
          data-testid="push-analytics-recent"
        >
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#F1F5F9" }}>
            {t("push_analytics_recent_title", "Son Yayınlar")}
          </div>
          {recent.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={{ color: "#94A3B8" }}>
              {t("push_analytics_no_recent", "Kayıt yok.")}
            </div>
          ) : (
            <div className="space-y-1">
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="rounded p-2 text-[11px] flex items-center gap-2 flex-wrap"
                  style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.25)" }}
                  data-testid={`push-analytics-recent-row-${r.id}`}
                >
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                        style={{ background: "rgba(56,189,248,0.18)", color: "#38BDF8" }}>
                    {typeLabel(r.notif_pref)}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-bold text-white">{r.title}</span>
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>{fmtWhen(r.created_at)}</span>
                  <span className="text-[10px] flex gap-2">
                    <span style={{ color: "#F5A623" }}><Send className="w-3 h-3 inline" /> {r.sent}</span>
                    <span style={{ color: "#38BDF8" }}><Eye className="w-3 h-3 inline" /> {r.opened}</span>
                    <span style={{ color: "#22C55E" }}><MousePointerClick className="w-3 h-3 inline" /> {r.clicked}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isLoading && (
          <div className="text-[11px] text-center py-3" style={{ color: "#94A3B8" }}>
            {t("loading", "Yükleniyor…")}
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelBar({ icon, label, value, pct, rate, color, testid }) {
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <div className="flex items-center gap-1.5" style={{ minWidth: 130 }}>
        {icon}
        <span className="text-[11px] font-bold" style={{ color }}>{label}</span>
      </div>
      <div className="flex-1 h-8 rounded overflow-hidden relative" style={{ background: "rgba(0,0,0,0.35)" }}>
        <div
          style={{
            width: `${Math.max(pct, value > 0 ? 2 : 0)}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, ${color}55)`,
            transition: "width 400ms ease",
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-between px-2 text-[11px] font-bold"
          style={{ color: "#F1F5F9" }}
        >
          <span>{value.toLocaleString("tr-TR")}</span>
          {typeof rate === "number" && (
            <span style={{ color }}>{rate}%</span>
          )}
        </div>
      </div>
    </div>
  );
}
