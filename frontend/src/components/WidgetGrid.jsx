import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Crown, Users, Zap, Trophy, Award, Target, Timer, TrendingUp, Shield, Flame, Medal, Plus, X, Settings2, GripVertical, Maximize2, Minimize2, Square, Layers, Check, Link2Off, Palette, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { groupColor } from "@/lib/groupColors";

const fetcher = (url) => api.get(url).then((r) => r.data);
const STORAGE_KEY = "titanxis_widgets_v1";
const SIZE_KEY = "titanxis_widget_sizes_v1";
const THEME_KEY = "titanxis_widget_theme_v1";
const GROUPS_KEY = "titanxis_widget_groups_v1";
const DEFAULT_WIDGETS = ["top_member", "active_events", "total_power", "personal_points"];
const SIZE_ORDER = ["compact", "normal", "wide"];
const THEMES = ["vivid", "minimal", "mono"];
const GROUP_PALETTE = ["#F5A623", "#22C55E", "#38BDF8", "#A855F7", "#EF4444", "#EAB308", "#F97316"];
const GROUP_ICONS = ["⭐", "🔥", "⚔️", "🛡️", "🏆", "👑", "💎", "⚡", "🎯", "🎮", "🌟", "💰", "🚀", "🎨", "📊", "🔔"];

const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");
const fmtBig = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

const WIDGETS = [
  { key: "top_member", labelKey: "wg_top_member", descKey: "wg_top_member_desc", icon: Crown, color: "#F5A623" },
  { key: "active_events", labelKey: "wg_active_events", descKey: "wg_active_events_desc", icon: Trophy, color: "#E74C1A" },
  { key: "total_power", labelKey: "wg_total_power", descKey: "wg_total_power_desc", icon: Zap, color: "#A855F7" },
  { key: "member_count", labelKey: "wg_member_count", descKey: "wg_member_count_desc", icon: Users, color: "#3B82F6" },
  { key: "personal_points", labelKey: "wg_personal_points", descKey: "wg_personal_points_desc", icon: Award, color: "#22C55E" },
  { key: "personal_rank", labelKey: "wg_personal_rank", descKey: "wg_personal_rank_desc", icon: Target, color: "#F97316" },
  { key: "rally_countdown", labelKey: "wg_rally_countdown", descKey: "wg_rally_countdown_desc", icon: Timer, color: "#EF4444" },
  { key: "personal_progress", labelKey: "wg_personal_progress", descKey: "wg_personal_progress_desc", icon: TrendingUp, color: "#38BDF8" },
  { key: "alliance_snapshot", labelKey: "wg_alliance_snapshot", descKey: "wg_alliance_snapshot_desc", icon: Shield, color: "#EAB308" },
  { key: "todays_event", labelKey: "wg_todays_event", descKey: "wg_todays_event_desc", icon: Flame, color: "#DC2626" },
  { key: "alliance_top3", labelKey: "wg_alliance_top3", descKey: "wg_alliance_top3_desc", icon: Medal, color: "#F59E0B" },
  { key: "alliance_duel", labelKey: "wg_alliance_duel", descKey: "wg_alliance_duel_desc", icon: Trophy, color: "#EF4444" },
];
export const WIDGETS_META = WIDGETS;

function useEnabledWidgets() {
  const [enabled, setEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_WIDGETS;
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)); } catch {}
  }, [enabled]);
  return [enabled, setEnabled];
}

function useWidgetSizes() {
  const [sizes, setSizes] = useState(() => {
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });
  useEffect(() => {
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(sizes)); } catch {}
  }, [sizes]);
  return [sizes, setSizes];
}

function useWidgetTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw && THEMES.includes(raw)) return raw;
    } catch {}
    return "vivid";
  });
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);
  return [theme, setTheme];
}

function useWidgetGroups() {
  const [groups, setGroups] = useState(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });
  useEffect(() => {
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch {}
  }, [groups]);
  return [groups, setGroups];
}


