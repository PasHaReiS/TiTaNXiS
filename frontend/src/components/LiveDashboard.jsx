import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { Activity, Users, Zap, Trophy, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

const formatBig = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

const formatDots = (n) => Number(n || 0).toLocaleString("tr-TR").replace(/,/g, ".");

export default function LiveDashboard() {
  const { t } = useTranslation();
  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 8000 });
  const { data: lb = [] } = useSWR("/leaderboard", fetcher, { refreshInterval: 8000 });

  const top3 = (lb || []).slice(0, 3);
  const memberCount = stats?.member_count ?? "—";
  const totalPower = stats?.total_power ?? 0;
  const eventCount = stats?.event_count ?? "—";

  return (
    <section data-testid="live-dashboard" className="live-dashboard">
      <header className="live-dashboard-header">
        <span className="live-dashboard-pulse" aria-hidden="true" />
        <Activity className="w-4 h-4" />
        <h3 className="live-dashboard-title">{t("live_dashboard")}</h3>
        <span className="live-dashboard-live-tag">CANLI</span>
      </header>

      <div className="live-dashboard-grid">
        <div className="live-stat" data-testid="live-stat-members">
          <div className="live-stat-icon"><Users className="w-4 h-4" /></div>
          <div>
            <div className="live-stat-label">{t("member_count_label")}</div>
            <div className="live-stat-value">{memberCount}</div>
          </div>
        </div>
        <div className="live-stat" data-testid="live-stat-power">
          <div className="live-stat-icon"><Zap className="w-4 h-4" /></div>
          <div>
            <div className="live-stat-label">{t("total_power")}</div>
            <div className="live-stat-value" title={formatDots(totalPower)}>{formatBig(totalPower)}</div>
          </div>
        </div>
        <div className="live-stat" data-testid="live-stat-events">
          <div className="live-stat-icon"><Trophy className="w-4 h-4" /></div>
          <div>
            <div className="live-stat-label">{t("active_events")}</div>
            <div className="live-stat-value">{eventCount}</div>
          </div>
        </div>
        <div className="live-stat live-stat-top3" data-testid="live-stat-top3">
          <div className="live-stat-icon"><Crown className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0">
            <div className="live-stat-label">{t("top_three")}</div>
            <ol className="live-top3-list">
              {top3.length === 0 && <li className="live-stat-value opacity-70">—</li>}
              {top3.map((r, i) => (
                <li key={r.member_id} className="live-top3-item">
                  <span className={`live-top3-badge live-top3-badge-${i + 1}`}>{i + 1}</span>
                  <span className="live-top3-name" title={r.name}>{r.name}</span>
                  <span className="live-top3-points">{formatBig(r.total_points)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
