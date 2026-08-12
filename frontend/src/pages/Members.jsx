import React, { useState, useMemo, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { api, apiErr, RANKS } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { allianceBadgeStyle } from "@/lib/colors";
import { MEMBERS } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import LinkMemberDialog from "@/components/LinkMemberDialog";
import OcrDialog from "@/components/OcrDialog";
import CanEdit from "@/components/CanEdit";
import CountUp from "@/components/CountUp";
import { Search, Plus, Pencil, Trash2, X, SlidersHorizontal, Palette, Check, RotateCcw, ChevronDown, ChevronsDown, ChevronsUp, MapPin, ClipboardList, Link2, Camera } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

const SORT_MODES = [
  "default",
  "name_asc",
  "name_desc",
  "rank_desc",
  "rank_asc",
  "castle_desc",
  "castle_asc",
];

const COLOR_PALETTE = [
  "#DC2626", "#EF4444", "#F87171", "#F97316", "#F5A623", "#FACC15",
  "#EAB308", "#84CC16", "#22C55E", "#16A34A", "#10B981", "#14B8A6",
  "#06B6D4", "#0891B2", "#0EA5E9", "#2563EB", "#3B82F6", "#6366F1",
  "#7C3AED", "#A855F7", "#C026D3", "#DB2777", "#E11D48", "#6B7280",
];

const NAME_FONTS = {
  default: 'Rajdhani, "Segoe UI", sans-serif',
  cinzel: '"Cinzel", "Trajan Pro", serif',
  roboto: 'Roboto, "Helvetica Neue", sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  montserrat: 'Montserrat, "Segoe UI", sans-serif',
};

const DISPLAY_KEY = "members_display_v1";
const readDisplay = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DISPLAY_KEY) || "{}");
    return {
      nameSize: d.nameSize ?? 12,
      nameFamily: d.nameFamily ?? "default",
      nameBold: d.nameBold !== false,
      nameItalic: d.nameItalic === true,
      rankSize: d.rankSize ?? 13,
      rankSizeByRank: d.rankSizeByRank ?? {},
      allianceSize: d.allianceSize ?? 18,
      allianceFamily: d.allianceFamily ?? "default",
      allianceBold: d.allianceBold !== false,
      allianceItalic: d.allianceItalic === true,
    };
  } catch {
    return {
      nameSize: 12, nameFamily: "default", nameBold: true, nameItalic: false,
      rankSize: 13, rankSizeByRank: {},
      allianceSize: 18, allianceFamily: "default", allianceBold: true, allianceItalic: false,
    };
  }
};

// 8 preset colors for the "bottom" position member note.
const NOTE_COLORS = [
  "#DC2626", // red
  "#F97316", // orange
  "#FACC15", // yellow
  "#16A34A", // green
  "#2563EB", // blue
  "#7C3AED", // purple
  "#FFFFFF", // white
  "#F5A623", // gold
];