function WidgetCard({ widgetKey, value, subtitle, extra, striped, size, theme, onCycleSize, onRemove, onClick, onDragStart, onDragOver, onDrop, dragging, t, selectMode, isSelected, onSelectToggle, groupAccent, groupIndex, groupSize }) {
  const meta = WIDGETS.find((w) => w.key === widgetKey);
  if (!meta) return null;
  const Icon = meta.icon;
  const clickable = selectMode ? true : !!onClick;
  const isCompact = size === "compact";
  const isWide = size === "wide";
  // Theme: vivid (default), minimal (muted), mono (grayscale)
  const accent = groupAccent || (theme === "mono" ? "#F5F0E8" : meta.color);
  const bgOpacity = theme === "minimal" ? 0.7 : 0.95;
  const stripeBg = striped
    ? `repeating-linear-gradient(45deg, ${accent}18, ${accent}18 6px, rgba(30,20,16,${bgOpacity}) 6px, rgba(30,20,16,${bgOpacity}) 14px)`
    : theme === "minimal"
      ? "linear-gradient(135deg, rgba(30,20,16,0.7), rgba(18,12,10,0.7))"
      : theme === "mono"
        ? "linear-gradient(135deg, rgba(24,18,14,0.95), rgba(14,10,8,0.95))"
        : "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))";
  const shadow = theme === "minimal" ? "none" : `0 4px 14px rgba(0,0,0,0.5), inset 0 0 12px ${accent}${theme === "mono" ? "0A" : "15"}`;
  const SizeIcon = size === "compact" ? Minimize2 : size === "wide" ? Maximize2 : Square;
  return (
    <div
      data-testid={`widget-${widgetKey}`}
      draggable={!selectMode}
      onDragStart={(e) => { if (selectMode) return; e.dataTransfer.effectAllowed = "move"; onDragStart(widgetKey); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(widgetKey); }}
      onDrop={(e) => { e.preventDefault(); onDrop(widgetKey); }}
      onClick={(e) => {
        // In select mode: any click on the card toggles selection
        if (selectMode) {
          if (e.target.closest("button[data-widget-action]")) return;
          onSelectToggle?.(widgetKey);
          return;
        }
        // Ignore clicks on drag handle / remove button
        if (!onClick) return;
        if (e.target.closest("button")) return;
        onClick();
      }}
      className="relative rounded-xl transition-opacity"
      style={{
        background: stripeBg,
        border: `${isSelected ? "2px" : "1px"} solid ${isSelected ? "#F5A623" : `${accent}${theme === "minimal" ? "33" : "55"}`}`,
        boxShadow: isSelected ? `0 0 0 2px rgba(245,166,35,0.35), ${shadow}` : shadow,
        cursor: selectMode ? "pointer" : (clickable ? "pointer" : "grab"),
        opacity: dragging === widgetKey ? 0.45 : 1,
        gridColumn: isWide ? "span 2" : "auto",
        padding: isCompact ? 8 : 12,
      }}
      data-size={size || "normal"}
      data-theme={theme || "vivid"}
      data-selected={isSelected ? "true" : "false"}
    >
      {selectMode && (
        <div
          data-testid={`widget-select-${widgetKey}`}
          className="absolute top-1 left-1 z-10 rounded-full flex items-center justify-center"
          style={{
            width: 16, height: 16,
            background: isSelected ? "#F5A623" : "rgba(20,12,10,0.85)",
            border: `1.5px solid ${isSelected ? "#F5A623" : "#F5F0E8"}`,
          }}
        >
          {isSelected && <Check className="w-2.5 h-2.5" style={{ color: "#0B0704" }} />}
        </div>
      )}
      {typeof groupIndex === "number" && groupSize > 1 && !selectMode && (
        <div
          data-testid={`widget-group-index-${widgetKey}`}
          className="absolute bottom-1 left-1 z-10 text-[9px] font-bold rounded px-1 leading-none py-0.5"
          style={{
            background: `${accent}33`,
            border: `1px solid ${accent}88`,
            color: accent,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.04em",
          }}
          title={t("wg_group_index_hint", { i: groupIndex, n: groupSize })}
        >
          {groupIndex}/{groupSize}
        </div>
      )}
      <div
        data-testid={`widget-drag-${widgetKey}`}
        style={{ position: "absolute", top: 6, left: 4, opacity: 0.4, cursor: "grab", color: "#F5F0E8" }}
        aria-hidden
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        data-testid={`widget-remove-${widgetKey}`}
        data-widget-action="remove"
        className="absolute top-2 right-2 rounded p-0.5 opacity-50 hover:opacity-100"
        style={{ color: "#F5F0E8" }}
        aria-label={t("wg_remove")}
      >
        <X className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onCycleSize(); }}
        data-testid={`widget-size-${widgetKey}`}
        data-widget-action="size"
        className="absolute top-2 right-7 rounded p-0.5 opacity-50 hover:opacity-100"
        style={{ color: meta.color }}
        aria-label={t("wg_size_cycle")}
        title={t(`wg_size_${size || "normal"}`)}
      >
        <SizeIcon className="w-3 h-3" />
      </button>
      <div className="flex items-center gap-2 mb-1.5 pl-4">
        <div
          className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{ width: isCompact ? 20 : 26, height: isCompact ? 20 : 26, background: `${accent}22`, border: `1px solid ${accent}80` }}
        >
          <Icon className={isCompact ? "w-3 h-3" : "w-3.5 h-3.5"} style={{ color: accent }} />
        </div>
        <div className="text-[10px] font-bold uppercase truncate" style={{ color: accent, letterSpacing: "0.06em" }}>
          {t(meta.labelKey)}
        </div>
      </div>
      <div className={`${isCompact ? "text-sm" : "text-xl"} font-bold pl-4`} style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {!isCompact && subtitle && (
        <div className="text-[10px] mt-0.5 pl-4" style={{ color: "#F5F0E8", opacity: 0.6 }}>
          {subtitle}
        </div>
      )}
      {!isCompact && extra && <div className="pl-4">{extra}</div>}
    </div>
  );
}

function useCountdown(targetIso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  const diff = target - now;
  return diff;
}

