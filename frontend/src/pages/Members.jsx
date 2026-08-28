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
import AdminNoteModal from "@/components/AdminNoteModal";
import CanEdit from "@/components/CanEdit";
import CountUp from "@/components/CountUp";
import { Search, Plus, Pencil, Trash2, X, SlidersHorizontal, Palette, Check, RotateCcw, ChevronDown, ChevronsDown, ChevronsUp, MapPin, ClipboardList, Link2, Camera, Shield, GraduationCap, CheckSquare, Square, Globe, Castle, Download, Flame, Send, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { COUNTRIES, COUNTRY_BY_ISO2 } from "@/lib/countries";
import InlineCountryPicker from "@/components/InlineCountryPicker";
// v64 — recharts imports for the Guild Health Score radar detail modal.
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Legend, Tooltip, ResponsiveContainer,
} from "recharts";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v134 — Manuel Telegram Eşleştirme modalı. Admin, üyenin yanındaki send
// ikonuna tıklar → sayısal chat_id girer → PATCH /members/{id} ile members
// dokümanına yazılır. Bağlı üyelerde ikon amber renk + mevcut ID görünür.
function TelegramLinkModal({ member, onClose }) {
  const [chatId, setChatId] = useState(member.telegram_chat_id || "");
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e?.preventDefault?.();
    const trimmed = (chatId || "").trim();
    if (trimmed && !/^-?\d+$/.test(trimmed)) {
      toast.error("Telegram ID sadece sayı olmalı (ör: 123456789)");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/members/${member.id}`, { telegram_chat_id: trimmed || "" });
      toast.success(trimmed ? "Telegram ID kaydedildi" : "Telegram bağlantısı kaldırıldı");
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      onClose();
    } catch (err) {
      toast.error(apiErr(err));
    } finally { setSaving(false); }
  };
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="telegram-link-modal"
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-sm p-5 relative"
        data-testid="telegram-link-form"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-base font-bold uppercase gold-text mb-1 flex items-center gap-2">
          <Send className="w-4 h-4" style={{ color: "#38BDF8" }} /> Telegram Eşleştir
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          <strong className="text-white">{member.name}</strong> için Telegram chat_id gir. Bot @TiTaNXiS_BoT'a `/start` yazan üyenin ID'sini kullan.
        </p>
        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Telegram ID</label>
        <input
          type="text"
          inputMode="numeric"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="ör: 123456789"
          data-testid="telegram-link-input"
          autoFocus
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono"
        />
        {member.telegram_chat_id && (
          <p className="text-[10px] text-amber-300 mt-2">
            🔗 Mevcut ID: <span className="mono">{member.telegram_chat_id}</span> — değiştir ya da boş bırakıp kaydet, bağlantı kalksın.
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          data-testid="telegram-link-save"
          className="btn-gold w-full mt-4"
          style={{ background: "linear-gradient(135deg,#0EA5E9,#0369A1)", borderColor: "#38BDF8" }}
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </form>
    </div>
  );
}

// Per-alliance Global / Sunucu toggle. Renders admin-only inside the alliance
// header. Persists via POST /alliances/{name}/scope which cascades the new
// scope to every member of the alliance in a single Mongo update.
function AllianceScopeToggle({ name }) {
  const { t } = useTranslation();
  const { data: scopes = {} } = useSWR("/alliance-scopes", fetcher, { refreshInterval: 30000 });
  const active = scopes[name] || "server";
  const setScope = async (next, e) => {
    e.stopPropagation();
    if (next === active) return;
    try {
      const r = await api.post(`/alliances/${encodeURIComponent(name)}/scope`, { scope: next });
      toast.success(`${name} → ${next === "global" ? "🌍 Global" : "🖥️ Sunucu"} (${r.data.members_updated} üye)`);
      await Promise.all([mutate("/alliance-scopes"), mutate((k) => typeof k === "string" && k.startsWith("/members"), undefined, { revalidate: true })]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("alliance_scope_update_failed"));
    }
  };
  return (
    <CanEdit>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid={`alliance-scope-${name}`}
        className="flex items-center gap-0.5 rounded-md overflow-hidden"
        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)" }}
      >
        {[
          { key: "global", label: "🌍", color: "#38BDF8", title: "Global" },
          { key: "server", label: "🖥️", color: "#F5A623", title: t("scope_server") },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            data-testid={`alliance-scope-${name}-${opt.key}`}
            onClick={(e) => setScope(opt.key, e)}
            title={opt.title}
            className="px-1.5 py-0.5 text-[11px] font-bold transition-colors"
            style={{
              background: active === opt.key ? `${opt.color}33` : "transparent",
              color: active === opt.key ? opt.color : "rgba(255,255,255,0.55)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </CanEdit>
  );
}

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
  // v134 — Manuel Telegram Eşleştirme modal state
  const [telegramLinkMember, setTelegramLinkMember] = useState(null);
  const [adminNoteMember, setAdminNoteMember] = useState(null); // v135.6
  const [profileId, setProfileId] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  // OCR alt modları: "power" = sadece güç kaydı, "castle_rank" = kale+rank kaydı.
  // Farklı ekranlar farklı sütunlar gösterir; backend /members/batch-create tek endpoint.
  const [ocrSubMode, setOcrSubMode] = useState("power");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterAlliances, setFilterAlliances] = useState([]);
  const [filterRanks, setFilterRanks] = useState([]);
  const [filterCountries, setFilterCountries] = useState(() => {
    try {
      const raw = localStorage.getItem("titanxis_members_filter_countries_v1");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  // Bulk-selection mode: when active, cards get a checkbox and a toolbar
  // appears with quick actions (currently: bulk-assign country).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkCountry, setBulkCountry] = useState("");
  const [sortMode, setSortMode] = useState("default");
  const [colorPickerAlliance, setColorPickerAlliance] = useState(null);
  const [renamingAlliance, setRenamingAlliance] = useState(null); // { old, next }
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [showCastleStats, setShowCastleStats] = useState(false);
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
  // v62 — Guild Health Score (0-100) per member. Admin-only endpoint; falls
  // back to empty map for non-admin viewers so `healthById[m.id]` stays undef.
  const { data: healthScores = [] } = useSWR(user?.is_admin ? "/health-scores?days=90" : null, fetcher, { refreshInterval: 60000 });
  const healthById = useMemo(() => {
    const m = {};
    (healthScores || []).forEach((h) => { if (h && h.member_id) m[h.member_id] = h; });
    return m;
  }, [healthScores]);
  // v64 — Guild Health Score detay modal (30/90/180 gün radar karşılaştırma).
  const [healthDetailMember, setHealthDetailMember] = useState(null);
  const { data: allianceStatsTop = [] } = useSWR("/alliances/stats", fetcher);
  const allianceCategoryMap = useMemo(() => {
    const m = {};
    (allianceStatsTop || []).forEach((a) => { if (a && a.name) m[a.name] = a.category || null; });
    return m;
  }, [allianceStatsTop]);
  const { data: alliancesList = [] } = useSWR("/alliances", fetcher);
  // v121 — RSVP consecutive-yes streak lookup. Only members whose linked
  // app-user has streak >= 5 are returned; empty map otherwise so the
  // 🔥 chip renders zero-cost for the common case.
  const { data: streakByMember = {} } = useSWR("/members/rsvp-streaks", fetcher, { refreshInterval: 60000 });
  const { data: castleStats } = useSWR(showCastleStats ? "/members/castle-stats" : null, fetcher, { refreshInterval: 30000 });

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
    if (filterCountries.length) {
      filtered = filtered.filter((m) => filterCountries.includes((m.country || "").toUpperCase()));
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
  const activeFilterCount = filterAlliances.length + filterRanks.length + filterCountries.length + (sortMode !== "default" ? 1 : 0);

  const clearFilters = () => {
    setFilterAlliances([]);
    setFilterRanks([]);
    setFilterCountries([]);
    setSortMode("default");
  };

  // Persist country filter across reloads.
  useEffect(() => {
    try {
      localStorage.setItem("titanxis_members_filter_countries_v1", JSON.stringify(filterCountries));
    } catch {}
  }, [filterCountries]);

  // Active countries = ISO2 codes that appear in ≥1 member (memoised).
  // Sorted by member count desc so the busiest country chip surfaces first.
  const activeCountries = useMemo(() => {
    const counts = {};
    members.forEach((m) => {
      const c = (m.country || "").toUpperCase();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([iso, count]) => ({ iso, count, meta: COUNTRY_BY_ISO2[iso] }));
  }, [members]);

  const toggleCountryFilter = (iso) => {
    setFilterCountries((prev) => prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso]);
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(grouped.flatMap((g) => g.members.map((m) => m.id))));
  };

  const applyBulkCountry = async () => {
    if (selectedIds.size === 0) { toast.error(t("bulk_country_select_first")); return; }
    try {
      const res = await api.post("/members/bulk-country", {
        member_ids: [...selectedIds],
        country: bulkCountry || null,
      });
      toast.success(t("bulk_country_done", { count: res.data?.modified ?? 0 }));
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      mutate("/dashboard/member-locations");
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const [bulkRank, setBulkRank] = useState("R3");
  const applyBulkRank = async () => {
    if (selectedIds.size === 0) { toast.error(t("bulk_country_select_first")); return; }
    try {
      const res = await api.post("/members/bulk-rank", {
        member_ids: [...selectedIds],
        rank: bulkRank,
      });
      toast.success(t("bulk_rank_done", { count: res.data?.modified ?? 0, rank: bulkRank }));
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const [bulkAlliance, setBulkAlliance] = useState("");
  const applyBulkAlliance = async () => {
    if (selectedIds.size === 0) { toast.error(t("bulk_country_select_first")); return; }
    if (!bulkAlliance) { toast.error(t("bulk_alliance_select_first")); return; }
    try {
      const res = await api.post("/members/bulk-alliance", {
        member_ids: [...selectedIds],
        alliance_name: bulkAlliance,
      });
      toast.success(t("bulk_alliance_done", { count: res.data?.modified ?? 0, alliance: bulkAlliance }));
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      mutate("/alliances");
      mutate("/alliances/stats");
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  return (
    <div data-testid={MEMBERS.container}>
      <Header title={t("members")}>
        <div className="flex items-center justify-end gap-2 flex-wrap">
            <CanEdit>
              <button
                data-testid="members-guild-csv-btn"
                onClick={async () => {
                  try {
                    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/reports/guild-data.csv`, {
                      credentials: "include",
                      headers: { Authorization: `Bearer ${localStorage.getItem("ol_token") || ""}` },
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `guild_data_${new Date().toISOString().slice(0, 10)}.csv`;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                    toast.success("Guild Data CSV indirildi");
                  } catch (e) {
                    toast.error(e.message || "CSV indirilemedi");
                  }
                }}
                className="chip text-xs flex items-center gap-1.5"
                style={{ borderColor: "rgba(34,197,94,0.5)", color: "#86EFAC" }}
                title="Tüm üye + puan verisini CSV olarak indir"
              >
                <Download className="w-3.5 h-3.5" /> Guild CSV
              </button>
              <button
                data-testid="members-ocr-power-btn"
                onClick={() => { setOcrSubMode("power"); setOcrOpen(true); }}
                className="chip text-xs flex items-center gap-1.5"
                style={{ borderColor: "rgba(249,115,22,0.5)", color: "#FDBA74" }}
                title="Bireysel Güç OCR — ekran görüntüsünden güç kaydet"
              >
                <Camera className="w-3.5 h-3.5" /> Güç OCR
              </button>
              <button
                data-testid="members-ocr-castle-btn"
                onClick={() => { setOcrSubMode("castle_rank"); setOcrOpen(true); }}
                className="chip text-xs flex items-center gap-1.5"
                style={{ borderColor: "rgba(244,114,182,0.5)", color: "#F9A8D4" }}
                title="Kale & Rank OCR — ekran görüntüsünden kale seviyesi + rütbe kaydet"
              >
                <Camera className="w-3.5 h-3.5" /> Kale/Rank OCR
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
      </Header>

      <div className="px-4">
        {showCastleStats && (
          <CastleStatsCard stats={castleStats} onClose={() => setShowCastleStats(false)} t={t} />
        )}

        {selectionMode && (
          <div
            data-testid="members-bulk-toolbar"
            className="flex items-center gap-2 mb-3 p-2 rounded-lg flex-wrap"
            style={{
              background: "linear-gradient(180deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 100%)",
              border: "1px solid rgba(139,92,246,0.4)",
            }}
          >
            <span className="text-[11px] font-bold" style={{ color: "#C4B5FD" }}>
              {t("bulk_selected_count", { count: selectedIds.size })}
            </span>
            <button
              type="button"
              data-testid="bulk-select-all-visible"
              onClick={selectAllVisible}
              className="chip text-[10px]"
            >
              {t("bulk_select_all_visible")}
            </button>
            <button
              type="button"
              data-testid="bulk-clear-selection"
              onClick={() => setSelectedIds(new Set())}
              className="chip text-[10px]"
              disabled={selectedIds.size === 0}
              style={selectedIds.size === 0 ? { opacity: 0.4 } : {}}
            >
              {t("bulk_clear")}
            </button>
            <div className="flex items-center gap-1.5 ml-auto">
              <select
                data-testid="bulk-country-select"
                value={bulkCountry}
                onChange={(e) => setBulkCountry(e.target.value)}
                className="rounded px-2 py-1.5 text-[11px]"
                style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(139,92,246,0.55)" }}
              >
                <option value="">— {t("bulk_country_clear")} —</option>
                {COUNTRIES.map((c) => (
                  <option key={c.iso2} value={c.iso2}>
                    {c.flag}  {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="bulk-country-apply"
                onClick={applyBulkCountry}
                disabled={selectedIds.size === 0}
                className="btn-gold text-[11px] flex items-center gap-1.5"
                style={selectedIds.size === 0 ? { opacity: 0.4 } : {}}
              >
                <Globe className="w-3.5 h-3.5" /> {t("bulk_country_apply")}
              </button>
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-2 pl-2 sm:border-l border-white/10">
              <label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#F5A623" }}>
                {t("bulk_rank_label")}:
              </label>
              <div className="flex gap-1">
                {RANKS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-testid={`bulk-rank-${r}`}
                    onClick={() => setBulkRank(r)}
                    className={`chip text-[10px] ${bulkRank === r ? "active" : ""}`}
                    style={{ minWidth: 28, justifyContent: "center" }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button
                type="button"
                data-testid="bulk-rank-apply"
                onClick={applyBulkRank}
                disabled={selectedIds.size === 0}
                className="btn-gold text-[11px] flex items-center gap-1.5"
                style={selectedIds.size === 0 ? { opacity: 0.4 } : {}}
              >
                <Shield className="w-3.5 h-3.5" /> {t("bulk_rank_apply")}
              </button>
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-2 pl-2 sm:border-l border-white/10">
              <label className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#F5A623" }}>
                {t("bulk_alliance_label")}:
              </label>
              <select
                data-testid="bulk-alliance-select"
                value={bulkAlliance}
                onChange={(e) => setBulkAlliance(e.target.value)}
                className="rounded px-2 py-1.5 text-[11px]"
                style={{ background: "#1A1210", color: "#F5F0E8", border: "1px solid rgba(139,92,246,0.55)", minWidth: 120 }}
              >
                <option value="">— {t("bulk_alliance_pick")} —</option>
                {(alliancesList || []).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button
                type="button"
                data-testid="bulk-alliance-apply"
                onClick={applyBulkAlliance}
                disabled={selectedIds.size === 0 || !bulkAlliance}
                className="btn-gold text-[11px] flex items-center gap-1.5"
                style={(selectedIds.size === 0 || !bulkAlliance) ? { opacity: 0.4 } : {}}
              >
                <GraduationCap className="w-3.5 h-3.5" /> {t("bulk_alliance_apply")}
              </button>
            </div>
          </div>
        )}

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
                  {(() => {
                    const cat = allianceCategoryMap[grp.name];
                    if (cat !== "main" && cat !== "academy") return null;
                    const isMain = cat === "main";
                    return (
                      <span
                        data-testid={`alliance-cat-badge-${grp.name}`}
                        className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{
                          background: isMain ? "rgba(245,166,35,0.22)" : "rgba(56,189,248,0.22)",
                          color: isMain ? "#F5A623" : "#38BDF8",
                          border: `1px solid ${isMain ? "#F5A623" : "#38BDF8"}`,
                          letterSpacing: "0.14em",
                        }}
                        title={isMain ? t("alliance_main") : t("alliance_academy")}
                      >
                        {isMain ? <Shield className="w-2.5 h-2.5" /> : <GraduationCap className="w-2.5 h-2.5" />}
                        {isMain ? "ANA" : "AKADEMİ"}
                      </span>
                    );
                  })()}
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
                    {grp.name && grp.name !== "Gruplandırılmamış" && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setRenamingAlliance({ old: grp.name, next: grp.name }); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setRenamingAlliance({ old: grp.name, next: grp.name });
                          }
                        }}
                        data-testid={`alliance-rename-btn-${grp.name}`}
                        aria-label={t("alliance_rename_tooltip")}
                        title={t("alliance_rename_tooltip")}
                        className="w-6 h-6 rounded-full flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-white" />
                      </span>
                    )}
                  </CanEdit>
                  <AllianceScopeToggle name={grp.name} />
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
                                  onClick={() => selectionMode ? toggleSelected(m.id) : setProfileId(m.id)}
                                  className={`rank-badge rank-${m.rank} flex-shrink-0 ${selectionMode && selectedIds.has(m.id) ? "ring-2 ring-violet-400" : ""}`}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    fontSize: 10,
                                    borderRadius: 5,
                                    fontWeight: 800,
                                    outline: selectionMode && selectedIds.has(m.id) ? "2px solid #A78BFA" : "none",
                                    outlineOffset: 1,
                                  }}
                                  title={selectionMode ? t("bulk_toggle_row") : `${t("rank")} ${m.rank}`}
                                  data-testid={selectionMode ? `bulk-toggle-${m.id}` : undefined}
                                >
                                  {selectionMode
                                    ? (selectedIds.has(m.id) ? <Check className="w-3 h-3 mx-auto" /> : m.rank)
                                    : m.rank}
                                </button>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => selectionMode ? toggleSelected(m.id) : setProfileId(m.id)}>
                                  <div className="flex items-start gap-1.5 min-w-0 flex-wrap">
                                    <CanEdit
                                      fallback={m.country && COUNTRY_BY_ISO2[m.country] ? (
                                        <span
                                          className="flex-shrink-0"
                                          style={{ fontSize: 11 }}
                                          title={COUNTRY_BY_ISO2[m.country].name}
                                          data-testid={`member-flag-${m.id}`}
                                        >
                                          {COUNTRY_BY_ISO2[m.country].flag}
                                        </span>
                                      ) : null}
                                    >
                                      <InlineCountryPicker
                                        memberId={m.id}
                                        currentIso={m.country}
                                        size={11}
                                      />
                                    </CanEdit>
                                    <span
                                      className="text-white leading-tight normal-case"
                                      style={{
                                        textTransform: "none",
                                        fontSize: displayPrefs.nameSize,
                                        fontFamily: NAME_FONTS[displayPrefs.nameFamily] || NAME_FONTS.default,
                                        fontWeight: displayPrefs.nameBold ? 700 : 500,
                                        fontStyle: displayPrefs.nameItalic ? "italic" : "normal",
                                        // v135.2 — İsim artık kesilmez: 2+
                                        // satıra sarılabilir, en fazla mevcut
                                        // konteynere göre genişler. Butonlar
                                        // sağda `flex-shrink-0` ile sabit
                                        // kalırken parent'ın `flex-1 min-w-0`
                                        // container'ı kalan alanı doldurur.
                                        whiteSpace: "normal",
                                        overflow: "visible",
                                        wordBreak: "break-word",
                                        overflowWrap: "anywhere",
                                        flex: "1 1 auto",
                                        minWidth: 0,
                                      }}
                                      title={m.name}
                                      data-testid={`member-name-${m.id}`}
                                    >
                                      {m.name}
                                    </span>
                                    {healthById[m.id] && <HealthChip health={healthById[m.id]} memberId={m.id} onOpen={() => setHealthDetailMember(m)} />}
                                    {/* v121 — RSVP streak fire badge.
                                        Renders only when the linked user
                                        has consecutively said "yes" >=5
                                        times. Small chip, amber-red glow,
                                        tooltip surfaces the exact count. */}
                                    {streakByMember[m.id] && (
                                      <span
                                        data-testid={`member-rsvp-streak-${m.id}`}
                                        className="inline-flex items-center gap-0.5 rounded-full flex-shrink-0"
                                        title={`Üst üste ${streakByMember[m.id]} etkinliğe Evet dedi`}
                                        style={{
                                          padding: "1px 5px",
                                          fontSize: 9,
                                          fontWeight: 800,
                                          background: "linear-gradient(135deg, rgba(245,166,35,0.35), rgba(231,76,26,0.35))",
                                          color: "#FFF7ED",
                                          border: "1px solid rgba(245,166,35,0.7)",
                                          boxShadow: "0 0 6px rgba(245,166,35,0.55)",
                                          letterSpacing: "0.04em",
                                        }}
                                      >
                                        <Flame className="w-2.5 h-2.5" style={{ color: "#FFB347" }} />
                                        {streakByMember[m.id]}
                                      </span>
                                    )}
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
                                    {/* v135.6 — Admin-only gizli not butonu.
                                        Amber ikon+glow "not var" durumunda,
                                        slate ikon boş durumda. AdminNoteModal
                                        yalnızca adminlere açılır. */}
                                    <button
                                      data-testid={`member-admin-note-btn-${m.id}`}
                                      onClick={() => setAdminNoteMember(m)}
                                      className="rounded flex items-center justify-center"
                                      style={{
                                        width: 22, height: 22,
                                        background: m.admin_note ? "rgba(245,166,35,0.25)" : "rgba(148,163,184,0.12)",
                                        color: m.admin_note ? "#F5A623" : "#94A3B8",
                                        border: m.admin_note ? "1px solid rgba(245,166,35,0.55)" : "1px solid rgba(148,163,184,0.30)",
                                        boxShadow: m.admin_note ? "0 0 6px rgba(245,166,35,0.45)" : "none",
                                      }}
                                      title={m.admin_note ? "Gizli not var (adminler görebilir)" : "Gizli not ekle"}
                                      aria-label="Gizli Admin Notu"
                                    >
                                      <StickyNote style={{ width: 11, height: 11 }} />
                                    </button>
                                    <button
                                      data-testid={`member-telegram-btn-${m.id}`}
                                      onClick={() => setTelegramLinkMember(m)}
                                      className="rounded flex items-center justify-center"
                                      style={{
                                        width: 22, height: 22,
                                        background: m.telegram_chat_id ? "rgba(245,166,35,0.25)" : "rgba(56,189,248,0.15)",
                                        color: m.telegram_chat_id ? "#F5A623" : "#38BDF8",
                                        border: m.telegram_chat_id ? "1px solid rgba(245,166,35,0.55)" : "1px solid rgba(56,189,248,0.35)",
                                        boxShadow: m.telegram_chat_id ? "0 0 6px rgba(245,166,35,0.45)" : "none",
                                      }}
                                      title={m.telegram_chat_id ? `Telegram bağlı: ${m.telegram_chat_id}` : "Telegram ID eşle"}
                                      aria-label="Telegram Eşleştir"
                                    >
                                      <Send style={{ width: 11, height: 11 }} />
                                    </button>
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

      {renamingAlliance && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setRenamingAlliance(null)}
          data-testid="alliance-rename-modal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-red-gold p-5 w-full max-w-sm"
          >
            <h3 className="gold-text uppercase text-sm mb-3">
              '{renamingAlliance.old}' Yeniden Adlandır
            </h3>
            <input
              autoFocus
              value={renamingAlliance.next}
              onChange={(e) => setRenamingAlliance({ ...renamingAlliance, next: e.target.value })}
              data-testid="alliance-rename-input"
              className="w-full px-3 py-2 rounded bg-black/40 border border-amber-500/30 text-white text-sm"
              placeholder={t("alliance_rename_placeholder")}
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="chip text-xs flex-1"
                onClick={() => setRenamingAlliance(null)}
                data-testid="alliance-rename-cancel"
              >
                İptal
              </button>
              <button
                type="button"
                className="btn-gold text-xs flex-1"
                data-testid="alliance-rename-save"
                onClick={async () => {
                  const next = (renamingAlliance.next || "").trim();
                  if (!next) return;
                  try {
                    const res = await api.post("/alliances/rename", {
                      old_name: renamingAlliance.old,
                      new_name: next,
                    });
                    toast.success(`${res.data.modified} üye '${next}' ittifakına güncellendi`);
                    setRenamingAlliance(null);
                    mutate((k) => typeof k === "string" && k.startsWith("/members"));
                    mutate("/alliances");
                    mutate("/alliances/stats");
                  } catch (e) {
                    // Backend 409 → duplicate; show its Turkish message clearly.
                    const msg = e?.response?.status === 409
                      ? (e.response.data?.detail || "Bu ittifak zaten var.")
                      : apiErr(e);
                    toast.error(msg);
                  }
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
      {telegramLinkMember && (
        <TelegramLinkModal
          member={telegramLinkMember}
          onClose={() => setTelegramLinkMember(null)}
        />
      )}
      {adminNoteMember && (
        <AdminNoteModal
          member={adminNoteMember}
          onClose={() => setAdminNoteMember(null)}
          onSaved={() => mutate((k) => typeof k === "string" && k.startsWith("/members"))}
        />
      )}
      {healthDetailMember && (
        <HealthScoreDetailModal
          member={healthDetailMember}
          onClose={() => setHealthDetailMember(null)}
        />
      )}

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
        subMode={ocrSubMode}
        title={ocrSubMode === "castle_rank" ? "Kale & Rank OCR" : "Bireysel Güç OCR"}
        onApply={async (data) => {
          const rows = data.members || [];
          // Sadece o alt modun alanları gönderilir — diğer alanlar backend tarafında
          // dokunulmaz (batch-create null'ları görmezden gelir).
          const payload = rows.map((r) => ({
            name: r.name,
            alliance_tag: r.alliance_name || null,
            power: ocrSubMode === "power" ? (r.power || null) : null,
            castle_level: ocrSubMode === "castle_rank" ? (r.castle_level || null) : null,
            rank: ocrSubMode === "castle_rank" ? (r.rank || null) : null,
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
  const [scope, setScope] = useState(initial?.scope || "server");
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
  const [country, setCountry] = useState(initial?.country || "");
  const [telegramUsername, setTelegramUsername] = useState(
    (initial?.telegram_username || "").replace(/^@+/, "")
  );
  const [saving, setSaving] = useState(false);
  const { data: alliances = [] } = useSWR("/alliances", fetcher);
  // Category (main/academy) is loaded per-alliance from /alliances/stats so
  // that when you tap an existing alliance chip we pre-fill its saved category.
  const { data: allianceStats = [] } = useSWR("/alliances/stats", fetcher);
  const categoryByAlliance = useMemo(() => {
    const m = {};
    (allianceStats || []).forEach((a) => { m[a.name] = a.category || null; });
    return m;
  }, [allianceStats]);
  const [allianceCategory, setAllianceCategory] = useState(
    initial?.alliance_name ? null : null,  // start null; effect below fills it
  );
  // When the alliance name changes to one that already has a saved category,
  // reflect that in the selector; unknown alliances leave the picker as the
  // user has set it (or null).
  useEffect(() => {
    const trimmed = allianceName.trim();
    if (!trimmed) { setAllianceCategory(null); return; }
    const known = categoryByAlliance[trimmed];
    if (known !== undefined) setAllianceCategory(known);
  }, [allianceName, categoryByAlliance]);

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
        country: country || null,
        telegram_username: telegramUsername.trim().replace(/^@+/, "") || null,
        scope,
      };
      if (initial) {
        await api.patch(`/members/${initial.id}`, body);
        toast.success(t("member_updated"));
      } else {
        await api.post("/members", body);
        toast.success(t("member_added"));
      }
      // Persist category selection alongside the member save. Only fires when
      // an alliance name is present and either (a) no category is stored yet,
      // or (b) the user explicitly picked a different one.
      const trimmedAlliance = allianceName.trim();
      const currentSaved = categoryByAlliance[trimmedAlliance];
      if (trimmedAlliance && allianceCategory !== undefined && allianceCategory !== currentSaved) {
        try {
          await api.post("/alliances/set-category", {
            name: trimmedAlliance,
            category: allianceCategory,  // "main" | "academy" | null
          });
        } catch (_) { /* non-fatal — member is saved */ }
      }
      mutate((k) => typeof k === "string" && (k.startsWith("/members") || k.startsWith("/alliances")));
      mutate("/alliances/stats");
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

        {/* Category picker — Ana (main) / Akademi (academy). Only shown when
            an alliance name is filled. Selection auto-syncs on the backend
            via /alliances/set-category when the form is submitted. */}
        {allianceName.trim() && (
          <div className="flex gap-2 mt-2" data-testid="member-form-alliance-category">
            <button
              type="button"
              data-testid="member-form-cat-main"
              onClick={() => setAllianceCategory(allianceCategory === "main" ? null : "main")}
              className="chip text-[10px] flex-1 flex items-center justify-center gap-1"
              style={allianceCategory === "main" ? { background: "rgba(245,166,35,0.25)", borderColor: "#F5A623", color: "#F5A623" } : {}}
            >
              <Shield className="w-3 h-3" /> Ana İttifak
            </button>
            <button
              type="button"
              data-testid="member-form-cat-acad"
              onClick={() => setAllianceCategory(allianceCategory === "academy" ? null : "academy")}
              className="chip text-[10px] flex-1 flex items-center justify-center gap-1"
              style={allianceCategory === "academy" ? { background: "rgba(56,189,248,0.25)", borderColor: "#38BDF8", color: "#38BDF8" } : {}}
            >
              <GraduationCap className="w-3 h-3" /> Akademi
            </button>
          </div>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Kapsam (Scope)</label>
        <div className="flex gap-2" data-testid="member-form-scope">
          <button
            type="button"
            data-testid="member-form-scope-global"
            onClick={() => setScope("global")}
            className="chip text-[10px] flex-1 flex items-center justify-center gap-1"
            style={scope === "global" ? { background: "rgba(56,189,248,0.25)", borderColor: "#38BDF8", color: "#38BDF8" } : {}}
          >
            🌍 Global
          </button>
          <button
            type="button"
            data-testid="member-form-scope-server"
            onClick={() => setScope("server")}
            className="chip text-[10px] flex-1 flex items-center justify-center gap-1"
            style={scope === "server" ? { background: "rgba(245,166,35,0.25)", borderColor: "#F5A623", color: "#F5A623" } : {}}
          >
            🖥️ Sunucu
          </button>
        </div>

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

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-4">{t("member_country_label")}</label>
        <select
          data-testid="member-form-country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white outline-none"
        >
          <option value="">— {t("member_country_none")} —</option>
          {COUNTRIES.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.flag}  {c.name} ({c.iso2})
            </option>
          ))}
        </select>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-4">{t("member_telegram_label")}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">@</span>
          <input
            data-testid="member-form-telegram-username"
            type="text"
            value={telegramUsername}
            onChange={(e) => setTelegramUsername(e.target.value.replace(/^@+/, ""))}
            placeholder="PasHa"
            autoComplete="off"
            className="w-full bg-background border border-border rounded-md pl-7 pr-3 py-2 text-sm text-white mono"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug" data-testid="member-telegram-start-hint">
          ℹ️ {t("member_telegram_hint")}
        </p>

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

/** Kale Seviyesi (Castle Level) stats card. Renders totals, average, and
 *  a per-level distribution bar + Top 10 castle-level leaderboard. */
function CastleStatsCard({ stats, onClose, t }) {
  if (!stats) {
    return (
      <div
        data-testid="members-castle-stats-loading"
        className="card-red-gold p-4 mb-3 text-center text-xs text-muted-foreground"
      >
        {t("loading") || "Yükleniyor…"}
      </div>
    );
  }
  const { total_members, with_castle_level, missing, avg_level, max_level, min_level, distribution = [], top = [] } = stats;
  const coverage = total_members ? Math.round((with_castle_level / total_members) * 100) : 0;
  const maxBucketCount = distribution.reduce((m, d) => Math.max(m, d.count), 0) || 1;

  return (
    <div
      data-testid="members-castle-stats-card"
      className="card-red-gold p-3 mb-3 space-y-3"
      style={{ borderLeft: "4px solid #F5A623" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Castle className="w-4 h-4" style={{ color: "#F5A623" }} />
          <span className="text-xs font-bold uppercase tracking-widest gold-text">
            {t("castle_level")} — {t("stats") || "İstatistik"}
          </span>
        </div>
        <button
          data-testid="members-castle-stats-close"
          onClick={onClose}
          className="chip text-[10px] flex items-center gap-1"
          aria-label={t("close") || "Kapat"}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatChip label={t("average") || "Ortalama"} value={avg_level} color="#93C5FD" />
        <StatChip label="Max" value={max_level} color="#22C55E" />
        <StatChip label={t("missing") || "Eksik"} value={missing} color="#EF4444" />
      </div>

      {distribution.length > 0 && (
        <div className="space-y-1" data-testid="members-castle-distribution">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            {t("distribution") || "Seviyeye Göre Dağılım"} ({min_level}–{max_level})
          </div>
          <div className="flex items-end gap-1 h-16">
            {distribution.map((d) => {
              const h = Math.max(4, Math.round((d.count / maxBucketCount) * 100));
              return (
                <div key={d.level} className="flex-1 flex flex-col items-center gap-0.5"
                     data-testid={`castle-bucket-${d.level}`}
                     title={`Seviye ${d.level}: ${d.count} üye`}>
                  <div className="text-[9px] font-bold text-white">{d.count}</div>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${h}%`,
                      background: "linear-gradient(180deg, #F5A623 0%, #DC2626 100%)",
                    }}
                  />
                  <div className="text-[9px] text-muted-foreground">F{d.level}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {top.length > 0 && (
        <div className="space-y-1" data-testid="members-castle-top">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            {t("top_castles") || "En Yüksek Kale — TOP 10"}
          </div>
          <div className="space-y-1">
            {top.map((m, i) => (
              <div
                key={m.id}
                data-testid={`castle-top-row-${i}`}
                className="flex items-center gap-2 px-2 py-1 rounded"
                style={{
                  background: i === 0 ? "rgba(245,166,35,0.15)" :
                              i < 3   ? "rgba(245,166,35,0.08)" :
                                        "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(245,166,35,0.2)",
                }}
              >
                <div className="text-[10px] font-bold w-5 text-center"
                     style={{ color: i < 3 ? "#F5A623" : "#9ca3af" }}>
                  {i + 1}
                </div>
                <div className="flex-1 text-xs text-white truncate">{m.name}</div>
                {m.alliance_name && (
                  <div className="text-[9px] text-muted-foreground truncate max-w-[60px] opacity-80">
                    {m.alliance_name}
                  </div>
                )}
                <div className="text-xs font-bold" style={{ color: "#F5A623" }}>
                  F{m.castle_level}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, sub, color }) {
  return (
    <div className="card-dark p-2 text-center rounded"
         style={{ border: `1px solid ${color}33` }}>
      <div className="text-lg font-bold leading-tight" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      {sub && <div className="text-[9px] font-bold" style={{ color: `${color}CC` }}>{sub}</div>}
    </div>
  );
}

// v62 — Guild Health Score chip (0-100). Renders inline next to member name.
// Color bands: 80+ neon green, 60-79 gold, 40-59 orange, <40 red.
// v64 — Clickable: `onOpen` opens the radar detay modal.
function HealthChip({ health, memberId, onOpen }) {
  const s = Number(health?.score ?? 0);
  const b = health?.breakdown || {};
  let color, glow, label;
  if (s >= 80) {
    color = "#22C55E"; glow = "rgba(34,197,94,0.55)"; label = "S";
  } else if (s >= 60) {
    color = "#F5A623"; glow = "rgba(245,166,35,0.55)"; label = "A";
  } else if (s >= 40) {
    color = "#F97316"; glow = "rgba(249,115,22,0.55)"; label = "B";
  } else {
    color = "#EF4444"; glow = "rgba(239,68,68,0.55)"; label = "C";
  }
  const title = `Guild Health Score: ${s.toFixed(1)}/100 (${label})
• RSVP: %${b.rsvp_rate ?? 0} (${b.yes_late ?? 0}/${b.eligible_events ?? 0})
• Katılım: %${b.attendance_rate ?? 0} (${b.attended ?? 0} check-in)
• Puan Tutarlılığı: %${b.consistency ?? 0} (${b.point_events ?? 0} etkinlik)
Son 90 gün — üstteki oranlar 0.35/0.35/0.30 ağırlıklı
Detay için tıkla`;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (onOpen) onOpen(); }}
      data-testid={`health-chip-${memberId}`}
      title={title}
      className="mono flex-shrink-0 hover:scale-110 transition-transform"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.06em",
        color,
        border: `1px solid ${color}`,
        background: `radial-gradient(circle at 30% 30%, ${color}22 0%, transparent 70%)`,
        boxShadow: `0 0 6px ${glow}`,
        fontFamily: "Cinzel, Rajdhani, serif",
        lineHeight: 1.2,
        cursor: "pointer",
      }}
    >
      <span style={{ opacity: 0.75, fontSize: 8 }}>♥</span>
      {Math.round(s)}
    </button>
  );
}

// ============================================================
// v64 — Guild Health Score Detay Modal
// 30 / 90 / 180 günlük skorları paralel çeker, üç dönemi bir
// RadarChart üzerinde karşılaştırır. Boyutlar: RSVP, Katılım,
// Tutarlılık. Trend satırı en altta.
// ============================================================
function HealthScoreDetailModal({ member, onClose }) {
  const { t } = useTranslation();
  const mid = member?.id;
  const { data: d30 } = useSWR(mid ? `/health-scores?days=30` : null, fetcher);
  const { data: d90 } = useSWR(mid ? `/health-scores?days=90` : null, fetcher);
  const { data: d180 } = useSWR(mid ? `/health-scores?days=180` : null, fetcher);

  const pickMember = (arr) => (arr || []).find((h) => h.member_id === mid);
  const h30 = pickMember(d30);
  const h90 = pickMember(d90);
  const h180 = pickMember(d180);

  const radarData = useMemo(() => ([
    {
      dim: "RSVP",
      "30 gün": h30?.breakdown?.rsvp_rate || 0,
      "90 gün": h90?.breakdown?.rsvp_rate || 0,
      "180 gün": h180?.breakdown?.rsvp_rate || 0,
    },
    {
      dim: t("health_dim_participation"),
      "30 gün": h30?.breakdown?.attendance_rate || 0,
      "90 gün": h90?.breakdown?.attendance_rate || 0,
      "180 gün": h180?.breakdown?.attendance_rate || 0,
    },
    {
      dim: t("health_dim_consistency"),
      "30 gün": h30?.breakdown?.consistency || 0,
      "90 gün": h90?.breakdown?.consistency || 0,
      "180 gün": h180?.breakdown?.consistency || 0,
    },
  ]), [h30, h90, h180]);

  const trend = (a, b) => {
    if (a == null || b == null) return null;
    const d = a - b;
    if (d > 2) return { label: "↑", color: "#22C55E" };
    if (d < -2) return { label: "↓", color: "#EF4444" };
    return { label: "→", color: "#94A3B8" };
  };
  const trend30v90 = trend(h30?.score, h90?.score);
  const trend90v180 = trend(h90?.score, h180?.score);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center p-3 sm:p-6"
      style={{ zIndex: 999997 }}
      onClick={onClose}
      data-testid="health-detail-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="health-detail-modal"
        className="w-full max-w-3xl max-h-[92vh] overflow-auto rounded-2xl fade-in"
        style={{
          background: "linear-gradient(180deg, #0F0716 0%, #14081F 40%, #08040E 100%)",
          border: "1px solid rgba(212,175,55,0.45)",
          boxShadow: "0 20px 60px -10px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,220,150,0.10)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 sticky top-0"
          style={{
            background: "linear-gradient(90deg, #14081F, #241436 60%, #0F0716)",
            borderBottom: "1px solid rgba(212,175,55,0.35)",
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 22 }}>♥</div>
          <div className="flex-1 min-w-0">
            <div style={{ color: "#F5E7A8", fontFamily: "Cinzel, serif", letterSpacing: "0.14em", fontSize: 12, textTransform: "uppercase" }}>
              Guild Health · {member?.name}
            </div>
            <div style={{ color: "#94A3B8", fontSize: 11 }}>
              {member?.alliance_name ? `${member.alliance_name} · ` : ""}
              30/90/180 gün karşılaştırma
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-white/10" data-testid="health-detail-close">
            <X className="w-5 h-5" style={{ color: "#F5E7A8" }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Score cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "180", data: h180, label: "180 gün", trend: null },
              { key: "90", data: h90, label: "90 gün", trend: trend90v180 },
              { key: "30", data: h30, label: "30 gün", trend: trend30v90 },
            ].map((c) => (
              <div
                key={c.key}
                data-testid={`health-detail-card-${c.key}`}
                className="p-3 rounded-lg text-center"
                style={{
                  background: "linear-gradient(180deg, rgba(147,51,234,0.18), rgba(20,15,25,0.85))",
                  border: "1px solid rgba(212,175,55,0.35)",
                }}
              >
                <div className="text-[9px] uppercase tracking-widest" style={{ color: "#94A3B8", letterSpacing: "0.16em", fontFamily: "Cinzel, serif" }}>
                  {c.label}
                </div>
                <div className="mono font-bold" style={{ color: "#F5A623", fontSize: 26, textShadow: "0 0 10px rgba(245,166,35,0.55)" }}>
                  {c.data ? c.data.score.toFixed(1) : "—"}
                </div>
                {c.trend && (
                  <div className="text-[10px] font-bold" style={{ color: c.trend.color }}>{c.trend.label} vs önceki dönem</div>
                )}
              </div>
            ))}
          </div>

          {/* Radar */}
          <div className="rounded-lg p-2" style={{ background: "rgba(20,15,25,0.65)", border: "1px solid rgba(212,175,55,0.25)" }}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} outerRadius={100}>
                <PolarGrid stroke="rgba(212,175,55,0.30)" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: "#F5E7A8", fontSize: 12, fontFamily: "Cinzel, serif" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 9 }} stroke="rgba(212,175,55,0.25)" />
                <Radar name="180 gün" dataKey="180 gün" stroke="#9333EA" fill="#9333EA" fillOpacity={0.15} />
                <Radar name="90 gün" dataKey="90 gün" stroke="#F5A623" fill="#F5A623" fillOpacity={0.25} />
                <Radar name="30 gün" dataKey="30 gün" stroke="#22C55E" fill="#22C55E" fillOpacity={0.35} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#F5E7A8", fontFamily: "Cinzel, serif" }} />
                <Tooltip
                  contentStyle={{ background: "#0F0716", border: "1px solid #D4AF37", borderRadius: 6, color: "#F5F0E8", fontSize: 11 }}
                  formatter={(v) => `${v}%`}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown detail rows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            {[
              { d: h30, label: "30 gün" },
              { d: h90, label: "90 gün" },
              { d: h180, label: "180 gün" },
            ].map(({ d, label }) => (
              <div key={label} className="p-3 rounded-lg" style={{ background: "rgba(20,15,25,0.65)", border: "1px solid rgba(147,51,234,0.30)" }}>
                <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "#D4AF37", fontFamily: "Cinzel, serif", letterSpacing: "0.14em" }}>{label}</div>
                {d ? (
                  <>
                    <div className="flex justify-between"><span style={{ color: "#94A3B8" }}>Eligible</span><span className="mono" style={{ color: "#F5F0E8" }}>{d.breakdown?.eligible_events ?? 0}</span></div>
                    <div className="flex justify-between"><span style={{ color: "#94A3B8" }}>Evet/Geç</span><span className="mono" style={{ color: "#F5F0E8" }}>{d.breakdown?.yes_late ?? 0}</span></div>
                    <div className="flex justify-between"><span style={{ color: "#94A3B8" }}>Check-in</span><span className="mono" style={{ color: "#F5F0E8" }}>{d.breakdown?.attended ?? 0}</span></div>
                    <div className="flex justify-between"><span style={{ color: "#94A3B8" }}>Puanlı etkinlik</span><span className="mono" style={{ color: "#F5F0E8" }}>{d.breakdown?.point_events ?? 0}</span></div>
                  </>
                ) : (
                  <div className="text-slate-500">—</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

