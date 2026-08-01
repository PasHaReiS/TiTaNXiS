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
  const { data: allMembers = [] } = useSWR("/members", fetcher, { refreshInterval: 10000 });

  // Merge zero-point members below scored ones so the whole guild is always listed.
  const fullLb = useMemo(() => {
    const scoredIds = new Set(lb.map((r) => r.member_id));
    const zeros = allMembers
      .filter((m) => !scoredIds.has(m.id))
      .map((m) => ({
        member_id: m.id,
        name: m.name,
        rank: m.rank || "R1",
        alliance_name: m.alliance_name,
        level: m.level || 1,
        title: m.title,
        total_points: 0,
      }));
    return [...lb, ...zeros].map((r, i) => ({ ...r, position: i + 1 }));
  }, [lb, allMembers]);

  const top3 = useMemo(() => fullLb.slice(0, 3), [fullLb]);
  const rest = useMemo(() => fullLb.slice(3, 500), [fullLb]);

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

        {/* Podium — Stone slab tiered (2nd | 1st | 3rd, aligned bottom) */}
        <div className="section-title heading-cinzel">{t("podium")}</div>
        <div className="mb-6 fade-in" style={{ display: "flex", alignItems: "flex-end", gap: "8px", padding: "8px 0" }}>
          {top3[1] && (
            <PodiumSlab place={2} entry={top3[1]} minHeight={120} borderColor="#8A9BB0" glow="rgba(138,155,176,0.45)" bg="linear-gradient(180deg,#1E1E22,#141418)" medal="🥈" />
          )}
          {top3[0] && (
            <PodiumSlab place={1} entry={top3[0]} minHeight={160} borderColor="#D4730A" glow="rgba(212,115,10,0.55)" bg="linear-gradient(180deg,#2A1A08,#1A0E04)" medal="👑" />
          )}
          {top3[2] && (
            <PodiumSlab place={3} entry={top3[2]} minHeight={100} borderColor="#8B6914" glow="rgba(139,105,20,0.45)" bg="linear-gradient(180deg,#221608,#160E04)" medal="🥉" />
          )}
        </div>

        <div className="section-title heading-cinzel">{t("full_ranking")}</div>
        <div className="space-y-1 mb-4">
          {rest.map((r) => (
            <button
              key={r.member_id}
              data-testid={LEADERBOARD.row(r.member_id)}
              onClick={() => setProfileId(r.member_id)}
              className="w-full rank-row flex items-center gap-3 text-left"
            >
              <div className="w-8 text-center">
                <span className="text-xs font-bold mono" style={{ color: "#D4730A", fontFamily: "Cinzel, Rajdhani, serif" }}>#{r.position}</span>
              </div>
              <div
                className="rank-badge"
                style={{ ...allianceBadgeStyle(r.alliance_name, allianceColors), width: 36, height: 36, fontSize: 11 }}
                title={r.alliance_name || ""}
              >
                {r.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Cinzel, Rajdhani, serif" }}>{r.name}</div>
                <div className="text-[10px] text-muted-foreground tracking-wider truncate">
                  {r.title || r.alliance_name || t("member")} • Lv {r.level}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold mono text-sm" style={{ color: "#E74C1A" }}>{fmt(r.total_points)}</div>
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

// Compact stone-slab podium tile — inline styled to keep the Stone & Fire aesthetic without extra CSS.
function PodiumSlab({ place, entry, minHeight, borderColor, glow, bg, medal }) {
  return (
    <div
      data-testid={`podium-${place}`}
      style={{
        flex: 1, minHeight, background: bg, border: `2px solid ${borderColor}`,
        boxShadow: `0 0 20px ${glow}, inset 0 0 12px rgba(0,0,0,0.4)`,
        borderRadius: 10, padding: 12, textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        fontFamily: "Cinzel, Rajdhani, serif",
      }}
    >
      <div style={{ fontSize: place === 1 ? 26 : 22, lineHeight: 1, marginBottom: 6 }}>{medal}</div>
      <div style={{ fontSize: 10, color: borderColor, fontWeight: 700, letterSpacing: "0.08em" }}>#{place}</div>
      <div style={{
        display: "inline-block", marginTop: 4, fontSize: 10,
        background: "#1A1008", border: `1px solid ${borderColor}`, color: borderColor,
        padding: "2px 6px", borderRadius: 4, fontWeight: 700,
      }}>{entry.rank}</div>
      <div style={{
        fontSize: place === 1 ? 13 : 11, fontWeight: 700, color: "#F5F0E8",
        marginTop: 8, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
      }} title={entry.name}>{entry.name}</div>
      <div style={{
        fontSize: place === 1 ? 15 : 12, fontWeight: 800, marginTop: 6,
        color: place === 1 ? "#D4730A" : "#E74C1A", fontFamily: "'JetBrains Mono', monospace"
      }}>{fmt(entry.total_points)}</div>
    </div>
  );
}
