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
        {(top3[0] || top3[1] || top3[2]) && (() => {
          const first = top3[0], second = top3[1], third = top3[2];
          return (
            <div className="mb-6 fade-in" style={{
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px',
              padding: '16px 8px',
              background: 'linear-gradient(180deg, rgba(231,76,26,0.05) 0%, transparent 100%)'
            }}>
              {/* 2. SIRA - SOL */}
              {second && (
                <div data-testid="podium-2" onClick={() => setProfileId(second.member_id)} style={{
                  flex: 1, minHeight: '120px', background: 'linear-gradient(180deg, #1E1E22 0%, #141418 100%)',
                  border: '2px solid #8A9BB0', boxShadow: '0 0 15px rgba(138,155,176,0.5), inset 0 0 10px rgba(0,0,0,0.5)',
                  borderRadius: '6px 6px 0 0', padding: '10px 6px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>🥈</span>
                  <span style={{ color: '#F5F0E8', fontFamily: 'Cinzel, serif', fontSize: '13px', fontWeight: 700, marginTop: '6px' }}>{second.name}</span>
                  <span style={{ color: '#8A9BB0', fontSize: '11px', marginTop: '2px' }}>{(second.total_points ?? 0).toLocaleString()}</span>
                </div>
              )}
              {/* 1. SIRA - ORTA (EN YÜKSEK) */}
              {first && (
                <div data-testid="podium-1" onClick={() => setProfileId(first.member_id)} style={{
                  flex: 1, minHeight: '170px', background: 'linear-gradient(180deg, #2A1A08 0%, #1A0E04 100%)',
                  border: '2px solid #D4730A', boxShadow: '0 0 25px rgba(212,115,10,0.7), inset 0 0 10px rgba(0,0,0,0.5)',
                  borderRadius: '6px 6px 0 0', padding: '10px 6px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '24px' }}>👑</span>
                  <span style={{ color: '#D4730A', fontFamily: 'Cinzel, serif', fontSize: '14px', fontWeight: 700, marginTop: '6px' }}>{first.name}</span>
                  <span style={{ color: '#E74C1A', fontSize: '13px', fontWeight: 'bold', marginTop: '4px' }}>{(first.total_points ?? 0).toLocaleString()}</span>
                </div>
              )}
              {/* 3. SIRA - SAĞ */}
              {third && (
                <div data-testid="podium-3" onClick={() => setProfileId(third.member_id)} style={{
                  flex: 1, minHeight: '100px', background: 'linear-gradient(180deg, #221608 0%, #160E04 100%)',
                  border: '2px solid #8B6914', boxShadow: '0 0 12px rgba(139,105,20,0.5), inset 0 0 10px rgba(0,0,0,0.5)',
                  borderRadius: '6px 6px 0 0', padding: '10px 6px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '18px' }}>🥉</span>
                  <span style={{ color: '#F5F0E8', fontFamily: 'Cinzel, serif', fontSize: '12px', fontWeight: 700, marginTop: '6px' }}>{third.name}</span>
                  <span style={{ color: '#8B6914', fontSize: '11px', marginTop: '2px' }}>{(third.total_points ?? 0).toLocaleString()}</span>
                </div>
              )}
            </div>
          );
        })()}

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
