import React, { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { api, fmt, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { LEADERBOARD } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Users, Calendar, Star, TrendingUp, Crown, Medal, Award, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Leaderboard() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("active");
  const [group, setGroup] = useState(null);
  // Reset the selected group whenever the tab flips so a stale group from the
  // other scope doesn't leave the leaderboard empty.
  useEffect(() => { setGroup(null); }, [filter]);
  const [profileId, setProfileId] = useState(null);
  const [archiveEventId, setArchiveEventId] = useState(null);
  const [rawSearch, setRawSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setDebSearch(rawSearch), 300);
    return () => clearTimeout(h);
  }, [rawSearch]);

  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 5000 });
  const { data: groups } = useSWR("/event-groups", fetcher, { refreshInterval: 10000 });
  // Live counts for the Active/Archive filter badges. `/event-groups` already
  // returns `{active, count}` per group so we sum without an extra network
  // call. Falls back to 0 while the request is in flight.
  const { activeCount, archiveCount } = useMemo(() => {
    let a = 0, c = 0;
    (groups || []).forEach((g) => {
      const act = Number(g.active || 0);
      const total = Number(g.count || 0);
      a += act;
      c += Math.max(0, total - act);
    });
    return { activeCount: a, archiveCount: c };
  }, [groups]);
  const lbScope = filter === "archive" ? "archived" : "active";
  const { data: lb = [] } = useSWR(
    `/leaderboard?scope=${lbScope}${group ? `&group_name=${encodeURIComponent(group)}` : ""}`,
    fetcher,
    { refreshInterval: 5000 },
  );
  const { data: allianceColors = {} } = useSWR("/alliance-colors", fetcher, { refreshInterval: 15000 });
  const { data: allMembers = [] } = useSWR("/members", fetcher, { refreshInterval: 10000 });
  const { data: archivedEvents = [] } = useSWR(filter === "archive" ? "/events?archived=true" : null, fetcher, { refreshInterval: 15000 });
  const { data: activeEvents = [] } = useSWR(filter === "active" ? "/events?archived=false" : null, fetcher, { refreshInterval: 15000 });
  const { data: groupTotalLb = [] } = useSWR(
    filter === "archive" && group ? `/leaderboard?scope=archived&group_name=${encodeURIComponent(group)}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
  const visibleArchivedEvents = useMemo(
    () => {
      const base = group ? archivedEvents.filter((e) => e.group_name === group) : archivedEvents;
      // Ranking is the aggregate view — hidden events never surface here so
      // the totals stay consistent with the /leaderboard aggregation.
      return base.filter((e) => !e.hidden_from_leaderboard);
    },
    [group, archivedEvents],
  );
  const visibleActiveEvents = useMemo(
    () => {
      const base = group ? activeEvents.filter((e) => e.group_name === group) : activeEvents;
      return base.filter((e) => !e.hidden_from_leaderboard);
    },
    [group, activeEvents],
  );
  const { data: archiveEventLb = [] } = useSWR(archiveEventId ? `/leaderboard?event_id=${encodeURIComponent(archiveEventId)}` : null, fetcher);
  const archiveEvent = useMemo(
    () => {
      if (!archiveEventId) return null;
      return archivedEvents.find((e) => e.id === archiveEventId)
          || activeEvents.find((e) => e.id === archiveEventId)
          || null;
    },
    [archiveEventId, archivedEvents, activeEvents],
  );

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
      <Header title={t("nav_leaderboard")} />

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
        <div
          className="flex gap-2 mb-4 justify-center"
          data-testid="leaderboard-filter-bar"
        >
          <button
            data-testid={LEADERBOARD.filterActive}
            onClick={() => setFilter("active")}
            className={`chip ${filter === "active" ? "active" : ""}`}
            style={filter === "active" ? {
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.14em",
              borderColor: "#F5A623",
              color: "#FFF7ED",
              background: "linear-gradient(180deg, rgba(245,166,35,0.32), rgba(180,83,9,0.55))",
              boxShadow: "0 0 14px rgba(245,166,35,0.55), inset 0 0 14px rgba(245,166,35,0.22)",
              textShadow: "0 1px 6px rgba(0,0,0,0.7)",
            } : {
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.14em",
              opacity: 0.85,
            }}
          >
            <span aria-hidden="true" style={{ marginRight: 6, fontSize: 14 }}>⚔️</span>
            {t("active_upper")}
            <span
              data-testid="leaderboard-filter-active-count"
              className="ml-2 mono font-bold px-2 py-0.5 rounded-full text-[11px]"
              style={{
                background: filter === "active" ? "rgba(0,0,0,0.35)" : "rgba(245,166,35,0.12)",
                color: filter === "active" ? "#FFF7ED" : "#F5A623",
                border: filter === "active" ? "1px solid rgba(255,247,237,0.25)" : "1px solid rgba(245,166,35,0.35)",
                minWidth: 22,
                display: "inline-block",
                textAlign: "center",
              }}
            >
              {activeCount}
            </span>
          </button>
          <button
            data-testid={LEADERBOARD.filterArchive}
            onClick={() => setFilter("archive")}
            className={`chip ${filter === "archive" ? "active" : ""}`}
            style={filter === "archive" ? {
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.14em",
              borderColor: "#94A3B8",
              color: "#F1F5F9",
              background: "linear-gradient(180deg, rgba(148,163,184,0.32), rgba(51,65,85,0.55))",
              boxShadow: "0 0 12px rgba(148,163,184,0.5), inset 0 0 12px rgba(148,163,184,0.20)",
              textShadow: "0 1px 6px rgba(0,0,0,0.7)",
            } : {
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.14em",
              opacity: 0.85,
            }}
          >
            <span aria-hidden="true" style={{ marginRight: 6, fontSize: 14 }}>📦</span>
            {t("archive_upper")}
            <span
              data-testid="leaderboard-filter-archive-count"
              className="ml-2 mono font-bold px-2 py-0.5 rounded-full text-[11px]"
              style={{
                background: filter === "archive" ? "rgba(0,0,0,0.35)" : "rgba(148,163,184,0.12)",
                color: filter === "archive" ? "#F1F5F9" : "#94A3B8",
                border: filter === "archive" ? "1px solid rgba(241,245,249,0.25)" : "1px solid rgba(148,163,184,0.35)",
                minWidth: 22,
                display: "inline-block",
                textAlign: "center",
              }}
            >
              {archiveCount}
            </span>
          </button>
        </div>

        {(() => {
          // Filter event groups by the current Active/Archive tab so the chip
          // strip only advertises groups that contain matching events.
          const visibleGroups = (groups || []).filter((g) => {
            const activeCount = Number(g.active || 0);
            const archivedCount = Math.max(0, Number(g.count || 0) - activeCount);
            return filter === "archive" ? archivedCount > 0 : activeCount > 0;
          });
          if (visibleGroups.length === 0) return null;
          return (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1" data-testid="leaderboard-group-strip">
              {/* "Tümü" chip removed on Active tab — user requested that only
                  events actually included in the ranking (specific groups)
                  surface. Archive keeps its overall summary chip. */}
              {filter !== "active" && (
                <button
                  className={`chip ${!group ? "active" : ""}`}
                  onClick={() => setGroup(null)}
                  data-testid="leaderboard-group-all"
                >
                  {t("all_short")}
                </button>
              )}
              {visibleGroups.map((g) => {
                const label = (g.name && String(g.name).trim()) || t("group_untitled");
                return (
                  <button
                    key={label}
                    data-testid={`leaderboard-group-${label}`}
                    onClick={() => setGroup(g.name === group ? null : g.name)}
                    className={`chip ${group === g.name ? "active" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Podium — Stone & Fire (always lit) */}
        {filter !== "archive" && (top3[0] || top3[1] || top3[2]) && (
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
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#F5F0E8', fontFamily: 'Rajdhani, sans-serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }} title={top3[1].name}>{top3[1].name}</div>
                <div
                  data-testid={`podium-alliance-badge-2`}
                  className="text-[9px] font-bold rounded-full mt-1"
                  style={{
                    background: (top3[1].alliance_name && allianceColors[top3[1].alliance_name]) || "#E74C1A",
                    color: "#fff",
                    padding: "2px 8px",
                    letterSpacing: "0.06em",
                    textTransform: "none",
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
                    textTransform: "none",
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
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#F5F0E8', fontFamily: 'Rajdhani, sans-serif', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none' }} title={top3[2].name}>{top3[2].name}</div>
                <div
                  data-testid={`podium-alliance-badge-3`}
                  className="text-[9px] font-bold rounded-full mt-1"
                  style={{
                    background: (top3[2].alliance_name && allianceColors[top3[2].alliance_name]) || "#E74C1A",
                    color: "#fff",
                    padding: "2px 8px",
                    letterSpacing: "0.06em",
                    textTransform: "none",
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

        {filter === "archive" && group && (
          <div className="mb-6" data-testid="archive-group-total">
            <div className="section-title heading-cinzel">{t("archive_group_total_title", { group })}</div>
            {groupTotalLb.length === 0 ? (
              <div className="card-dark p-6 text-center text-muted-foreground text-sm">{t("no_points_yet")}</div>
            ) : (
              <div className="space-y-1"
                style={{
                  border: "1px solid rgba(212,115,10,0.35)",
                  borderRadius: 12,
                  padding: 6,
                  background: "linear-gradient(180deg, rgba(60,30,10,0.35) 0%, rgba(20,12,10,0.55) 100%)",
                }}
              >
                {groupTotalLb.map((r) => (
                  <button
                    key={r.member_id}
                    data-testid={`archive-group-total-row-${r.member_id}`}
                    onClick={() => setProfileId(r.member_id)}
                    className="w-full flex items-center gap-3 rank-row text-left"
                    style={{ padding: "6px 10px", minHeight: 40 }}
                  >
                    <div className="w-7 text-center">
                      <span className="text-xs font-bold mono" style={{ color: "#D4730A", fontFamily: "Cinzel, Rajdhani, serif" }}>#{r.position}</span>
                    </div>
                    <div
                      className="text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: (r.alliance_name && allianceColors[r.alliance_name]) || "#E74C1A",
                        color: "#fff",
                        minWidth: 44,
                        padding: "3px 7px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        letterSpacing: "0.06em",
                        textTransform: "none",
                        fontFamily: "Cinzel, Rajdhani, serif",
                      }}
                      title={r.alliance_name || ""}
                    >
                      {r.alliance_name || "-"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate text-sm" style={{ color: "#F5F0E8", fontFamily: "Cinzel, Rajdhani, serif" }}>{r.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold mono text-sm" style={{ color: "#E74C1A" }}>{fmt(r.total_points)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filter !== "archive" && !group && visibleActiveEvents.length > 0 && (
          <div className="mb-6" data-testid="active-events-grid">
            <div className="section-title heading-cinzel">Aktif Etkinlikler</div>
            <div className="grid grid-cols-2 gap-2">
              {visibleActiveEvents.map((e) => (
                <button
                  key={e.id}
                  data-testid={`active-event-card-${e.id}`}
                  onClick={() => setArchiveEventId(e.id)}
                  className="text-left rounded-lg p-3 transition-all hover:scale-[1.02]"
                  style={{
                    background: "linear-gradient(160deg, rgba(60,30,10,0.85) 0%, rgba(20,12,10,0.92) 100%)",
                    border: "1px solid rgba(212,115,10,0.45)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,170,80,0.08)",
                  }}
                >
                  {e.banner_url && (
                    <img
                      src={e.banner_url}
                      alt=""
                      data-testid={`active-event-card-banner-${e.id}`}
                      className="w-full h-20 object-cover rounded-md mb-2"
                      loading="lazy"
                      onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#D4730A", letterSpacing: "0.14em" }}>
                    {e.group_name || t("event")}
                  </div>
                  <div className="text-sm font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }} title={e.name}>
                    {e.name}
                  </div>
                  {e.subtitle && (
                    <div className="text-[11px] mt-0.5 truncate opacity-80" style={{ color: "#EAD8B0" }} title={e.subtitle}>
                      {e.subtitle}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: "#A88060" }}>
                    <span>{e.date ? String(e.date).slice(0, 10) : "—"}</span>
                    <span className="font-bold mono" style={{ color: "#E74C1A" }}>×{e.multiplier ?? 1}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {filter === "archive" && (
          <div className="mb-6" data-testid="archive-events-grid">
            <div className="section-title heading-cinzel">{t("archive_events_title")}</div>
            {visibleArchivedEvents.length === 0 ? (
              <div className="card-dark p-6 text-center text-muted-foreground text-sm">{t("archive_events_empty")}</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {visibleArchivedEvents.map((e) => (
                  <button
                    key={e.id}
                    data-testid={`archive-event-card-${e.id}`}
                    onClick={() => setArchiveEventId(e.id)}
                    className="text-left rounded-lg p-3 transition-all hover:scale-[1.02]"
                    style={{
                      background: "linear-gradient(160deg, rgba(60,30,10,0.85) 0%, rgba(20,12,10,0.92) 100%)",
                      border: "1px solid rgba(212,115,10,0.45)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,170,80,0.08)",
                    }}
                  >
                    <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#D4730A", letterSpacing: "0.14em" }}>
                      {e.group_name || t("event")}
                    </div>
                    <div className="text-sm font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }} title={e.name}>
                      {e.name}
                    </div>
                    {e.subtitle && (
                      <div className="text-[11px] mt-0.5 truncate opacity-80" style={{ color: "#EAD8B0" }} title={e.subtitle}>
                        {e.subtitle}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: "#A88060" }}>
                      <span>{e.date || "—"}</span>
                      <span className="font-bold mono" style={{ color: "#E74C1A" }}>×{e.multiplier ?? 1}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filter !== "archive" && (
          <>
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
                  textTransform: "none",
                  fontFamily: "Cinzel, Rajdhani, serif",
                }}
                title={r.alliance_name || ""}
              >
                {r.alliance_name || "-"}
              </div>
              <div className="flex-1 min-w-0 flex items-center">
                <div className="font-bold truncate normal-case text-sm" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif", textTransform: "none" }}>{r.name}</div>
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
          </>
        )}
      </div>

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
      {archiveEvent && (
        <div
          data-testid="archive-event-modal"
          onClick={() => setArchiveEventId(null)}
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #1E1410 0%, #0F0806 100%)",
              border: "1px solid rgba(212,115,10,0.55)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(231,76,26,0.25)",
              maxHeight: "85vh",
            }}
          >
            <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: "rgba(212,115,10,0.3)" }}>
              <div className="min-w-0 flex-1 pr-3">
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "#D4730A" }}>
                  {archiveEvent.group_name || t("event")} · ×{archiveEvent.multiplier ?? 1}
                </div>
                <div className="text-base font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }} title={archiveEvent.name}>
                  {archiveEvent.name}
                </div>
                {archiveEvent.subtitle && (
                  <div className="text-[11px] mt-0.5 opacity-80" style={{ color: "#EAD8B0" }}>{archiveEvent.subtitle}</div>
                )}
                {archiveEvent.date && (
                  <div className="text-[10px] mt-0.5 opacity-70 mono" style={{ color: "#A88060" }}>
                    {String(archiveEvent.date).slice(0, 10)}
                  </div>
                )}
              </div>
              <button
                data-testid="archive-event-modal-close"
                onClick={() => setArchiveEventId(null)}
                className="p-1.5 rounded hover:bg-white/10 transition"
                style={{ color: "#F5F0E8" }}
                aria-label={t("cancel")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {archiveEvent.banner_url && (
              <div
                className="w-full flex-shrink-0"
                data-testid="archive-event-modal-banner"
                style={{ background: "#0A0605", borderBottom: "1px solid rgba(212,115,10,0.25)" }}
              >
                <img
                  src={archiveEvent.banner_url}
                  alt={archiveEvent.name}
                  className="w-full max-h-72 object-contain"
                  onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                />
              </div>
            )}
            <div className="overflow-y-auto flex-1" data-testid="archive-event-lb-list">
              {archiveEventLb.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">{t("no_points_yet")}</div>
              ) : (
                <div className="p-2 space-y-1">
                  {archiveEventLb.map((r) => (
                    <button
                      key={r.member_id}
                      onClick={() => { setArchiveEventId(null); setProfileId(r.member_id); }}
                      data-testid={`archive-event-row-${r.member_id}`}
                      className="w-full flex items-center gap-3 rank-row text-left"
                      style={{ padding: "6px 10px", minHeight: 40 }}
                    >
                      <div className="w-7 text-center">
                        <span className="text-xs font-bold mono" style={{ color: "#D4730A", fontFamily: "Cinzel, Rajdhani, serif" }}>#{r.position}</span>
                      </div>
                      <div
                        className="text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: (r.alliance_name && allianceColors[r.alliance_name]) || "#E74C1A",
                          color: "#fff",
                          minWidth: 44,
                          padding: "3px 7px",
                          border: "1px solid rgba(255,255,255,0.15)",
                          letterSpacing: "0.06em",
                          textTransform: "none",
                          fontFamily: "Cinzel, Rajdhani, serif",
                        }}
                        title={r.alliance_name || ""}
                      >
                        {r.alliance_name || "-"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate text-sm" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }}>{r.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold mono text-sm" style={{ color: "#E74C1A" }}>{fmt(r.total_points)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