function fmtCountdown(diffMs) {
  if (diffMs === null || Number.isNaN(diffMs)) return "—";
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const core = d > 0 ? `${d}g ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return past ? `-${core}` : core;
}

// Play a short beep via WebAudio API + vibrate. Fire only once per event.
function playRallyAlert() {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  } catch {}
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1100, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.35 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.35);
      osc.stop(now + i * 0.35 + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

// Sparkline SVG for last-7-days personal points
function Sparkline({ series, color }) {
  const vals = series.map((v) => Number(v) || 0);
  const max = Math.max(1, ...vals);
  const w = 120, h = 32;
  const step = vals.length > 1 ? w / (vals.length - 1) : w;
  const points = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} data-testid="widget-sparkline" style={{ display: "block", marginTop: 2 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {vals.map((v, i) => (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(h - (v / max) * (h - 4) - 2).toFixed(1)} r="1.6" fill={color} />
      ))}
    </svg>
  );
}

function GroupContainer({ group: g, members, values, sizes, setSizes, removeWidget, setDragging, setDragOver, handleDrop, dragging, theme, groupMode, selected, toggleSelect, ungroup, setGroupName, setGroupColor, setGroupIcon, toggleGroupCollapsed, draggingGroup, setDraggingGroup, handleGroupDrop, t }) {
  const [editingName, setEditingName] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [nameDraft, setNameDraft] = useState(g.name || "");
  const [dragOverGroup, setDragOverGroup] = useState(false);
  useEffect(() => { setNameDraft(g.name || ""); }, [g.name]);
  const commitName = () => {
    setEditingName(false);
    if ((nameDraft || "") !== (g.name || "")) setGroupName(g.id, nameDraft.trim());
  };
  const isBeingDragged = draggingGroup === g.id;
  const isDropTarget = draggingGroup && draggingGroup !== g.id && dragOverGroup;
  return (
    <div
      data-testid={`widget-group-${g.id}`}
      className="rounded-xl p-2 transition-opacity"
      style={{
        gridColumn: "1 / -1",
        background: isDropTarget
          ? `linear-gradient(135deg, ${g.color}22, ${g.color}0F)`
          : `linear-gradient(135deg, ${g.color}0F, ${g.color}05)`,
        border: `${isDropTarget ? "3px" : "2px"} dashed ${g.color}${isDropTarget ? "" : "80"}`,
        boxShadow: `inset 0 0 20px ${g.color}12`,
        opacity: isBeingDragged ? 0.5 : 1,
      }}
      onDragOver={(e) => { if (draggingGroup && draggingGroup !== g.id) { e.preventDefault(); setDragOverGroup(true); } }}
      onDragLeave={() => setDragOverGroup(false)}
      onDrop={(e) => {
        if (draggingGroup && draggingGroup !== g.id) {
          e.preventDefault();
          setDragOverGroup(false);
          handleGroupDrop(g.id);
        }
      }}
    >
      <div className="flex items-center justify-between mb-1.5 px-1 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", g.id); setDraggingGroup(g.id); }}
            onDragEnd={() => { setDraggingGroup(null); setDragOverGroup(false); }}
            data-testid={`widget-group-drag-${g.id}`}
            className="cursor-grab flex-shrink-0 opacity-70 hover:opacity-100 p-0.5"
            style={{ color: g.color }}
            aria-label={t("wg_group_drag_hint")}
            title={t("wg_group_drag_hint")}
          >
            <GripVertical className="w-3 h-3" />
          </button>
          <Layers className="w-3 h-3 flex-shrink-0" style={{ color: g.color }} />
          <button
            type="button"
            onClick={() => setShowIconPicker((v) => !v)}
            data-testid={`widget-group-icon-btn-${g.id}`}
            className="text-[13px] leading-none flex-shrink-0 rounded px-1 py-0.5 hover:opacity-80"
            style={{ background: g.icon ? "transparent" : `${g.color}22`, border: `1px solid ${g.color}66`, color: g.color, minWidth: 20, minHeight: 20 }}
            aria-label={t("wg_group_pick_icon")}
            title={t("wg_group_pick_icon")}
          >
            {g.icon || "＋"}
          </button>
          {showIconPicker && (
            <div
              data-testid={`widget-group-icon-palette-${g.id}`}
              className="absolute left-0 top-full mt-1 z-20 flex flex-wrap gap-1 p-1.5 rounded-lg"
              style={{ background: "rgba(20,12,10,0.98)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 4px 14px rgba(0,0,0,0.6)", maxWidth: 200 }}
            >
              {GROUP_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => { setGroupIcon(g.id, ic); setShowIconPicker(false); toast.success(t("wg_group_icon_changed")); }}
                  data-testid={`widget-group-icon-swatch-${g.id}-${ic}`}
                  aria-label={ic}
                  className="rounded text-[15px] leading-none flex items-center justify-center hover:opacity-80"
                  style={{
                    width: 22, height: 22,
                    background: g.icon === ic ? `${g.color}44` : "transparent",
                    border: g.icon === ic ? `1.5px solid ${g.color}` : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {ic}
                </button>
              ))}
              {g.icon && (
                <button
                  type="button"
                  onClick={() => { setGroupIcon(g.id, ""); setShowIconPicker(false); }}
                  data-testid={`widget-group-icon-clear-${g.id}`}
                  className="rounded text-[10px] font-bold px-1.5 leading-none flex items-center justify-center hover:opacity-80"
                  style={{ height: 22, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444" }}
                >
                  ×
                </button>
              )}
            </div>
          )}
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") { setNameDraft(g.name || ""); setEditingName(false); }
              }}
              data-testid={`widget-group-name-input-${g.id}`}
              placeholder={t("wg_group_name_placeholder")}
              className="text-[10px] font-bold uppercase bg-transparent outline-none border-b flex-1 min-w-0 max-w-[240px] pb-0.5"
              style={{ color: g.color, borderColor: `${g.color}66`, letterSpacing: "0.08em" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              data-testid={`widget-group-name-${g.id}`}
              className="text-[10px] font-bold uppercase truncate flex items-center gap-1 hover:opacity-80"
              style={{ color: g.color, letterSpacing: "0.08em" }}
              title={t("wg_group_name_placeholder")}
            >
              <span className="truncate">{g.name?.trim() ? g.name : `${t("wg_group_label")} · ${members.length}`}</span>
              <Pencil className="w-2.5 h-2.5 opacity-60 flex-shrink-0" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 relative">
          <button
            type="button"
            onClick={() => toggleGroupCollapsed(g.id)}
            data-testid={`widget-group-collapse-${g.id}`}
            aria-pressed={!!g.collapsed}
            aria-label={g.collapsed ? t("wg_group_expand") : t("wg_group_collapse")}
            title={g.collapsed ? t("wg_group_expand") : t("wg_group_collapse")}
            className="rounded-full p-1 flex items-center justify-center"
            style={{ background: `${g.color}22`, border: `1px solid ${g.color}66` }}
          >
            {g.collapsed ? <ChevronRight className="w-2.5 h-2.5" style={{ color: g.color }} /> : <ChevronDown className="w-2.5 h-2.5" style={{ color: g.color }} />}
          </button>
          <button
            type="button"
            onClick={() => setShowPalette((v) => !v)}
            data-testid={`widget-group-color-btn-${g.id}`}
            aria-label={t("wg_group_pick_color")}
            title={t("wg_group_pick_color")}
            className="rounded-full p-1 flex items-center justify-center"
            style={{ background: `${g.color}22`, border: `1px solid ${g.color}66` }}
          >
            <Palette className="w-2.5 h-2.5" style={{ color: g.color }} />
          </button>
          {showPalette && (
            <div
              data-testid={`widget-group-palette-${g.id}`}
              className="absolute right-0 top-full mt-1 z-20 flex gap-1 p-1.5 rounded-lg"
              style={{ background: "rgba(20,12,10,0.98)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 4px 14px rgba(0,0,0,0.6)" }}
            >
              {GROUP_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setGroupColor(g.id, c); setShowPalette(false); toast.success(t("wg_group_color_changed")); }}
                  data-testid={`widget-group-palette-swatch-${g.id}-${c.replace("#","")}`}
                  aria-label={c}
                  className="rounded-full"
                  style={{
                    width: 16, height: 16,
                    background: c,
                    border: g.color === c ? "2px solid #F5F0E8" : "1px solid rgba(255,255,255,0.2)",
                    boxShadow: g.color === c ? `0 0 6px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => ungroup(g.id)}
            data-testid={`widget-group-ungroup-${g.id}`}
            className="text-[9px] font-bold uppercase flex items-center gap-1 px-1.5 py-0.5 rounded"
            style={{ background: `${g.color}22`, border: `1px solid ${g.color}66`, color: g.color, letterSpacing: "0.06em" }}
          >
            <Link2Off className="w-2.5 h-2.5" /> {t("wg_group_ungroup")}
          </button>
        </div>
      </div>
      {g.collapsed ? (
        <div
          data-testid={`widget-group-collapsed-body-${g.id}`}
          className="text-[10px] uppercase font-bold px-2 py-1.5 rounded"
          style={{ background: `${g.color}0F`, color: g.color, letterSpacing: "0.08em" }}
        >
          {t("wg_group_hidden_count", { n: members.length })}
        </div>
      ) : (
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {members.map((k, mi) => (
          <WidgetCard
            key={k}
            widgetKey={k}
            value={values[k]?.value ?? "—"}
            subtitle={values[k]?.subtitle}
            extra={values[k]?.extra}
            striped={values[k]?.striped}
            size={sizes[k] || "normal"}
            theme={theme}
            groupAccent={g.color}
            groupIndex={mi + 1}
            groupSize={members.length}
            onCycleSize={() => {
              const cur = sizes[k] || "normal";
              const next = SIZE_ORDER[(SIZE_ORDER.indexOf(cur) + 1) % SIZE_ORDER.length];
              setSizes({ ...sizes, [k]: next });
            }}
            onClick={values[k]?.onClick}
            onRemove={() => removeWidget(k)}
            onDragStart={setDragging}
            onDragOver={setDragOver}
            onDrop={handleDrop}
            dragging={dragging}
            t={t}
            selectMode={groupMode}
            isSelected={selected.includes(k)}
            onSelectToggle={toggleSelect}
          />
        ))}
      </div>
      )}
    </div>
  );
}