export default function Members() {
  const { t } = useTranslation();
  const { user, refreshMe } = useAuth();
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterAlliances, setFilterAlliances] = useState([]);
  const [filterRanks, setFilterRanks] = useState([]);
  const [sortMode, setSortMode] = useState("default");
  const [colorPickerAlliance, setColorPickerAlliance] = useState(null);
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [displayPrefs, setDisplayPrefs] = useState(readDisplay());
  const patchDisplay = (patch) => {
    setDisplayPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  const patchRankSize = (rk, size) => {
    patchDisplay({ rankSizeByRank: { ...displayPrefs.rankSizeByRank, [rk]: size } });
  };
  // Hydrate collapse state from localStorage so alliance expand/collapse
  // persists across reloads. Ranks stored per "alliance::rank" key.
  const [collapsedAlliances, setCollapsedAlliances] = useState(() => {
    try {
      const raw = localStorage.getItem("titanxis_members_collapsed_alliances_v1");
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  });
  const [collapsedRankSections, setCollapsedRankSections] = useState(() => {
    try {
      const raw = localStorage.getItem("titanxis_members_collapsed_ranks_v1");
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  });

  useEffect(() => {
    try { localStorage.setItem("titanxis_members_collapsed_alliances_v1", JSON.stringify([...collapsedAlliances])); } catch {}
  }, [collapsedAlliances]);
  useEffect(() => {
    try { localStorage.setItem("titanxis_members_collapsed_ranks_v1", JSON.stringify([...collapsedRankSections])); } catch {}
  }, [collapsedRankSections]);

  const toggleAlliance = (name) =>
    setCollapsedAlliances((s) => {
      const next = new Set(s);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleRankSection = (allianceName, rank) => {
    const key = `${allianceName}::${rank}`;
    setCollapsedRankSections((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const { data: members = [] } = useSWR(`/members${q ? `?search=${encodeURIComponent(q)}` : ""}`, fetcher, {
    refreshInterval: 8000,
  });
  const { data: allianceColors = {} } = useSWR("/alliance-colors", fetcher, { refreshInterval: 15000 });
  const { data: alliancesList = [] } = useSWR("/alliances", fetcher);

  const grouped = useMemo(() => {
    const rankOrder = { GOW: 100, R5: 5, R4: 4, R3: 3, R2: 2, R1: 1 };
    // 1. Apply filters
    let filtered = members;
    if (filterAlliances.length) {
      filtered = filtered.filter((m) => filterAlliances.includes((m.alliance_name || "").trim()));
    }
    if (filterRanks.length) {
      filtered = filtered.filter((m) => filterRanks.includes(m.rank));
    }

    // 2. Group by alliance
    const NOGROUP = t("no_group");
    const groups = {};
    filtered.forEach((m) => {
      const raw = (m.alliance_name || "").trim();
      const key = raw || NOGROUP;
      (groups[key] = groups[key] || []).push(m);
    });

    // 3. Sort within groups per selected sort mode (default = rank desc + name)
    const cmp = (a, b) => {
      const ca = parseInt(a.castle_level || "0", 10) || 0;
      const cb = parseInt(b.castle_level || "0", 10) || 0;
      const ra = rankOrder[a.rank] || 0;
      const rb = rankOrder[b.rank] || 0;
      const an = a.name || "";
      const bn = b.name || "";
      switch (sortMode) {
        case "name_asc": return an.localeCompare(bn, "tr");
        case "name_desc": return bn.localeCompare(an, "tr");
        case "rank_asc": return ra - rb || an.localeCompare(bn, "tr");
        case "rank_desc": return rb - ra || an.localeCompare(bn, "tr");
        case "castle_desc": return cb - ca || an.localeCompare(bn, "tr");
        case "castle_asc": return ca - cb || an.localeCompare(bn, "tr");
        default: return rb - ra || an.localeCompare(bn, "tr");
      }
    };
    Object.values(groups).forEach((arr) => arr.sort(cmp));

    // 4. Sort groups: GOW → GoW → GOw → alphabetical (tr) → NOGROUP last
    const ALLIANCE_PRIORITY = { GOW: 1, GoW: 2, GOw: 3 };
    return Object.keys(groups)
      .sort((a, b) => {
        if (a === NOGROUP) return 1;
        if (b === NOGROUP) return -1;
        const pa = ALLIANCE_PRIORITY[a] !== undefined ? ALLIANCE_PRIORITY[a] : 99;
        const pb = ALLIANCE_PRIORITY[b] !== undefined ? ALLIANCE_PRIORITY[b] : 99;
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b, "tr");
      })
      .map((name) => ({ name, members: groups[name] }));
  }, [members, filterAlliances, filterRanks, sortMode, t]);

  const totalCount = members.length;
  const shownCount = grouped.reduce((n, g) => n + g.members.length, 0);
  const activeFilterCount = filterAlliances.length + filterRanks.length + (sortMode !== "default" ? 1 : 0);

  const clearFilters = () => {
    setFilterAlliances([]);
    setFilterRanks([]);
    setSortMode("default");
  };

  return (
    <div data-testid={MEMBERS.container}>
      <Header title={t("members")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {t("members_total", { count: totalCount })}
              {activeFilterCount > 0 && (
                <span className="ml-2 gold-text">({shownCount} {t("members_word")})</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <button
                data-testid="members-link-account-btn"
                onClick={() => setLinkOpen(true)}
                className="chip text-xs flex items-center gap-1.5"
                style={{
                  borderColor: (user.member_ids?.length || 0) > 0 ? "rgba(34,197,94,0.5)" : "rgba(245,166,35,0.5)",
                  color: (user.member_ids?.length || 0) > 0 ? "#4ade80" : "#F5A623",
                }}
                title={t("link_account")}
              >
                <Link2 className="w-3.5 h-3.5" />
                {(user.member_ids?.length || 0) > 0
                  ? t("linked_member_count", { count: user.member_ids.length })
                  : t("link_account")}
              </button>
            )}
            <CanEdit>
              <button
                data-testid="members-ocr-btn"
                onClick={() => setOcrOpen(true)}
                className="chip text-xs flex items-center gap-1.5"
                style={{ borderColor: "rgba(139,92,246,0.5)", color: "#A78BFA" }}
                title="Ekran Görüntüsünden Aktar"
              >
                <Camera className="w-3.5 h-3.5" /> OCR
              </button>
              <button
                data-testid={MEMBERS.addBtn}
                onClick={() => { setEditing(null); setShowForm(true); }}
                className="btn-gold flex items-center gap-1.5 text-xs"
              >
                <Plus className="w-4 h-4" /> {t("new_short")}
              </button>
            </CanEdit>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid={MEMBERS.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search_member_or_id")}
              className="w-full card-dark pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            data-testid="members-filter-toggle"
            onClick={() => setShowFilterPanel((v) => !v)}
            className={`chip relative ${showFilterPanel || activeFilterCount > 0 ? "active" : ""}`}
            style={{ minWidth: 44, justifyContent: "center" }}
            aria-label={t("filter")}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {activeFilterCount > 0 && (
              <span
                data-testid="members-filter-badge"
                className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                style={{ background: "#F5A623", color: "#0a0a0a" }}
              >{activeFilterCount}</span>
            )}
          </button>
          <button
            type="button"
            data-testid="members-display-toggle"
            onClick={() => setShowDisplayPanel((v) => !v)}
            className={`chip ${showDisplayPanel ? "active" : ""}`}
            style={{ minWidth: 44, justifyContent: "center" }}
            aria-label={t("display_settings")}
            title={t("display_settings")}
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        </div>

        {showDisplayPanel && (
          <div
            data-testid="members-display-panel"
            className="rounded-lg p-3 mb-3 space-y-3 text-xs"
            style={{ background: "rgba(20,12,10,0.75)", border: "1px solid rgba(245,166,35,0.4)" }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase font-bold gold-text" style={{ letterSpacing: "0.14em" }}>
                {t("display_settings")}
              </div>
              <button
                type="button"
                data-testid="members-display-reset"
                onClick={() => {
                  try { localStorage.removeItem(DISPLAY_KEY); } catch { /* ignore */ }
                  setDisplayPrefs(readDisplay());
                }}
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1"
                style={{ background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.35)" }}
              >
                <RotateCcw className="w-3 h-3" /> {t("reset")}
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase gold-text mb-1" style={{ letterSpacing: "0.14em" }}>{t("alliance_name_settings")}</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  data-testid="display-alliance-family"
                  value={displayPrefs.allianceFamily}
                  onChange={(e) => patchDisplay({ allianceFamily: e.target.value })}
                  className="rounded px-2 py-1 text-[11px]"
                  style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.4)" }}
                >
                  <option value="default">Varsayılan</option>
                  <option value="cinzel">Cinzel</option>
                  <option value="roboto">Roboto</option>
                  <option value="georgia">Georgia</option>
                  <option value="montserrat">Montserrat</option>
                </select>
                <select
                  data-testid="display-alliance-size"
                  value={displayPrefs.allianceSize}
                  onChange={(e) => patchDisplay({ allianceSize: parseInt(e.target.value, 10) })}
                  className="rounded px-2 py-1 text-[11px]"
                  style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.4)" }}
                >
                  {[10, 12, 14, 16, 18].map((s) => (<option key={s} value={s}>{s}px</option>))}
                </select>
                <button
                  type="button"
                  data-testid="display-alliance-bold"
                  onClick={() => patchDisplay({ allianceBold: !displayPrefs.allianceBold })}
                  className="px-2 py-1 rounded text-[11px] font-bold"
                  style={{
                    background: displayPrefs.allianceBold ? "linear-gradient(135deg,#F5A623,#E74C1A)" : "rgba(20,12,10,0.6)",
                    color: displayPrefs.allianceBold ? "#0a0a0a" : "#F5A623",
                    border: "1px solid rgba(245,166,35,0.5)",
                  }}
                >B</button>
                <button
                  type="button"
                  data-testid="display-alliance-italic"
                  onClick={() => patchDisplay({ allianceItalic: !displayPrefs.allianceItalic })}
                  className="px-2 py-1 rounded text-[11px]"
                  style={{
                    background: displayPrefs.allianceItalic ? "linear-gradient(135deg,#F5A623,#E74C1A)" : "rgba(20,12,10,0.6)",
                    color: displayPrefs.allianceItalic ? "#0a0a0a" : "#F5A623",
                    border: "1px solid rgba(245,166,35,0.5)",
                    fontStyle: "italic", fontWeight: 700,
                  }}
                >I</button>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase gold-text mb-1" style={{ letterSpacing: "0.14em" }}>{t("member_name_settings")}</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  data-testid="display-name-family"
                  value={displayPrefs.nameFamily}
                  onChange={(e) => patchDisplay({ nameFamily: e.target.value })}
                  className="rounded px-2 py-1 text-[11px]"
                  style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.4)" }}
                >
                  <option value="default">Varsayılan</option>
                  <option value="cinzel">Cinzel</option>
                  <option value="roboto">Roboto</option>
                  <option value="georgia">Georgia</option>
                  <option value="montserrat">Montserrat</option>
                </select>
                <select
                  data-testid="display-name-size"
                  value={displayPrefs.nameSize}
                  onChange={(e) => patchDisplay({ nameSize: parseInt(e.target.value, 10) })}
                  className="rounded px-2 py-1 text-[11px]"
                  style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.4)" }}
                >
                  {[12, 14, 16, 18].map((s) => (<option key={s} value={s}>{s}px</option>))}
                </select>
                <button
                  type="button"
                  data-testid="display-name-bold"
                  onClick={() => patchDisplay({ nameBold: !displayPrefs.nameBold })}
                  className="px-2 py-1 rounded text-[11px] font-bold"
                  style={{
                    background: displayPrefs.nameBold ? "linear-gradient(135deg,#F5A623,#E74C1A)" : "rgba(20,12,10,0.6)",
                    color: displayPrefs.nameBold ? "#0a0a0a" : "#F5A623",
                    border: "1px solid rgba(245,166,35,0.5)",
                  }}
                >B</button>
                <button
                  type="button"
                  data-testid="display-name-italic"
                  onClick={() => patchDisplay({ nameItalic: !displayPrefs.nameItalic })}
                  className="px-2 py-1 rounded text-[11px]"
                  style={{
                    background: displayPrefs.nameItalic ? "linear-gradient(135deg,#F5A623,#E74C1A)" : "rgba(20,12,10,0.6)",
                    color: displayPrefs.nameItalic ? "#0a0a0a" : "#F5A623",
                    border: "1px solid rgba(245,166,35,0.5)",
                    fontStyle: "italic",
                    fontWeight: 700,
                  }}
                >I</button>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase gold-text mb-1" style={{ letterSpacing: "0.14em" }}>{t("rank_font_size")}</div>
              <div className="flex flex-wrap gap-1.5">
                {["R1", "R2", "R3", "R4", "R5"].map((rk) => (
                  <div key={rk} className="flex items-center gap-1">
                    <span className={`rank-badge rank-${rk}`} style={{ width: 22, height: 18, fontSize: 9, borderRadius: 3 }}>{rk}</span>
                    <select
                      data-testid={`display-rank-size-${rk}`}
                      value={displayPrefs.rankSizeByRank[rk] || displayPrefs.rankSize}
                      onChange={(e) => patchRankSize(rk, parseInt(e.target.value, 10))}
                      className="rounded px-1.5 py-0.5 text-[10px]"
                      style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.4)" }}
                    >
                      <option value={11}>{t("small")}</option>
                      <option value={13}>{t("medium")}</option>
                      <option value={16}>{t("large")}</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showFilterPanel && (
          <FilterSortPanel
            alliances={alliancesList}
            filterAlliances={filterAlliances}
            setFilterAlliances={setFilterAlliances}
            filterRanks={filterRanks}
            setFilterRanks={setFilterRanks}
            sortMode={sortMode}
            setSortMode={setSortMode}
            onClear={clearFilters}
            onClose={() => setShowFilterPanel(false)}
          />
        )}

        {grouped.length > 0 && (
          <div className="flex items-center gap-2 mb-3" data-testid="members-collapse-controls">
            <button
              type="button"
              onClick={() => setCollapsedAlliances(new Set())}
              data-testid="members-expand-all"
              className="chip text-[10px] flex items-center gap-1"
              style={{ padding: "5px 10px" }}
              title={t("expand_all")}
            >
              <ChevronsDown className="w-3 h-3" /> {t("expand_all")}
            </button>
            <button
              type="button"
              onClick={() => setCollapsedAlliances(new Set(grouped.map((g) => g.name)))}
              data-testid="members-collapse-all"
              className="chip text-[10px] flex items-center gap-1"
              style={{ padding: "5px 10px" }}
              title={t("collapse_all")}
            >
              <ChevronsUp className="w-3 h-3" /> {t("collapse_all")}
            </button>
          </div>
        )}

        {grouped.map((grp, gi) => (
          <React.Fragment key={grp.name}>
            {gi > 0 && (
              <div className="my-5 flex items-center gap-2">
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(220,38,38,0.4) 20%, rgba(245,166,35,0.5) 50%, rgba(220,38,38,0.4) 80%, transparent)" }} />
              </div>
            )}
            <div className="mb-4 fade-in">
              <button
                type="button"
                onClick={() => toggleAlliance(grp.name)}
                className="w-full flex items-center justify-between px-3 py-3 rounded-lg mb-2 shadow-lg text-left"
                style={{ ...allianceBadgeStyle(grp.name, allianceColors), color: "#fff", border: "1px solid" }}
                data-testid={`members-group-${grp.name}`}
                aria-expanded={!collapsedAlliances.has(grp.name)}
              >
                <span
                  className="flex items-center gap-2 tracking-wider truncate"
                  style={{
                    fontFamily: NAME_FONTS[displayPrefs.allianceFamily] || 'Cinzel, Rajdhani, serif',
                    letterSpacing: "0.10em",
                    fontWeight: displayPrefs.allianceBold ? 700 : 500,
                    fontStyle: displayPrefs.allianceItalic ? "italic" : "normal",
                    fontSize: displayPrefs.allianceSize,
                  }}
                  data-testid={`alliance-header-name-${grp.name}`}
                >
                  <ChevronDown
                    className="w-4 h-4 flex-shrink-0 transition-transform"
                    style={{ transform: collapsedAlliances.has(grp.name) ? "rotate(-90deg)" : "rotate(0deg)" }}
                  />
                  ── {grp.name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <CanEdit>
                    {(
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setColorPickerAlliance(grp.name); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setColorPickerAlliance(grp.name);
                          }
                        }}
                        data-testid={`alliance-color-btn-${grp.name}`}
                        aria-label={t("choose_color")}
                        title={t("choose_color")}
                        className="w-6 h-6 rounded-full flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors cursor-pointer"
                      >
                        <Palette className="w-3.5 h-3.5 text-white" />
                      </span>
                    )}
                  </CanEdit>
                  <span className="text-xs font-bold mono opacity-95">({grp.members.length} {t("members_word")})</span>
                </div>
              </button>

              {!collapsedAlliances.has(grp.name) && (
                <div className="space-y-2">
                  {RANKS.map((rk) => {
                    const rankMembers = grp.members.filter((m) => m.rank === rk);
                    if (rankMembers.length === 0) return null;
                    const secKey = `${grp.name}::${rk}`;
                    const isCollapsed = collapsedRankSections.has(secKey);
                    return (
                      <div key={rk} data-testid={`rank-section-${grp.name}-${rk}`}>
                        <button
                          type="button"
                          onClick={() => toggleRankSection(grp.name, rk)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left bg-black/40 hover:bg-black/60 border border-border transition-colors"
                          data-testid={`rank-section-toggle-${grp.name}-${rk}`}
                          aria-expanded={!isCollapsed}
                        >
                          <span className="flex items-center gap-2">
                            <ChevronDown
                              className="w-3.5 h-3.5 gold-text transition-transform"
                              style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                            />
                            <span className={`rank-badge rank-${rk}`} style={{ width: 32, height: 22, fontSize: 11, borderRadius: 4, fontWeight: 800 }}>
                              {rk}
                            </span>
                            <span
                              className="font-bold uppercase text-white"
                              style={{ fontSize: 13, letterSpacing: "0.14em", fontWeight: 700, opacity: 0.95 }}
                            >
                              {t("rank")} {rk}
                            </span>
                            <span
                              className="font-semibold mono text-white/70"
                              style={{ fontSize: 12, letterSpacing: "0.06em" }}
                            >
                              ({rankMembers.length})
                            </span>
                          </span>
                        </button>

                        {!isCollapsed && (
                          <motion.div
                            className="mt-1.5"
                            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}
                            data-testid={`rank-section-grid-${grp.name}-${rk}`}
                            initial="hidden"
                            animate="visible"
                            variants={{
                              hidden: {},
                              visible: { transition: { staggerChildren: 0.04 } },
                            }}
                          >
                            {rankMembers.map((m) => (
                              <motion.div
                                key={m.id}
                                data-testid={MEMBERS.card(m.id)}
                                className="card-dark row-hover min-w-0"
                                style={{ padding: "8px", display: "flex", alignItems: "center", gap: "6px" }}
                                variants={{
                                  hidden: { opacity: 0, y: 12 },
                                  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
                                }}
                              >
                                <button
                                  onClick={() => setProfileId(m.id)}
                                  className={`rank-badge rank-${m.rank} flex-shrink-0`}
                                  style={{ width: 28, height: 28, fontSize: 10, borderRadius: 5, fontWeight: 800 }}
                                  title={`${t("rank")} ${m.rank}`}
                                >
                                  {m.rank}
                                </button>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setProfileId(m.id)}>
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className="text-white truncate leading-tight normal-case"
                                      style={{
                                        textTransform: "none",
                                        fontSize: displayPrefs.nameSize,
                                        fontFamily: NAME_FONTS[displayPrefs.nameFamily] || NAME_FONTS.default,
                                        fontWeight: displayPrefs.nameBold ? 700 : 500,
                                        fontStyle: displayPrefs.nameItalic ? "italic" : "normal",
                                      }}
                                      title={m.name}
                                      data-testid={`member-name-${m.id}`}
                                    >
                                      {m.name}
                                    </span>
                                    {m.note && m.note.trim() !== "" && (m.note_position || "inline") === "inline" && (
                                      <span
                                        className="text-xs truncate leading-tight"
                                        style={{ color: "#DC2626", fontWeight: 700 }}
                                        title={m.note}
                                        data-testid={`member-note-inline-${m.id}`}
                                      >
                                        {m.note}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[9px] gold-text mono truncate leading-tight">
                                    {m.castle_level ? `F${m.castle_level}` : "-"}
                                  </div>
                                  {m.bireysel_guc ? (
                                    <div
                                      className="text-[10px] mono truncate leading-tight flex items-center gap-1 mt-0.5"
                                      style={{ color: "#FF6B00", textShadow: "0 0 4px rgba(255,107,0,0.35)" }}
                                      data-testid={`member-bireysel-guc-${m.id}`}
                                    >
                                      <span aria-hidden="true">⚡</span>
                                      <span className="opacity-80">{t("bireysel_guc")}:</span>
                                      <CountUp
                                        value={m.bireysel_guc}
                                        duration={900}
                                        className="font-bold"
                                        testId={`member-bireysel-guc-value-${m.id}`}
                                      />
                                    </div>
                                  ) : null}
                                  {m.note && m.note.trim() !== "" && m.note_position === "bottom" && (
                                    <div
                                      className="text-xs truncate leading-tight mt-0.5"
                                      style={{ color: m.note_color || "#DC2626", fontWeight: 700, fontStyle: "italic" }}
                                      title={m.note}
                                      data-testid={`member-note-bottom-${m.id}`}
                                    >
                                      {m.note}
                                    </div>
                                  )}
                                </div>
                                <CanEdit>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      data-testid={MEMBERS.editBtn(m.id)}
                                      onClick={() => { setEditing(m); setShowForm(true); }}
                                      className="rounded bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                                      style={{ width: 22, height: 22 }}
                                      aria-label={t("edit")}
                                    >
                                      <Pencil style={{ width: 11, height: 11 }} />
                                    </button>
                                    <button
                                      data-testid={MEMBERS.deleteBtn(m.id)}
                                      onClick={async () => {
                                        if (!window.confirm(t("confirm_delete_generic", { name: m.name }))) return;
                                        await api.delete(`/members/${m.id}`);
                                        mutate((k) => typeof k === "string" && k.startsWith("/members"));
                                        mutate("/stats");
                                        toast.success(t("member_deleted"));
                                      }}
                                      className="rounded bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                                      style={{ width: 22, height: 22 }}
                                      aria-label={t("delete")}
                                    >
                                      <Trash2 style={{ width: 11, height: 11 }} />
                                    </button>
                                  </div>
                                </CanEdit>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </React.Fragment>
        ))}

        {shownCount === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">{t("no_records_dot")}</div>
        )}
      </div>

      {showForm && (
        <MemberForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {colorPickerAlliance && (
        <AllianceColorPicker
          allianceName={colorPickerAlliance}
          current={allianceColors[colorPickerAlliance]}
          onClose={() => setColorPickerAlliance(null)}
        />
      )}

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />

      <LinkMemberDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        currentMemberIds={user?.member_ids || []}
        onSaved={() => refreshMe && refreshMe()}
      />

      <OcrDialog
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        mode="members"
        title="Üye Listesi — Ekran Görüntüsünden Aktar"
        onApply={async (data) => {
          const rows = data.members || [];
          // Send raw names (with `[TAG] Name`) — backend batch-create strips brackets
          // and auto-resolves alliances via find_or_create_alliance().
          const payload = rows.map((r) => ({
            name: r.name,
            alliance_tag: r.alliance_name || null,
            power: r.power || null,
            castle_level: r.castle_level || null,
            rank: r.rank || null,
          }));
          const res = await api.post("/members/batch-create", { members: payload });
          mutate((k) => typeof k === "string" && k.startsWith("/members"));
          mutate("/stats");
          const newAlliances = (res.data.new_alliances || []).length;
          toast.success(
            `Eklendi: ${res.data.created} · Mevcut: ${res.data.existing}` +
              (newAlliances ? ` · Yeni ittifak: ${newAlliances}` : ""),
          );
        }}
      />
    </div>
  );
}

function FilterSortPanel({
  alliances,
  filterAlliances,
  setFilterAlliances,
  filterRanks,
  setFilterRanks,
  sortMode,
  setSortMode,
  onClear,
  onClose,
}) {
  const { t } = useTranslation();
  const [localAlliances, setLocalAlliances] = useState(filterAlliances);
  const [localRanks, setLocalRanks] = useState(filterRanks);
  const [localSort, setLocalSort] = useState(sortMode);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const apply = () => {
    setFilterAlliances(localAlliances);
    setFilterRanks(localRanks);
    setSortMode(localSort);
    onClose();
  };

  const clear = () => {
    setLocalAlliances([]);
    setLocalRanks([]);
    setLocalSort("default");
    onClear();
  };

  return (
    <div
      data-testid="members-filter-panel"
      className="card-red-gold p-4 mb-4 fade-in"
      style={{ background: "linear-gradient(180deg, rgba(26,26,26,0.98), rgba(15,15,15,0.98))" }}
    >
      {/* Alliance filter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest font-bold gold-text">{t("filter_alliance")}</div>
          <button
            type="button"
            data-testid="filter-alliance-toggle-all"
            onClick={() =>
              setLocalAlliances(localAlliances.length === alliances.length ? [] : [...alliances])
            }
            className="text-[10px] uppercase font-bold text-muted-foreground hover:gold-text"
          >
            {localAlliances.length === alliances.length ? t("deselect_all") : t("select_all")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3 max-h-32 overflow-y-auto">
          {alliances.map((a) => (
            <button
              key={a}
              type="button"
              data-testid={`filter-alliance-${a}`}
              onClick={() => toggle(localAlliances, setLocalAlliances, a)}
              className={`chip ${localAlliances.includes(a) ? "active" : ""}`}
            >
              {localAlliances.includes(a) && <Check className="w-3 h-3" />}
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Rank filter */}
      <div>
        <div className="text-[10px] uppercase tracking-widest font-bold gold-text mb-2">{t("filter_rank")}</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {RANKS.map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`filter-rank-${r}`}
              onClick={() => toggle(localRanks, setLocalRanks, r)}
              className={`chip ${localRanks.includes(r) ? "active" : ""}`}
            >
              {localRanks.includes(r) && <Check className="w-3 h-3" />}
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div>
        <div className="text-[10px] uppercase tracking-widest font-bold gold-text mb-2">{t("sort")}</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SORT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`sort-${m}`}
              onClick={() => setLocalSort(m)}
              className={`chip ${localSort === m ? "active" : ""}`}
            >
              {t("sort_" + m, { defaultValue: t(m === "default" ? "sort_default" : "sort_" + m) })}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          data-testid="filter-clear"
          onClick={clear}
          className="chip flex-1 justify-center"
        >
          <RotateCcw className="w-3 h-3" /> {t("clear")}
        </button>
        <button
          type="button"
          data-testid="filter-apply"
          onClick={apply}
          className="btn-gold flex-1 justify-center py-2 text-xs"
        >
          {t("apply")}
        </button>
      </div>
    </div>
  );
}

function AllianceColorPicker({ allianceName, current, onClose }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(current || COLOR_PALETTE[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/alliance-colors", { name: allianceName, color: selected });
      mutate("/alliance-colors");
      toast.success(t("color_saved"));
      onClose();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.delete(`/alliance-colors/${encodeURIComponent(allianceName)}`);
      mutate("/alliance-colors");
      toast.success(t("color_saved"));
      onClose();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative"
        data-testid="alliance-color-picker"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-1">{t("choose_color")}</h3>
        <p className="text-xs text-muted-foreground mb-4">
          <span className="red-text font-semibold">{allianceName}</span>
        </p>

        <div className="grid grid-cols-8 gap-2 mb-4">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`color-swatch-${c.replace("#", "")}`}
              onClick={() => setSelected(c)}
              className="w-9 h-9 rounded-full transition-all"
              style={{
                background: c,
                border: selected.toLowerCase() === c.toLowerCase() ? "2px solid #F5A623" : "2px solid rgba(255,255,255,0.15)",
                transform: selected.toLowerCase() === c.toLowerCase() ? "scale(1.15)" : "scale(1)",
                boxShadow: selected.toLowerCase() === c.toLowerCase() ? "0 0 12px rgba(245,166,35,0.5)" : "none",
              }}
              aria-label={c}
            />
          ))}
        </div>

        <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">{t("custom_color")}</label>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="color"
            data-testid="color-native-input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-border"
            style={{ background: "transparent" }}
          />
          <input
            type="text"
            data-testid="color-hex-input"
            value={selected}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setSelected(v);
            }}
            placeholder="#DC2626"
            maxLength={7}
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono focus:outline-none focus:border-primary"
          />
        </div>

        {/* Preview */}
        <div className="rounded-lg p-3 mb-4" style={{ ...allianceBadgeStyle(allianceName, { [allianceName]: selected }), border: "1px solid" }}>
          <span className="font-bold tracking-wider text-white">── {allianceName}</span>
        </div>

        <div className="flex gap-2">
          {current && (
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              data-testid="color-reset"
              className="chip flex-1 justify-center"
            >
              <RotateCcw className="w-3 h-3" /> {t("reset_color")}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            data-testid="color-save"
            className="btn-gold flex-1 justify-center py-2 text-xs"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Strip non-digit chars — used to sanitize numeric level fields.
const digitsOnly = (v) => String(v || "").replace(/[^0-9]/g, "");

function MemberForm({ initial, onClose }) {
  const { t } = useTranslation();
  const [allianceName, setAllianceName] = useState(initial?.alliance_name || "");
  const [name, setName] = useState(initial?.name || "");
  const [memberId, setMemberId] = useState(initial?.member_id || "");
  const [castleLevel, setCastleLevel] = useState(digitsOnly(initial?.castle_level));
  const [tetikciF, setTetikciF] = useState(digitsOnly(initial?.tetikci_f));
  const [tetikciT, setTetikciT] = useState(digitsOnly(initial?.tetikci_t));
  const [bombaciF, setBombaciF] = useState(digitsOnly(initial?.bombaci_f));
  const [bombaciT, setBombaciT] = useState(digitsOnly(initial?.bombaci_t));
  const [kalkanliF, setKalkanliF] = useState(digitsOnly(initial?.kalkanli_f));
  const [kalkanliT, setKalkanliT] = useState(digitsOnly(initial?.kalkanli_t));
  const [bireyselGuc, setBireyselGuc] = useState(digitsOnly(initial?.bireysel_guc));
  const [rank, setRank] = useState(initial?.rank && RANKS.includes(initial.rank) ? initial.rank : "R1");
  const [note, setNote] = useState(initial?.note || "");
  const [notePosition, setNotePosition] = useState(initial?.note_position || "inline");
  const [noteColor, setNoteColor] = useState(initial?.note_color || "#DC2626");
  const [saving, setSaving] = useState(false);
  const { data: alliances = [] } = useSWR("/alliances", fetcher);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("player_name_required")); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        member_id: memberId.trim() || null,
        alliance_name: allianceName.trim() || null,
        rank,
        castle_level: castleLevel || null,
        tetikci_f: tetikciF || null,
        tetikci_t: tetikciT || null,
        bombaci_f: bombaciF || null,
        bombaci_t: bombaciT || null,
        kalkanli_f: kalkanliF || null,
        kalkanli_t: kalkanliT || null,
        bireysel_guc: bireyselGuc ? parseInt(bireyselGuc, 10) : 0,
        note: note.trim() || null,
      };
      if (initial) {
        await api.patch(`/members/${initial.id}`, body);
        toast.success(t("member_updated"));
      } else {
        await api.post("/members", body);
        toast.success(t("member_added"));
      }
      mutate((k) => typeof k === "string" && (k.startsWith("/members") || k.startsWith("/alliances")));
      mutate("/stats");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  const numInput = "w-16 bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white mono text-center focus:outline-none focus:border-primary";
  const numProps = { type: "number", inputMode: "numeric", pattern: "[0-9]*", min: "0" };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        data-testid={MEMBERS.form}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative max-h-[90vh] overflow-y-auto"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? t("edit_member") : t("new_member")}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("alliance_name")}</label>
        {alliances.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2">
            {alliances.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAllianceName(a)}
                className={`chip ${allianceName === a ? "active" : ""}`}
                data-testid={`alliance-chip-${a}`}
              >{a}</button>
            ))}
          </div>
        )}
        <input
          data-testid="member-form-alliance"
          value={allianceName}
          onChange={(e) => setAllianceName(e.target.value)}
          list="alliance-list"
          placeholder={t("alliance_example")}
          autoComplete="off"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />
        <datalist id="alliance-list">
          {alliances.map((a) => (<option key={a} value={a} />))}
        </datalist>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("player_name")}</label>
        <input data-testid={MEMBERS.formName} value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("player_example")}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("id_optional")}</label>
        <input data-testid={MEMBERS.formId} value={memberId} onChange={(e) => setMemberId(e.target.value)}
          placeholder={t("game_id")}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("bireysel_guc")}</label>
        <input
          data-testid="member-form-bireysel-guc"
          type="text"
          inputMode="numeric"
          value={bireyselGuc ? bireyselGuc.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
          onChange={(e) => setBireyselGuc(digitsOnly(e.target.value))}
          placeholder="1.000.000.000"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono"
        />

        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs uppercase text-muted-foreground font-bold flex-1">{t("castle_level")}</label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold gold-text w-4 text-center">F</span>
            <input
              data-testid="member-form-castle-f"
              {...numProps}
              value={castleLevel}
              onChange={(e) => setCastleLevel(digitsOnly(e.target.value))}
              placeholder="35"
              className={numInput}
            />
          </div>
        </div>

        <div className="section-title mt-4">{t("military_barracks")}</div>
        {[
          { label: t("tetikci"), f: tetikciF, setF: setTetikciF, t: tetikciT, setT: setTetikciT, tid: "tetikci" },
          { label: t("bombaci"), f: bombaciF, setF: setBombaciF, t: bombaciT, setT: setBombaciT, tid: "bombaci" },
          { label: t("kalkanli"), f: kalkanliF, setF: setKalkanliF, t: kalkanliT, setT: setKalkanliT, tid: "kalkanli" },
        ].map((b) => (
          <div key={b.tid} className="flex items-center gap-2 mt-2">
            <label className="text-xs uppercase text-white font-bold flex-1">{b.label}</label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold gold-text w-4 text-center">F</span>
              <input
                data-testid={`member-form-${b.tid}-f`}
                {...numProps}
                value={b.f}
                onChange={(e) => b.setF(digitsOnly(e.target.value))}
                placeholder="0"
                className={numInput}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold red-text w-4 text-center">T</span>
              <input
                data-testid={`member-form-${b.tid}-t`}
                {...numProps}
                value={b.t}
                onChange={(e) => b.setT(digitsOnly(e.target.value))}
                placeholder="0"
                className={numInput}
              />
            </div>
          </div>
        ))}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-4">{t("rank")}</label>
        <div data-testid={MEMBERS.formRank} className="flex gap-1.5 flex-wrap">
          {RANKS.map((r) => (
            <button key={r} type="button" onClick={() => setRank(r)} className={`chip ${rank === r ? "active" : ""}`}>{r}</button>
          ))}
        </div>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">&nbsp;</label>
        <div className="flex items-center gap-1.5 mb-1.5" data-testid="note-position-toggle">
          <button
            type="button"
            onClick={() => setNotePosition("inline")}
            data-testid="note-position-inline"
            className={`chip flex-1 justify-center text-[10px] ${notePosition === "inline" ? "active" : ""}`}
          >
            <MapPin className="w-3 h-3" /> {t("note_pos_inline")}
          </button>
          <button
            type="button"
            onClick={() => setNotePosition("bottom")}
            data-testid="note-position-bottom"
            className={`chip flex-1 justify-center text-[10px] ${notePosition === "bottom" ? "active" : ""}`}
          >
            <ClipboardList className="w-3 h-3" /> {t("note_pos_bottom")}
          </button>
        </div>
        {notePosition === "bottom" && (
          <div className="flex items-center gap-1.5 mb-1.5" data-testid="note-color-picker">
            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest">{t("color")}</span>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNoteColor(c)}
                data-testid={`note-color-${c.replace("#", "")}`}
                aria-label={c}
                className="rounded-full transition-all"
                style={{
                  width: 18,
                  height: 18,
                  background: c,
                  border: noteColor.toLowerCase() === c.toLowerCase() ? "2px solid #F5A623" : "1px solid rgba(255,255,255,0.2)",
                  transform: noteColor.toLowerCase() === c.toLowerCase() ? "scale(1.2)" : "scale(1)",
                  boxShadow: noteColor.toLowerCase() === c.toLowerCase() ? "0 0 6px rgba(245,166,35,0.6)" : "none",
                }}
              />
            ))}
          </div>
        )}
        <textarea data-testid="member-form-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white resize-none" />

        <button data-testid={MEMBERS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : t("save_upper")}
        </button>
      </form>
    </div>
  );
}
