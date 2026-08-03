import React, { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { api, fmt, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { LEADERBOARD } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Users, Calendar, Star, TrendingUp, Crown, Medal, Award } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Leaderboard() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("active");
  const [group, setGroup] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [rawSearch, setRawSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setDebSearch(rawSearch), 300);
    return () => clearTimeout(h);
  }, [rawSearch]);

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

        {/* Podium — Stone & Fire (always lit) */}
        {(top3[0] || top3[1] || top3[2]) && (
          <div className="mb-6 mt-3 fade-in" style={{ display: "grid", gridTemplateColumns: "0.85fr 1fr 0.85fr", gap: "4px", alignItems: "end" }}>
            {top3[1] && (
              <div
                data-testid="podium-2"
                onClick={() => setProfileId(top3[1].member_id)}
                style={{
                  background: 'linear-gradient(180deg, rgba(192,192,192,0.12) 0%, #141418 100%)',
                  border: '2px solid #8A9BB0',
                  boxShadow: '0 0 25px rgba(192,192,192,0.5), inset 0 0 15px rgba(192,192,192,0.08)',
                  borderRadius: 12, padding: '16px 8px 12px', minHeight: 120,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer',
                }}
              >
                <div className="podium-medal" style={{ background: 'linear-gradient(135deg,#c0c0c0,#8a8a8a)', color: '#0a0a0a' }}>
                  <Medal className="w-4 h-4" />
                </div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#F5F0E8', fontFamily: 'Cinzel, serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }} title={top3[1].name}>{top3[1].name}</div>
                <div
                  data-testid={`podium-alliance-badge-2`}
                  className="text-[9px] font-bold rounded-full mt-1"
                  style={{
                    background: (top3[1].alliance_name && allianceColors[top3[1].alliance_name]) || "#E74C1A",
                    color: "#fff",
                    padding: "2px 8px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "Cinzel, Rajdhani, serif",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                  title={top3[1].alliance_name || ""}
                >
                  {top3[1].alliance_name || "-"}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, fontSize: 12, color: '#E74C1A', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(top3[1].total_points)}</div>
              </div>
            )}
            {top3[0] && (
              <div
                data-testid="podium-1"
                onClick={() => setProfileId(top3[0].member_id)}
                style={{
                  background: 'linear-gradient(180deg, rgba(220,38,38,0.15) 0%, #1A0E04 100%)',
                  border: '2px solid #D4730A',
                  boxShadow: '0 0 30px rgba(220,38,38,0.6), inset 0 0 20px rgba(220,38,38,0.1)',
                  borderRadius: 12, padding: '18px 8px 14px', minHeight: 140,
                  transform: 'scale(1.05)', zIndex: 2,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer',
                }}
              >
                <div className="podium-medal" style={{ background: 'linear-gradient(135deg,#D4730A,#E74C1A)', color: '#0a0a0a' }}>
                  <Crown className="w-4 h-4" />
                </div>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: '#F5F0E8', fontFamily: 'Cinzel, serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }} title={top3[0].name}>{top3[0].name}</div>
                <div
                  data-testid={`podium-alliance-badge-1`}
                  className="text-[9px] font-bold rounded-full mt-1"
                  style={{
                    background: (top3[0].alliance_name && allianceColors[top3[0].alliance_name]) || "#E74C1A",
                    color: "#fff",
                    padding: "2px 8px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "Cinzel, Rajdhani, serif",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                  title={top3[0].alliance_name || ""}
                >
                  {top3[0].alliance_name || "-"}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, fontSize: 14, color: '#E74C1A', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(top3[0].total_points)}</div>
              </div>
            )}
            {top3[2] && (
              <div
                data-testid="podium-3"
                onClick={() => setProfileId(top3[2].member_id)}
                style={{
                  background: 'linear-gradient(180deg, rgba(205,127,50,0.12) 0%, #160E04 100%)',
                  border: '2px solid #8B6914',
                  boxShadow: '0 0 20px rgba(205,127,50,0.5), inset 0 0 15px rgba(205,127,50,0.08)',
                  borderRadius: 12, padding: '14px 8px 10px', minHeight: 100,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer',
                }}
              >
                <div className="podium-medal" style={{ background: 'linear-gradient(135deg,#8B6914,#A67C00)', color: '#0a0a0a' }}>
                  <Award className="w-4 h-4" />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#F5F0E8', fontFamily: 'Cinzel, serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }} title={top3[2].name}>{top3[2].name}</div>
                <div
                  data-testid={`podium-alliance-badge-3`}
                  className="text-[9px] font-bold rounded-full mt-1"
                  style={{
                    background: (top3[2].alliance_name && allianceColors[top3[2].alliance_name]) || "#E74C1A",
                    color: "#fff",
                    padding: "2px 8px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "Cinzel, Rajdhani, serif",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                  title={top3[2].alliance_name || ""}
                >
                  {top3[2].alliance_name || "-"}
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, fontSize: 11, color: '#E74C1A', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(top3[2].total_points)}</div>
              </div>
            )}
          </div>
        )}

        <div className="section-title heading-cinzel">{t("full_ranking")}</div>
        <div className="relative mb-3">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            data-testid="leaderboard-search"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder={t("search_by_name_or_id") || "İsim veya ID ile ara..."}
            className="w-full pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none rounded-md"
            style={{ background: "#1A1210", border: "1px solid rgba(231,76,26,0.35)" }}
          />
        </div>
        <div className="space-y-1 mb-4">
          {(() => {
            const s = debSearch.trim().toLowerCase();
            const list = s ? rest.filter((r) => (r.name || "").toLowerCase().includes(s) || String(r.member_id || "").toLowerCase().includes(s)) : rest;
            return list;
          })().map((r) => (
            <button
              key={r.member_id}
              data-testid={LEADERBOARD.row(r.member_id)}
              onClick={() => setProfileId(r.member_id)}
              className="w-full rank-row flex items-center gap-3 text-left"
              style={{ padding: "7px 12px", minHeight: 44 }}
            >
              <div className="w-8 text-center">
                <span className="text-xs font-bold mono" style={{ color: "#D4730A", fontFamily: "Cinzel, Rajdhani, serif" }}>#{r.position}</span>
              </div>
              <div
                data-testid={`row-alliance-badge-${r.member_id}`}
                className="text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: (r.alliance_name && allianceColors[r.alliance_name]) || "#E74C1A",
                  color: "#fff",
                  minWidth: 52,
                  padding: "4px 9px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontFamily: "Cinzel, Rajdhani, serif",
                }}
                title={r.alliance_name || ""}
              >
                {r.alliance_name || "-"}
              </div>
              <div className="flex-1 min-w-0 flex items-center">
                <div className="font-bold truncate normal-case text-sm" style={{ color: "#F5F0E8", fontFamily: "Cinzel, Rajdhani, serif", textTransform: "none" }}>{r.name}</div>
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
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        >
          {t("detailed_report")}
        </button>
      </div>

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
