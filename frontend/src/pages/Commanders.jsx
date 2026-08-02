import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, CATEGORIES, groupCategories } from "@/lib/api";
import { COMMANDERS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, X, Shield, ChevronDown, ChevronRight, Upload, Image as ImageIcon, Sparkles, Link as LinkIcon, Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import SoldierCalculator from "@/components/SoldierCalculator";
import EquipmentTables from "@/components/EquipmentTables";

const fetcher = (url) => api.get(url).then((r) => r.data);

// Resolve /uploads/... to full backend URL for preview.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const resolveImageUrl = (u) => {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/uploads/")) return `${BACKEND_URL}/api${u}`;
  if (u.startsWith("/api/uploads/")) return `${BACKEND_URL}${u}`;
  return u;
};

const DEFAULT_RANK_SUGGESTIONS = ["R1", "R2", "R3", "R4", "R5", "KoF", "SSR", "SR", "R", "N"];

const SECTION_PREFIX = "__section:";
const isSectionKey = (k) => typeof k === "string" && k.startsWith(SECTION_PREFIX);
const sectionOf = (k) => (isSectionKey(k) ? k.slice(SECTION_PREFIX.length) : null);

// Rarity: legendary (orange) > epic (purple) > common (blue).
const RARITY = {
  legendary: { color: "#F97316", labelKey: "rarity_legendary", bg: "#1a0d00" },
  epic: { color: "#A855F7", labelKey: "rarity_epic", bg: "#1a0030" },
  common: { color: "#3B82F6", labelKey: "rarity_common", bg: "#001530" },
};

// Sidebar section header → i18n key map. Section names come from CATEGORIES[i].section (Turkish literal).
const SIDEBAR_SECTION_I18N = {
  "BİLGİLENDİRME": "sb_bilgilendirme",
  "KOMUTANLAR": "sb_komutanlar",
  "KAFES ETKİNLİK": "sb_kafes",
  "GARNİZON": "sb_garnizon",
  "SAVAŞ": "sb_savas",
  "SVS EKİP": "sb_svs",
  "MALİYET HESAPLAMA": "sb_maliyet_hesaplama",
};

// Content language badge — the app stores commander names/desc as free text.
// This static badge tells viewers the content was entered in Turkish.
function ContentLangBadge() {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10"
      title="Content language: Turkish"
      data-testid="content-lang-badge"
    >
      <span aria-hidden>🌐</span> TR
    </span>
  );
}

// Style helper: returns rarity-tinted frame + background for a commander card,
// or null when no rarity is set (caller keeps the default red/gold card look).
function rarityCardStyle(rarity) {
  const r = RARITY[rarity];
  if (!r) return null;
  return {
    border: `2px solid ${r.color}`,
    background: `linear-gradient(180deg, ${r.bg}f5, ${r.bg}cc)`,
  };
}
const RARITY_ORDER = { legendary: 3, epic: 2, common: 1 };
const RANK_ORDER = { S6: 11, S5: 10, S4: 9, S3: 8, S2: 7, S1: 6, R5: 5, R4: 4, R3: 3, R2: 2, R1: 1 };

// Shared sort for commander lists:
//  1) KoF first (S6→S1 among KoF).
//  2) Non-KoF ranked commanders (R5→R1, then any S-rank).
//  3) Non-KoF unranked, by rarity (legendary > epic > common).
//  4) Ties broken by name in Turkish locale.
function sortCommandersList(arr) {
  const rankRank = (r) => RANK_ORDER[r] || 0;
  const rarityRank = (r) => RARITY_ORDER[r] || 0;
  return [...arr].sort((a, b) => {
    if (a.is_kof !== b.is_kof) return a.is_kof ? -1 : 1;
    const aRank = rankRank(a.rank);
    const bRank = rankRank(b.rank);
    const aHasRank = aRank > 0;
    const bHasRank = bRank > 0;
    if (aHasRank !== bHasRank) return aHasRank ? -1 : 1;
    if (aHasRank && bHasRank) {
      if (aRank !== bRank) return bRank - aRank;
      return (a.name || "").localeCompare(b.name || "", "tr");
    }
    const aRar = rarityRank(a.rarity);
    const bRar = rarityRank(b.rarity);
    if (aRar !== bRar) return bRar - aRar;
    return (a.name || "").localeCompare(b.name || "", "tr");
  });
}
// Groups used by the KOMUTANLAR section view (order matters).
const COMMANDER_GROUPS = ["tetikci", "kalkanli", "bombaci", "robotlar"];

// Label the "+ Yeni" button based on the currently-selected category or section.
function addButtonLabel(t, category, section) {
  if (section === "MALİYET HESAPLAMA") return t("add_info_item");
  if (section) return t("add_commander_short");
  const key = category?.key;
  if (key === "bilgilendirme" || (typeof key === "string" && key.startsWith("mh_"))) return t("add_info_item");
  const sec = category?.section;
  if (sec === "KOMUTANLAR") return t("add_commander_short");
  if (sec === "KAFES ETKİNLİK") return t("add_squad_short");
  if (sec === "GARNİZON") return t("add_garrison_short");
  if (sec === "SAVAŞ") return t("add_squad_short");
  if (sec === "SVS EKİP") return t("add_squad_short");
  return t("new_short");
}