export default function WidgetGrid() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [enabled, setEnabled] = useEnabledWidgets();
  const [sizes, setSizes] = useWidgetSizes();
  const [theme, setTheme] = useWidgetTheme();
  const [groups, setGroups] = useWidgetGroups();
  const [picker, setPicker] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [progressModal, setProgressModal] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [draggingGroup, setDraggingGroup] = useState(null);
  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 8000 });
  const { data: lb = [] } = useSWR("/leaderboard", fetcher, { refreshInterval: 8000 });
  const { data: events = [] } = useSWR("/events?archived=false", fetcher, { refreshInterval: 30000 });
  const { data: myMember } = useSWR(
    user?.username ? `/members?search=${encodeURIComponent(user.username)}` : null,
    fetcher
  );
  // Personal progress — daily points for the last 7 days (from /members/{id}/history)
  const me = Array.isArray(myMember) ? myMember.find((m) => (m.name || "").toLowerCase() === user?.username?.toLowerCase()) : null;
  const { data: myHistory } = useSWR(me ? `/members/${me.id}/history` : null, fetcher, { refreshInterval: 60000 });
  const dailySeries = useMemo(() => {
    const buckets = Array(7).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startMs = today.getTime() - 6 * 86400000;
    const points = Array.isArray(myHistory) ? myHistory : (myHistory?.points || []);
    points.forEach((p) => {
      const d = p.date ? new Date(p.date) : null;
      if (!d) return;
      const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (dayMs < startMs || dayMs > today.getTime()) return;
      const idx = Math.round((dayMs - startMs) / 86400000);
      const val = (Number(p.points) || 0) * (Number(p.multiplier) || 1);
      buckets[idx] += val;
    });
    return buckets;
  }, [myHistory]);
  const progressSum = dailySeries.reduce((a, b) => a + b, 0);

  // Rally sound alert — fire once when countdown enters (0, 5min] window
  const alertRef = React.useRef({ armed: false, firedFor: null });

  // Find the next upcoming event (date in future, closest)
  const nextEvent = useMemo(() => {
    const nowMs = Date.now();
    const upcoming = (events || [])
      .filter((e) => e.date && new Date(e.date).getTime() > nowMs)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (upcoming.length > 0) return upcoming[0];
    // Fallback: most recent event (may be past)
    const past = (events || [])
      .filter((e) => e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return past[0] || null;
  }, [events]);
  const countdownMs = useCountdown(nextEvent?.date);

  // Arm alert every time nextEvent changes; fire once when countdown ≤ 5min & > 0.
  useEffect(() => {
    if (!nextEvent) return;
    if (alertRef.current.firedFor !== nextEvent.id) {
      alertRef.current = { armed: true, firedFor: null };
    }
  }, [nextEvent?.id]);
  useEffect(() => {
    if (!nextEvent || countdownMs === null) return;
    const FIVE_MIN = 5 * 60 * 1000;
    if (
      alertRef.current.armed &&
      alertRef.current.firedFor !== nextEvent.id &&
      countdownMs > 0 &&
      countdownMs <= FIVE_MIN &&
      enabled.includes("rally_countdown")
    ) {
      playRallyAlert();
      alertRef.current.firedFor = nextEvent.id;
      alertRef.current.armed = false;
    }
  }, [countdownMs, nextEvent, enabled]);

  const values = useMemo(() => {
    const top = lb[0];
    const myRow = me ? lb.find((r) => r.member_id === me.id) : null;
    const myRank = me ? lb.findIndex((r) => r.member_id === me.id) : -1;
    return {
      top_member: { value: top?.name || "—", subtitle: top ? `${fmtBig(top.total_points)} ${t("wg_points_short")}` : "" },
      active_events: (() => {
        // Count active + attach a color legend of unique groups (top 4)
        const now = Date.now();
        const active = (events || []).filter((e) => !e.archived);
        const groups = Array.from(new Set(active.map((e) => e.group_name).filter(Boolean))).slice(0, 4);
        return {
          value: stats?.event_count ?? active.length,
          subtitle: t("wg_events_subtitle"),
          extra: groups.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5" data-testid="widget-active-events-legend">
              {groups.map((g) => {
                const c = groupColor(g);
                return (
                  <span key={g} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                    style={{ background: `${c}22`, border: `1px solid ${c}66`, color: c, letterSpacing: "0.04em" }}>
                    <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 3, background: c }} /> {g}
                  </span>
                );
              })}
            </div>
          ) : null,
        };
      })(),
      total_power: { value: fmtBig(stats?.total_power || 0), subtitle: fmt(stats?.total_power || 0) },
      member_count: { value: stats?.member_count ?? "—", subtitle: t("wg_members_subtitle") },
      personal_points: {
        value: myRow ? fmtBig(myRow.total_points) : "—",
        subtitle: me ? me.name : t("wg_personal_hint"),
      },
      personal_rank: {
        value: myRank >= 0 ? `#${myRank + 1}` : "—",
        subtitle: me ? me.alliance_name || "" : t("wg_personal_hint"),
      },
      rally_countdown: {
        value: fmtCountdown(countdownMs),
        subtitle: nextEvent ? nextEvent.name : t("wg_no_event"),
      },
      personal_progress: {
        value: me ? fmtBig(progressSum) : "—",
        subtitle: me ? t("wg_progress_7d") : t("wg_personal_hint"),
        extra: me ? <Sparkline series={dailySeries} color="#38BDF8" /> : null,
        onClick: me ? () => setProgressModal(true) : null,
      },
      alliance_snapshot: (() => {
        const aName = me?.alliance_name;
        if (!aName) return { value: "—", subtitle: t("wg_personal_hint") };
        // Aggregate points per alliance from leaderboard (uses alliance_name field per row)
        const perAlliance = {};
        (lb || []).forEach((r) => {
          const a = r.alliance_name || "-";
          if (!perAlliance[a]) perAlliance[a] = { name: a, total: 0, count: 0 };
          perAlliance[a].total += Number(r.total_points) || 0;
          perAlliance[a].count += 1;
        });
        const sorted = Object.values(perAlliance).sort((a, b) => b.total - a.total);
        const idx = sorted.findIndex((a) => a.name === aName);
        const my = idx >= 0 ? sorted[idx] : null;
        return {
          value: my ? `#${idx + 1}` : "—",
          subtitle: my ? `${aName} · ${fmtBig(my.total)} · ${my.count} ${t("wg_members_short")}` : aName,
        };
      })(),
      todays_event: (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfToday = today.getTime() + 86400000;
        const active = (events || []).filter((e) => {
          if (!e.date) return false;
          const ts = new Date(e.date).getTime();
          return ts >= today.getTime() && ts < endOfToday;
        });
        if (active.length === 0) return { value: t("wg_todays_none"), subtitle: t("wg_todays_none_hint"), striped: true };
        const ev = active[0];
        const t2 = new Date(ev.date);
        const timeStr = `${String(t2.getHours()).padStart(2, "0")}:${String(t2.getMinutes()).padStart(2, "0")}`;
        const gc = groupColor(ev.group_name);
        return {
          value: ev.name,
          subtitle: (
            <span className="inline-flex items-center gap-1">
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: gc, boxShadow: `0 0 4px ${gc}` }} />
              {timeStr} · <span style={{ color: gc, fontWeight: 700 }}>{ev.group_name || "—"}</span>
            </span>
          ),
          striped: true,
        };
      })(),
      alliance_top3: (() => {
        const aName = me?.alliance_name;
        if (!aName) return { value: "—", subtitle: t("wg_personal_hint") };
        const top = (lb || []).filter((r) => r.alliance_name === aName).slice(0, 3);
        if (top.length === 0) return { value: aName, subtitle: t("wg_no_data") };
        return {
          value: aName,
          subtitle: t("wg_top3_subtitle"),
          extra: (
            <div className="flex flex-col gap-1 mt-1" data-testid="widget-alliance-top3-list">
              {top.map((m, i) => {
                const medal = ["#F5A623", "#C0C0C0", "#CD7F32"][i] || "#F5A623";
                const initials = (m.name || "?").slice(0, 2).toUpperCase();
                return (
                  <div key={m.member_id} className="flex items-center gap-1.5 rounded px-1.5 py-0.5"
                    style={{ background: `${medal}18`, border: `1px solid ${medal}55` }}>
                    <span className="flex items-center justify-center rounded-full font-bold flex-shrink-0"
                      style={{ width: 18, height: 18, background: medal, color: "#0B0704", fontSize: 9 }}>
                      {initials}
                    </span>
                    <span className="text-[10px] font-bold truncate flex-1" style={{ color: "#F5F0E8" }}>{m.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: medal, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBig(m.total_points)}
                    </span>
                  </div>
                );
              })}
            </div>
          ),
        };
      })(),
    };
  }, [stats, lb, me, t, nextEvent, countdownMs, progressSum, dailySeries, events]);

  const available = WIDGETS.filter((w) => !enabled.includes(w.key));

  const groupOf = (key) => groups.find((g) => g.widgets.includes(key)) || null;

  const handleDrop = (targetKey) => {
    if (!dragging || dragging === targetKey) {
      setDragging(null); setDragOver(null); return;
    }
    const srcGroup = groupOf(dragging);
    const tgtGroup = groupOf(targetKey);
    // Intra-group reorder: reorder within the same group
    if (srcGroup && tgtGroup && srcGroup.id === tgtGroup.id) {
      const reorderedWidgets = (() => {
        const arr = srcGroup.widgets.filter((k) => k !== dragging);
        const idx = arr.indexOf(targetKey);
        const safeIdx = idx < 0 ? arr.length : idx;
        return [...arr.slice(0, safeIdx), dragging, ...arr.slice(safeIdx)];
      })();
      const gs = groups.map((g) => g.id === srcGroup.id ? { ...g, widgets: reorderedWidgets } : g);
      setGroups(gs);
      // Mirror in enabled so the visual order matches localStorage
      const finalNext = [];
      let inserted = false;
      enabled.forEach((k) => {
        if (reorderedWidgets.includes(k)) {
          if (!inserted) { finalNext.push(...reorderedWidgets); inserted = true; }
        } else {
          finalNext.push(k);
        }
      });
      setEnabled(finalNext);
      setDragging(null); setDragOver(null);
      return;
    }
    const srcKeys = srcGroup ? srcGroup.widgets.filter((k) => enabled.includes(k)) : [dragging];
    let next = enabled.filter((k) => !srcKeys.includes(k));
    let anchor = targetKey;
    if (tgtGroup) {
      anchor = tgtGroup.widgets.find((k) => next.includes(k)) || targetKey;
    }
    const idx = next.indexOf(anchor);
    const safeIdx = idx < 0 ? next.length : idx;
    next = [...next.slice(0, safeIdx), ...srcKeys, ...next.slice(safeIdx)];
    setEnabled(next);
    setDragging(null);
    setDragOver(null);
  };

  const toggleSelect = (key) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const createGroup = () => {
    if (selected.length < 2) { toast.error(t("wg_group_min_two")); return; }
    // Remove selected keys from any existing groups; dissolve groups that fall below 2
    const cleaned = groups
      .map((g) => ({ ...g, widgets: g.widgets.filter((k) => !selected.includes(k)) }))
      .filter((g) => g.widgets.length >= 2);
    const usedColors = new Set(cleaned.map((g) => g.color));
    const color = GROUP_PALETTE.find((c) => !usedColors.has(c)) || GROUP_PALETTE[cleaned.length % GROUP_PALETTE.length];
    const newGroup = {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      color,
      name: "",
      icon: "",
      widgets: [...selected],
    };
    setGroups([...cleaned, newGroup]);
    // Reorder enabled so the selected widgets are contiguous at the position of the first selected
    const finalNext = [];
    let inserted = false;
    enabled.forEach((k) => {
      if (selected.includes(k)) {
        if (!inserted) { finalNext.push(...selected); inserted = true; }
      } else {
        finalNext.push(k);
      }
    });
    setEnabled(finalNext);
    setSelected([]);
    setGroupMode(false);
    toast.success(t("wg_group_created"));
  };

  const ungroup = (gid) => {
    setGroups(groups.filter((g) => g.id !== gid));
    toast.success(t("wg_group_ungrouped"));
  };

  const setGroupName = (gid, name) => {
    setGroups(groups.map((g) => g.id === gid ? { ...g, name } : g));
  };

  const setGroupColor = (gid, color) => {
    setGroups(groups.map((g) => g.id === gid ? { ...g, color } : g));
  };

  const setGroupIcon = (gid, icon) => {
    setGroups(groups.map((g) => g.id === gid ? { ...g, icon } : g));
  };

  const toggleGroupCollapsed = (gid) => {
    setGroups(groups.map((g) => g.id === gid ? { ...g, collapsed: !g.collapsed } : g));
  };

  const handleGroupDrop = (targetGid) => {
    if (!draggingGroup || draggingGroup === targetGid) { setDraggingGroup(null); return; }
    const srcIdx = groups.findIndex((g) => g.id === draggingGroup);
    const tgtIdx = groups.findIndex((g) => g.id === targetGid);
    if (srcIdx < 0 || tgtIdx < 0) { setDraggingGroup(null); return; }
    // Swap semantics: swap the two groups' positions in the groups array
    const newGroups = [...groups];
    [newGroups[srcIdx], newGroups[tgtIdx]] = [newGroups[tgtIdx], newGroups[srcIdx]];
    setGroups(newGroups);
    // Mirror in enabled: swap the two blocks of widgets
    const src = groups[srcIdx];
    const tgt = groups[tgtIdx];
    const srcMembers = src.widgets.filter((k) => enabled.includes(k));
    const tgtMembers = tgt.widgets.filter((k) => enabled.includes(k));
    const rebuilt = [];
    let emittedForSrc = false;
    let emittedForTgt = false;
    enabled.forEach((k) => {
      if (srcMembers.includes(k)) {
        if (!emittedForSrc) { rebuilt.push(...tgtMembers); emittedForSrc = true; }
      } else if (tgtMembers.includes(k)) {
        if (!emittedForTgt) { rebuilt.push(...srcMembers); emittedForTgt = true; }
      } else {
        rebuilt.push(k);
      }
    });
    setEnabled(rebuilt);
    setDraggingGroup(null);
    toast.success(t("wg_group_reordered"));
  };

  const scrollToGroup = (gid) => {
    const el = document.querySelector(`[data-testid="widget-group-${gid}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const removeWidget = (key) => {
    setEnabled(enabled.filter((k) => k !== key));
    // Update groups
    const g2 = groups
      .map((g) => ({ ...g, widgets: g.widgets.filter((k) => k !== key) }))
      .filter((g) => g.widgets.length >= 2);
    if (JSON.stringify(g2) !== JSON.stringify(groups)) setGroups(g2);
  };

  return (
    <section data-testid="widget-grid" className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3
          className="text-sm font-bold uppercase"
          style={{ color: "#F5A623", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
        >
          {t("wg_title")}
        </h3>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5" data-testid="widget-theme-strip">
            {THEMES.map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => setTheme(th)}
                data-testid={`widget-theme-${th}`}
                aria-pressed={theme === th}
                className="px-2 py-1 rounded-full text-[9px] font-bold uppercase"
                style={{
                  background: theme === th ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "rgba(30,20,16,0.6)",
                  border: `1px solid ${theme === th ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  color: theme === th ? "#0B0704" : "#F5F0E8",
                  letterSpacing: "0.06em",
                }}
              >
                {t(`wg_theme_${th}`)}
              </button>
            ))}
          </div>
          {available.length > 0 && (
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              data-testid="widget-add-btn"
              className="px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 ml-1"
              style={{ background: "linear-gradient(135deg,#7C3AED,#3B82F6)", color: "#fff" }}
            >
              {picker ? <Settings2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {picker ? t("close") : t("wg_add")}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setGroupMode((v) => !v); setSelected([]); }}
            data-testid="widget-group-mode-toggle"
            aria-pressed={groupMode}
            className="px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 ml-1"
            style={{
              background: groupMode ? "linear-gradient(135deg,#F5A623,#E74C1A)" : "rgba(30,20,16,0.6)",
              border: `1px solid ${groupMode ? "#F5A623" : "rgba(255,255,255,0.15)"}`,
              color: groupMode ? "#0B0704" : "#F5F0E8",
            }}
          >
            <Layers className="w-3 h-3" />
            {t("wg_group_mode")}
          </button>
          {groupMode && selected.length >= 2 && (
            <button
              type="button"
              onClick={createGroup}
              data-testid="widget-group-create-btn"
              className="px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 ml-1"
              style={{ background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#0B0704" }}
            >
              <Layers className="w-3 h-3" />
              {t("wg_group_create")} ({selected.length})
            </button>
          )}
        </div>
      </div>

      {groupMode && (
        <div
          className="mb-2 p-2 rounded-lg text-[10px]"
          data-testid="widget-group-hint"
          style={{ background: "rgba(245,166,35,0.08)", border: "1px dashed #F5A623", color: "#F5F0E8" }}
        >
          {selected.length === 0
            ? t("wg_group_hint_start")
            : selected.length === 1
              ? t("wg_group_hint_one_more")
              : t("wg_group_hint_ready", { count: selected.length })}
        </div>
      )}
      {picker && (
        <div
          className="flex flex-wrap gap-1.5 mb-3 p-2 rounded-lg"
          data-testid="widget-picker"
          style={{ background: "rgba(20,12,10,0.6)", border: "1px dashed rgba(168,85,247,0.4)" }}
        >
          {available.length === 0 ? (
            <span className="text-[10px] opacity-60" style={{ color: "#F5F0E8" }}>{t("wg_all_added")}</span>
          ) : available.map((w) => {
            const Icon = w.icon;
            return (
              <button
                key={w.key}
                type="button"
                onClick={() => { setEnabled([...enabled, w.key]); }}
                data-testid={`widget-pick-${w.key}`}
                className="px-2 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1"
                style={{ background: `${w.color}22`, border: `1px solid ${w.color}`, color: w.color, letterSpacing: "0.06em" }}
              >
                <Icon className="w-3 h-3" /> {t(w.labelKey)}
              </button>
            );
          })}
        </div>
      )}

      {groups.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 mb-2 px-0.5"
          data-testid="widget-group-nav"
        >
          <div className="text-[9px] font-bold uppercase self-center mr-1" style={{ color: "#8B7355", letterSpacing: "0.1em" }}>
            {t("wg_group_nav")}:
          </div>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => scrollToGroup(g.id)}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", g.id); setDraggingGroup(g.id); }}
              onDragEnd={() => setDraggingGroup(null)}
              onDragOver={(e) => { if (draggingGroup && draggingGroup !== g.id) e.preventDefault(); }}
              onDrop={(e) => {
                if (draggingGroup && draggingGroup !== g.id) {
                  e.preventDefault();
                  handleGroupDrop(g.id);
                }
              }}
              data-testid={`widget-group-chip-${g.id}`}
              className="text-[10px] font-bold uppercase flex items-center gap-1 px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing"
              style={{
                background: draggingGroup === g.id ? `${g.color}44` : `${g.color}22`,
                border: `1px solid ${g.color}66`,
                color: g.color,
                letterSpacing: "0.06em",
                opacity: draggingGroup === g.id ? 0.5 : 1,
              }}
              title={g.name?.trim() ? g.name : `${t("wg_group_label")} · ${g.widgets.length}`}
            >
              <span
                className="rounded-full flex-shrink-0"
                style={{ width: 8, height: 8, background: g.color, boxShadow: `0 0 4px ${g.color}` }}
              />
              {g.icon && <span className="text-[11px] leading-none flex-shrink-0">{g.icon}</span>}
              <span className="truncate max-w-[140px]">
                {g.name?.trim() ? g.name : `${t("wg_group_label")} · ${g.widgets.length}`}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        {(() => {
          const rendered = new Set();
          const nodes = [];
          enabled.forEach((key) => {
            const g = groupOf(key);
            if (g) {
              if (rendered.has(g.id)) return;
              rendered.add(g.id);
              const members = g.widgets.filter((k) => enabled.includes(k));
              nodes.push(
                <GroupContainer
                  key={g.id}
                  group={g}
                  members={members}
                  values={values}
                  sizes={sizes}
                  setSizes={setSizes}
                  removeWidget={removeWidget}
                  setDragging={setDragging}
                  setDragOver={setDragOver}
                  handleDrop={handleDrop}
                  dragging={dragging}
                  theme={theme}
                  groupMode={groupMode}
                  selected={selected}
                  toggleSelect={toggleSelect}
                  ungroup={ungroup}
                  setGroupName={setGroupName}
                  setGroupColor={setGroupColor}
                  setGroupIcon={setGroupIcon}
                  toggleGroupCollapsed={toggleGroupCollapsed}
                  draggingGroup={draggingGroup}
                  setDraggingGroup={setDraggingGroup}
                  handleGroupDrop={handleGroupDrop}
                  t={t}
                />
              );
            } else {
              nodes.push(
                <WidgetCard
                  key={key}
                  widgetKey={key}
                  value={values[key]?.value ?? "—"}
                  subtitle={values[key]?.subtitle}
                  extra={values[key]?.extra}
                  striped={values[key]?.striped}
                  size={sizes[key] || "normal"}
                  theme={theme}
                  onCycleSize={() => {
                    const cur = sizes[key] || "normal";
                    const next = SIZE_ORDER[(SIZE_ORDER.indexOf(cur) + 1) % SIZE_ORDER.length];
                    setSizes({ ...sizes, [key]: next });
                  }}
                  onClick={values[key]?.onClick}
                  onRemove={() => removeWidget(key)}
                  onDragStart={setDragging}
                  onDragOver={setDragOver}
                  onDrop={handleDrop}
                  dragging={dragging}
                  t={t}
                  selectMode={groupMode}
                  isSelected={selected.includes(key)}
                  onSelectToggle={toggleSelect}
                />
              );
            }
          });
          return nodes;
        })()}
        {enabled.length === 0 && (
          <div
            className="col-span-full text-center p-4 rounded-lg text-xs"
            style={{ background: "rgba(20,12,10,0.5)", border: "1px dashed rgba(255,255,255,0.15)", color: "#F5F0E8", opacity: 0.6 }}
            data-testid="widget-empty"
          >
            {t("wg_empty")}
          </div>
        )}
      </div>

      {progressModal && me && (
        <ProgressDetailModal
          series={dailySeries}
          total={progressSum}
          memberName={me.name}
          onClose={() => setProgressModal(false)}
        />
      )}
    </section>
  );
}

function ProgressDetailModal({ series, total, memberName, onClose }) {
  const { t } = useTranslation();
  const days = 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const labels = Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 86400000);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const max = Math.max(1, ...series);
  const width = 480, height = 200, pad = 28;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;
  const barW = chartW / days;
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
      data-testid="progress-detail-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl p-5 rounded-xl relative"
        style={{ background: "#1E1410", border: "1px solid #38BDF8", boxShadow: "0 8px 32px rgba(0,0,0,0.9)" }}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white" data-testid="progress-detail-close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold mb-1 uppercase flex items-center gap-2"
          style={{ color: "#E0E7FF", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
          <TrendingUp className="w-4 h-4" style={{ color: "#38BDF8" }} />
          {t("wg_progress_detail_title")}
        </h3>
        <div className="text-xs mb-3" style={{ color: "#F5F0E8", opacity: 0.7 }}>
          {memberName} · {t("wg_progress_total", { total: fmtBig(total) })}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="200" style={{ display: "block" }} data-testid="progress-detail-chart">
          {[0.25, 0.5, 0.75, 1].map((f, i) => (
            <line key={i} x1={pad} x2={width - pad} y1={height - pad - chartH * f} y2={height - pad - chartH * f}
              stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          ))}
          {series.map((v, i) => {
            const h = (Number(v) / max) * chartH;
            const x = pad + i * barW + barW * 0.15;
            const y = height - pad - h;
            const w = barW * 0.7;
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} rx="2" fill="#38BDF8" opacity="0.85" />
                <text x={x + w / 2} y={y - 4} textAnchor="middle" fill="#E0E7FF" fontSize="10">{v > 0 ? fmtBig(v) : ""}</text>
                <text x={x + w / 2} y={height - pad + 14} textAnchor="middle" fill="#F5F0E8" fontSize="10" opacity="0.7">{labels[i]}</text>
              </g>
            );
          })}
        </svg>
        <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: "repeat(7, 1fr)" }} data-testid="progress-detail-days">
          {series.map((v, i) => (
            <div key={i} className="text-center rounded p-1" style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}>
              <div className="text-[10px]" style={{ color: "#F5F0E8", opacity: 0.6 }}>{labels[i]}</div>
              <div className="text-xs font-bold" style={{ color: "#38BDF8" }}>{fmtBig(v)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
