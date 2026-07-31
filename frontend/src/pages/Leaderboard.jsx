import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { api, fmt, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { LEADERBOARD } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Users, Calendar, Star, TrendingUp, Download, Crown, Medal, Award } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Leaderboard() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("active");
  const [group, setGroup] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 5000 });
  const { data: groups } = useSWR("/event-groups", fetcher, { refreshInterval: 10000 });
  const { data: lb = [] } = useSWR(group ? `/leaderboard?group_name=${encodeURIComponent(group)}` : "/leaderboard", fetcher, { refreshInterval: 5000 });
  const { data: allianceColors = {} } = useSWR("/alliance-colors", fetcher, { refreshInterval: 15000 });

  const top3 = useMemo(() => lb.slice(0, 3), [lb]);
  const rest = useMemo(() => lb.slice(3, 200), [lb]);

  const exportXlsx = async () => {
    try {
      const url = `${api.defaults.baseURL}/export/xlsx`;
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `detayli_rapor_${today}.xlsx`;
      a.click();
      toast.success(t("report_downloaded"));
    } catch (e) {
      toast.error(t("report_failed"));
    }
  };

  return (
    <div data-testid={LEADERBOARD.container}>
      <Header />

      <div className="px-4">
        <div className="section-title">{t("general_stats")}</div>
        <div className="grid grid-cols-2 gap-2 mb-4 fade-in">
          <div data-testid={LEADERBOARD.statsMember} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><Users className="w-3 h-3" /> {t("member_count_stat")}</div>
            <div className="stat-value">{fmt(stats?.member_count)}</div>
          </div>
          <div data-testid={LEADERBOARD.statsEvent} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("event")}</div>
            <div className="stat-value">{fmt(stats?.event_count)}</div>
          </div>
          <div data-testid={LEADERBOARD.statsTotal} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><Star className="w-3 h-3" /> {t("total_points")}</div>
            <div className="stat-value">{fmt(stats?.total_points)}</div>
          </div>
          <div data-testid={LEADERBOARD.statsAvg} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {t("event_avg")}</div>
            <div className="stat-value">{fmt(stats?.event_avg)}</div>
          </div>
        </div>

        <div className="section-title">{t("event_filter")}</div>
        <div className="flex gap-2 mb-3">
          <button
            data-testid={LEADERBOARD.filterActive}
            onClick={() => setFilter("active")}
            className={`chip ${filter === "active" ? "active" : ""}`}
          >{t("active_upper")}</button>
          <button
            data-testid={LEADERBOARD.filterArchive}
            onClick={() => setFilter("archive")}
            className={`chip ${filter === "archive" ? "active" : ""}`}
          >{t("archive_upper")}</button>
        </div>

        {groups && groups.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <button className={`chip ${!group ? "active" : ""}`} onClick={() => setGroup(null)}>
              {t("all_short")}
            </button>
            {groups.map((g) => (
              <button
                key={g.name}
                onClick={() => setGroup(g.name === group ? null : g.name)}
                className={`chip ${group === g.name ? "active" : ""}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Podium */}
        <div className="section-title">{t("podium")}</div>
        <div className="grid grid-cols-3 gap-2 mb-6 fade-in items-end">
          {top3[1] && (
            <div className="podium-item podium-2" style={{ minHeight: 130 }}>
              <div className="podium-medal" style={{ background: "linear-gradient(135deg,#c0c0c0,#8a8a8a)", color: "#0a0a0a" }}>
                <Medal className="w-4 h-4" />
              </div>
              <div className={`rank-badge rank-${top3[1].rank} mt-2`}>{top3[1].rank === "GOW" ? "" : top3[1].rank}</div>
              <div className="text-xs font-bold mt-2 text-white truncate w-full">{top3[1].name}</div>
              <div className="text-[10px] text-muted-foreground">Lv {top3[1].level}</div>
              <div className="gold-text font-bold text-xs mono mt-1">{fmt(top3[1].total_points)}</div>
            </div>
          )}
          {top3[0] && (
            <div className="podium-item podium-1" style={{ minHeight: 150 }}>
              <div className="podium-medal" style={{ background: "linear-gradient(135deg,#F5A623,#d68810)", color: "#0a0a0a" }}>
                <Crown className="w-4 h-4" />
              </div>
              <div className={`rank-badge rank-${top3[0].rank} mt-2`}>{top3[0].rank === "GOW" ? "" : top3[0].rank}</div>
              <div className="text-sm font-bold mt-2 text-white truncate w-full">{top3[0].name}</div>
              <div className="text-[10px] text-muted-foreground">Lv {top3[0].level}</div>
              <div className="gold-text font-bold text-sm mono mt-1">{fmt(top3[0].total_points)}</div>
            </div>
          )}
          {top3[2] && (
            <div className="podium-item podium-3" style={{ minHeight: 130 }}>
              <div className="podium-medal" style={{ background: "linear-gradient(135deg,#cd7f32,#8b4513)", color: "#fff" }}>
                <Award className="w-4 h-4" />
              </div>
              <div className={`rank-badge rank-${top3[2].rank} mt-2`}>{top3[2].rank === "GOW" ? "" : top3[2].rank}</div>
              <div className="text-xs font-bold mt-2 text-white truncate w-full">{top3[2].name}</div>
              <div className="text-[10px] text-muted-foreground">Lv {top3[2].level}</div>
              <div className="gold-text font-bold text-xs mono mt-1">{fmt(top3[2].total_points)}</div>
            </div>
          )}
        </div>

        <div className="section-title">{t("full_ranking")}</div>
        <div className="space-y-1 mb-4">
          {rest.map((r) => (
            <button
              key={r.member_id}
              data-testid={LEADERBOARD.row(r.member_id)}
              onClick={() => setProfileId(r.member_id)}
              className="w-full card-dark p-3 flex items-center gap-3 row-hover text-left"
            >
              <div className="w-8 text-center">
                <span className="text-xs font-bold text-muted-foreground mono">#{r.position}</span>
              </div>
              <div
                className="rank-badge"
                style={{ ...allianceBadgeStyle(r.alliance_name, allianceColors), width: 36, height: 36, fontSize: 11 }}
                title={r.alliance_name || ""}
              >
                {r.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white truncate">{r.name}</div>
                <div className="text-[10px] text-muted-foreground tracking-wider truncate">
                  {r.title || r.alliance_name || t("member")} • Lv {r.level}
                </div>
              </div>
              <div className="text-right">
                <div className="gold-text font-bold mono text-sm">{fmt(r.total_points)}</div>
              </div>
            </button>
          ))}
          {rest.length === 0 && top3.length === 0 && (
            <div className="card-dark p-6 text-center text-muted-foreground text-sm">{t("no_points_yet")}</div>
          )}
        </div>

        <button
          data-testid={LEADERBOARD.exportButton}
          onClick={exportXlsx}
          className="btn-gold w-full flex items-center justify-center gap-2 mb-6"
        >
          <Download className="w-4 h-4" />
          {t("detailed_report")}
        </button>
      </div>

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
