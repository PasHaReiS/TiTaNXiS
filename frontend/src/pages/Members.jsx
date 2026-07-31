import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { MEMBERS } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import CanEdit from "@/components/CanEdit";
import { Search, Plus, Pencil, Trash2, X, SlidersHorizontal, Palette, Check, RotateCcw, ChevronDown, MapPin, ClipboardList } from "lucide-react";
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
  "#DC2626", // red
  "#F5A623", // gold
  "#2563eb", // blue
  "#16a34a", // green
  "#7c3aed", // purple
  "#db2777", // pink
  "#0891b2", // cyan
  "#ea580c", // orange
];

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
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterAlliances, setFilterAlliances] = useState([]);
  const [filterRanks, setFilterRanks] = useState([]);
  const [sortMode, setSortMode] = useState("default");
  const [colorPickerAlliance, setColorPickerAlliance] = useState(null);
  const [collapsedAlliances, setCollapsedAlliances] = useState(() => new Set());
  const [collapsedRankSections, setCollapsedRankSections] = useState(() => new Set());

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
      switch (sortMode) {
        case "name_asc": return a.name.localeCompare(b.name, "tr");
        case "name_desc": return b.name.localeCompare(a.name, "tr");
        case "rank_asc": return ra - rb || a.name.localeCompare(b.name, "tr");
        case "rank_desc": return rb - ra || a.name.localeCompare(b.name, "tr");
        case "castle_desc": return cb - ca || a.name.localeCompare(b.name, "tr");
        case "castle_asc": return ca - cb || a.name.localeCompare(b.name, "tr");
        default: return rb - ra || a.name.localeCompare(b.name, "tr");
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
      <Header subtitle={t("member_mgmt_sub")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold uppercase red-text tracking-wider">{t("members")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("members_total", { count: totalCount })}
              {activeFilterCount > 0 && (
                <span className="ml-2 gold-text">({shownCount} {t("members_word")})</span>
              )}
            </p>
          </div>
          <CanEdit>
            <button
              data-testid={MEMBERS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
            </button>
          </CanEdit>
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
        </div>

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
                <span className="flex items-center gap-2 font-bold tracking-wider text-base truncate">
                  <ChevronDown
                    className="w-4 h-4 flex-shrink-0 transition-transform"
                    style={{ transform: collapsedAlliances.has(grp.name) ? "rotate(-90deg)" : "rotate(0deg)" }}
                  />
                  ── {grp.name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <CanEdit>
                    {grp.name !== t("no_group") && (
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
                            <span className="text-xs font-bold uppercase tracking-wider text-white">
                              ({rankMembers.length})
                            </span>
                          </span>
                        </button>

                        {!isCollapsed && (
                          <div
                            className="mt-1.5"
                            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}
                            data-testid={`rank-section-grid-${grp.name}-${rk}`}
                          >
                            {rankMembers.map((m) => (
                              <div
                                key={m.id}
                                data-testid={MEMBERS.card(m.id)}
                                className="card-dark row-hover min-w-0"
                                style={{ padding: "8px", display: "flex", alignItems: "center", gap: "6px" }}
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
                                      className="font-bold text-white text-xs truncate leading-tight"
                                      title={m.name}
                                      data-testid={`member-name-${m.id}`}
                                    >
                                      {m.name}
                                    </span>
                                    {m.note && (m.note_position || "inline") === "inline" && (
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
                                  {m.note && m.note_position === "bottom" && (
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
                              </div>
                            ))}
                          </div>
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
