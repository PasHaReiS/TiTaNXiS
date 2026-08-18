import React, { useState, useMemo, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { EVENTS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, Archive, X, Calendar, ArchiveRestore, Check, Camera, BellOff, Users, User, LayoutGrid, CalendarDays, CheckSquare, Square, EyeOff, Eye, Star } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ImageDropzone from "@/components/ImageDropzone";
import OcrDialog from "@/components/OcrDialog";
import EventAttendance from "@/components/EventAttendance";
import EventReminderDialog from "@/components/EventReminderDialog";
import EventCountdown from "@/components/EventCountdown";
import EventResultGallery from "@/components/EventResultGallery";
import EventCalendar from "@/components/EventCalendar";
import { BellRing, GripVertical } from "lucide-react";
import { groupColor, groupBgTint } from "@/lib/groupColors";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Events() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("reminded"); // "reminded" | "unreminded" | "archive"
  // Top-level view mode — Liste (existing list layout) vs Takvim (monthly grid).
  const [view, setView] = useState(() => {
    try { return localStorage.getItem("events_view") || "list"; } catch { return "list"; }
  });
  useEffect(() => {
    try { localStorage.setItem("events_view", view); } catch { /* private mode */ }
  }, [view]);
  // Sub-filter chips — Kolektif (grouped) / Bireysel (ungrouped). Default =
  // "all" renders both side-by-side; clicking a chip narrows to just that
  // column; clicking the active chip again toggles back to "all". Persisted
  // to localStorage so admins land on their preferred view next visit.
  const [subFilter, setSubFilter] = useState(() => {
    try {
      const v = localStorage.getItem("events_subfilter") || "all";
      // Legacy values from before rename → normalise
      if (v === "grouped") return "kolektif";
      if (v === "ungrouped") return "bireysel";
      return v;
    } catch { return "all"; }
  });
  useEffect(() => {
    try { localStorage.setItem("events_subfilter", subFilter); } catch { /* private mode */ }
  }, [subFilter]);
  // Local drag-order overrides — persisted per tab in localStorage so a
  // reorder survives reloads even without a backend round-trip. Keyed by
  // event.id so DB re-fetches don't clobber user intent.
  const ORDER_KEY = "events_manual_order_v1";
  const [manualOrder, setManualOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ORDER_KEY) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(manualOrder)); } catch { /* private mode */ }
  }, [manualOrder]);
  const [dragId, setDragId] = useState(null);
  const [dragSourceBucket, setDragSourceBucket] = useState(null);
  // Bulk-selection mode — when active every event card renders a checkbox
  // and the top-of-page toolbar exposes "Sıralama dışına al" / "Sıralamaya
  // ekle" batch actions.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [renamingGroup, setRenamingGroup] = useState(null); // group name being renamed
  const [renameValue, setRenameValue] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [reminderFor, setReminderFor] = useState(null); // event object → opens the reminder dialog
  // Archive-folder taxonomy — admins can group archived events into named
  // folders (Kupa 4, Sezon 1, vb). `folderId` narrows the archive grid to
  // one folder; "none" sentinel shows only top-level events; null shows all.
  const [folderId, setFolderId] = useState(null);
  const [showFolderMgr, setShowFolderMgr] = useState(false);
  // Sort inside the archive tab — newest first by default per user request.
  const [archiveSort, setArchiveSort] = useState("newest"); // "newest" | "oldest"
  // Drag id used to reorder folder chips via HTML5 drag-and-drop.
  const [dragFolderId, setDragFolderId] = useState(null);

  const archived = tab === "archive";
  const { data: events = [] } = useSWR(`/events?archived=${archived}`, fetcher, { refreshInterval: 6000 });
  const { data: folders = [] } = useSWR("/event-folders", fetcher, { refreshInterval: 15000 });

  const allActive = useSWR("/events?archived=false", fetcher).data || [];
  const remindedCount = allActive.filter((e) => e.reminder_enabled !== false).length;
  const unremindedCount = allActive.filter((e) => e.reminder_enabled === false).length;
  const archivedCount = useSWR("/events?archived=true", fetcher).data?.length || 0;

  const filteredEvents = useMemo(() => {
    let list = events;
    if (!archived) {
      if (tab === "reminded") list = list.filter((e) => e.reminder_enabled !== false);
      else list = list.filter((e) => e.reminder_enabled === false);
    } else {
      // Archive: apply folder filter + sort direction
      if (folderId === "none") list = list.filter((e) => !e.folder_id);
      else if (folderId) list = list.filter((e) => e.folder_id === folderId);
      const dir = archiveSort === "oldest" ? 1 : -1;
      list = [...list].sort((a, b) => dir * (new Date(b.date) - new Date(a.date)));
    }
    return list;
  }, [events, tab, archived, folderId, archiveSort]);

  // Split events into (a) grouped-by-name and (b) ungrouped so the page can
  // render two clean side-by-side columns instead of mixing them together.
  // A group_name of "", null, undefined or whitespace-only counts as ungrouped.
  const { groupedMap, ungrouped } = useMemo(() => {
    const g = {};
    const un = [];
    filteredEvents.forEach((e) => {
      const gn = (e.group_name || "").trim();
      if (gn) {
        if (!g[gn]) g[gn] = [];
        g[gn].push(e);
      } else {
        un.push(e);
      }
    });
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    un.sort((a, b) => new Date(a.date) - new Date(b.date));
    return { groupedMap: g, ungrouped: un };
  }, [filteredEvents]);
  const groupedEventCount = useMemo(
    () => Object.values(groupedMap).reduce((n, arr) => n + arr.length, 0),
    [groupedMap],
  );

  // Apply the user's manual drag-drop reorder on top of the date-sorted
  // lists. Any event not yet touched by drag keeps its original position.
  const applyManualOrder = (list, bucketKey) => {
    const order = manualOrder[bucketKey] || [];
    if (!order.length) return list;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : 9999;
      const rb = rank.has(b.id) ? rank.get(b.id) : 9999;
      if (ra !== rb) return ra - rb;
      return new Date(a.date) - new Date(b.date);
    });
  };

  // Persist a new order for a bucket after a drop event resolves.
  const reorderBucket = (bucketKey, sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setManualOrder((prev) => {
      const bucket = groupedMap[bucketKey.replace("group:", "")] || (bucketKey === "ungrouped" ? ungrouped : []);
      const currentIds = applyManualOrder(bucket, bucketKey).map((e) => e.id);
      const from = currentIds.indexOf(sourceId);
      const to = currentIds.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...currentIds];
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      // Fire-and-forget: sync per-user order to backend so a reorder on
      // desktop survives on the phone. Server is authoritative on next load.
      api.put("/users/me/event-order", { bucket_key: bucketKey, ids: next }).catch(() => { /* offline OK */ });
      return { ...prev, [bucketKey]: next };
    });
  };

  // Hydrate manual order from the backend once per mount.
  useEffect(() => {
    let cancelled = false;
    api.get("/users/me/event-order").then((r) => {
      if (cancelled) return;
      const remote = r?.data?.order || {};
      if (Object.keys(remote).length === 0) return;
      setManualOrder((prev) => ({ ...remote, ...prev }));
    }).catch(() => { /* not logged in / no order yet */ });
    return () => { cancelled = true; };
  }, []);

  // Column split percentage — persisted to localStorage. Clamped to [20,80]
  // so neither Kolektif nor Bireysel collapses to nothing.
  const [splitPct, setSplitPct] = useState(() => {
    try { return Number(localStorage.getItem("events_split_pct")) || 50; } catch { return 50; }
  });
  useEffect(() => {
    try { localStorage.setItem("events_split_pct", String(splitPct)); } catch { /* private */ }
  }, [splitPct]);
  const startResize = (ev) => {
    ev.preventDefault();
    const startX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const startPct = splitPct;
    const container = ev.currentTarget.parentElement;
    const w = container?.getBoundingClientRect().width || 800;
    const move = (mv) => {
      const cx = mv.touches ? mv.touches[0].clientX : mv.clientX;
      const dx = cx - startX;
      const nextPct = Math.min(80, Math.max(20, startPct + (dx / w) * 100));
      setSplitPct(nextPct);
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", stop);
  };

  const renderGroupedCol = () => (
    <section
      data-testid="events-grouped-column"
      onDragOver={(ev) => {
        // Accept drops from any card that started in a different bucket so
        // admins can drop onto empty header space to convert to a Kolektif.
        if (dragSourceBucket && !dragSourceBucket.startsWith("group:")) {
          ev.preventDefault();
        }
      }}
      style={
        dragSourceBucket && !dragSourceBucket.startsWith("group:")
          ? {
              outline: "2px dashed rgba(245,166,35,0.75)",
              outlineOffset: 6,
              borderRadius: 8,
              animation: "dropzone-pulse 1.1s ease-in-out infinite",
            }
          : undefined
      }
    >
      <div
        className="flex items-center gap-2 mb-3 pb-2"
        style={{ borderBottom: "1px solid rgba(245,166,35,0.22)" }}
      >
        <Users className="w-4 h-4" style={{ color: "#F5A623" }} />
        <h2 className="text-xs font-bold uppercase tracking-widest gold-text">
          Kolektif Etkinlikler
        </h2>
        <span
          className="ml-auto chip text-[10px]"
          style={{ borderColor: "rgba(245,166,35,0.45)", color: "#F5A623" }}
          data-testid="events-grouped-count"
        >
          {Object.keys(groupedMap).length} grup · {groupedEventCount}
        </span>
      </div>
      {Object.keys(groupedMap).length === 0 ? (
        <div data-testid="events-grouped-empty" className="card-dark p-4 text-center text-xs text-muted-foreground">
          Kolektif etkinlik yok
        </div>
      ) : (
        Object.entries(groupedMap).map(([group, list]) => renderGroupBlock(group, list))
      )}
    </section>
  );

  const renderUngroupedCol = () => (
    <section
      data-testid="events-ungrouped-column"
      onDragOver={(ev) => {
        if (dragSourceBucket && dragSourceBucket !== "ungrouped") ev.preventDefault();
      }}
      onDrop={(ev) => {
        if (!dragId || !dragSourceBucket || dragSourceBucket === "ungrouped") return;
        ev.preventDefault();
        api.patch(`/events/${dragId}`, { group_name: "" })
          .then(() => {
            mutate((k) => typeof k === "string" && k.startsWith("/events"));
            toast.success("→ Bireysel");
          })
          .catch((err) => toast.error(err?.response?.data?.detail || err.message));
        setDragId(null); setDragSourceBucket(null);
      }}
      style={
        dragSourceBucket && dragSourceBucket !== "ungrouped"
          ? {
              outline: "2px dashed rgba(139,92,246,0.75)",
              outlineOffset: 6,
              borderRadius: 8,
              animation: "dropzone-pulse 1.1s ease-in-out infinite",
            }
          : undefined
      }
    >
      <div
        className="flex items-center gap-2 mb-3 pb-2"
        style={{ borderBottom: "1px solid rgba(139,92,246,0.28)" }}
      >
        <User className="w-4 h-4" style={{ color: "#A78BFA" }} />
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#C4B5FD", textShadow: "0 0 6px rgba(139,92,246,0.35)" }}>
          Bireysel Etkinlikler
        </h2>
        <span
          className="ml-auto chip text-[10px]"
          style={{ borderColor: "rgba(139,92,246,0.45)", color: "#C4B5FD" }}
          data-testid="events-ungrouped-count"
        >
          {ungrouped.length}
        </span>
      </div>
      {ungrouped.length === 0 ? (
        <div data-testid="events-ungrouped-empty" className="card-dark p-4 text-center text-xs text-muted-foreground">
          Bireysel etkinlik yok
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-1.5"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          data-testid="events-ungrouped-grid"
        >
          {applyManualOrder(ungrouped, "ungrouped").map((e) =>
            renderEventCard(e, "#818cf8", "", "ungrouped")
          )}
        </motion.div>
      )}
    </section>
  );

  const archiveGroup = async (group) => {
    if (!window.confirm(t("confirm_archive_group", { group }))) return;
    await api.post(`/events/archive-group?group_name=${encodeURIComponent(group)}`);
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    mutate("/stats");
    toast.success(t("group_archived"));
  };

  const unarchiveGroup = async (group) => {
    if (!window.confirm(t("confirm_unarchive_group", { group }))) return;
    await api.post(`/events/unarchive-group?group_name=${encodeURIComponent(group)}`);
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    mutate("/stats");
    toast.success(t("group_unarchived"));
  };

  const deleteGroup = async (group) => {
    if (!window.confirm(t("confirm_delete_group", { group }))) return;
    try {
      const res = await api.delete(`/events/group/${encodeURIComponent(group)}`);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate((k) => typeof k === "string" && k.startsWith("/leaderboard"));
      mutate("/stats");
      mutate("/event-groups");
      toast.success(t("group_deleted", { count: res.data?.events_deleted || 0 }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const startRenameGroup = (group) => {
    setRenamingGroup(group);
    setRenameValue(group);
  };
  const commitRenameGroup = async (group) => {
    const nv = renameValue.trim();
    if (!nv || nv === group) { setRenamingGroup(null); return; }
    try {
      await api.post(`/events/rename-group?old_name=${encodeURIComponent(group)}&new_name=${encodeURIComponent(nv)}`);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate("/event-groups");
      toast.success(t("group_renamed", { old: group, new: nv }));
      setRenamingGroup(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  // Extracted so the same card JSX renders inside a group AND inside the
  // stand-alone "Grupsuz" column. `gc` is the group tint colour; for ungrouped
  // events we pass a neutral violet so the left border still reads as visible.
  // `bucketKey` (e.g. "ungrouped" or "group:SvS") scopes the drag-drop reorder
  // — dropping a card within the same bucket reorders; dropping onto a card
  // in a DIFFERENT bucket moves the event across (Kolektif ↔ Bireysel or
  // between groups) by PATCH-ing its group_name.
  const renderEventCard = (e, gc, group, bucketKey) => {
    const evMs = new Date(e.date).getTime();
    const nowMs = Date.now();
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = startOfToday.getTime() + 86400000;
    const isTodayEvent = !e.archived && evMs >= startOfToday.getTime() && evMs < endOfToday;
    const isPastActive = !e.archived && evMs <= nowMs && (nowMs - evMs) < 6 * 3600 * 1000;
    const highlight = isTodayEvent || isPastActive;
    return (
      <motion.div
        key={e.id}
        id={`event-${e.id}`}
        data-testid={EVENTS.card(e.id)}
        draggable={!!bucketKey}
        onDragStart={(ev) => { if (bucketKey) { setDragId(e.id); setDragSourceBucket(bucketKey); ev.dataTransfer.effectAllowed = "move"; } }}
        onDragOver={(ev) => { if (bucketKey && dragId && dragId !== e.id) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; } }}
        onDrop={(ev) => {
          if (!bucketKey || !dragId) return;
          ev.preventDefault();
          if (dragSourceBucket && dragSourceBucket !== bucketKey) {
            const newGroup = bucketKey === "ungrouped" ? "" : bucketKey.replace(/^group:/, "");
            api.patch(`/events/${dragId}`, { group_name: newGroup })
              .then(() => {
                mutate((k) => typeof k === "string" && k.startsWith("/events"));
                toast.success(newGroup ? `→ ${newGroup}` : "→ Bireysel");
              })
              .catch((err) => toast.error(err?.response?.data?.detail || err.message));
          } else {
            reorderBucket(bucketKey, dragId, e.id);
          }
          setDragId(null); setDragSourceBucket(null);
        }}
        onDragEnd={() => { setDragId(null); setDragSourceBucket(null); }}
        onClick={() => { if (!dragId) setDetailId(e.id); }}
        className={`card-dark row-hover p-3 flex items-center gap-3 cursor-pointer ${dragId === e.id ? "opacity-50" : ""}`}
        variants={{
          hidden: { opacity: 0, y: 14 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
        }}
        style={highlight ? {
          backgroundImage: "repeating-linear-gradient(45deg, rgba(220,38,38,0.14), rgba(220,38,38,0.14) 6px, transparent 6px, transparent 14px)",
          borderColor: "rgba(220,38,38,0.55)",
          boxShadow: "0 0 12px rgba(220,38,38,0.25), inset 0 0 12px rgba(220,38,38,0.1)",
        } : { borderLeft: `3px solid ${gc}`, background: group ? groupBgTint(group, 0.06) : "rgba(129,140,248,0.05)" }}
      >
        {bucketKey && (
          <span
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-white"
            title="Sürükle-bırak ile sırayı değiştir"
            data-testid={`event-drag-handle-${e.id}`}
            style={{ touchAction: "none" }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        {selectionMode && (
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); toggleSelected(e.id); }}
            className="flex-shrink-0 p-0.5 rounded"
            style={{ color: selectedIds.has(e.id) ? "#FCA5A5" : "#9CA3AF" }}
            data-testid={`event-select-${e.id}`}
            aria-pressed={selectedIds.has(e.id)}
            aria-label="Etkinliği seç"
          >
            {selectedIds.has(e.id)
              ? <CheckSquare className="w-4 h-4" />
              : <Square className="w-4 h-4" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div
            className="font-bold text-white truncate"
            data-testid={`event-name-${e.id}`}
            style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, letterSpacing: "0.02em" }}
          >
            {e.name}
          </div>
          <div
            className="text-[11px] text-muted-foreground truncate mono"
            data-testid={`event-date-${e.id}`}
            style={{ marginTop: 2 }}
          >
            {new Date(e.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
        {highlight && (
          <span
            data-testid={`event-today-badge-${e.id}`}
            className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
            style={{
              background: "linear-gradient(135deg,#DC2626,#F97316)",
              color: "#fff",
              letterSpacing: "0.08em",
              animation: "pulse 2s ease-in-out infinite",
            }}
          >
            {isTodayEvent ? t("event_today_badge") : t("event_active_badge")}
          </span>
        )}
      </motion.div>
    );
  };

  // Full group block (header + rename controls + archive/delete + event list)
  const renderGroupBlock = (group, list) => {
    const gc = groupColor(group);
    return (
      <div key={group} className="mb-5" data-testid={`event-group-block-${group}`}>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              data-testid={`event-group-dot-${group}`}
              style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: gc, boxShadow: `0 0 6px ${gc}80` }}
            />
            {renamingGroup === group ? (
              <input
                autoFocus
                data-testid={`event-group-rename-input-${group}`}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRenameGroup(group);
                  if (e.key === "Escape") setRenamingGroup(null);
                }}
                className="px-2 py-0.5 text-sm rounded"
                style={{ background: "#1A1210", color: "#F5F0E8", border: `1px solid ${gc}88`, minWidth: 120 }}
              />
            ) : (
              <h3 className="text-sm font-bold uppercase tracking-wider truncate" style={{ color: gc, textShadow: `0 0 6px ${gc}55` }}>{group}</h3>
            )}
            <span className="chip" style={{ borderColor: `${gc}55`, color: gc }}>{list.length}</span>
          </div>
          <CanEdit>
            <div className="flex items-center gap-1 flex-shrink-0">
              {renamingGroup === group ? (
                <>
                  <button
                    onClick={() => commitRenameGroup(group)}
                    data-testid={`event-group-rename-commit-${group}`}
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> {t("save")}
                  </button>
                  <button
                    onClick={() => setRenamingGroup(null)}
                    data-testid={`event-group-rename-cancel-${group}`}
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-neutral-500/15 text-neutral-300 border border-neutral-500/30 hover:bg-neutral-500/25 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> {t("cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => startRenameGroup(group)}
                    data-testid={`event-group-rename-${group}`}
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 flex items-center gap-1"
                    title={t("group_rename")}
                  >
                    <Pencil className="w-3 h-3" /> {t("group_rename")}
                  </button>
                  {tab === "active" ? (
                    <button
                      onClick={() => archiveGroup(group)}
                      data-testid={`event-group-archive-${group}`}
                      className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-yellow-500/15 gold-text border border-yellow-500/30 hover:bg-yellow-500/25 flex items-center gap-1"
                      title={t("archive_group")}
                    >
                      <Archive className="w-3 h-3" /> {t("group_move_archive")}
                    </button>
                  ) : (
                    <button
                      onClick={() => unarchiveGroup(group)}
                      data-testid={`event-group-unarchive-${group}`}
                      className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 flex items-center gap-1"
                      title={t("group_unarchive")}
                    >
                      <ArchiveRestore className="w-3 h-3" /> {t("group_unarchive")}
                    </button>
                  )}
                  <button
                    onClick={() => deleteGroup(group)}
                    data-testid={`event-group-delete-${group}`}
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-red-500/15 red-text border border-red-500/30 hover:bg-red-500/25 flex items-center gap-1"
                    title={t("group_delete")}
                  >
                    <Trash2 className="w-3 h-3" /> {t("group_delete")}
                  </button>
                </>
              )}
            </div>
          </CanEdit>
        </div>

        <motion.div
          className="grid grid-cols-2 gap-1.5"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          data-testid={`event-group-grid-${group}`}
        >
          {applyManualOrder(list, `group:${group}`).map((e) =>
            renderEventCard(e, gc, group, `group:${group}`)
          )}
        </motion.div>
      </div>
    );
  };

  return (
    <div data-testid={EVENTS.container}>
      <Header title={t("nav_events")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground"><span className="gold-text font-bold mono">{remindedCount + unremindedCount}</span> {t("active")}</p>
          </div>
          <CanEdit>
            <button
              data-testid="events-ocr-btn"
              onClick={() => setOcrOpen(true)}
              className="chip text-xs flex items-center gap-1.5 mr-1"
              style={{ borderColor: "rgba(139,92,246,0.5)", color: "#A78BFA" }}
              title="Ekran Görüntüsünden Aktar"
            >
              <Camera className="w-3.5 h-3.5" /> OCR
            </button>
            <button
              data-testid={EVENTS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
            </button>
          </CanEdit>
        </div>

        {/* View toggle — Liste vs Takvim. Sits above the tab bar so it
            switches the whole page mode; localStorage-persisted so admins
            return to their last view on next visit. */}
        <div className="flex gap-1.5 mb-3" data-testid="events-view-toggle">
          <button
            type="button"
            data-testid="events-view-list"
            onClick={() => setView("list")}
            className="chip flex-1 justify-center text-[10px]"
            style={view === "list" ? {
              borderColor: "#F5A623",
              color: "#F5A623",
              background: "rgba(245,166,35,0.15)",
              boxShadow: "0 0 8px rgba(245,166,35,0.35)",
            } : { opacity: 0.7 }}
          >
            <span aria-hidden="true" style={{ fontSize: 12 }}>📋</span> Liste
          </button>
          <button
            type="button"
            data-testid="events-view-calendar"
            onClick={() => setView("calendar")}
            className="chip flex-1 justify-center text-[10px]"
            style={view === "calendar" ? {
              borderColor: "#A78BFA",
              color: "#C4B5FD",
              background: "rgba(139,92,246,0.15)",
              boxShadow: "0 0 8px rgba(139,92,246,0.35)",
            } : { opacity: 0.7 }}
          >
            <span aria-hidden="true" style={{ fontSize: 12 }}>📅</span> Takvim
          </button>
        </div>

        {selectionMode && (
          <EventsBulkToolbar
            filteredEvents={filteredEvents}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            clearSelection={clearSelection}
            folders={folders}
            onDone={() => { setSelectionMode(false); clearSelection(); }}
          />
        )}

        {/* Archive tab uses a fully redesigned folder grid + expandable
            panel below (see the archive render block further down). The
            legacy chip strip / sort toggle / "Klasör Yönet" toolbar and
            the per-folder actions bar have been removed — folder rename
            and delete now live on the folder cards themselves. */}

        {view === "calendar" ? (
          <EventCalendar
            events={allActive}
            onEventClick={(e) => { setEditing(e); setShowForm(true); }}
          />
        ) : (
        <>
        <div
          className="flex mb-4 rounded-lg overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(15,8,20,0.85), rgba(10,5,15,0.95))",
            border: "1px solid rgba(120,53,15,0.35)",
          }}
          data-testid="events-tabs"
        >
          <button
            data-testid="events-tab-reminded"
            onClick={() => setTab("reminded")}
            className="flex flex-col items-center justify-center transition-all"
            style={{
              flex: "41",
              padding: "6px 4px",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              lineHeight: 1.15,
              background: tab === "reminded"
                ? "linear-gradient(180deg, rgba(249,115,22,0.28), rgba(180,83,9,0.45))"
                : "rgba(20,15,25,0.65)",
              color: tab === "reminded" ? "#FFEDD5" : "#78716C",
              border: tab === "reminded" ? "2px solid #f97316" : "2px solid transparent",
              boxShadow: tab === "reminded"
                ? "0 0 12px #f97316, 0 0 24px rgba(249,115,22,0.4), inset 0 0 18px rgba(249,115,22,0.20)"
                : "none",
              textShadow: tab === "reminded" ? "0 1px 6px rgba(0,0,0,0.75)" : "none",
              opacity: tab === "reminded" ? 1 : 0.7,
            }}
          >
            <span className="flex items-center gap-1">
              <span aria-hidden="true" style={{ fontSize: 14, filter: tab === "reminded" ? "none" : "grayscale(0.6)" }}>🔔</span>
              <span>Hatırlatmalı</span>
            </span>
            <span className="mono text-[10px] opacity-90">({remindedCount})</span>
          </button>
          <button
            data-testid="events-tab-unreminded"
            onClick={() => setTab("unreminded")}
            className="flex flex-col items-center justify-center transition-all"
            style={{
              flex: "41",
              padding: "6px 4px",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              lineHeight: 1.15,
              background: tab === "unreminded"
                ? "linear-gradient(180deg, rgba(129,140,248,0.24), rgba(76,29,149,0.38))"
                : "rgba(20,15,25,0.65)",
              color: tab === "unreminded" ? "#DDD6FE" : "#6B7280",
              border: tab === "unreminded" ? "2px solid #818cf8" : "2px solid transparent",
              boxShadow: tab === "unreminded"
                ? "0 0 12px #818cf8, 0 0 24px rgba(129,140,248,0.4), inset 0 0 16px rgba(129,140,248,0.18)"
                : "none",
              textShadow: tab === "unreminded" ? "0 1px 6px rgba(0,0,0,0.75)" : "none",
              opacity: tab === "unreminded" ? 1 : 0.7,
            }}
          >
            <span className="flex items-center gap-1">
              <span aria-hidden="true" style={{ fontSize: 14, filter: tab === "unreminded" ? "none" : "grayscale(0.6)" }}>🔕</span>
              <span>Hatırlatmasız</span>
            </span>
            <span className="mono text-[10px] opacity-90">({unremindedCount})</span>
          </button>
          <button
            data-testid={EVENTS.tabArchived}
            onClick={() => setTab("archive")}
            className="flex flex-col items-center justify-center transition-all"
            style={{
              flex: "18",
              padding: "6px 4px",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "1px",
              textTransform: "uppercase",
              lineHeight: 1.15,
              background: tab === "archive"
                ? "linear-gradient(180deg, rgba(148,163,184,0.28), rgba(31,41,55,0.55))"
                : "rgba(20,15,25,0.65)",
              color: tab === "archive" ? "#E5E7EB" : "#6B7280",
              border: tab === "archive" ? "2px solid #94a3b8" : "2px solid transparent",
              boxShadow: tab === "archive"
                ? "0 0 10px rgba(148,163,184,0.55), inset 0 0 14px rgba(148,163,184,0.20)"
                : "none",
              textShadow: tab === "archive" ? "0 1px 6px rgba(0,0,0,0.75)" : "none",
              opacity: tab === "archive" ? 1 : 0.7,
            }}
          >
            <span className="flex items-center gap-1">
              <span aria-hidden="true" style={{ fontSize: 12, filter: tab === "archive" ? "none" : "grayscale(0.6)" }}>📦</span>
              <span>Arşiv</span>
            </span>
            <span className="mono text-[10px] opacity-90">({archivedCount})</span>
          </button>
        </div>


        {/* Sub-filter chips — sit UNDER the primary tabs so the admin can
            narrow the active tab down to just "Kolektif" (grouped) or
            "Bireysel" (ungrouped). Clicking the active chip toggles back
            to the 2-column split. Hidden on the archive tab because the
            folder-grouped view already provides its own grouping. */}
        {tab !== "archive" && (
        <div
          className="flex gap-1.5 mb-2 flex-wrap"
          data-testid="events-subfilter-bar"
        >
          {[
            { key: "kolektif", label: "Kolektif", color: "#F5A623", emoji: "🤝" },
            { key: "bireysel", label: "Bireysel", color: "#A78BFA", emoji: "🧍" },
          ].map((opt) => {
            const active = subFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                data-testid={`events-subfilter-${opt.key}`}
                onClick={() => setSubFilter(active ? "all" : opt.key)}
                className="chip text-[10px] flex-1 justify-center"
                style={active ? {
                  borderColor: opt.color,
                  color: opt.color,
                  background: `${opt.color}18`,
                  boxShadow: `0 0 8px ${opt.color}55, inset 0 0 8px ${opt.color}22`,
                } : {
                  opacity: 0.7,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 12 }}>{opt.emoji}</span> {opt.label}
              </button>
            );
          })}
        </div>
        )}

        {/* Visibility filter row removed — hidden and visible events now
            render together in the list. Each hidden event still shows a
            small "🚫 Sıralama dışı" badge on its card so admins can
            distinguish them without a filter chip. */}

        {/* Split preset chips — only visible when both columns show (Tümü
            mode). Quick 30/70, 50/50, 70/30 buttons for admins who prefer
            snap-to-preset over dragging the middle handle. Hidden on
            archive since the folder-grouped view uses a single grid. */}
        {tab !== "archive" && subFilter === "all" && (
          <div className="hidden lg:flex gap-1.5 mb-3" data-testid="events-split-presets">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold self-center mr-1">
              Kolon
            </span>
            {[
              { pct: 30, label: "30 / 70" },
              { pct: 50, label: "50 / 50" },
              { pct: 70, label: "70 / 30" },
            ].map((p) => {
              const active = Math.abs(splitPct - p.pct) < 1;
              return (
                <button
                  key={p.pct}
                  type="button"
                  data-testid={`events-split-preset-${p.pct}`}
                  onClick={() => setSplitPct(p.pct)}
                  className="chip text-[10px]"
                  style={active ? {
                    borderColor: "#FCD34D",
                    color: "#FCD34D",
                    background: "rgba(245,166,35,0.15)",
                    boxShadow: "0 0 6px rgba(245,166,35,0.35)",
                  } : { opacity: 0.75 }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Filtered content — respects the sub-filter chip above. When
            "all", both columns render side-by-side with a resizable split
            handle; otherwise only that column shows full-width. */}
        {tab === "archive" ? (
          /* New archive redesign — stone-textured folder cards in a 3-col
             grid. Klasörsüz is always the first card. Clicking a folder
             expands a golden-bordered panel below with the folder's
             events. Rename / delete controls live on the card corners. */
          (() => {
            const byFolder = {};
            folders.forEach((f) => { byFolder[f.id] = []; });
            const noFolder = [];
            filteredEvents.forEach((e) => {
              if (e.folder_id && byFolder[e.folder_id]) byFolder[e.folder_id].push(e);
              else noFolder.push(e);
            });
            const cards = [
              { id: "__none__", name: "Klasörsüz", color: "#94A3B8", icon: "📂", events: noFolder, isSpecial: true },
              ...folders.map((f) => ({
                id: f.id, name: f.name,
                color: f.color || "#F5A623",
                icon: f.icon || "📁",
                events: byFolder[f.id],
                isSpecial: false,
              })),
            ];
            const selected = folderId && cards.find((c) => c.id === folderId || (folderId === "none" && c.id === "__none__"));
            const selectedEvents = selected
              ? [...selected.events].sort((a, b) => new Date(b.date) - new Date(a.date))
              : [];
            const renameCard = async (c) => {
              const nxt = window.prompt("Yeni klasör adı:", c.name);
              if (!nxt || nxt.trim() === c.name) return;
              try {
                await api.patch(`/event-folders/${c.id}`, { name: nxt.trim() });
                mutate("/event-folders");
                toast.success("Klasör adı güncellendi");
              } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
            };
            const deleteCard = async (c) => {
              if (!window.confirm(`"${c.name}" klasörü silinsin mi? İçindeki etkinlikler klasörsüz kalır.`)) return;
              try {
                await api.delete(`/event-folders/${c.id}`);
                mutate("/event-folders");
                mutate((k) => typeof k === "string" && k.startsWith("/events"));
                if (folderId === c.id) setFolderId(null);
                toast.success("Silindi");
              } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
            };
            const openNewFolder = () => setShowFolderMgr(true);
            return (
              <div data-testid="events-archive-redesign">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {cards.map((c) => {
                    const isSel = folderId === c.id || (folderId === "none" && c.id === "__none__");
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-testid={`events-archive-card-${c.id}`}
                        onClick={() => {
                          const nxt = c.id === "__none__" ? "none" : c.id;
                          setFolderId(isSel ? null : nxt);
                        }}
                        onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-event-id")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                        onDrop={(e) => {
                          const evId = e.dataTransfer.getData("application/x-event-id");
                          if (!evId) return;
                          e.preventDefault();
                          const target = c.id === "__none__" ? null : c.id;
                          api.post("/event-folders/assign", { event_ids: [evId], folder_id: target })
                            .then(() => {
                              mutate((k) => typeof k === "string" && k.startsWith("/events"));
                              mutate("/event-folders");
                              toast.success(`→ ${c.name}`);
                            })
                            .catch((err) => toast.error(err?.response?.data?.detail || err.message));
                        }}
                        className="relative rounded-xl p-4 text-center transition-all"
                        style={{
                          background: isSel
                            ? `linear-gradient(160deg, ${c.color}55 0%, rgba(20,12,10,0.95) 60%)`
                            : "linear-gradient(160deg, rgba(35,20,12,0.85) 0%, rgba(15,8,5,0.95) 100%)",
                          border: isSel ? `2px solid ${c.color}` : "1px solid rgba(212,115,10,0.35)",
                          boxShadow: isSel
                            ? `0 0 24px ${c.color}, 0 0 48px ${c.color}55, inset 0 0 24px ${c.color}22`
                            : "0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,170,80,0.08)",
                          minHeight: 130,
                          cursor: "pointer",
                        }}
                      >
                        {!c.isSpecial && (
                          <CanEdit>
                            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                              <button
                                type="button"
                                data-testid={`events-archive-card-rename-${c.id}`}
                                onClick={(ev) => { ev.stopPropagation(); renameCard(c); }}
                                className="p-1 rounded hover:bg-white/10"
                                style={{ color: "#93C5FD" }}
                                title="Yeniden adlandır"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                data-testid={`events-archive-card-delete-${c.id}`}
                                onClick={(ev) => { ev.stopPropagation(); deleteCard(c); }}
                                className="p-1 rounded hover:bg-white/10"
                                style={{ color: "#FCA5A5" }}
                                title="Sil"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </CanEdit>
                        )}
                        <div style={{ fontSize: 42, lineHeight: 1, marginTop: 4 }}>{c.icon}</div>
                        <div
                          className="text-sm font-bold mt-2 truncate"
                          style={{
                            color: isSel ? "#FFF7ED" : "#F5F0E8",
                            fontFamily: "Cinzel, serif",
                            letterSpacing: "0.06em",
                            textShadow: isSel ? `0 0 8px ${c.color}` : "0 1px 2px rgba(0,0,0,0.8)",
                          }}
                          title={c.name}
                        >
                          {c.name}
                        </div>
                        <div className="text-[10px] mt-0.5 mono" style={{ color: isSel ? c.color : "#94A3B8" }}>
                          {c.events.length} etkinlik
                        </div>
                      </button>
                    );
                  })}
                  <CanEdit>
                    <button
                      type="button"
                      data-testid="events-archive-card-new"
                      onClick={openNewFolder}
                      className="rounded-xl p-4 text-center transition-all"
                      style={{
                        background: "rgba(20,12,10,0.4)",
                        border: "2px dashed rgba(245,166,35,0.4)",
                        minHeight: 130,
                        cursor: "pointer",
                        color: "#F5A623",
                      }}
                    >
                      <div style={{ fontSize: 42, lineHeight: 1, marginTop: 4 }}>➕</div>
                      <div className="text-sm font-bold mt-2" style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.06em" }}>
                        Yeni Klasör
                      </div>
                    </button>
                  </CanEdit>
                </div>

                {selected && (
                  <div
                    data-testid="events-archive-expanded-panel"
                    className="rounded-xl p-4"
                    style={{
                      background: `linear-gradient(180deg, ${selected.color}18 0%, rgba(20,12,10,0.92) 100%)`,
                      border: `2px solid ${selected.color}`,
                      boxShadow: `0 0 32px ${selected.color}55, inset 0 0 32px ${selected.color}18`,
                    }}
                  >
                    <div
                      className="flex items-center gap-2 mb-3 pb-2"
                      style={{ borderBottom: `1px solid ${selected.color}55` }}
                    >
                      <span style={{ fontSize: 20 }}>{selected.icon}</span>
                      <h3
                        className="text-sm font-bold uppercase tracking-widest flex-1"
                        style={{ color: selected.color, letterSpacing: "0.14em", fontFamily: "Cinzel, serif", textShadow: `0 0 8px ${selected.color}55` }}
                      >
                        {selected.name}
                      </h3>
                      <span className="text-[10px] mono opacity-80" style={{ color: selected.color }}>
                        {selectedEvents.length} etkinlik
                      </span>
                    </div>
                    {selectedEvents.length === 0 ? (
                      <div className="text-center py-6 text-xs" style={{ color: "#94A3B8", opacity: 0.7 }}>
                        Bu klasörde etkinlik yok
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedEvents.map((e) => (
                          <div
                            key={e.id}
                            data-testid={`events-archive-expanded-item-${e.id}`}
                            draggable
                            onDragStart={(ev) => { ev.dataTransfer.setData("application/x-event-id", e.id); ev.dataTransfer.effectAllowed = "move"; }}
                            onClick={() => setDetailId(e.id)}
                            className="rounded-lg px-3 py-2 cursor-pointer transition-all hover:scale-[1.02]"
                            style={{
                              background: "linear-gradient(160deg, rgba(35,20,12,0.90) 0%, rgba(15,8,5,0.95) 100%)",
                              border: `1px solid ${selected.color}55`,
                              boxShadow: `0 0 8px ${selected.color}22, inset 0 1px 0 rgba(255,170,80,0.08)`,
                            }}
                          >
                            <div className="text-sm font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }} title={e.name}>
                              {e.name}
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[10px]" style={{ color: "#94A3B8" }}>
                              <span>{String(e.date || "").slice(0, 10)}</span>
                              <span className="font-bold mono" style={{ color: selected.color }}>×{e.multiplier ?? 1}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        ) : (

        (() => {
          const showGrouped = subFilter === "all" || subFilter === "kolektif";
          const showUngrouped = subFilter === "all" || subFilter === "bireysel";
          const twoCol = showGrouped && showUngrouped;
          return (
        <div
          className={twoCol ? "hidden lg:grid gap-0" : ""}
          style={twoCol ? { gridTemplateColumns: `${splitPct}fr 8px ${100 - splitPct}fr` } : undefined}
          data-testid="events-two-col-grid"
        >
          {/* Mobile / narrow-viewport fallback for 2-col — plain stacked */}
          {twoCol && (
            <div className="grid grid-cols-1 gap-4 lg:hidden col-span-full">
              {renderGroupedCol()}
              {renderUngroupedCol()}
            </div>
          )}
          {twoCol ? (
            <>
              {renderGroupedCol()}
              <div
                data-testid="events-column-resize-handle"
                onMouseDown={(ev) => startResize(ev)}
                onTouchStart={(ev) => startResize(ev)}
                className="hidden lg:block cursor-col-resize group"
                style={{ position: "relative" }}
                title="Sürükle-bırak ile kolon genişliğini ayarla"
              >
                <div
                  className="absolute inset-y-0"
                  style={{
                    left: 2,
                    width: 4,
                    background: "linear-gradient(180deg, rgba(245,166,35,0.35), rgba(139,92,246,0.35))",
                    borderRadius: 2,
                    transition: "opacity 0.15s",
                  }}
                />
              </div>
              {renderUngroupedCol()}
            </>
          ) : (
            <>
              {showGrouped && renderGroupedCol()}
              {showUngrouped && renderUngroupedCol()}
            </>
          )}
        </div>
          );
        })()
        )}

        {events.length === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">{t("no_events")}</div>
        )}
        </>
        )}
      </div>

      {showForm && (
        <EventForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
      {showFolderMgr && (
        <EventFolderManager
          folders={folders}
          onClose={() => setShowFolderMgr(false)}
        />
      )}
      <EventDetailModal
        event={events.find((x) => x.id === detailId) || allActive.find((x) => x.id === detailId) || null}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onEdit={(e) => { setEditing(e); setShowForm(true); setDetailId(null); }}
        events={filteredEvents}
        onNavigate={(id) => setDetailId(id)}
      />

      {reminderFor && (
        <EventReminderDialog event={reminderFor} onClose={() => setReminderFor(null)} />
      )}

      <OcrDialog
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        mode="event"
        title="Etkinlik Puanı — Ekran Görüntüsünden Aktar"
        requireSelection={{
          type: "event",
          label: "Bu puanları hangi etkinliğe eklemek istiyorsun?",
          placeholder: "Etkinlik seç",
          options: (events || [])
            .filter((e) => !e.archived)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((e) => ({
              id: e.id,
              label: `${e.name}${e.date ? ` · ${new Date(e.date).toLocaleDateString("tr-TR")}` : ""}`,
            })),
        }}
        onApply={async (data, extra) => {
          const parts = data.participants || [];
          if (!extra?.event_id) throw new Error("Etkinlik seçilmedi");
          const res = await api.post("/ocr/apply-event-points", {
            event_id: extra.event_id,
            participants: parts,
          });
          mutate("/events");
          mutate((k) => typeof k === "string" && k.startsWith("/points"));
          mutate((k) => typeof k === "string" && k.startsWith("/members"));
          mutate("/stats");
          const errs = (res.data.errors || []).length;
          const newMembers = res.data.new_members_created || 0;
          toast.success(
            `${res.data.created} puan '${res.data.event_name}' etkinliğine eklendi` +
              (newMembers ? ` · ${newMembers} yeni üye oluşturuldu` : "") +
              (errs ? ` · ${errs} hata` : ""),
          );
        }}
      />
    </div>
  );
}

function EventDetailModal({ event, open, onClose, onEdit, events = [], onNavigate }) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);

  // Sibling navigation — Esc closes the modal, ← / → walk through the
  // same filteredEvents list currently rendered on the page. We stop when
  // there's nothing to navigate to instead of wrapping so admins don't
  // accidentally jump from the last archived event back to the first
  // active one.
  const currentIdx = React.useMemo(
    () => (event ? events.findIndex((x) => x.id === event.id) : -1),
    [event, events],
  );
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < events.length - 1;
  const goPrev = React.useCallback(() => {
    if (canPrev && onNavigate) onNavigate(events[currentIdx - 1].id);
  }, [canPrev, onNavigate, events, currentIdx]);
  const goNext = React.useCallback(() => {
    if (canNext && onNavigate) onNavigate(events[currentIdx + 1].id);
  }, [canNext, onNavigate, events, currentIdx]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      // When the lightbox is open let its own handler (backdrop click / X)
      // manage Esc — closing the whole modal on Esc would be jarring.
      if (lightbox) {
        if (e.key === "Escape") { setLightbox(false); e.preventDefault(); }
        return;
      }
      if (e.key === "Escape") { onClose(); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { goPrev(); e.preventDefault(); }
      else if (e.key === "ArrowRight") { goNext(); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lightbox, onClose, goPrev, goNext]);

  if (!open || !event) return null;

  const e = event;
  const evMs = new Date(e.date).getTime();
  const isPast = evMs < Date.now();

  const doArchive = async (archived) => {
    setBusy(true);
    try {
      await api.patch(`/events/${e.id}`, { archived });
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      toast.success(archived ? t("archived") : (t("group_unarchived") || "Etkinlik aktife alındı"));
      onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || err.message); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (e.series_id) {
      const scope = window.prompt(
        `Bu etkinlik bir seriye ait (${e.series_id.slice(0, 6)}). Ne silmek istersin?\n\n` +
        `1 = Sadece bu etkinlik\n2 = Bu ve gelecek olan hepsi\n3 = Tüm seri (geçmiş dahil)\n\nİptal için boş bırak:`,
        "1",
      );
      if (!scope || !["1", "2", "3"].includes(scope.trim())) return;
      setBusy(true);
      try {
        if (scope.trim() === "1") await api.delete(`/events/${e.id}`);
        else if (scope.trim() === "2") await api.delete(`/events/series/${e.series_id}?from_date=${encodeURIComponent(e.date)}`);
        else await api.delete(`/events/series/${e.series_id}`);
        mutate((k) => typeof k === "string" && k.startsWith("/events"));
        mutate("/stats");
        toast.success(t("event_deleted"));
        onClose();
      } catch (err) { toast.error(err?.response?.data?.detail || err.message); }
      finally { setBusy(false); }
      return;
    }
    if (!window.confirm(t("confirm_delete_generic", { name: e.name }))) return;
    setBusy(true);
    try {
      await api.delete(`/events/${e.id}`);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate("/stats");
      toast.success(t("event_deleted"));
      onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || err.message); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="event-detail-modal"
    >
      <div
        className="card-dark relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-lg"
        onClick={(ev) => ev.stopPropagation()}
        style={{ border: "1px solid rgba(245,166,35,0.55)", boxShadow: "0 0 30px rgba(245,166,35,0.25)" }}
      >
        <button
          type="button"
          onClick={onClose}
          data-testid="event-detail-close"
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", color: "#F5F0E8" }}
          aria-label={t("cancel")}
        >
          <X className="w-4 h-4" />
        </button>

        {(canPrev || canNext) && (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={!canPrev}
              data-testid="event-detail-prev"
              className="absolute top-1/2 -translate-y-1/2 -left-3 md:-left-10 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-opacity"
              style={{
                background: "rgba(10,6,5,0.85)",
                color: canPrev ? "#F5A623" : "#4b5563",
                border: `1px solid ${canPrev ? "rgba(245,166,35,0.55)" : "rgba(75,85,99,0.35)"}`,
                opacity: canPrev ? 1 : 0.35,
                cursor: canPrev ? "pointer" : "default",
              }}
              aria-label="Önceki etkinlik"
              title="← Önceki etkinlik"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              data-testid="event-detail-next"
              className="absolute top-1/2 -translate-y-1/2 -right-3 md:-right-10 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-opacity"
              style={{
                background: "rgba(10,6,5,0.85)",
                color: canNext ? "#F5A623" : "#4b5563",
                border: `1px solid ${canNext ? "rgba(245,166,35,0.55)" : "rgba(75,85,99,0.35)"}`,
                opacity: canNext ? 1 : 0.35,
                cursor: canNext ? "pointer" : "default",
              }}
              aria-label="Sonraki etkinlik"
              title="Sonraki etkinlik →"
            >
              ›
            </button>
          </>
        )}

        {e.banner_url && (
          <div
            className="relative w-full cursor-zoom-in"
            style={{ height: 180 }}
            data-testid={`event-detail-hero-${e.id}`}
            onClick={() => setLightbox(true)}
            title="Görsele tıklayınca tam ekran açılır"
          >
            <img src={e.banner_url} alt={e.name} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,0,21,0) 0%, rgba(10,0,21,0.55) 65%, rgba(10,0,21,0.95) 100%)" }} />
            <div
              className="absolute top-2 left-2 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.65)", color: "#F5A623", width: 28, height: 28 }}
              aria-hidden="true"
            >
              🔍
            </div>
          </div>
        )}

        {lightbox && e.banner_url && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3"
            style={{ background: "rgba(0,0,0,0.94)" }}
            onClick={() => setLightbox(false)}
            data-testid="event-detail-lightbox"
          >
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.7)", color: "#F5F0E8", border: "1px solid rgba(245,166,35,0.55)" }}
              data-testid="event-detail-lightbox-close"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={e.banner_url}
              alt={e.name}
              className="max-w-full max-h-full object-contain"
              style={{ boxShadow: "0 0 40px rgba(245,166,35,0.35)" }}
              onClick={(ev) => ev.stopPropagation()}
              data-testid="event-detail-lightbox-image"
            />
          </div>
        )}

        <div className="p-4 space-y-3">
          <div>
            <div
              className="font-black uppercase tracking-widest"
              style={{ fontFamily: "Cinzel, serif", color: "#F5F0E8", fontSize: 18, letterSpacing: "0.06em", lineHeight: 1.2 }}
              data-testid="event-detail-name"
            >
              {e.name}
            </div>
            {e.subtitle && (
              <div className="text-xs mt-1 opacity-85" style={{ color: "#EAD8B0" }} data-testid="event-detail-subtitle">
                {e.subtitle}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {e.group_name && (
              <span
                className="chip text-[10px]"
                style={{ borderColor: "#F5A623", color: "#F5A623", background: "rgba(245,166,35,0.10)" }}
                data-testid="event-detail-group"
              >
                🤝 {e.group_name}
              </span>
            )}
            <span
              className="chip text-[10px] mono"
              style={{ borderColor: "#E74C1A", color: "#F97316" }}
              data-testid="event-detail-multiplier"
            >
              ×{e.multiplier ?? 1}
            </span>
            <span
              className="chip text-[10px] mono"
              style={{ borderColor: "rgba(255,255,255,0.15)", color: "#EAD8B0" }}
              data-testid="event-detail-date"
            >
              📅 {new Date(e.date).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            {e.archived && (
              <span className="chip text-[10px]" style={{ borderColor: "#94A3B8", color: "#94A3B8" }}>📦 ARŞİV</span>
            )}
            {e.hidden_from_leaderboard && (
              <span
                className="chip text-[10px]"
                style={{ borderColor: "#9CA3AF", color: "#9CA3AF", background: "rgba(107,114,128,0.15)" }}
                data-testid="event-detail-hidden-badge"
                title="Sıralama sayfasında görünmez"
              >
                🚫 Sıralama dışı
              </span>
            )}
            {e.reminder_enabled === false && (
              <span className="chip text-[10px]" style={{ borderColor: "#818cf8", color: "#C4B5FD" }}>🔕 Hatırlatmasız</span>
            )}
            {!e.archived && <EventCountdown target={e.date} testId={`event-detail-countdown-${e.id}`} />}
          </div>

          {e.reminder_enabled !== false && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <EventAttendance eventId={e.id} testIdPrefix={`event-detail-att-${e.id}`} />
            </div>
          )}
          {isPast && (
            <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <EventResultGallery event={e} />
            </div>
          )}

          <CanEdit>
            <div className="pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: "rgba(245,166,35,0.25)" }}>
              <button
                type="button"
                onClick={() => onEdit(e)}
                disabled={busy}
                data-testid="event-detail-edit"
                className="chip text-[11px] flex-1 justify-center py-2"
                style={{ borderColor: "#3b82f6", color: "#93C5FD", background: "rgba(59,130,246,0.10)" }}
              >
                ✏️ {t("edit") || "Düzenle"}
              </button>
              <button
                type="button"
                onClick={() => doArchive(!e.archived)}
                disabled={busy}
                data-testid={e.archived ? "event-detail-unarchive" : "event-detail-archive"}
                className="chip text-[11px] flex-1 justify-center py-2"
                style={e.archived
                  ? { borderColor: "#22c55e", color: "#86EFAC", background: "rgba(34,197,94,0.10)" }
                  : { borderColor: "#F5A623", color: "#FCD34D", background: "rgba(245,166,35,0.10)" }
                }
              >
                {e.archived ? "♻️ Arşivden Çıkar" : "📦 Arşive Al"}
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={busy}
                data-testid="event-detail-delete"
                className="chip text-[11px] flex-1 justify-center py-2"
                style={{ borderColor: "#ef4444", color: "#FCA5A5", background: "rgba(239,68,68,0.10)" }}
              >
                🗑️ {t("delete") || "Sil"}
              </button>
            </div>
          </CanEdit>
        </div>
      </div>
    </div>
  );
}

function EventsBulkToolbar({ filteredEvents, selectedIds, setSelectedIds, clearSelection, folders = [], onDone }) {
  const [busy, setBusy] = React.useState(false);
  const visibleIds = React.useMemo(() => filteredEvents.map((e) => e.id), [filteredEvents]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectAllVisible = () => setSelectedIds(new Set([...selectedIds, ...visibleIds]));
  const invertVisible = () => {
    const next = new Set(selectedIds);
    visibleIds.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id)));
    setSelectedIds(next);
  };

  const bulkToggleHidden = async (hidden) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error("Önce etkinlik seç"); return; }
    setBusy(true);
    try {
      const res = await api.post("/events/bulk-visibility", { ids, hidden });
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      toast.success(`${res.data.modified} etkinlik ${hidden ? "sıralama dışına alındı" : "sıralamaya eklendi"}`);
      clearSelection();
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const bulkToggleArchive = async (archived) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error("Önce etkinlik seç"); return; }
    setBusy(true);
    try {
      const res = await api.post("/events/bulk-archive", { ids, archived });
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      toast.success(`${res.data.modified} etkinlik ${archived ? "arşive alındı" : "arşivden çıkarıldı"}`);
      clearSelection();
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const bulkAssignFolder = async (folderId) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error("Önce etkinlik seç"); return; }
    setBusy(true);
    try {
      const res = await api.post("/event-folders/assign", { event_ids: ids, folder_id: folderId });
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate("/event-folders");
      const label = folderId ? (folders.find((f) => f.id === folderId)?.name || "klasör") : "klasörsüz";
      toast.success(`${res.data.modified} etkinlik → ${label}`);
      clearSelection();
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  return (
    <div
      data-testid="events-bulk-toolbar"
      className="flex items-center gap-1.5 mb-3 p-2 rounded-lg flex-wrap"
      style={{
        background: "linear-gradient(180deg, rgba(220,38,38,0.14) 0%, rgba(220,38,38,0.05) 100%)",
        border: "1px solid rgba(220,38,38,0.45)",
      }}
    >
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#FCA5A5" }}>
        {selectedIds.size} seçili
      </span>
      <button
        type="button"
        onClick={selectAllVisible}
        disabled={busy || allVisibleSelected}
        data-testid="events-bulk-select-all"
        className="chip text-[10px]"
      >
        Tümünü Seç ({visibleIds.length})
      </button>
      <button
        type="button"
        onClick={invertVisible}
        disabled={busy}
        data-testid="events-bulk-invert"
        className="chip text-[10px]"
      >
        Terse Çevir
      </button>
      <button
        type="button"
        onClick={clearSelection}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-clear"
        className="chip text-[10px]"
      >
        Temizle
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => bulkToggleArchive(true)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-archive"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(148,163,184,0.55)", color: "#E5E7EB", background: "rgba(148,163,184,0.10)" }}
        title="Seçili etkinlikleri arşive al"
      >
        <Archive className="w-3 h-3" /> Arşive Al
      </button>
      <button
        type="button"
        onClick={() => bulkToggleArchive(false)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-unarchive"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(34,197,94,0.55)", color: "#86EFAC", background: "rgba(34,197,94,0.10)" }}
        title="Seçili etkinlikleri arşivden çıkar"
      >
        <ArchiveRestore className="w-3 h-3" /> Arşivden Çıkar
      </button>
      <button
        type="button"
        onClick={() => bulkToggleHidden(true)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-hide"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(107,114,128,0.55)", color: "#D1D5DB", background: "rgba(107,114,128,0.10)" }}
        title="Seçili etkinlikleri sıralama dışına al"
      >
        <EyeOff className="w-3 h-3" /> Sıralama Dışı
      </button>
      <button
        type="button"
        onClick={() => bulkToggleHidden(false)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-show"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(245,166,35,0.55)", color: "#FCD34D", background: "rgba(245,166,35,0.10)" }}
        title="Seçili etkinlikleri sıralamaya ekle"
      >
        <Eye className="w-3 h-3" /> Sıralamaya Ekle
      </button>
      {folders.length > 0 && (
        <select
          data-testid="events-bulk-folder-select"
          disabled={busy || selectedIds.size === 0}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            const target = v === "__none__" ? null : v;
            bulkAssignFolder(target);
            e.target.value = "";
          }}
          className="chip text-[10px]"
          style={{
            borderColor: "rgba(139,92,246,0.55)",
            color: "#C4B5FD",
            background: "rgba(139,92,246,0.10)",
            cursor: "pointer",
          }}
          title="Seçili etkinlikleri klasöre taşı"
          defaultValue=""
        >
          <option value="" disabled>📁 Klasöre Taşı…</option>
          <option value="__none__">Klasörsüz (temizle)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={onDone}
        disabled={busy}
        data-testid="events-bulk-done"
        className="chip text-[10px] flex items-center gap-1"
        title="Seçim modundan çık"
      >
        <X className="w-3 h-3" /> Kapat
      </button>
    </div>
  );
}

function EventForm({ initial, onClose }) {  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(
    initial?.date
      ? (() => {
          const d = new Date(initial.date);
          const tz = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - tz).toISOString().slice(0, 16);
        })()
      : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [multiplier, setMultiplier] = useState(initial?.multiplier || 1);
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [grouped, setGrouped] = useState(
    initial ? !!(initial.group_name && String(initial.group_name).trim()) : true,
  );
  const [groupName, setGroupName] = useState(initial?.group_name || "SvS vs 10007");
  const [reminderEnabled, setReminderEnabled] = useState(
    initial ? initial.reminder_enabled !== false : true,
  );
  const [hiddenFromLb, setHiddenFromLb] = useState(
    initial ? !!initial.hidden_from_leaderboard : false,
  );
  const [recurInterval, setRecurInterval] = useState("none");
  const [recurCount, setRecurCount] = useState(4);
  // When editing an event that belongs to a series, this toggle routes the
  // save to the series-level PATCH so every occurrence in the series gets
  // the same update (name / multiplier / subtitle / reminder).
  const [applyToSeries, setApplyToSeries] = useState(false);
  // Live count of occurrences in this series so the "Tüm seride uygula"
  // toggle shows an accurate blast-radius chip before the admin saves.
  const [seriesCount, setSeriesCount] = useState(0);
  useEffect(() => {
    if (!initial?.series_id) { setSeriesCount(0); return; }
    let cancelled = false;
    api.get(`/events?series_id=${encodeURIComponent(initial.series_id)}`)
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r?.data) ? r.data : (r?.data?.items || []);
        setSeriesCount(list.filter((e) => e.series_id === initial.series_id).length);
      })
      .catch(() => { /* fallback: just don't show count */ });
    return () => { cancelled = true; };
  }, [initial?.series_id]);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(initial?.banner_url ? [{ id: "existing", url: initial.banner_url, filename: "banner" }] : []);
  const { data: activeGroups = [] } = useSWR("/event-groups?active_only=true", fetcher);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("name_field_required")); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(), date: new Date(date).toISOString(),
        multiplier: Number(multiplier), subtitle: subtitle.trim() || null,
        group_name: grouped ? (groupName || "").trim() || null : "",
        banner_url: banner[0]?.url || null,
        reminder_enabled: reminderEnabled,
        hidden_from_leaderboard: hiddenFromLb,
        recurrence_interval: recurInterval,
        recurrence_count: Number(recurCount) || 1,
      };
      let res;
      if (initial) {
        if (applyToSeries && initial.series_id) {
          // Series-level bulk edit — subset of fields (no date, no banner).
          const seriesBody = {
            name: body.name, multiplier: body.multiplier,
            subtitle: body.subtitle, reminder_enabled: body.reminder_enabled,
            group_name: body.group_name,
          };
          res = await api.patch(`/events/series/${initial.series_id}`, seriesBody);
        } else {
          res = await api.patch(`/events/${initial.id}`, body);
        }
      } else {
        res = await api.post("/events", body);
      }
      mutate((k) => typeof k === "string" && (k.startsWith("/events") || k.startsWith("/event-groups")));
      mutate("/stats");
      const spawned = res?.data?.recurrence_created || 0;
      const matched = res?.data?.matched || 0;
      if (spawned > 1) {
        toast.success(`${spawned} etkinlik oluşturuldu (${recurInterval})`);
      } else if (applyToSeries && matched > 1) {
        toast.success(`Seri güncellendi (${matched} etkinlik)`);
      } else {
        toast.success(initial ? t("updated") : t("event_added"));
      }
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? t("edit_event") : t("new_event")}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("name_field")}</label>
        <input data-testid={EVENTS.formName} value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("date")}</label>
        <input data-testid={EVENTS.formDate} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("multiplier")}</label>
        <input data-testid={EVENTS.formMultiplier} type="number" step="0.5" value={multiplier} onChange={(e) => setMultiplier(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("subtitle")}</label>
        <input data-testid={EVENTS.formSubtitle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
          placeholder={t("subtitle_example")}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Grup Tipi</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            data-testid="event-form-grouped-yes"
            onClick={() => setGrouped(true)}
            className={`chip justify-center py-2 ${grouped ? "active" : ""}`}
            aria-pressed={grouped}
          >
            Kolektif
          </button>
          <button
            type="button"
            data-testid="event-form-grouped-no"
            onClick={() => setGrouped(false)}
            className={`chip justify-center py-2 ${!grouped ? "active" : ""}`}
            aria-pressed={!grouped}
          >
            Bireysel
          </button>
        </div>

        {(!grouped || !(groupName || "").trim()) && (
          <div
            data-testid="event-form-groupless-hint"
            className="mt-2 rounded p-2 text-[11px] flex items-start gap-2"
            style={{
              background: "rgba(245,166,35,0.08)",
              border: "1px solid rgba(245,166,35,0.35)",
              color: "#F5A623",
            }}
          >
            <span aria-hidden>ⓘ</span>
            <span>Bu etkinlik <b>kendi adıyla</b> sıralamada görünecek.</span>
          </div>
        )}

        {/* Tekrarlama — creates or extends a recurring series. On CREATE
            this generates `count` copies starting at the picked date; on
            EDIT it spawns `count-1` future copies AFTER the current event
            (the current one stays untouched). Interval "none" = single. */}
        {initial?.series_id && (
          <label
            className="flex items-center gap-2 mb-2 p-2 rounded cursor-pointer"
            style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.35)" }}
            data-testid="event-form-apply-series-label"
          >
            <input
              type="checkbox"
              checked={applyToSeries}
              onChange={(e) => setApplyToSeries(e.target.checked)}
              data-testid="event-form-apply-series"
              className="accent-violet-400"
            />
            <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: "#C4B5FD" }}>
              🔗 Tüm seride uygula
            </span>
            {applyToSeries && seriesCount > 1 && (
              <span
                className="chip text-[10px]"
                style={{
                  borderColor: "rgba(139,92,246,0.55)",
                  color: "#DDD6FE",
                  background: "rgba(139,92,246,0.20)",
                  animation: "pulse 1.6s ease-in-out infinite",
                }}
                data-testid="event-form-series-preview"
              >
                ⚠️ {seriesCount} etkinlik güncellenecek
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto mono">series {(initial.series_id || "").slice(0, 6)}</span>
          </label>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-4">
          Tekrarlama {initial && <span className="text-[9px] opacity-70">(bu etkinlikten sonra ek etkinlikler oluşturur)</span>}
        </label>
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {[
            { key: "none",     label: "Yok"  },
            { key: "2days",    label: "2 Günde" },
            { key: "weekly",   label: "Haftalık" },
            { key: "2weekly",  label: "2 Haftada" },
            { key: "monthly",  label: "Aylık" },
          ].map((opt) => {
            const active = recurInterval === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                data-testid={`event-form-recur-${opt.key}`}
                onClick={() => setRecurInterval(opt.key)}
                className="chip justify-center text-[10px] py-1"
                style={active ? {
                  borderColor: "#F5A623",
                  color: "#FCD34D",
                  background: "rgba(245,166,35,0.15)",
                } : { opacity: 0.7 }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {recurInterval !== "none" && (
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[10px] uppercase text-muted-foreground font-bold">Kaç kere</label>
            <input
              data-testid="event-form-recur-count"
              type="number"
              min={2}
              max={52}
              value={recurCount}
              onChange={(e) => setRecurCount(e.target.value)}
              className="w-16 bg-background border border-border rounded-md px-2 py-1 text-xs text-white mono text-center"
            />
            <span className="text-[10px] text-muted-foreground">(2–52)</span>
          </div>
        )}

        {grouped && (
          <>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("group")}</label>
            {activeGroups.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                {activeGroups.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    data-testid={`event-group-chip-${g.name}`}
                    onClick={() => setGroupName(g.name)}
                    className={`chip ${groupName === g.name ? "active" : ""}`}
                  >
                    {g.name}
                    <span className="ml-1 text-[9px] opacity-70">({g.active})</span>
                  </button>
                ))}
              </div>
            )}
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
              data-testid={EVENTS.formGroup || "event-form-group"}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Etkinlik Görseli</label>
        <ImageDropzone purpose="event" value={banner} onChange={setBanner} max={1} compact />

        <div className="mt-4 rounded p-3" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.30)" }} data-testid="event-form-reminder-toggle">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              data-testid="event-form-reminder-checkbox"
              className="cursor-pointer"
            />
            <span className="flex-1">
              <span className="block text-sm font-bold text-white">
                🔔 {t("event_form_reminder_label") || "Bu etkinlik için hatırlatma kurulabilir"}
              </span>
              <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">
                {reminderEnabled
                  ? (t("event_form_reminder_hint_on") || "Etkinlik 'Hatırlatmalı' sekmesinde görünür — Bildirim Kur butonu aktif olur.")
                  : (t("event_form_reminder_hint_off") || "Etkinlik 'Hatırlatmasız' sekmesine gider — sadece kayıt tutulur, hatırlatma önerilmez.")}
              </span>
            </span>
          </label>
        </div>

        <div className="mt-3 rounded p-3" style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.30)" }} data-testid="event-form-visibility-toggle">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!hiddenFromLb}
              onChange={(e) => setHiddenFromLb(!e.target.checked)}
              data-testid="event-form-visibility-checkbox"
              className="cursor-pointer"
            />
            <span className="flex-1">
              <span className="block text-sm font-bold text-white">
                🏆 Sıralamada göster
              </span>
              <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">
                {hiddenFromLb
                  ? "Bu etkinlik sıralamadan gizlenir — puan girilebilir ama toplama katılmaz."
                  : "Bu etkinliğe eklenen puanlar Sıralama sayfasında toplama dahil edilir."}
              </span>
            </span>
          </label>
        </div>

        <button data-testid={EVENTS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : initial ? t("update") : t("add_short")}
        </button>
      </form>
    </div>
  );
}

function EventFolderManager({ folders, onClose }) {
  // 8-color curated palette — replaces the raw <input type="color"> so
  // admins land on brand-consistent options instead of the full spectrum.
  const PALETTE = [
    { hex: "#F5A623", label: "Amber" },
    { hex: "#E74C1A", label: "Ember" },
    { hex: "#A855F7", label: "Amethyst" },
    { hex: "#3B82F6", label: "Sapphire" },
    { hex: "#22C55E", label: "Emerald" },
    { hex: "#F43F5E", label: "Rose" },
    { hex: "#06B6D4", label: "Cyan" },
    { hex: "#94A3B8", label: "Slate" },
  ];
  // Curated emoji glyphs — busy archives stay scannable when each folder
  // wears an icon in addition to its colour.
  const ICONS = ["📁", "🏆", "🎯", "⚔️", "🛡️", "🌟", "💎", "🔥", "👑", "🎖️"];
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0].hex);
  const [icon, setIcon] = useState(ICONS[0]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const { data: templates = [] } = useSWR("/event-folder-templates", (u) => api.get(u).then((r) => r.data), { refreshInterval: 15000 });

  const create = async () => {
    const nm = name.trim();
    if (!nm) { toast.error("Klasör adı boş olamaz"); return; }
    setBusy(true);
    try {
      await api.post("/event-folders", { name: nm, color, icon });
      mutate("/event-folders");
      setName("");
      toast.success("Klasör oluşturuldu");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const saveEdit = async (id) => {
    const nm = editName.trim();
    if (!nm) { toast.error("Ad boş olamaz"); return; }
    setBusy(true);
    try {
      await api.patch(`/event-folders/${id}`, { name: nm, color: editColor, icon: editIcon });
      mutate("/event-folders");
      setEditingId(null);
      toast.success("Güncellendi");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const remove = async (id, nm) => {
    if (!window.confirm(`"${nm}" klasörü silinsin mi? İçindeki etkinlikler klasörsüz kalır.`)) return;
    setBusy(true);
    try {
      await api.delete(`/event-folders/${id}`);
      mutate("/event-folders");
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      toast.success("Silindi");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const saveTemplate = async () => {
    const nm = name.trim();
    if (!nm) { toast.error("Şablon için önce klasör adı gir"); return; }
    setBusy(true);
    try {
      await api.post("/event-folder-templates", { name: nm, folder_name_default: nm, color, icon });
      mutate("/event-folder-templates");
      toast.success("Şablon kaydedildi");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const applyTemplate = (tpl) => {
    setName(tpl.folder_name_default || tpl.name || "");
    setColor(tpl.color || PALETTE[0].hex);
    setIcon(tpl.icon || ICONS[0]);
    toast.success(`Şablon yüklendi — "Ekle" ile klasörü oluştur`);
  };

  const deleteTemplate = async (tid, tname) => {
    if (!window.confirm(`"${tname}" şablonu silinsin mi?`)) return;
    try {
      await api.delete(`/event-folder-templates/${tid}`);
      mutate("/event-folder-templates");
      toast.success("Şablon silindi");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    }
  };

  const renderPalette = (selected, onPick, testIdPrefix = "palette") => (
    <div className="flex gap-1 flex-wrap" data-testid={`${testIdPrefix}-swatches`}>
      {PALETTE.map((p) => {
        const isSel = String(selected).toLowerCase() === p.hex.toLowerCase();
        return (
          <button
            key={p.hex}
            type="button"
            onClick={() => onPick(p.hex)}
            data-testid={`${testIdPrefix}-${p.hex.slice(1)}`}
            title={p.label}
            aria-label={p.label}
            aria-pressed={isSel}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: p.hex,
              border: isSel ? "2px solid #FFF7ED" : "2px solid rgba(255,255,255,0.15)",
              boxShadow: isSel ? `0 0 10px ${p.hex}` : "none",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );

  const renderIcons = (selected, onPick, testIdPrefix = "icons") => (
    <div className="flex gap-1 flex-wrap" data-testid={`${testIdPrefix}-swatches`}>
      {ICONS.map((ic) => {
        const isSel = selected === ic;
        return (
          <button
            key={ic}
            type="button"
            onClick={() => onPick(ic)}
            data-testid={`${testIdPrefix}-${ic}`}
            aria-pressed={isSel}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isSel ? "rgba(245,166,35,0.20)" : "rgba(255,255,255,0.05)",
              border: isSel ? "2px solid #F5A623" : "2px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {ic}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      data-testid="events-folder-manager"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, #1E1410 0%, #0F0806 100%)",
          border: "1px solid rgba(245,166,35,0.55)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(231,76,26,0.25)",
          maxHeight: "85vh",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(245,166,35,0.35)" }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 16 }}>📁</span>
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
              Arşiv Klasörleri
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="events-folder-manager-close"
            className="p-1.5 rounded hover:bg-white/10"
            style={{ color: "#F5F0E8" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {templates.length > 0 && (
          <div className="px-4 py-2 border-b" style={{ borderColor: "rgba(245,166,35,0.2)" }}>
            <div className="text-[10px] uppercase tracking-widest mb-1.5 font-bold" style={{ color: "#C4B5FD", letterSpacing: "0.12em" }}>
              Şablonlar
            </div>
            <div className="flex flex-wrap gap-1" data-testid="events-folder-templates-list">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="chip text-[10px] flex items-center gap-1"
                  data-testid={`events-folder-template-${tpl.id}`}
                  style={{
                    padding: "3px 6px 3px 8px",
                    borderColor: `${tpl.color || "#F5A623"}55`,
                    color: tpl.color || "#F5A623",
                    background: `${tpl.color || "#F5A623"}12`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="flex items-center gap-1"
                    title="Bu şablonu yükle"
                    data-testid={`events-folder-template-apply-${tpl.id}`}
                  >
                    <span>{tpl.icon || "📁"}</span>
                    <span className="font-bold">{tpl.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(tpl.id, tpl.name)}
                    className="ml-1 opacity-60 hover:opacity-100"
                    title="Şablonu sil"
                    data-testid={`events-folder-template-delete-${tpl.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-b flex flex-col gap-2" style={{ borderColor: "rgba(245,166,35,0.2)" }}>
          <div className="flex items-center gap-2">
            <input
              data-testid="events-folder-new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Yeni klasör adı"
              className="flex-1 rounded px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none"
              style={{ background: "#1A1210", border: "1px solid rgba(245,166,35,0.35)" }}
            />
            <button
              type="button"
              data-testid="events-folder-new-submit"
              onClick={create}
              disabled={busy || !name.trim()}
              className="chip text-[10px] flex items-center gap-1"
              style={{
                padding: "8px 12px",
                borderColor: "rgba(245,166,35,0.55)",
                color: "#F5A623",
                background: "rgba(245,166,35,0.10)",
              }}
            >
              <Plus className="w-3 h-3" /> Ekle
            </button>
          </div>
          {renderPalette(color, setColor, "new-color")}
          {renderIcons(icon, setIcon, "new-icon")}
          <button
            type="button"
            onClick={saveTemplate}
            disabled={busy || !name.trim()}
            className="self-start chip text-[10px] flex items-center gap-1"
            data-testid="events-folder-save-template"
            style={{
              padding: "5px 10px",
              borderColor: "rgba(168,85,247,0.55)",
              color: "#C4B5FD",
              background: "rgba(168,85,247,0.10)",
            }}
            title="Bu ayarları şablon olarak kaydet"
          >
            <Star className="w-3 h-3" /> Şablon Olarak Kaydet
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2" data-testid="events-folder-manager-list">
          {folders.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Henüz klasör yok. Yukarıdan ilk klasörü oluştur.
            </div>
          ) : (
            folders.map((f) => (
              <div
                key={f.id}
                data-testid={`events-folder-row-${f.id}`}
                className="px-3 py-2 flex flex-col gap-1.5 hover:bg-white/5"
                style={{ borderBottom: "1px solid rgba(245,166,35,0.10)" }}
              >
                {editingId === f.id ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(f.id)}
                        className="flex-1 rounded px-2 py-1 text-sm text-white"
                        style={{ background: "#1A1210", border: "1px solid rgba(245,166,35,0.35)" }}
                        data-testid={`events-folder-edit-name-${f.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(f.id)}
                        disabled={busy}
                        data-testid={`events-folder-save-${f.id}`}
                        className="p-1 rounded text-green-400 hover:bg-green-500/10"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded text-red-400 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {renderPalette(editColor, setEditColor, `edit-color-${f.id}`)}
                    {renderIcons(editIcon, setEditIcon, `edit-icon-${f.id}`)}
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 16 }}>{f.icon || "📁"}</span>
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: f.color || "#F5A623",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate" style={{ color: "#F5F0E8" }}>
                        {f.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {f.archived_count || 0} arşiv etkinlik
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setEditingId(f.id); setEditName(f.name); setEditColor(f.color || PALETTE[0].hex); setEditIcon(f.icon || ICONS[0]); }}
                      data-testid={`events-folder-edit-${f.id}`}
                      className="p-1 rounded text-blue-400 hover:bg-blue-500/10"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f.id, f.name)}
                      disabled={busy}
                      data-testid={`events-folder-delete-${f.id}`}
                      className="p-1 rounded text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