export default function Commanders() {
  const { t } = useTranslation();
  const [selectedCat, setSelectedCat] = useState(CATEGORIES[1].key);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [gridSearch, setGridSearch] = useState("");
  const sections = groupCategories();
  const [expanded, setExpanded] = useState(() => {
    const initial = {};
    Object.entries(sections).forEach(([sec]) => { initial[sec] = sec === "KOMUTANLAR"; });
    return initial;
  });

  const { data: allCommanders = [] } = useSWR("/commanders", fetcher, { refreshInterval: 8000 });

  const activeSection = sectionOf(selectedCat);
  const commanders = useMemo(() => {
    let base;
    if (activeSection) {
      const catKeys = CATEGORIES.filter((cc) => cc.section === activeSection).map((cc) => cc.key);
      base = allCommanders.filter((c) => catKeys.includes(c.category));
      // KOMUTANLAR aggregate ("Tümü") intentionally excludes Robotlar — robots only appear in their own tab.
      if (activeSection === "KOMUTANLAR") {
        base = base.filter((c) => c.category !== "robotlar");
      }
    } else {
      base = allCommanders.filter((c) => c.category === selectedCat);
    }
    return sortCommandersList(base);
  }, [allCommanders, selectedCat, activeSection]);

  const kofCommanders = useMemo(() => allCommanders.filter((c) => c.is_kof), [allCommanders]);
  const commanderById = useMemo(() => {
    const m = {};
    allCommanders.forEach((c) => { m[c.id] = c; });
    return m;
  }, [allCommanders]);

  // Autocomplete pools derived purely from existing data.
  const allRanks = useMemo(() => {
    const s = new Set();
    allCommanders.forEach((c) => { if (c.rank) s.add(c.rank); });
    return [...s].sort((a, b) => a.localeCompare(b, "tr"));
  }, [allCommanders]);
  const allCharacters = useMemo(() => {
    const s = new Set();
    allCommanders.forEach((c) => (c.characters || []).forEach((x) => s.add(x)));
    return [...s].sort((a, b) => a.localeCompare(b, "tr"));
  }, [allCommanders]);
  const allDescriptions = useMemo(() => {
    const s = new Set();
    allCommanders.forEach((c) => { if (c.description) s.add(c.description); });
    return [...s].slice(0, 100);
  }, [allCommanders]);
  const allCustomTypes = useMemo(() => {
    // any category value in db that is NOT in the built-in CATEGORIES list
    const known = new Set(CATEGORIES.map((c) => c.key));
    const s = new Set();
    allCommanders.forEach((c) => { if (c.category && !known.has(c.category)) s.add(c.category); });
    return [...s];
  }, [allCommanders]);

  const currentCategory = CATEGORIES.find((c) => c.key === selectedCat);
  const isInfoCategory = selectedCat === "bilgilendirme";
  const toggleSection = (section) => setExpanded((e) => ({ ...e, [section]: !e[section] }));
  const openSectionView = (section) => setSelectedCat(SECTION_PREFIX + section);

  const contextLabel = activeSection
    ? activeSection
    : `${currentCategory?.section} — ${currentCategory?.label}`;

  return (
    <div data-testid={COMMANDERS.container}>
      <Header subtitle={t("commander_guide")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold uppercase red-text tracking-wider">{t("commanders_title")}</h2>
          <CanEdit>
            <button
              data-testid={COMMANDERS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
              title={contextLabel}
            >
              <Plus className="w-4 h-4" /> {addButtonLabel(t, currentCategory, activeSection)}
            </button>
          </CanEdit>
        </div>

        <div className="grid grid-cols-[130px_1fr] gap-3">
          {/* Sidebar tree (accordion) */}
          <div className="card-dark p-2 max-h-[calc(100vh-260px)] overflow-y-auto">
            {Object.entries(sections).map(([section, cats]) => {
              const isSectionActive = activeSection === section;
              return (
                <div key={section} className="mb-1">
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => openSectionView(section)}
                      data-testid={`section-open-${section}`}
                      className={`flex-1 flex items-center gap-1 tree-cat hover:text-white ${isSectionActive ? "gold-text" : ""}`}
                      style={{ background: isSectionActive ? "rgba(245,166,35,0.10)" : "transparent", border: 0, cursor: "pointer", padding: "6px 6px" }}
                    >
                      <Grid3x3 className="w-3 h-3 opacity-70" />
                      <span className="text-left flex-1 truncate">{t(SIDEBAR_SECTION_I18N[section] || "") || section}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSection(section)}
                      data-testid={`section-toggle-${section}`}
                      className="w-6 flex items-center justify-center hover:text-white"
                      style={{ background: "transparent", border: 0, cursor: "pointer" }}
                    >
                      {expanded[section] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  </div>
                  {expanded[section] && cats.map((c) => (
                    <div
                      key={c.key}
                      data-testid={COMMANDERS.categoryItem(c.key)}
                      onClick={() => setSelectedCat(c.key)}
                      className={`tree-item ${selectedCat === c.key ? "active" : ""}`}
                    >
                      {t(`cat_${c.key}`) !== `cat_${c.key}` ? t(`cat_${c.key}`) : c.label}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Content */}
          <div className="min-w-0">
            <div className="text-[11px] uppercase gold-text font-bold tracking-widest mb-2 flex items-center gap-2">
              <span>
                {activeSection
                  ? `${t(SIDEBAR_SECTION_I18N[activeSection] || "") || activeSection} — ${t("all_short")}`
                  : (currentCategory ? (t(`cat_${currentCategory.key}`) !== `cat_${currentCategory.key}` ? t(`cat_${currentCategory.key}`) : currentCategory.label) : "")}
              </span>
              <span className="text-muted-foreground font-normal">• {commanders.length}</span>
            </div>
            {selectedCat === "mh_ekipman" && <EquipmentTables />}
            {selectedCat === "mh_asker_egitim" ? (
              <SoldierCalculator />
            ) : activeSection ? (
              <>
                <div className="relative mb-2">
                  <input
                    value={gridSearch}
                    onChange={(e) => setGridSearch(e.target.value)}
                    placeholder={t("search_commander")}
                    data-testid="commanders-grid-search"
                    className="w-full card-dark px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                {(() => {
                  const q = gridSearch.trim().toLowerCase();
                  const searched = q ? commanders.filter((c) => (c.name || "").toLowerCase().includes(q)) : commanders;

                  // KOMUTANLAR "Tümü" view: single flat list mixing Tetikçi/Bombacı/Kalkanlı (Robotlar excluded upstream).
                  if (activeSection === "KOMUTANLAR") {
                    if (searched.length === 0) {
                      return <div className="card-dark p-6 text-center text-muted-foreground text-xs">{t("no_commanders_in_category")}</div>;
                    }
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2" data-testid="grid-group-KOMUTANLAR-all">
                        {searched.map((c) => (
                          <CommanderGridCard
                            key={c.id}
                            commander={c}
                            commanderById={commanderById}
                            onOpen={() => setLightbox(c)}
                            onEdit={() => { setEditing(c); setShowForm(true); }}
                            onDelete={async () => {
                              if (!window.confirm(t("confirm_delete_generic", { name: c.name }))) return;
                              await api.delete(`/commanders/${c.id}`);
                              mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
                              toast.success(t("deleted"));
                            }}
                          />
                        ))}
                      </div>
                    );
                  }

                  // Other sections: group by category (keeps team/garrison behavior intact).
                  const groupsOrder = null;
                  const groups = {};
                  searched.forEach((c) => { (groups[c.category] = groups[c.category] || []).push(c); });
                  Object.keys(groups).forEach((k) => { groups[k] = sortCommandersList(groups[k]); });
                  const orderedCats = groupsOrder
                    ? groupsOrder.filter((k) => groups[k]).concat(Object.keys(groups).filter((k) => !groupsOrder.includes(k)))
                    : Object.keys(groups);
                  return orderedCats.length === 0 ? (
                    <div className="card-dark p-6 text-center text-muted-foreground text-xs">{t("no_commanders_in_category")}</div>
                  ) : orderedCats.map((catKey) => {
                    const label = CATEGORIES.find((x) => x.key === catKey)?.label || catKey;
                    return (
                      <div key={catKey} className="mb-4" data-testid={`grid-group-${catKey}`}>
                        <div className="text-[10px] uppercase gold-text font-bold tracking-widest mb-1.5">
                          {label} <span className="text-muted-foreground font-normal">• {groups[catKey].length}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                          {groups[catKey].map((c) => (
                            <CommanderGridCard
                              key={c.id}
                              commander={c}
                              commanderById={commanderById}
                              onOpen={() => setLightbox(c)}
                              onEdit={() => { setEditing(c); setShowForm(true); }}
                              onDelete={async () => {
                                if (!window.confirm(t("confirm_delete_generic", { name: c.name }))) return;
                                await api.delete(`/commanders/${c.id}`);
                                mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
                                toast.success(t("deleted"));
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </>
            ) : (
              <div className="space-y-2">
                {commanders.map((c) => (
                  <CommanderCard
                    key={c.id}
                    commander={c}
                    commanderById={commanderById}
                    onOpen={() => setLightbox(c)}
                    onEdit={() => { setEditing(c); setShowForm(true); }}
                    onDelete={async () => {
                      if (!window.confirm(t("confirm_delete_generic", { name: c.name }))) return;
                      await api.delete(`/commanders/${c.id}`);
                      mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
                      toast.success(t("deleted"));
                    }}
                  />
                ))}
                {commanders.length === 0 && (
                  <div className="card-dark p-6 text-center text-muted-foreground text-xs">{t("no_commanders_in_category")}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <CommanderForm
          initial={editing}
          defaultCategory={activeSection ? (CATEGORIES.find((c) => c.section === activeSection)?.key) : selectedCat}
          activeSection={activeSection}
          kofCommanders={kofCommanders}
          allCommanders={allCommanders}
          allRanks={allRanks}
          allCharacters={allCharacters}
          allDescriptions={allDescriptions}
          allCustomTypes={allCustomTypes}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {lightbox && <CommanderLightbox commander={lightbox} commanderById={commanderById} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function KofBadge({ id, small = false }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${small ? "text-[9px]" : "text-[10px]"}`}
      style={{ background: "linear-gradient(135deg,#DC2626,#F5A623)", color: "#fff" }}
      data-testid={`kof-badge-${id}`}
    >
      <Sparkles className={small ? "w-2.5 h-2.5" : "w-3 h-3"} /> KoF
    </span>
  );
}

function CommanderCard({ commander: c, commanderById, onOpen, onEdit, onDelete }) {
  const { t } = useTranslation();
  const matchNames = (c.kof_pairs || []).map((id) => commanderById[id]).filter(Boolean);
  const catLabel = CATEGORIES.find((x) => x.key === c.category)?.label || c.category;
  const isTeam = Array.isArray(c.team_slots) && c.team_slots.length > 0;

  return (
    <div
      data-testid={COMMANDERS.card(c.id)}
      className={rarityCardStyle(c.rarity) ? "p-3 fade-in rounded-lg" : "card-red-gold p-3 fade-in"}
      style={rarityCardStyle(c.rarity) || undefined}
    >
      <button
        type="button"
        onClick={onOpen}
        data-testid={`commander-open-${c.id}`}
        className="w-full text-left"
      >
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <div className="text-sm font-bold text-white truncate flex-1 min-w-0">{c.name}</div>
          {c.is_kof && <KofBadge id={c.id} />}
          {c.rank && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold gold-gradient text-black" data-testid={`rank-${c.id}`}>
              {c.rank}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex-1">{catLabel}</div>
          <ContentLangBadge />
        </div>

        {isTeam ? (
          <div className="grid grid-cols-4 gap-1" data-testid={`team-preview-${c.id}`}>
            {c.team_slots.map((s, i) => {
              const cmd = commanderById[s.commander_id];
              const kof = commanderById[s.kof_id];
              return (
                <div key={i} className="min-w-0 rounded overflow-hidden" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(220,38,38,0.3)" }}>
                  {kof && (
                    <div className="p-0.5" style={{ background: "linear-gradient(135deg,rgba(220,38,38,0.2),rgba(245,166,35,0.2))" }}>
                      {kof.image_url ? (
                        <img src={resolveImageUrl(kof.image_url)} alt={kof.name} className="w-full aspect-square object-cover rounded" />
                      ) : (
                        <div className="w-full aspect-square rounded bg-red-500/30 flex items-center justify-center">
                          <Sparkles className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div className="text-[7px] text-white truncate text-center">{kof.name}</div>
                    </div>
                  )}
                  <div className="p-0.5">
                    {cmd ? (
                      <>
                        {cmd.image_url ? (
                          <img src={resolveImageUrl(cmd.image_url)} alt={cmd.name} className="w-full aspect-square object-cover rounded" />
                        ) : (
                          <div className="w-full aspect-square rounded bg-black/40 flex items-center justify-center">
                            <Shield className="w-3 h-3 gold-text" />
                          </div>
                        )}
                        <div className="text-[7px] text-white truncate text-center">{cmd.name}</div>
                      </>
                    ) : (
                      <div className="w-full aspect-square rounded flex items-center justify-center text-[7px] text-muted-foreground border border-dashed border-border">—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-3">
            {c.image_url ? (
              <img
                src={resolveImageUrl(c.image_url)}
                alt={c.name}
                className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                style={{ border: `2px solid ${RARITY[c.rarity]?.color || "rgba(136,136,136,0.5)"}` }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-md bg-black/40 flex items-center justify-center flex-shrink-0"
                style={{ border: `2px solid ${RARITY[c.rarity]?.color || "rgba(136,136,136,0.5)"}` }}
              >
                <Shield className="w-6 h-6 gold-text" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {c.description && <div className="text-[10px] text-muted-foreground line-clamp-2">{c.description}</div>}
              <div className="flex flex-wrap gap-1 mt-1">
                {(c.characters || []).map((ch) => (
                  <span key={ch} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 red-text border border-red-500/30">
                    {ch}
                  </span>
                ))}
              </div>
              {matchNames.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1" data-testid={`kof-matches-${c.id}`}>
                  <span className="text-[9px] uppercase font-bold gold-text flex items-center gap-0.5">
                    <LinkIcon className="w-2.5 h-2.5" /> KoF:
                  </span>
                  {matchNames.map((m) => (
                    <span
                      key={m.id}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 gold-text border border-yellow-500/30 flex items-center gap-1"
                    >
                      {m.image_url && <img src={resolveImageUrl(m.image_url)} alt="" className="w-3 h-3 rounded-full object-cover" />}
                      {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </button>
      <CanEdit>
        <div className="flex justify-end gap-1 mt-2">
          <button onClick={onEdit} data-testid={`commander-edit-${c.id}`} className="w-7 h-7 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} data-testid={`commander-delete-${c.id}`} className="w-7 h-7 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </CanEdit>
    </div>
  );
}

function CommanderGridCard({ commander: c, commanderById, onOpen, onEdit, onDelete }) {
  const catLabel = CATEGORIES.find((x) => x.key === c.category)?.label || c.category;
  const matchNames = (c.kof_pairs || []).map((id) => commanderById[id]).filter(Boolean);

  return (
    <div
      data-testid={COMMANDERS.card(c.id)}
      className={rarityCardStyle(c.rarity) ? "p-2 fade-in flex flex-col rounded-lg" : "card-red-gold p-2 fade-in flex flex-col"}
      style={rarityCardStyle(c.rarity) || undefined}
    >
      <button
        type="button"
        onClick={onOpen}
        data-testid={`commander-open-${c.id}`}
        className="w-full text-left flex flex-col"
      >
        <div
          className="relative w-full aspect-square rounded-md overflow-hidden bg-black/40 flex items-center justify-center mb-2"
          style={{ border: `3px solid ${RARITY[c.rarity]?.color || "rgba(136,136,136,0.5)"}` }}
          data-testid={`grid-rarity-frame-${c.id}`}
        >
          {c.image_url ? (
            <img src={resolveImageUrl(c.image_url)} alt={c.name} className="w-full h-full object-cover" />
          ) : (
            <Shield className="w-8 h-8 gold-text" />
          )}
          {c.is_kof && (
            <div className="absolute top-1 right-1"><KofBadge id={c.id} small /></div>
          )}
          {c.rank && (
            <span className="absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded font-bold gold-gradient text-black">{c.rank}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{c.name}</div>
          <div className="flex items-center gap-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex-1 truncate">{catLabel}</div>
            <ContentLangBadge />
          </div>
          {matchNames.length > 0 && (
            <div className="text-[9px] gold-text mt-1 truncate flex items-center gap-1">
              <LinkIcon className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{matchNames.map((m) => m.name).join(", ")}</span>
            </div>
          )}
        </div>
      </button>
      <CanEdit>
        <div className="flex justify-end gap-1 mt-2">
          <button onClick={onEdit} data-testid={`commander-edit-${c.id}`} className="w-6 h-6 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center">
            <Pencil className="w-2.5 h-2.5" />
          </button>
          <button onClick={onDelete} data-testid={`commander-delete-${c.id}`} className="w-6 h-6 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center">
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </CanEdit>
    </div>
  );
}

function CommanderLightbox({ commander, commanderById, onClose }) {
  const { t } = useTranslation();
  const matchNames = (commander.kof_pairs || []).map((id) => commanderById[id]).filter(Boolean);
  return (
    <div
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 fade-in"
      onClick={onClose}
      data-testid="commander-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        data-testid="commander-lightbox-close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 border border-primary/50 hover:bg-primary/30 flex items-center justify-center z-10"
        aria-label={t("close")}
      >
        <X className="w-5 h-5 text-white" />
      </button>

      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md flex flex-col items-center max-h-[95vh] overflow-y-auto">
        {commander.image_url ? (
          <img src={resolveImageUrl(commander.image_url)} alt={commander.name} className="max-w-full max-h-[60vh] rounded-lg object-contain shadow-2xl border-2 border-primary/40" />
        ) : (
          <div className="w-56 h-56 rounded-lg bg-black/60 border-2 border-primary/40 flex items-center justify-center">
            <Shield className="w-20 h-20 gold-text" />
          </div>
        )}

        <div className="w-full mt-4 text-center px-2">
          <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
            <h3 className="text-2xl font-bold uppercase gold-text tracking-wider" style={{ fontFamily: "Rajdhani" }}>{commander.name}</h3>
            {commander.is_kof && <KofBadge id={commander.id} />}
            {commander.rank && <span className="text-[10px] px-2 py-0.5 rounded font-bold gold-gradient text-black">{commander.rank}</span>}
          </div>
          {commander.description && <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{commander.description}</p>}
          {(commander.characters || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
              {commander.characters.map((ch) => (
                <span key={ch} className="text-xs px-2.5 py-1 rounded-full bg-red-500/20 red-text border border-red-500/40 font-semibold">{ch}</span>
              ))}
            </div>
          )}
          {matchNames.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] uppercase gold-text font-bold tracking-widest mb-2">{t("kof_matches")}</div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {matchNames.map((m) => (
                  <span key={m.id} className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/20 gold-text border border-yellow-500/40 font-semibold flex items-center gap-1.5">
                    {m.image_url && <img src={resolveImageUrl(m.image_url)} alt="" className="w-4 h-4 rounded-full object-cover" />}
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Roles used by team squads. First 3 slots have USER-SELECTABLE type; slot 3 is locked to robot.
const TEAM_ROLES = [
  { fixed: false, labelKey: "slot_1_label" },
  { fixed: false, labelKey: "slot_2_label" },
  { fixed: false, labelKey: "slot_3_label" },
  { fixed: true, role: "robotlar", labelKey: "slot_robot_label" },
];
const TYPE_CHOICES = [
  { role: "tetikci", labelKey: "tetikci" },
  { role: "bombaci", labelKey: "bombaci" },
  { role: "kalkanli", labelKey: "kalkanli" },
];
const TEAM_SECTIONS = new Set(["KAFES ETKİNLİK", "GARNİZON", "SAVAŞ", "SVS EKİP"]);

const defaultTeamSlots = () => [
  { role: "tetikci", commander_id: null, kof_id: null },
  { role: "kalkanli", commander_id: null, kof_id: null },
  { role: "bombaci", commander_id: null, kof_id: null },
  { role: "robotlar", commander_id: null, kof_id: null },
];

// Searchable multi-select of commanders / characters with thumbnails + free-text add.
function CharacterMultiSelect({ value, onChange, allCommanders, allCharacters, excludeId }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const cmdByName = useMemo(() => {
    const m = {};
    (allCommanders || []).forEach((c) => { m[c.name] = c; });
    return m;
  }, [allCommanders]);

  const options = useMemo(() => {
    const arr = [];
    const seen = new Set();
    (allCommanders || []).forEach((c) => {
      if (excludeId && c.id === excludeId) return;
      if (seen.has(c.name)) return;
      seen.add(c.name);
      arr.push({ name: c.name, image_url: c.image_url, id: c.id });
    });
    (allCharacters || []).forEach((n) => {
      if (!seen.has(n)) { seen.add(n); arr.push({ name: n, image_url: null }); }
    });
    return arr;
  }, [allCommanders, allCharacters, excludeId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const notSelected = options.filter((o) => !value.includes(o.name));
    if (!s) return notSelected.slice(0, 30);
    return notSelected.filter((o) => (o.name || "").toLowerCase().includes(s)).slice(0, 30);
  }, [options, q, value]);

  const add = (n) => {
    const name = (n || "").trim();
    if (!name || value.includes(name)) return;
    onChange([...value, name]);
    setQ("");
  };
  const remove = (n) => onChange(value.filter((x) => x !== n));

  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (q.trim()) add(q);
    }
  };

  return (
    <div ref={wrapRef} className="relative" data-testid="character-multiselect">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5" data-testid="character-selected">
          {value.map((n) => {
            const cmd = cmdByName[n];
            return (
              <span key={n} className="chip active" data-testid={`character-chip-${n}`}>
                {cmd?.image_url && (
                  <img src={resolveImageUrl(cmd.image_url)} alt="" className="w-4 h-4 rounded-full object-cover" />
                )}
                {n}
                <button
                  type="button"
                  onClick={() => remove(n)}
                  data-testid={`character-remove-${n}`}
                  className="ml-1 -mr-0.5 opacity-70 hover:opacity-100"
                  aria-label={t("remove")}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={t("search_add_character")}
        data-testid="character-search-input"
        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        autoComplete="off"
      />
      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] rounded-md overflow-hidden max-h-64 overflow-y-auto"
          style={{
            zIndex: 60,
            background: "linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)",
            border: "1px solid rgba(220,38,38,0.5)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          }}
          data-testid="character-dropdown"
        >
          {q.trim() && !options.some((o) => (o.name || "").toLowerCase() === q.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => add(q)}
              data-testid="character-add-custom"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/15 border-b border-border"
              style={{ color: "#F5A623" }}
            >
              <Plus className="w-4 h-4" />
              <span className="truncate">{t("add_new")}: "{q.trim()}"</span>
            </button>
          )}
          {filtered.length === 0 && !q.trim() && (
            <div className="p-3 text-xs text-muted-foreground text-center">{t("no_match")}</div>
          )}
          {filtered.map((o) => (
            <button
              key={o.id || o.name}
              type="button"
              onClick={() => add(o.name)}
              data-testid={`character-option-${o.name}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-primary/15"
            >
              {o.image_url ? (
                <img src={resolveImageUrl(o.image_url)} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-primary/30" />
              ) : (
                <div className="w-7 h-7 rounded-md bg-black/40 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-3.5 h-3.5 gold-text" />
                </div>
              )}
              <span className="flex-1 truncate">{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Team composition editor: 4 slots — first 3 have user-selectable type (Tetikçi/Bombacı/Kalkanlı),
// slot 4 is always Robot. Each slot picks a commander (bottom) and optionally a KoF hero (top) of matching type.
function TeamSlotsEditor({ value, onChange, allCommanders }) {
  const { t } = useTranslation();
  const updateSlotAt = (idx, patch) => {
    onChange(value.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };
  return (
    <div className="flex gap-1.5" data-testid="team-slots-editor">
      {TEAM_ROLES.map((meta, idx) => {
        const slot = value[idx] || { role: meta.fixed ? meta.role : "tetikci", commander_id: null, kof_id: null };
        const activeRole = meta.fixed ? meta.role : slot.role;
        const cmdOptions = allCommanders.filter((c) => c.category === activeRole && !c.is_kof);
        const kofOptions = allCommanders.filter((c) => c.category === activeRole && c.is_kof);
        const cmd = allCommanders.find((c) => c.id === slot.commander_id);
        const kof = allCommanders.find((c) => c.id === slot.kof_id);
        const canPickKof = activeRole !== "robotlar";
        return (
          <div
            key={idx}
            className="flex-1 min-w-0 rounded-lg overflow-hidden"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(220,38,38,0.35)" }}
            data-testid={`team-slot-${idx}`}
          >
            <div className="text-[9px] uppercase tracking-wider font-bold text-center py-1 gold-text" style={{ background: "rgba(245,166,35,0.10)" }}>
              {t(meta.labelKey)}
            </div>

            {/* Type chip picker for editable slots (slots 0-2) */}
            {!meta.fixed && (
              <div className="flex gap-0.5 p-1 border-b border-border/40" data-testid={`slot-type-picker-${idx}`}>
                {TYPE_CHOICES.map((tc) => (
                  <button
                    key={tc.role}
                    type="button"
                    onClick={() => updateSlotAt(idx, { role: tc.role, commander_id: null, kof_id: null })}
                    data-testid={`slot-type-${idx}-${tc.role}`}
                    className={`flex-1 text-[9px] font-bold uppercase py-1 rounded transition-colors ${
                      slot.role === tc.role ? "gold-gradient text-black" : "bg-black/30 text-white hover:bg-primary/20"
                    }`}
                  >
                    {t(tc.labelKey).slice(0, 3)}
                  </button>
                ))}
              </div>
            )}

            {canPickKof && (
              <div className="p-1.5 border-b border-border/40">
                <div className="text-[8px] uppercase text-muted-foreground text-center font-bold mb-1">{t("kof_pair_short")}</div>
                {kof ? (
                  <div className="text-center">
                    {kof.image_url ? (
                      <img src={resolveImageUrl(kof.image_url)} alt={kof.name} className="w-full aspect-square object-cover rounded" />
                    ) : (
                      <div className="w-full aspect-square rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg,#DC2626,#F5A623)" }}>
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div className="text-[9px] text-white truncate mt-0.5">{kof.name}</div>
                  </div>
                ) : (
                  <div className="w-full aspect-square rounded flex items-center justify-center text-[9px] text-muted-foreground border border-dashed border-border">
                    {t("empty_slot")}
                  </div>
                )}
                <select
                  value={slot.kof_id || ""}
                  onChange={(e) => updateSlotAt(idx, { kof_id: e.target.value || null })}
                  data-testid={`slot-kof-select-${idx}`}
                  className="w-full mt-1 text-[9px] bg-background border border-border rounded px-1 py-0.5 text-white"
                >
                  <option value="">--</option>
                  {kofOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
            )}

            <div className="p-1.5">
              <div className="text-[8px] uppercase text-muted-foreground text-center font-bold mb-1">{t("commander_short")}</div>
              {cmd ? (
                <div className="text-center">
                  {cmd.image_url ? (
                    <img src={resolveImageUrl(cmd.image_url)} alt={cmd.name} className="w-full aspect-square object-cover rounded" />
                  ) : (
                    <div className="w-full aspect-square rounded bg-black/40 flex items-center justify-center">
                      <Shield className="w-5 h-5 gold-text" />
                    </div>
                  )}
                  <div className="text-[9px] text-white truncate mt-0.5">{cmd.name}</div>
                </div>
              ) : (
                <div className="w-full aspect-square rounded flex items-center justify-center text-[9px] text-muted-foreground border border-dashed border-border">
                  {t("empty_slot")}
                </div>
              )}
              <select
                value={slot.commander_id || ""}
                onChange={(e) => updateSlotAt(idx, { commander_id: e.target.value || null })}
                data-testid={`slot-cmd-select-${idx}`}
                className="w-full mt-1 text-[9px] bg-background border border-border rounded px-1 py-0.5 text-white"
              >
                <option value="">--</option>
                {cmdOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommanderForm({ initial, defaultCategory, activeSection, kofCommanders, allCommanders, allRanks, allCharacters, allDescriptions, allCustomTypes, onClose }) {
  const { t } = useTranslation();
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || defaultCategory || "tetikci");
  const [rank, setRank] = useState(initial?.rank || "");
  const [rarity, setRarity] = useState(initial?.rarity || "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url || "");
  const initialImages = (initial?.images && initial.images.length > 0)
    ? initial.images
    : (initial?.image_url ? [initial.image_url] : []);
  const [images, setImages] = useState(initialImages);
  const [urlDraft, setUrlDraft] = useState("");
  const multiImageInputRef = React.useRef(null);
  const [description, setDescription] = useState(initial?.description || "");
  const [characters, setCharacters] = useState(initial?.characters || []);
  const [isKof, setIsKof] = useState(!!initial?.is_kof);
  const [kofPairs, setKofPairs] = useState(initial?.kof_pairs || []);
  const [teamSlots, setTeamSlots] = useState(initial?.team_slots || defaultTeamSlots());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  // Sub-category chips within the same section (or the current form's category's section).
  const currentSection = activeSection || CATEGORIES.find((c) => c.key === category)?.section;
  const sectionChoices = useMemo(() => CATEGORIES.filter((c) => c.section === currentSection), [currentSection]);
  const isInfo = category === "bilgilendirme" || (typeof category === "string" && category.startsWith("mh_"));
  const isMultiImage = typeof category === "string" && category.startsWith("mh_") && category !== "mh_asker_egitim";

  const MAX_IMAGES = 10;
  const addImages = (arr) => {
    if (!arr || arr.length === 0) return;
    setImages((prev) => {
      const room = Math.max(0, MAX_IMAGES - prev.length);
      if (arr.length > room) toast.warning(`Maksimum ${MAX_IMAGES} resim eklenebilir`);
      return [...prev, ...arr.slice(0, room)];
    });
  };

  const handleMultiFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const room = Math.max(0, MAX_IMAGES - images.length);
    if (files.length > room) toast.warning(`Maksimum ${MAX_IMAGES} resim eklenebilir`);
    const toUpload = files.slice(0, room).filter((f) => f.type.startsWith("image/") && f.size <= 8 * 1024 * 1024);
    if (toUpload.length === 0) { toast.error(t("upload_invalid_type")); return; }
    setUploading(true);
    try {
      const urls = [];
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        urls.push(res.data.url);
      }
      addImages(urls);
      toast.success(t("upload_done"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
      if (multiImageInputRef.current) multiImageInputRef.current.value = "";
    }
  };

  const addUrlDraft = () => {
    const u = urlDraft.trim();
    if (!u) return;
    if (images.length >= MAX_IMAGES) { toast.warning(`Maksimum ${MAX_IMAGES} resim eklenebilir`); return; }
    addImages([u]);
    setUrlDraft("");
  };
  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("upload_invalid_type")); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error(t("upload_too_large")); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageUrl(res.data.url);
      toast.success(t("upload_done"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const togglePair = (id) => setKofPairs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const isTeamMode = TEAM_SECTIONS.has(currentSection);
  const isGarrison = currentSection === "GARNİZON" || category === "garnizon";
  const hideRankAndRarity = isTeamMode || isGarrison;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("name_required")); return; }
    if (!category.trim()) { toast.error(t("type_required")); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        category: category.trim(),
        rank: hideRankAndRarity ? null : (rank.trim() || null),
        rarity: hideRankAndRarity ? null : (rarity || null),
        image_url: isMultiImage ? (images[0] || null) : (imageUrl.trim() || null),
        images: isMultiImage ? images : (imageUrl.trim() ? [imageUrl.trim()] : []),
        description: description.trim() || null,
        characters: characters.map((s) => s.trim()).filter(Boolean),
        is_kof: isTeamMode ? false : !!isKof,
        kof_pairs: isTeamMode || isKof ? [] : kofPairs,
        team_slots: isTeamMode ? teamSlots : null,
      };
      if (initial) await api.patch(`/commanders/${initial.id}`, body);
      else await api.post("/commanders", body);
      mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
      toast.success(initial ? t("updated") : t("commander_added"));
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSaving(false); }
  };

  const pairingPool = kofCommanders.filter((c) => c.id !== initial?.id);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative max-h-[90vh] overflow-y-auto"
        data-testid="commander-form"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-1">
          {editing ? (isInfo ? t("edit_info_item") : t("edit_commander")) : (isInfo ? t("new_info_item") : t("new_commander"))}
        </h3>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4" data-testid="commander-form-category-label">
          {t("category")}: <span className="gold-text font-bold">{currentSection}</span>
        </div>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{isInfo ? t("title") : t("name_person")}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="commander-form-name"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />

        {/* Type/Category chips + free-text — hidden in team mode (team is a squad) */}
        {!isInfo && !isTeamMode && sectionChoices.length > 0 && (
          <>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("commander_type")}</label>
            <div className="flex gap-1.5 flex-wrap mb-2" data-testid="commander-form-type-chips">
              {sectionChoices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  data-testid={`type-chip-${c.key}`}
                  className={`chip ${category === c.key ? "active" : ""}`}
                >
                  {c.label}
                </button>
              ))}
              {allCustomTypes.map((ct) => (
                <button key={ct} type="button" onClick={() => setCategory(ct)} data-testid={`type-chip-${ct}`} className={`chip ${category === ct ? "active" : ""}`}>
                  {ct}
                </button>
              ))}
            </div>
            <input
              data-testid="commander-form-type-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("type_placeholder")}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            />
          </>
        )}

        {/* Rank + Rarity — hidden for Team and Garrison forms (not needed there) */}
        {!isInfo && !hideRankAndRarity && (
          <>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("rank")}</label>
            {allRanks.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2" data-testid="commander-form-rank-chips">
                {allRanks.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRank(r)}
                    data-testid={`rank-chip-${r}`}
                    className={`chip ${rank === r ? "active" : ""}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            <input
              data-testid="commander-form-rank"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              list="commander-rank-list"
              placeholder={t("rank_placeholder")}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
              autoComplete="off"
            />
            <datalist id="commander-rank-list">
              {allRanks.map((r) => (<option key={r} value={r} />))}
            </datalist>

            {/* Rarity picker */}
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("rarity")}</label>
            <div className="flex gap-1.5" data-testid="rarity-picker">
              {["legendary", "epic", "common"].map((k) => {
                const r = RARITY[k];
                const isActive = rarity === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRarity(isActive ? "" : k)}
                    data-testid={`rarity-${k}`}
                    className="flex-1 text-[10px] font-bold uppercase py-2 rounded transition-all"
                    style={{
                      background: isActive ? r.color : "rgba(0,0,0,0.3)",
                      color: isActive ? "#fff" : r.color,
                      border: `2px solid ${r.color}`,
                      boxShadow: isActive ? `0 0 12px ${r.color}80` : "none",
                    }}
                  >
                    {t(r.labelKey)}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Character / Commander multi-select — hidden in team mode (team uses slots instead) */}
        {!isTeamMode && (
          <>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("character_commander")}</label>
            <CharacterMultiSelect
              value={characters}
              onChange={setCharacters}
              allCommanders={allCommanders || []}
              allCharacters={allCharacters || []}
              excludeId={initial?.id}
            />
          </>
        )}

        {/* Team composition — 4 slots (marksman / shield / bomber / robot) with KoF above each */}
        {isTeamMode && (
          <>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">
              {t("team_composition")}
            </label>
            <TeamSlotsEditor
              value={teamSlots}
              onChange={setTeamSlots}
              allCommanders={allCommanders || []}
            />
          </>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("image_url")}</label>
        {isMultiImage ? (
          <div data-testid="multi-image-section" className="space-y-2">
            {images.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                {images.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="relative group" data-testid={`multi-image-thumb-${idx}`}>
                    <img
                      src={resolveImageUrl(url)}
                      alt={`img-${idx}`}
                      className="w-full aspect-square object-cover rounded-md"
                      style={{ border: "1px solid rgba(231,76,26,0.4)" }}
                      onError={(e) => { e.currentTarget.style.opacity = "0.35"; }}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      data-testid={`multi-image-remove-${idx}`}
                      aria-label="remove"
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs"
                      style={{ background: "#C0392B", boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                data-testid="multi-image-url-input"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrlDraft(); } }}
                placeholder="https://... (Enter ile ekle)"
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono"
              />
              <button
                type="button"
                onClick={addUrlDraft}
                data-testid="multi-image-add-url"
                className="chip px-3"
              ><LinkIcon className="w-3.5 h-3.5" /> Ekle</button>
            </div>
            <input ref={multiImageInputRef} type="file" accept="image/*" multiple onChange={handleMultiFiles} className="hidden" data-testid="multi-image-file-input" />
            <button
              type="button"
              onClick={() => multiImageInputRef.current?.click()}
              disabled={uploading || images.length >= MAX_IMAGES}
              data-testid="multi-image-upload-btn"
              className="chip w-full justify-center py-2"
            >
              {uploading ? (<><Upload className="w-3.5 h-3.5 animate-pulse" /> {t("uploading")}</>) : (<><ImageIcon className="w-3.5 h-3.5" /> Cihazdan Yükle ({images.length}/{MAX_IMAGES})</>)}
            </button>
          </div>
        ) : (
        <div className="flex items-start gap-2">
          {imageUrl && (
            <img
              src={resolveImageUrl(imageUrl)}
              alt="preview"
              className="w-14 h-14 rounded-md object-cover border border-primary/40 flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              data-testid="commander-image-preview"
            />
          )}
          <div className="flex-1 space-y-1.5">
            <input
              data-testid="commander-image-url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... or /api/uploads/..."
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono"
            />
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" data-testid="commander-image-file-input" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="commander-image-upload-btn"
              className="chip w-full justify-center py-2"
            >
              {uploading ? (<><Upload className="w-3.5 h-3.5 animate-pulse" /> {t("uploading")}</>) : (<><ImageIcon className="w-3.5 h-3.5" /> {t("upload_from_device")}</>)}
            </button>
          </div>
        </div>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{isInfo ? t("body_text") : t("description")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="commander-form-description"
          rows={isInfo ? 6 : 3}
          list="commander-desc-list"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />
        <datalist id="commander-desc-list">
          {allDescriptions.map((d, i) => (<option key={i} value={d} />))}
        </datalist>

        {!isInfo && !isTeamMode && (
          <>
            <div className="mt-4 flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.3)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase gold-text tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> {t("kof_commander")}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{t("kof_commander_help")}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-2">
                <input type="checkbox" checked={isKof} onChange={(e) => setIsKof(e.target.checked)} data-testid="commander-form-is-kof" className="sr-only peer" />
                <div className="w-10 h-5 bg-secondary rounded-full peer-checked:bg-primary transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
              </label>
            </div>

            {!isKof && (
              <div className="mt-3">
                <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">
                  {t("kof_matches")} <span className="text-muted-foreground">({kofPairs.length})</span>
                </label>
                {pairingPool.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground p-2 rounded border border-dashed border-border" data-testid="kof-empty-hint">
                    {t("kof_no_candidates")}
                  </div>
                ) : (
                  <div className="flex gap-1.5 flex-wrap max-h-32 overflow-y-auto" data-testid="commander-form-kof-pairs">
                    {pairingPool.map((kc) => (
                      <button
                        key={kc.id}
                        type="button"
                        onClick={() => togglePair(kc.id)}
                        data-testid={`kof-pair-toggle-${kc.id}`}
                        className={`chip ${kofPairs.includes(kc.id) ? "active" : ""}`}
                      >
                        {kc.image_url && <img src={resolveImageUrl(kc.image_url)} alt="" className="w-4 h-4 rounded-full object-cover" />}
                        {kc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <button type="submit" disabled={saving} className="btn-gold w-full mt-5" data-testid="commander-form-submit">
          {saving ? t("saving") : editing ? t("update") : t("add_short")}
        </button>
      </form>
    </div>
  );
}
