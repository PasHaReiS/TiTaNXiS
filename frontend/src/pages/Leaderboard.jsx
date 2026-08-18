import React, { useState, useMemo, useEffect } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { api, fmt, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { LEADERBOARD } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Users, Calendar, Star, TrendingUp, Crown, Medal, Award, X, Download, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Leaderboard() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [filter, setFilter] = useState("active");
  const [group, setGroup] = useState(null);
  // Reset the selected group whenever the tab flips so a stale group from the
  // other scope doesn't leave the leaderboard empty.
  useEffect(() => { setGroup(null); setActiveEventId(null); setFolderId(null); }, [filter]);
  const [profileId, setProfileId] = useState(null);
  const [archiveEventId, setArchiveEventId] = useState(null);
  // Under Aktif: when the user picks a specific active event from the chip
  // strip, `activeEventId` overrides the aggregate leaderboard so the
  // podium + list reflect only that event's participants.
  const [activeEventId, setActiveEventId] = useState(null);
  // Under Arşiv: when set, only events in that folder surface in the
  // archive grid. Syncs 1-to-1 with the Events page folder taxonomy.
  const [folderId, setFolderId] = useState(null);
  // In the group-list view (folderId set), each group has an expand
  // toggle (▶/▼) that reveals its underlying events inline. Group name
  // click still swaps to the total-ranking view via setGroup.
  const [expandedGroups, setExpandedGroups] = useState({});
  // On the Aktif tab, each group chip in the active-event strip carries
  // an inline ▶ expand icon. Clicking ▶ reveals that group's underlying
  // events in a panel below the strip; clicking the group NAME still
  // filters the aggregate ranking to that group's total. Sub-events stay
  // hidden by default so the strip remains a compact side-by-side row.
  const [expandedActiveGroups, setExpandedActiveGroups] = useState({});
  // Folder chip drag/drop reorder — mirrors the Events archive UX.
  const [dragFolderId, setDragFolderId] = useState(null);
  // Compare mode — when active, archive event cards get checkboxes so the
  // admin can pick exactly 2 events and open a side-by-side diff modal.
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]); // ordered [a, b]
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  useEffect(() => {
    // Leaving the archive tab clears any compare state so returning users
    // land on a clean grid instead of stale checkboxes.
    if (filter !== "archive") { setCompareMode(false); setCompareIds([]); }
  }, [filter]);
  const [rawSearch, setRawSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setDebSearch(rawSearch), 300);
    return () => clearTimeout(h);
  }, [rawSearch]);

  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 5000 });
  const { data: groups } = useSWR("/event-groups", fetcher, { refreshInterval: 10000 });
  const { data: folders = [] } = useSWR("/event-folders", fetcher, { refreshInterval: 15000 });
  const { data: groupResults = [] } = useSWR("/event-group-results", fetcher, { refreshInterval: 15000 });
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
  // Primary leaderboard feed. When the user picks a single active event
  // from the chip strip, swap in the per-event feed so the whole podium +
  // list reflects only that event's scorers (rather than the aggregate).
  const { data: lb = [] } = useSWR(
    activeEventId
      ? `/leaderboard?event_id=${encodeURIComponent(activeEventId)}`
      : `/leaderboard?scope=${lbScope}${group ? `&group_name=${encodeURIComponent(group)}` : ""}`,
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
      let base = group ? archivedEvents.filter((e) => e.group_name === group) : archivedEvents;
      // Folder filter — when a folder chip is active, only events assigned
      // to that folder surface. "none" sentinel means top-level (no folder).
      if (folderId === "none") {
        base = base.filter((e) => !e.folder_id);
      } else if (folderId) {
        base = base.filter((e) => e.folder_id === folderId);
      }
      // Ranking is the aggregate view — hidden events never surface here so
      // the totals stay consistent with the /leaderboard aggregation.
      // Sort newest → oldest inside a folder so admins land on recent events.
      const filtered = base.filter((e) => !e.hidden_from_leaderboard);
      return [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    [group, archivedEvents, folderId],
  );
  const visibleActiveEvents = useMemo(
    () => {
      const base = group ? activeEvents.filter((e) => e.group_name === group) : activeEvents;
      const filtered = base.filter((e) => !e.hidden_from_leaderboard);
      // Priority sort — today / in-progress at the very top, then upcoming
      // (nearest date first), then finished/past events at the bottom.
      const now = Date.now();
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = startOfToday.getTime() + 86400000;
      const rank = (e) => {
        const t = new Date(e.date).getTime();
        if (t >= startOfToday.getTime() && t < endOfToday) return 0; // today
        if (t <= now && (now - t) < 6 * 3600 * 1000) return 1;       // just finished, still hot
        if (t > now) return 2;                                        // upcoming
        return 3;                                                     // past
      };
      return [...filtered].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        // Same bucket → upcoming ascending (nearest first), past descending
        // (most recent first) — so #2 sorts nearest-future first, #3 sorts
        // most-recently-past first.
        const ta = new Date(a.date).getTime();
        const tb = new Date(b.date).getTime();
        return ra <= 2 ? ta - tb : tb - ta;
      });
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
          // Hidden on the Archive tab — the new folder-card grid + group
          // chip drill-down covers that navigation more cleanly. Also
          // excludes groups whose events are all hidden from the ranking
          // (e.g. legacy HIDDEN_GRP) so they never surface as buttons.
          if (filter === "archive") return null;
          const allowedNames = new Set(visibleActiveEvents.map((e) => (e.group_name || "").trim()).filter(Boolean));
          const visibleGroups = (groups || []).filter((g) => {
            const activeCount = Number(g.active || 0);
            if (activeCount <= 0) return false;
            const name = String(g.name || "").trim();
            if (!name) return false;
            // Belt-and-braces: never show the legacy HIDDEN_GRP bucket.
            if (name.toUpperCase() === "HIDDEN_GRP") return false;
            // Skip groups whose active events are ALL hidden from the ranking.
            return allowedNames.has(name);
          });
          if (visibleGroups.length === 0) return null;
          return (
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 flex-nowrap" data-testid="leaderboard-group-strip" style={{ scrollBehavior: "smooth" }}>
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
                const isActive = group === g.name;
                return (
                  <button
                    key={label}
                    data-testid={`leaderboard-group-${label}`}
                    onClick={() => setGroup(g.name === group ? null : g.name)}
                    className={`chip ${isActive ? "active" : ""}`}
                    style={isActive ? {
                      padding: "6px 12px",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      borderColor: "#F5A623",
                      color: "#FFF7ED",
                      background: "linear-gradient(180deg, rgba(245,166,35,0.30), rgba(180,83,9,0.55))",
                      boxShadow: "0 0 10px rgba(245,166,35,0.55), inset 0 0 8px rgba(245,166,35,0.20)",
                      textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                      fontFamily: "Cinzel, serif",
                    } : {
                      padding: "6px 12px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      borderColor: "rgba(245,166,35,0.55)",
                      color: "#F5A623",
                      background: "rgba(30,20,15,0.85)",
                      fontFamily: "Cinzel, serif",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Active events select-list — under the Aktif filter, we branch:
            if any active event has a `group_name`, list the unique GROUP
            names side-by-side (chip = filter ranking to that group; the
            inline ▶ reveals member events under it, kept hidden by default
            so the strip stays a compact row). If NO groups exist, list the
            individual event names (clicking one shows that event's ranking). */}
        {filter !== "archive" && visibleActiveEvents.length > 0 && (() => {
          const groupNames = [...new Set(visibleActiveEvents.map((e) => e.group_name).filter(Boolean))];
          const hasGroups = groupNames.length > 0;
          const items = hasGroups
            ? groupNames.map((g) => ({ key: g, label: g, isGroup: true }))
            : visibleActiveEvents.map((e) => ({ key: e.id, label: e.name, isGroup: false, event: e }));
          const isSelected = (it) => it.isGroup ? group === it.key : activeEventId === it.event.id;
          const expandedGn = Object.keys(expandedActiveGroups).filter((k) => expandedActiveGroups[k] && groupNames.includes(k));
          const breakdownableFor = (gn) => visibleActiveEvents.filter((e) => e.group_name === gn && e.show_breakdown !== false);
          return (
          <>
          <div
            className="flex gap-1.5 mb-2 overflow-x-auto pb-1 flex-nowrap"
            data-testid="leaderboard-active-event-strip"
            style={{ scrollBehavior: "smooth" }}
          >
            {items.map((it) => {
              const isActive = isSelected(it);
              const tid = it.isGroup ? `leaderboard-active-group-${it.key}` : `leaderboard-active-event-${it.key}`;
              const isExp = it.isGroup && !!expandedActiveGroups[it.key];
              return (
                <div
                  key={it.key}
                  className="flex items-stretch flex-shrink-0"
                  style={{ borderRadius: 6, overflow: "hidden" }}
                >
                  <button
                    data-testid={tid}
                    onClick={() => {
                      if (it.isGroup) {
                        setGroup(isActive ? null : it.key);
                        setActiveEventId(null);
                      } else {
                        setActiveEventId(isActive ? null : it.event.id);
                      }
                    }}
                    className={`chip ${isActive ? "active" : ""}`}
                    title={it.label}
                    style={isActive ? {
                      padding: "5px 10px", fontSize: 9, fontWeight: 800,
                      letterSpacing: "0.08em", textTransform: "none",
                      borderColor: "#F5A623", color: "#FFF7ED",
                      background: "linear-gradient(180deg, rgba(245,166,35,0.30), rgba(180,83,9,0.55))",
                      boxShadow: "0 0 10px rgba(245,166,35,0.55), inset 0 0 6px rgba(245,166,35,0.20)",
                      textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                      fontFamily: "Rajdhani, sans-serif", whiteSpace: "nowrap",
                      maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                      borderTopRightRadius: it.isGroup ? 0 : undefined,
                      borderBottomRightRadius: it.isGroup ? 0 : undefined,
                    } : {
                      padding: "5px 10px", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.08em", textTransform: "none",
                      borderColor: "rgba(245,166,35,0.45)", color: "#EAD8B0",
                      background: "rgba(30,20,15,0.85)",
                      fontFamily: "Rajdhani, sans-serif", whiteSpace: "nowrap",
                      maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                      borderTopRightRadius: it.isGroup ? 0 : undefined,
                      borderBottomRightRadius: it.isGroup ? 0 : undefined,
                    }}
                  >
                    {it.isGroup ? "🤝 " : ""}{it.label}
                  </button>
                  {it.isGroup && breakdownableFor(it.key).length > 0 && (
                    <button
                      type="button"
                      data-testid={`leaderboard-active-group-expand-${it.key}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setExpandedActiveGroups((prev) => ({ ...prev, [it.key]: !prev[it.key] }));
                      }}
                      className="flex items-center justify-center transition-transform"
                      title={isExp ? "Etkinlikleri gizle" : "Etkinlikleri göster"}
                      style={{
                        padding: "0 6px",
                        fontSize: 10,
                        color: isActive ? "#FFF7ED" : "#F5A623",
                        background: isActive
                          ? "linear-gradient(180deg, rgba(245,166,35,0.30), rgba(180,83,9,0.55))"
                          : "rgba(245,166,35,0.15)",
                        border: `1px solid ${isActive ? "#F5A623" : "rgba(245,166,35,0.45)"}`,
                        borderLeft: "none",
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        cursor: "pointer",
                        transform: isExp ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    >
                      ▶
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {expandedGn.length > 0 && (
            <div
              className="mb-3 rounded-lg p-2 flex flex-col gap-2"
              data-testid="leaderboard-active-group-events-panel"
              style={{
                background: "rgba(245,166,35,0.06)",
                border: "1px dashed rgba(245,166,35,0.35)",
              }}
            >
              {expandedGn.map((gn) => {
                const evs = breakdownableFor(gn)
                  .sort((a, b) => new Date(a.date) - new Date(b.date));
                return (
                  <div key={gn} className="flex flex-col gap-1" data-testid={`leaderboard-active-group-events-${gn}`}>
                    <div
                      className="text-[9px] uppercase tracking-widest font-bold"
                      style={{ color: "#F5A623", letterSpacing: "0.14em", fontFamily: "Cinzel, serif" }}
                    >
                      🤝 {gn}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {evs.length === 0 ? (
                        <div className="text-[10px] opacity-70" style={{ color: "#94A3B8" }}>Etkinlik yok</div>
                      ) : evs.map((e) => {
                        const isEvSel = activeEventId === e.id;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            data-testid={`leaderboard-active-group-event-${e.id}`}
                            onClick={() => {
                              setActiveEventId(isEvSel ? null : e.id);
                              setGroup(null);
                            }}
                            className={`chip text-[9px] ${isEvSel ? "active" : ""}`}
                            style={isEvSel ? {
                              padding: "3px 8px",
                              borderColor: "#F5A623",
                              color: "#FFF7ED",
                              background: "linear-gradient(180deg, rgba(245,166,35,0.30), rgba(180,83,9,0.55))",
                              boxShadow: "0 0 8px rgba(245,166,35,0.4)",
                              fontFamily: "Rajdhani, sans-serif",
                            } : {
                              padding: "3px 8px",
                              borderColor: "rgba(245,166,35,0.35)",
                              color: "#EAD8B0",
                              background: "rgba(20,12,10,0.7)",
                              fontFamily: "Rajdhani, sans-serif",
                            }}
                            title={String(e.date || "").slice(0, 10)}
                          >
                            {e.name}
                            <span className="ml-1 opacity-70 mono">×{e.multiplier ?? 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>
          );
        })()}

        {/* Archive folder chip strip removed — the archive tab uses a
            folder-card grid + group-only drill-down instead of chips. */}
        {false && filter === "archive" && folders.length > 0 && (
          <div
            className="flex gap-1.5 mb-3 overflow-x-auto pb-1 flex-nowrap"
            data-testid="leaderboard-folder-strip"
            style={{ scrollBehavior: "smooth" }}
          >
            <button
              data-testid="leaderboard-folder-all"
              onClick={() => setFolderId(null)}
              className={`chip ${!folderId ? "active" : ""}`}
              style={{ padding: "5px 10px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}
            >
              📁 {t("all_short")}
            </button>
            <button
              data-testid="leaderboard-folder-none"
              onClick={() => setFolderId(folderId === "none" ? null : "none")}
              className={`chip ${folderId === "none" ? "active" : ""}`}
              style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Klasörsüz
            </button>
            {folders.map((f) => {
              const isSel = folderId === f.id;
              const isDragTarget = dragFolderId && dragFolderId !== f.id;
              return (
                <button
                  key={f.id}
                  data-testid={`leaderboard-folder-${f.id}`}
                  draggable="true"
                  onDragStart={(e) => { setDragFolderId(f.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDragFolderId(null)}
                  onDragOver={(e) => { if (isDragTarget) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                  onDrop={(e) => {
                    if (!isDragTarget) return;
                    e.preventDefault();
                    const ids = folders.map((x) => x.id);
                    const from = ids.indexOf(dragFolderId);
                    const to = ids.indexOf(f.id);
                    if (from < 0 || to < 0 || from === to) return;
                    ids.splice(to, 0, ids.splice(from, 1)[0]);
                    api.post("/event-folders/reorder", { ids })
                      .then(() => toast.success("Klasör sırası güncellendi"))
                      .catch((err) => toast.error(err?.response?.data?.detail || err.message));
                    setDragFolderId(null);
                  }}
                  onClick={() => setFolderId(isSel ? null : f.id)}
                  className={`chip ${isSel ? "active" : ""}`}
                  title={`${f.name} — sürükleyerek yeniden sırala`}
                  style={{
                    padding: "5px 10px",
                    fontSize: 10,
                    fontWeight: isSel ? 800 : 700,
                    whiteSpace: "nowrap",
                    borderColor: f.color || (isSel ? "#F5A623" : "rgba(245,166,35,0.45)"),
                    color: isSel ? "#FFF7ED" : "#EAD8B0",
                    background: isSel && f.color ? `${f.color}30` : undefined,
                    outline: isDragTarget ? "2px dashed rgba(245,166,35,0.6)" : "none",
                    outlineOffset: 2,
                    cursor: "grab",
                    opacity: dragFolderId === f.id ? 0.5 : 1,
                  }}
                >
                  {f.icon || "📁"} {f.name}
                  {typeof f.archived_count === "number" && (
                    <span className="ml-1 opacity-70 mono">({f.archived_count})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

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

        {/* Active events grid removed per user request — the group chips
            above the podium now serve as the primary event navigator so
            the ranking screen isn't buried under a second card grid. */}
        {false && filter !== "archive" && !group && visibleActiveEvents.length > 0 && (
          <div className="mb-6" data-testid="active-events-grid">
            <div className="section-title heading-cinzel">Aktif Etkinlikler</div>
            <div className="grid grid-cols-1 gap-3">
              {visibleActiveEvents.map((e) => (
                <button
                  key={e.id}
                  data-testid={`active-event-card-${e.id}`}
                  onClick={() => setArchiveEventId(e.id)}
                  className="text-left rounded-lg overflow-hidden transition-all hover:scale-[1.01] relative"
                  style={{
                    background: "linear-gradient(160deg, rgba(60,30,10,0.85) 0%, rgba(20,12,10,0.92) 100%)",
                    border: "1px solid rgba(212,115,10,0.55)",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,170,80,0.10)",
                  }}
                >
                  {e.banner_url ? (
                    <div className="relative w-full" style={{ height: 140 }}>
                      <img
                        src={e.banner_url}
                        alt=""
                        data-testid={`active-event-card-banner-${e.id}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                      />
                      <div className="absolute inset-0" style={{
                        background: "linear-gradient(180deg, rgba(10,0,21,0) 0%, rgba(10,0,21,0.55) 55%, rgba(10,0,21,0.95) 100%)",
                      }} />
                      <div className="absolute left-4 bottom-3 right-4">
                        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#F5A623", letterSpacing: "0.16em", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                          {e.group_name || t("event")} · ×{e.multiplier ?? 1}
                        </div>
                        <div className="text-lg font-black truncate uppercase" style={{ color: "#FFF7ED", fontFamily: "Cinzel, serif", letterSpacing: "0.04em", textShadow: "0 2px 8px rgba(0,0,0,0.9)" }} title={e.name}>
                          {e.name}
                        </div>
                        {e.subtitle && (
                          <div className="text-[11px] mt-0.5 truncate opacity-90" style={{ color: "#EAD8B0", textShadow: "0 1px 4px rgba(0,0,0,0.85)" }} title={e.subtitle}>
                            {e.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#D4730A", letterSpacing: "0.16em" }}>
                        {e.group_name || t("event")} · ×{e.multiplier ?? 1}
                      </div>
                      <div className="text-lg font-black truncate uppercase" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }} title={e.name}>
                        {e.name}
                      </div>
                      {e.subtitle && (
                        <div className="text-[11px] mt-0.5 truncate opacity-80" style={{ color: "#EAD8B0" }} title={e.subtitle}>
                          {e.subtitle}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-2 text-[11px]" style={{
                    color: "#A88060",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.65))",
                    borderTop: "1px solid rgba(212,115,10,0.25)",
                  }}>
                    <span className="mono">📅 {e.date ? new Date(e.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                    {e.date && new Date(e.date).getTime() > Date.now() && (
                      <span className="font-bold" style={{ color: "#F5A623" }}>Aktif</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {filter === "archive" && (
          <div className="mb-6" data-testid="archive-events-grid">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="section-title heading-cinzel m-0">{t("archive_events_title")}</div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="archive-compare-toggle"
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setCompareIds([]);
                  }}
                  className={`chip text-[10px] flex items-center gap-1 ${compareMode ? "active" : ""}`}
                  style={{
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                    borderColor: compareMode ? "#A855F7" : "rgba(168,85,247,0.45)",
                    color: compareMode ? "#F5F3FF" : "#C4B5FD",
                    background: compareMode ? "rgba(168,85,247,0.20)" : undefined,
                  }}
                  title="İki arşiv etkinlik seçip karşılaştır"
                >
                  <GitCompare className="w-3 h-3" /> Karşılaştır
                </button>
                {compareMode && compareIds.length === 2 && (
                  <button
                    type="button"
                    data-testid="archive-compare-open"
                    onClick={() => setShowCompareModal(true)}
                    className="chip text-[10px] flex items-center gap-1"
                    style={{
                      padding: "5px 10px",
                      whiteSpace: "nowrap",
                      borderColor: "#F5A623",
                      color: "#FFF7ED",
                      background: "linear-gradient(180deg, rgba(245,166,35,0.30), rgba(180,83,9,0.55))",
                      boxShadow: "0 0 8px rgba(245,166,35,0.45)",
                    }}
                  >
                    Görüntüle →
                  </button>
                )}
                <button
                  type="button"
                  data-testid="archive-csv-export"
                  disabled={exportBusy}
                  onClick={async () => {
                    setExportBusy(true);
                    try {
                      const token = localStorage.getItem("ol_token");
                      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/reports/archive-points-export.csv`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      });
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const today = new Date().toISOString().slice(0, 10);
                      a.download = `arsiv_puanlar_${today}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      toast.success("CSV indirildi");
                    } catch (e) {
                      toast.error(`CSV indirilemedi: ${e.message}`);
                    } finally { setExportBusy(false); }
                  }}
                  className="chip text-[10px] flex items-center gap-1"
                  style={{
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                    borderColor: "rgba(34,197,94,0.55)",
                    color: "#86EFAC",
                    background: "rgba(34,197,94,0.10)",
                    opacity: exportBusy ? 0.6 : 1,
                  }}
                  title="Tüm arşiv etkinliklerinin üye × puan dökümünü CSV olarak indir"
                >
                  <Download className="w-3 h-3" /> {exportBusy ? "İndiriliyor…" : "CSV İndir"}
                </button>
              </div>
            </div>
            {compareMode && (
              <div
                className="mb-2 text-[11px] rounded px-3 py-1.5"
                data-testid="archive-compare-hint"
                style={{
                  background: "rgba(168,85,247,0.08)",
                  border: "1px dashed rgba(168,85,247,0.4)",
                  color: "#C4B5FD",
                }}
              >
                {compareIds.length === 0
                  ? "İki etkinlik seç…"
                  : compareIds.length === 1
                    ? "1 etkinlik seçildi, ikincisini seç."
                    : "2 etkinlik seçildi — 'Görüntüle' ile yan yana kıyaslayın."}
              </div>
            )}
            {(archivedEvents.length === 0 && folders.length === 0) ? (
              <div className="card-dark p-6 text-center text-muted-foreground text-sm">{t("archive_events_empty")}</div>
            ) : (() => {
              // Leaderboard Archive hierarchy: Folder → Group → Member totals.
              // Individual events are NEVER surfaced here (event breakdown
              // belongs to the Events page). Top level = folder cards grid;
              // pick a folder → group list; pick a group → member ranking.
              const folderEventsAll = archivedEvents.filter((e) => e.folder_id === folderId);
              const selFolder = folderId ? folders.find((f) => f.id === folderId) : null;
              if (folderId) {
                const folderEvents = folderEventsAll;
                const groupNames = [...new Set(folderEvents.map((e) => e.group_name).filter(Boolean))].sort();
                const selColor = (selFolder && selFolder.color) || "#F5A623";
                if (groupNames.length === 0) {
                  return (
                    <div className="flex flex-col gap-2" data-testid="leaderboard-archive-groups-only">
                      <button
                        type="button"
                        data-testid="leaderboard-archive-back"
                        onClick={() => { setFolderId(null); setGroup(null); }}
                        className="chip text-[10px] self-start"
                        style={{ padding: "4px 10px", borderColor: `${selColor}55`, color: selColor }}
                      >
                        ← Klasörler
                      </button>
                      <div className="card-dark p-6 text-center text-muted-foreground text-sm">
                        Bu klasörde grup yok
                      </div>
                    </div>
                  );
                }
                const outcomeFor = (gn) => (groupResults.find((r) => r.group_name === gn) || {}).outcome || null;
                const setOutcome = (gn, outcome) => {
                  api.put(`/event-group-results/${encodeURIComponent(gn)}`, { outcome })
                    .then(() => { swrMutate("/event-group-results"); toast.success(outcome === "win" ? "🏆 Win" : outcome === "loose" ? "💀 Loose" : "Rozet kaldırıldı"); })
                    .catch((err) => toast.error(err?.response?.data?.detail || err.message));
                };
                const dateRangeFor = (gn) => {
                  const ds = folderEvents.filter((e) => e.group_name === gn).map((e) => String(e.date || "").slice(0, 10)).filter(Boolean).sort();
                  if (ds.length === 0) return "—";
                  return ds.length === 1 ? ds[0] : `${ds[0]} — ${ds[ds.length - 1]}`;
                };
                return (
                  <div className="flex flex-col gap-2" data-testid="leaderboard-archive-groups-only">
                    <button
                      type="button"
                      data-testid="leaderboard-archive-back"
                      onClick={() => { setFolderId(null); setGroup(null); }}
                      className="chip text-[10px] self-start"
                      style={{ padding: "4px 10px", borderColor: `${selColor}55`, color: selColor }}
                    >
                      ← Klasörler
                    </button>
                    {groupNames.map((gn) => {
                      const isSel = group === gn;
                      const out = outcomeFor(gn);
                      const outIcon = out === "win" ? "🏆" : out === "loose" ? "💀" : null;
                      const isExpanded = !!expandedGroups[gn];
                      const groupEvents = folderEvents
                        .filter((e) => e.group_name === gn)
                        .sort((a, b) => new Date(b.date) - new Date(a.date));
                      return (
                        <div key={gn} className="flex flex-col">
                          <div
                            className="flex items-center gap-2 rounded-lg px-3 py-2 transition-all"
                            style={{
                              background: isSel
                                ? `linear-gradient(90deg, ${selColor}22 0%, rgba(20,12,10,0.85) 100%)`
                                : `${selColor}10`,
                              border: `1px solid ${isSel ? "#F5A623" : `${selColor}55`}`,
                              boxShadow: isSel ? "0 0 12px rgba(245,166,35,0.45)" : "none",
                            }}
                            data-testid={`leaderboard-archive-group-row-${gn}`}
                          >
                            <span style={{ fontSize: 16, width: 20, textAlign: "center" }} aria-hidden="true">
                              {outIcon || "○"}
                            </span>
                            <span
                              className="text-sm font-bold truncate flex-1 cursor-pointer"
                              style={{ color: isSel ? "#FFF7ED" : "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.06em" }}
                              title={`${gn} — tıkla: toplam sıralama`}
                              onClick={() => setGroup(isSel ? null : gn)}
                              data-testid={`leaderboard-archive-group-name-${gn}`}
                            >
                              {gn}
                            </span>
                            <span className="text-[10px] mono opacity-80" style={{ color: selColor }}>
                              {dateRangeFor(gn)}
                            </span>
                            {canEdit && (
                              <select
                                data-testid={`leaderboard-archive-group-outcome-${gn}`}
                                value={out || ""}
                                onChange={(ev) => { ev.stopPropagation(); setOutcome(gn, ev.target.value || null); }}
                                onClick={(ev) => ev.stopPropagation()}
                                className="chip text-[9px] flex-shrink-0"
                                style={{
                                  padding: "2px 5px",
                                  borderColor: `${selColor}55`,
                                  color: selColor,
                                  background: "rgba(20,12,10,0.85)",
                                  cursor: "pointer",
                                }}
                                title="Sonuç ata"
                              >
                                <option value="">—</option>
                                <option value="win">🏆 Win</option>
                                <option value="loose">💀 Loose</option>
                              </select>
                            )}
                            <button
                              type="button"
                              data-testid={`leaderboard-archive-group-expand-${gn}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setExpandedGroups((prev) => ({ ...prev, [gn]: !prev[gn] }));
                              }}
                              className="text-[12px] flex-shrink-0 rounded px-1.5 py-0.5 transition-transform"
                              style={{
                                color: selColor,
                                background: `${selColor}18`,
                                border: `1px solid ${selColor}55`,
                                cursor: "pointer",
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              }}
                              title={isExpanded ? "Etkinlikleri gizle" : "Etkinlikleri göster"}
                            >
                              ▶
                            </button>
                          </div>
                          {isExpanded && (
                            <div
                              className="flex flex-col gap-1 mt-1 ml-6 pl-2"
                              style={{ borderLeft: `2px solid ${selColor}55` }}
                              data-testid={`leaderboard-archive-group-events-${gn}`}
                            >
                              {groupEvents.length === 0 ? (
                                <div className="text-[10px] py-1 opacity-70" style={{ color: "#94A3B8" }}>
                                  Etkinlik yok
                                </div>
                              ) : groupEvents.map((e) => {
                                const dateStr = String(e.date || "").slice(0, 10);
                                return (
                                  <div
                                    key={e.id}
                                    data-testid={`leaderboard-archive-group-event-${e.id}`}
                                    onClick={() => setArchiveEventId(e.id)}
                                    className="flex items-center gap-2 rounded px-2 py-1 cursor-pointer hover:scale-[1.005] transition-transform"
                                    style={{
                                      borderLeft: `3px solid ${selColor}`,
                                      background: "rgba(20,12,10,0.6)",
                                      border: `1px solid ${selColor}22`,
                                      fontSize: 11,
                                    }}
                                  >
                                    <span
                                      className="truncate flex-1 font-bold"
                                      style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }}
                                      title={e.name}
                                    >
                                      {e.name}
                                    </span>
                                    <span className="text-[10px] mono opacity-70" style={{ color: "#EAD8B0" }}>{dateStr}</span>
                                    <span className="font-bold mono text-[10px]" style={{ color: "#E74C1A" }}>×{e.multiplier ?? 1}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              // No folder selected → render folder cards grid only.
              // Individual events are intentionally NOT rendered here.
              return (
                <div className="grid grid-cols-3 gap-2" data-testid="leaderboard-archive-folders-grid">
                  {folders.length === 0 ? (
                    <div className="col-span-3 card-dark p-6 text-center text-muted-foreground text-sm">
                      Klasör oluşturulmadı
                    </div>
                  ) : folders.map((f) => {
                    const eventsInFolder = archivedEvents.filter((e) => e.folder_id === f.id);
                    const groupCount = new Set(eventsInFolder.map((e) => e.group_name).filter(Boolean)).size;
                    const color = f.color || "#F5A623";
                    return (
                      <button
                        key={f.id}
                        type="button"
                        data-testid={`leaderboard-archive-folder-card-${f.id}`}
                        onClick={() => { setFolderId(f.id); setGroup(null); }}
                        className="rounded-lg p-2 flex flex-col items-center justify-center gap-1 transition-all hover:scale-[1.02]"
                        style={{
                          background: `linear-gradient(180deg, ${color}18, rgba(20,12,10,0.85))`,
                          border: `1px solid ${color}55`,
                          boxShadow: `0 0 12px ${color}22, inset 0 1px 0 rgba(255,255,255,0.05)`,
                          minHeight: 88,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ fontSize: 22, filter: `drop-shadow(0 0 8px ${color}66)` }} aria-hidden="true">
                          {f.icon || "📁"}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase text-center truncate max-w-full"
                          style={{ color, fontFamily: "Cinzel, serif", letterSpacing: "0.10em" }}
                          title={f.name}
                        >
                          {f.name}
                        </span>
                        <span className="text-[9px] mono opacity-80" style={{ color: "#EAD8B0" }}>
                          {groupCount} grup
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
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
      {showCompareModal && compareIds.length === 2 && (
        <CompareEventsModal
          eventIds={compareIds}
          events={archivedEvents}
          allianceColors={allianceColors}
          onClose={() => setShowCompareModal(false)}
          onPickMember={(mid) => { setShowCompareModal(false); setProfileId(mid); }}
        />
      )}
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

function CompareEventsModal({ eventIds, events, allianceColors, onClose, onPickMember }) {
  const [aId, bId] = eventIds;
  const a = events.find((e) => e.id === aId);
  const b = events.find((e) => e.id === bId);
  const { data: aLb = [] } = useSWR(aId ? `/leaderboard?event_id=${encodeURIComponent(aId)}` : null, fetcher);
  const { data: bLb = [] } = useSWR(bId ? `/leaderboard?event_id=${encodeURIComponent(bId)}` : null, fetcher);
  // Guard so we only bump compare-wins once per modal open, even if SWR
  // refreshes the leaderboard data.
  const winRecordedRef = React.useRef(false);

  // Build per-member score maps for the diff view. `both` = participated in
  // both events (with per-side deltas); `onlyA` / `onlyB` = participated in
  // exactly one side.
  const { both, onlyA, onlyB, totalA, totalB } = useMemo(() => {
    const aMap = new Map(aLb.map((r) => [r.member_id, r]));
    const bMap = new Map(bLb.map((r) => [r.member_id, r]));
    const bothIds = [...aMap.keys()].filter((id) => bMap.has(id));
    const both = bothIds
      .map((id) => {
        const ar = aMap.get(id);
        const br = bMap.get(id);
        return {
          id,
          name: ar.name || br.name,
          alliance_name: ar.alliance_name || br.alliance_name,
          a: Number(ar.total_points || 0),
          b: Number(br.total_points || 0),
        };
      })
      .sort((x, y) => (y.a + y.b) - (x.a + x.b));
    const onlyA = [...aMap.values()].filter((r) => !bMap.has(r.member_id));
    const onlyB = [...bMap.values()].filter((r) => !aMap.has(r.member_id));
    const totalA = aLb.reduce((s, r) => s + Number(r.total_points || 0), 0);
    const totalB = bLb.reduce((s, r) => s + Number(r.total_points || 0), 0);
    return { both, onlyA, onlyB, totalA, totalB };
  }, [aLb, bLb]);

  // Record the compare win exactly once per modal — after we have real
  // totals and a clear victor. Ties skip the increment.
  useEffect(() => {
    if (winRecordedRef.current) return;
    if (!aId || !bId) return;
    if (aLb.length === 0 || bLb.length === 0) return; // wait for both feeds
    if (totalA === totalB) return; // no winner on a tie
    const winnerId = totalA > totalB ? aId : bId;
    winRecordedRef.current = true;
    api.post(`/events/${encodeURIComponent(winnerId)}/compare-win`).catch(() => {
      // Silent — the badge is a nice-to-have, don't spam a toast if
      // the increment fails (e.g. rate limiting / offline).
      winRecordedRef.current = false;
    });
  }, [aId, bId, totalA, totalB, aLb.length, bLb.length]);

  const badge = (r) => (
    <span
      className="text-[9px] font-bold rounded-full"
      style={{
        background: (r.alliance_name && allianceColors[r.alliance_name]) || "#E74C1A",
        color: "#fff",
        padding: "2px 7px",
        letterSpacing: "0.05em",
        textTransform: "none",
        fontFamily: "Cinzel, Rajdhani, serif",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      {r.alliance_name || "-"}
    </span>
  );

  return (
    <div
      data-testid="archive-compare-modal"
      onClick={onClose}
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, #1E1410 0%, #0F0806 100%)",
          border: "1px solid rgba(168,85,247,0.55)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(168,85,247,0.25)",
          maxHeight: "88vh",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(168,85,247,0.35)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare className="w-4 h-4" style={{ color: "#A855F7", flexShrink: 0 }} />
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: "#F5F3FF", fontFamily: "Cinzel, serif" }}>
              Etkinlik Karşılaştırma
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="archive-compare-modal-close"
            className="p-1.5 rounded hover:bg-white/10"
            style={{ color: "#F5F0E8" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 border-b" style={{ borderColor: "rgba(168,85,247,0.2)" }}>
          {[
            { label: "A", ev: a, total: totalA, count: aLb.length },
            { label: "B", ev: b, total: totalB, count: bLb.length },
          ].map((side) => (
            <div
              key={side.label}
              data-testid={`archive-compare-header-${side.label}`}
              className="rounded-lg p-2"
              style={{
                background: "linear-gradient(160deg, rgba(60,30,10,0.75) 0%, rgba(20,12,10,0.85) 100%)",
                border: "1px solid rgba(168,85,247,0.4)",
              }}
            >
              <div className="text-[10px] uppercase tracking-widest" style={{ color: "#C4B5FD", letterSpacing: "0.14em" }}>
                {side.label} · {side.ev?.group_name || "-"} · {String(side.ev?.date || "").slice(0, 10)}
              </div>
              <div className="text-sm font-bold truncate mt-1" style={{ color: "#F5F0E8" }} title={side.ev?.name}>
                {side.ev?.name || "—"}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px]" style={{ color: "#EAD8B0" }}>
                <span>👥 {side.count} katılımcı</span>
                <span className="mono font-bold" style={{ color: "#F5A623" }}>{fmt(side.total)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Visual comparison bar — proportional widths of A vs B totals so
            admins spot the winning event without reading numbers. */}
        {(totalA > 0 || totalB > 0) && (() => {
          const max = Math.max(totalA, totalB, 1);
          const aPct = Math.round((totalA / max) * 100);
          const bPct = Math.round((totalB / max) * 100);
          const aWon = totalA > totalB;
          const bWon = totalB > totalA;
          return (
            <div className="px-3 py-2 border-b" data-testid="archive-compare-chart" style={{ borderColor: "rgba(168,85,247,0.2)" }}>
              <div className="text-[10px] uppercase tracking-widest mb-1.5 font-bold" style={{ color: "#C4B5FD", letterSpacing: "0.14em" }}>
                📊 Toplam Puan Kıyası
              </div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "A", ev: a, total: totalA, pct: aPct, won: aWon, color: "#F5A623" },
                  { label: "B", ev: b, total: totalB, pct: bPct, won: bWon, color: "#A855F7" },
                ].map((row) => (
                  <div key={row.label} data-testid={`archive-compare-bar-${row.label}`} className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold flex-shrink-0"
                      style={{ color: row.color, width: 18, textAlign: "center" }}
                    >
                      {row.label}
                    </span>
                    <div className="flex-1 rounded-full h-4 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(row.pct, 2)}%`,
                          background: `linear-gradient(90deg, ${row.color}55, ${row.color})`,
                          boxShadow: row.won ? `0 0 8px ${row.color}` : "none",
                        }}
                      />
                      <span
                        className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-bold mono"
                        style={{ color: "#F5F0E8", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
                      >
                        {fmt(row.total)}
                        {row.won && <span className="ml-1" title="Kazanan">👑</span>}
                      </span>
                    </div>
                    <span className="text-[10px] mono w-9 text-right flex-shrink-0" style={{ color: row.color }}>
                      {row.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {/* Both — matched participants */}
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-1.5 font-bold" style={{ color: "#C4B5FD", letterSpacing: "0.14em" }}>
              🤝 Her ikisinde katılan ({both.length})
            </div>
            {both.length === 0 ? (
              <div className="rounded p-2 text-[11px] text-center" style={{ background: "rgba(255,255,255,0.03)", color: "#94A3B8" }}>
                Eşleşen katılımcı yok
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="grid text-[9px] font-bold uppercase px-2" style={{ gridTemplateColumns: "auto auto 1fr auto auto auto", gap: 8, color: "#D4730A", letterSpacing: "0.08em" }}>
                  <span></span>
                  <span></span>
                  <span>Üye</span>
                  <span className="text-right truncate" title={a?.name} data-testid="archive-compare-col-A">
                    <span style={{ color: "#F5A623" }}>A</span> · {a?.name || "-"}
                  </span>
                  <span className="text-right truncate" title={b?.name} data-testid="archive-compare-col-B">
                    <span style={{ color: "#A855F7" }}>B</span> · {b?.name || "-"}
                  </span>
                  <span className="text-right">Fark</span>
                </div>
                {both.slice(0, 30).map((r, idx) => {
                  const diff = r.b - r.a;
                  const diffColor = diff > 0 ? "#4ADE80" : diff < 0 ? "#F87171" : "#94A3B8";
                  const diffSign = diff > 0 ? "+" : "";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      data-testid={`archive-compare-both-row-${r.id}`}
                      onClick={() => onPickMember(r.id)}
                      className="grid items-center rounded px-2 py-1.5 text-left hover:bg-white/5"
                      style={{
                        gridTemplateColumns: "auto auto 1fr auto auto auto",
                        gap: 8,
                        background: "rgba(20,12,10,0.5)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span className="text-[9px] mono opacity-70" style={{ color: "#D4730A", minWidth: 20 }}>#{idx + 1}</span>
                      {badge(r)}
                      <span className="text-xs font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }}>{r.name}</span>
                      <span className="text-xs mono text-right" style={{ color: "#EAD8B0" }}>{fmt(r.a)}</span>
                      <span className="text-xs mono text-right" style={{ color: "#EAD8B0" }}>{fmt(r.b)}</span>
                      <span className="text-xs mono text-right font-bold" style={{ color: diffColor }}>{diffSign}{fmt(diff)}</span>
                    </button>
                  );
                })}
                {both.length > 30 && (
                  <div className="text-[10px] text-center py-1 opacity-60" style={{ color: "#94A3B8" }}>
                    …ve {both.length - 30} kişi daha
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Only A / Only B */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: `🅰️ Sadece A · ${a?.name || "-"}`, rows: onlyA, color: "#F5A623", testId: "onlyA" },
              { label: `🅱️ Sadece B · ${b?.name || "-"}`, rows: onlyB, color: "#A855F7", testId: "onlyB" },
            ].map((side) => (
              <div key={side.testId}>
                <div className="text-[10px] uppercase tracking-widest mb-1.5 font-bold" style={{ color: side.color, letterSpacing: "0.14em" }}>
                  {side.label} ({side.rows.length})
                </div>
                {side.rows.length === 0 ? (
                  <div className="rounded p-2 text-[11px] text-center" style={{ background: "rgba(255,255,255,0.03)", color: "#94A3B8" }}>
                    Boş
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {side.rows.slice(0, 20).map((r) => (
                      <button
                        key={r.member_id}
                        type="button"
                        data-testid={`archive-compare-${side.testId}-row-${r.member_id}`}
                        onClick={() => onPickMember(r.member_id)}
                        className="flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/5"
                        style={{ background: "rgba(20,12,10,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        {badge(r)}
                        <span className="text-xs truncate flex-1 font-bold" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }}>{r.name}</span>
                        <span className="text-xs mono" style={{ color: side.color }}>{fmt(r.total_points)}</span>
                      </button>
                    ))}
                    {side.rows.length > 20 && (
                      <div className="text-[10px] text-center py-1 opacity-60" style={{ color: "#94A3B8" }}>
                        …ve {side.rows.length - 20} kişi daha
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
