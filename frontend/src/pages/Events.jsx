import React, { useState, useMemo, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { EVENTS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, Archive, X, Calendar, ArchiveRestore, Check, Camera, BellOff, Users, User, LayoutGrid, CalendarDays, CheckSquare, Square, EyeOff, Eye, Star, ChevronDown, ChevronRight, LayoutTemplate, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ImageDropzone from "@/components/ImageDropzone";
import OcrDialog from "@/components/OcrDialog";
import EventAttendance from "@/components/EventAttendance";
import EventReminderDialog from "@/components/EventReminderDialog";
import EventCountdown from "@/components/EventCountdown";
import EventResultGallery from "@/components/EventResultGallery";
import EventCalendar from "@/components/EventCalendar";
import { BellRing, GripVertical, Folder, MessageCircle } from "lucide-react";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import EventChatDrawer from "@/components/EventChatDrawer";
import { useAuth } from "@/context/AuthContext";
import { groupColor, groupBgTint } from "@/lib/groupColors";

const fetcher = (url) => api.get(url).then((r) => r.data);

// Admin-only inline chip that shows "✅ 12 · 🤔 3 · ❌ 5" — sourced from
// /events/:id/rsvp/summary. Rendered inside <CanEdit> so members never see it.
// Tapping the chip opens a modal listing exactly which users chose each option.
function RsvpSummaryChip({ eventId }) {
  const { data } = useSWR(`/events/${eventId}/rsvp/summary`, fetcher, { refreshInterval: 30000 });
  const [open, setOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [customMsg, setCustomMsg] = useState("");
  const { data: listData } = useSWR(open ? `/events/${eventId}/rsvp/list` : null, fetcher);
  const sendReminder = async () => {
    if (reminding || reminderSent) return;
    setReminding(true);
    try {
      const trimmed = customMsg.trim();
      const r = await api.post(`/events/${eventId}/rsvp/remind`, {
        include_maybe: true,
        custom_body: trimmed || undefined,
      });
      const sent = r.data?.sent ?? 0;
      const matched = r.data?.matched ?? 0;
      toast.success(`✅ Hatırlatma gönderildi (${sent}/${matched} bildirim)`);
      setReminderSent(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Hatırlatma gönderilemedi");
    } finally { setReminding(false); }
  };
  if (!data) return null;
  const { yes_count = 0, maybe_count = 0, no_count = 0 } = data;
  if (yes_count + maybe_count + no_count === 0) return null;
  const items = listData?.items || [];
  const yesUsers   = items.filter((r) => r.status === "yes");
  const maybeUsers = items.filter((r) => r.status === "maybe");
  const noUsers    = items.filter((r) => r.status === "no");
  return (
    <>
      <button
        type="button"
        onClick={(ev) => { ev.stopPropagation(); setOpen(true); }}
        data-testid={`rsvp-summary-${eventId}`}
        className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold mono cursor-pointer hover:brightness-125"
        style={{
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(245,166,35,0.35)",
          letterSpacing: "0.02em",
          color: "#F5A623",
        }}
        title="Tıkla — RSVP listesini gör (yalnızca yetkililer görür)"
      >
        {/* v52 — Simplified chip: total participants + a chevron. The
            detailed ✅/🤔/❌ breakdown lives in the modal so the card row
            keeps maximum width for name + date. */}
        <span aria-hidden="true">👥</span>
        <span>{yes_count + maybe_count + no_count}</span>
        <span aria-hidden="true" style={{ opacity: 0.7, marginLeft: 1 }}>▾</span>
      </button>
      {open && (
        <div
          data-testid={`rsvp-modal-backdrop-${eventId}`}
          onClick={(ev) => { ev.stopPropagation(); setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9995,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            data-testid={`rsvp-modal-${eventId}`}
            style={{
              width: "100%", maxWidth: 420, maxHeight: "80vh", overflow: "auto",
              background: "linear-gradient(180deg, rgba(20,10,6,0.98), rgba(10,6,4,0.98))",
              border: "1.5px solid rgba(245,166,35,0.55)",
              borderRadius: 12, padding: 18, position: "relative",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 24px rgba(245,166,35,0.25)",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid={`rsvp-modal-close-${eventId}`}
              style={{ position: "absolute", top: 6, right: 12, background: "transparent", border: "none", color: "rgba(245,240,232,0.6)", fontSize: 20, cursor: "pointer" }}
            >
              ×
            </button>
            <div style={{ fontFamily: "Cinzel, serif", fontWeight: 800, fontSize: 14, letterSpacing: "0.14em", color: "#F5A623", textTransform: "uppercase", marginBottom: 12, textShadow: "0 0 6px rgba(245,166,35,0.4)" }}>
              RSVP Katılım Listesi
            </div>
            {[
              { key: "yes",   emoji: "✅", label: "Katılacağım", color: "#4ade80", users: yesUsers },
              { key: "maybe", emoji: "🤔", label: "Belki",       color: "#F5A623", users: maybeUsers },
              { key: "no",    emoji: "❌", label: "Katılamam",   color: "#fca5a5", users: noUsers },
            ].map((sec) => (
              <div key={sec.key} data-testid={`rsvp-modal-section-${sec.key}`} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: sec.color, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  <span>{sec.emoji}</span>
                  <span>{sec.label}</span>
                  <span style={{ marginLeft: "auto", color: "#888", fontFamily: "monospace" }}>{sec.users.length}</span>
                </div>
                {sec.users.length === 0 ? (
                  <div style={{ fontSize: 11, color: "rgba(245,240,232,0.4)", fontStyle: "italic", paddingLeft: 22 }}>—</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {sec.users.map((u) => (
                      <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: 12 }}>{sec.emoji}</span>
                        <span style={{ fontSize: 12, color: "#F5F0E8", fontWeight: 600 }}>{u.username || u.user_id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  color: "#D4730A",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Özel Mesaj (opsiyonel)
              </label>
              <textarea
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value.slice(0, 240))}
                disabled={reminding || reminderSent}
                data-testid={`rsvp-modal-custom-msg-${eventId}`}
                placeholder="Örn: Kale surlarında toplanın, 5dk kaldı! 🏰"
                rows={2}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(245,166,35,0.35)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  color: "#F5F0E8",
                  fontSize: 12,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "rgba(245,240,232,0.5)" }}>
                <span>Boş bırakılırsa varsayılan mesaj gönderilir</span>
                <span style={{ fontFamily: "monospace" }}>{customMsg.length}/240</span>
              </div>
            </div>
            <button
              type="button"
              onClick={sendReminder}
              disabled={reminding || reminderSent}
              data-testid={`rsvp-modal-remind-${eventId}`}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                cursor: reminding || reminderSent ? "default" : "pointer",
                background: reminderSent
                  ? "rgba(34,197,94,0.22)"
                  : "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)",
                color: reminderSent ? "#4ade80" : "#0a0a0a",
                fontFamily: "Cinzel, serif",
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                boxShadow: reminderSent ? "none" : "0 4px 14px rgba(0,0,0,0.5), 0 0 16px rgba(245,166,35,0.35)",
                opacity: reminding ? 0.6 : 1,
              }}
            >
              {reminderSent ? "✅ Hatırlatma Gönderildi" : reminding ? "Gönderiliyor…" : "📣 Herkese Hatırlatma Gönder"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Events() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
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

  // Deep link from MemberHome: /etkinlikler#event-<id>. Waits for the event
  // list to hydrate, switches to the tab that actually contains that event,
  // then scrolls it into view + adds a short amber ring so users see where
  // they landed.
  const allEventsForHash = useSWR("/events?archived=false", fetcher).data || [];
  const archivedForHash = useSWR("/events?archived=true", fetcher).data || [];
  useEffect(() => {
    const h = location.hash || "";
    if (!h.startsWith("#event-")) return;
    const targetId = h.slice("#event-".length);
    // Route to correct tab so the event actually renders in the DOM.
    const active = [...allEventsForHash];
    const archived = [...archivedForHash];
    const inArchived = archived.find((e) => e.id === targetId);
    const inActive = active.find((e) => e.id === targetId);
    if (inArchived) setTab("archive");
    else if (inActive && inActive.reminder_enabled === false) setTab("unreminded");
    else if (inActive) setTab("reminded");
    setView("list");
    // Give the DOM a beat to render the newly-active tab, then scroll.
    const timer = setTimeout(() => {
      const el = document.getElementById(`event-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const prev = el.style.boxShadow;
        el.style.boxShadow = "0 0 0 3px rgba(245,166,35,0.9), 0 0 22px rgba(245,166,35,0.55)";
        setTimeout(() => { el.style.boxShadow = prev; }, 2200);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [location.hash, allEventsForHash.length, archivedForHash.length]);
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
  // v135.39 — Şablondan hızlı oluşturma: seçilen event-template EventForm'a
  // initialTemplate olarak geçilir; form açılışta bu şablonu otomatik apply eder.
  const [prefillTpl, setPrefillTpl] = useState(null);
  // v135.40 — Şablondan Seri Oluşturma
  const [seriesTpl, setSeriesTpl] = useState(null);
  // v135.43 — 'Yeni' butonu artık 2 seçenekli dropdown (Bireysel / İttifak)
  const [newEventOpen, setNewEventOpen] = useState(false);
  const newEventMenuRef = React.useRef(null);
  useEffect(() => {
    if (!newEventOpen) return;
    const onDoc = (e) => {
      if (newEventMenuRef.current && !newEventMenuRef.current.contains(e.target)) {
        // If click was on the toggle button itself, let its handler flip state.
        const t = e.target;
        if (t.closest && t.closest(`[data-testid="${EVENTS.addBtn}"]`)) return;
        setNewEventOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [newEventOpen]);
  // v132 — Bireysel Etkinlik modal state (separate quick-add form).
  const [showBireyselForm, setShowBireyselForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  // v124 — Event chat drawer state. Stores the event id whose chat is open.
  const [chatEventId, setChatEventId] = useState(null);
  const { user: me, isAdmin } = useAuth();
  // v135.33 — Bulk RSVP counts for the ✅/🤔/❌ chips on every event card.
  // Admin/editor only (route returns 403 otherwise). Refresh every 30s.
  const { data: rsvpCountsData } = useSWR(
    isAdmin ? "/events/rsvp/counts" : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const rsvpCounts = rsvpCountsData?.counts || {};
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
  // Which group accordions are open inside the expanded folder panel.
  // Keyed by `${folderId}::${groupKey}` so re-selecting a folder doesn't
  // lose state across sessions.
  const [openedGroups, setOpenedGroups] = useState({});
  // v130 — Collapsed groups on the main Kolektif column. Persisted to
  // localStorage so the accordion state survives navigation. Keyed by
  // raw group name (case-sensitive) matching MongoDB `group_name`.
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const raw = localStorage.getItem("events_collapsed_groups");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const toggleCollapsedGroup = (name) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      try { localStorage.setItem("events_collapsed_groups", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  const archived = tab === "archive";
  const { data: events = [] } = useSWR(`/events?archived=${archived}`, fetcher, { refreshInterval: 6000 });
  const { data: folders = [] } = useSWR("/event-folders", fetcher, { refreshInterval: 15000 });

  const allActive = useSWR("/events?archived=false", fetcher).data || [];
  const remindedCount = allActive.filter((e) => e.reminder_enabled !== false).length;
  const unremindedCount = allActive.filter((e) => e.reminder_enabled === false).length;
  const archivedCount = useSWR("/events?archived=true", fetcher).data?.length || 0;

  // v136.3 — Arşiv sekmesi için gelişmiş filtre paneli. Sadece
  // `tab==="archive"` iken uygulanır; klasör grid'inin ÜSTÜNDE render edilir
  // ve `filteredEvents` useMemo'da uygulanır. participantQuery non-empty
  // olduğunda `/points?search=X` çekilir ve o etkinlik ID'leri set'e alınır.
  const [archFilter, setArchFilter] = useState({
    dateFrom: "",
    dateTo: "",
    typeQuery: "",
    participantQuery: "",
  });
  const debouncedParticipant = React.useDeferredValue(archFilter.participantQuery.trim());
  const { data: archParticipantPoints = [] } = useSWR(
    archived && debouncedParticipant.length >= 2
      ? `/points?search=${encodeURIComponent(debouncedParticipant)}&limit=2000`
      : null,
    fetcher,
  );
  const participantEventIdSet = useMemo(() => {
    if (!debouncedParticipant) return null;
    return new Set(archParticipantPoints.map((p) => p.event_id).filter(Boolean));
  }, [archParticipantPoints, debouncedParticipant]);

  const filteredEvents = useMemo(() => {
    let list = events;
    if (!archived) {
      if (tab === "reminded") list = list.filter((e) => e.reminder_enabled !== false);
      else list = list.filter((e) => e.reminder_enabled === false);
    } else {
      // Archive: apply folder filter + sort direction
      if (folderId === "none") list = list.filter((e) => !e.folder_id);
      else if (folderId) list = list.filter((e) => e.folder_id === folderId);
      // v136.3 — Gelişmiş arşiv filtreleri
      if (archFilter.dateFrom) {
        const fromMs = new Date(archFilter.dateFrom).getTime();
        if (!isNaN(fromMs)) list = list.filter((e) => new Date(e.date).getTime() >= fromMs);
      }
      if (archFilter.dateTo) {
        const toMs = new Date(archFilter.dateTo).getTime() + 24 * 3600 * 1000 - 1;
        if (!isNaN(toMs)) list = list.filter((e) => new Date(e.date).getTime() <= toMs);
      }
      if (archFilter.typeQuery.trim()) {
        const q = archFilter.typeQuery.trim().toLowerCase();
        list = list.filter((e) =>
          (e.name || "").toLowerCase().includes(q) ||
          (e.group_name || "").toLowerCase().includes(q) ||
          (e.subtitle || "").toLowerCase().includes(q));
      }
      if (participantEventIdSet) {
        list = list.filter((e) => participantEventIdSet.has(e.id));
      }
      const dir = archiveSort === "oldest" ? 1 : -1;
      list = [...list].sort((a, b) => dir * (new Date(b.date) - new Date(a.date)));
    }
    return list;
  }, [events, tab, archived, folderId, archiveSort, archFilter, participantEventIdSet]);

  // Split events into (a) grouped-by-name and (b) ungrouped so the page can
  // render two clean side-by-side columns instead of mixing them together.
  // A group_name of "", null, undefined or whitespace-only counts as ungrouped.
  const { groupedMap, ungrouped } = useMemo(() => {
    const g = {};
    const un = [];
    filteredEvents.forEach((e) => {
      // v140.43 — Kolon kategorileme artık event_type'a göre: "bireysel" işaretli
      // etkinlikler grup adı verilse de HER ZAMAN Bireysel kolonuna düşer.
      // Legacy kayıtlar (event_type=None) için grup adı fallback devreye girer.
      const et = (e.event_type || "").trim().toLowerCase();
      if (et === "bireysel") {
        un.push(e);
        return;
      }
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
        className={`card-dark row-hover flex flex-wrap items-center gap-2 cursor-pointer ${dragId === e.id ? "opacity-50" : ""}`}
        variants={{
          hidden: { opacity: 0, y: 14 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
        }}
        style={highlight ? {
          overflow: "hidden",
          padding: "10px 10px 10px 10px",
          minHeight: 96,
          backgroundImage: "repeating-linear-gradient(45deg, rgba(220,38,38,0.14), rgba(220,38,38,0.14) 6px, transparent 6px, transparent 14px)",
          borderColor: "rgba(220,38,38,0.55)",
          boxShadow: "0 0 12px rgba(220,38,38,0.25), inset 0 0 12px rgba(220,38,38,0.1)",
        } : {
          overflow: "hidden",
          padding: "10px 10px 10px 10px",
          minHeight: 96,
          borderLeft: `3px solid ${gc}`,
          background: group
            ? `linear-gradient(135deg, ${groupBgTint(group, 0.70)} 0%, rgba(30,27,75,0.62) 55%, rgba(15,10,45,0.72) 100%)`
            : "linear-gradient(135deg, rgba(76,29,149,0.72) 0%, rgba(30,27,75,0.62) 55%, rgba(15,10,45,0.72) 100%)",
          border: "1px solid rgba(168,85,247,0.35)",
          boxShadow: "0 0 14px rgba(168,85,247,0.28), inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.55)",
        }}
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
            className="font-bold text-white"
            data-testid={`event-name-${e.id}`}
            style={{
              fontFamily: "Rajdhani, sans-serif",
              fontSize: 15,
              letterSpacing: "0.02em",
              // v136.6 — Etkinlik adları artık asla kesilmez: uzun isimler
              // birden fazla satıra sarılır. `wordBreak: break-word` +
              // `overflowWrap: anywhere` kombinasyonu hem TR hem CJK
              // karakterlerle çalışır. Parent flex-wrap:wrap sayesinde
              // RSVP chip aşağı düşer, isim tüm genişliği kullanabilir.
              whiteSpace: "normal",
              overflow: "visible",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              lineHeight: 1.25,
            }}
          >
            {/* v128 — Grup Adı / Etkinlik Adı formatı. group_translations
                ve name_translations dict'lerini kullanarak kullanıcının
                diline göre lokalize eder; yoksa TR fallback. */}
            {e.group_name && String(e.group_name).trim() ? (
              <>
                <span style={{ color: "#D4AF37", fontWeight: 800, letterSpacing: "0.05em" }}>
                  {(() => {
                    const lng = (i18n.language || "tr").split("-")[0].toLowerCase();
                    const raw = String(e.group_name).trim();
                    if (lng === "tr") return raw;
                    return (e.group_translations || {})[lng] || raw;
                  })()}
                </span>
                <span style={{ color: "#94A3B8", padding: "0 6px", fontWeight: 500 }}>/</span>
                <span>{(() => {
                  const lng = (i18n.language || "tr").split("-")[0].toLowerCase();
                  if (lng === "tr") return e.name;
                  return (e.name_translations || {})[lng] || e.name;
                })()}</span>
              </>
            ) : (
              (() => {
                const lng = (i18n.language || "tr").split("-")[0].toLowerCase();
                if (lng === "tr") return e.name;
                return (e.name_translations || {})[lng] || e.name;
              })()
            )}
          </div>
          <div
            className="text-[11px] text-muted-foreground mono"
            data-testid={`event-date-${e.id}`}
            style={{
              marginTop: 2,
              // v52 — date always on ONE line, fully readable on mobile/tablet.
              // Removed `truncate` (which added `overflow:hidden;text-overflow:ellipsis`)
              // and let the date extend naturally — dates are always short so no
              // overflow issue arises.
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
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
        {/* v135.33 — RSVP counts chips (admin only). Compact
            `✅ 8 · 🤔 4 · ❌ 2` bar so commitment gaps pop off the list. */}
        {isAdmin && rsvpCounts[e.id] && (
          (rsvpCounts[e.id].yes_count + rsvpCounts[e.id].maybe_count + rsvpCounts[e.id].no_count) > 0
        ) && (
          <div
            className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono font-bold"
            data-testid={`event-rsvp-counts-${e.id}`}
            onClick={(ev) => ev.stopPropagation()}
          >
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ background: "rgba(34,197,94,0.15)", color: "#86efac",
                       border: "1px solid rgba(34,197,94,0.35)" }}
              data-testid={`event-rsvp-yes-${e.id}`}
              title={t("rsvp_yes_title", "Kesin katılacak")}
            >
              ✅ {rsvpCounts[e.id].yes_count}
            </span>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ background: "rgba(245,166,35,0.15)", color: "#FCD34D",
                       border: "1px solid rgba(245,166,35,0.35)" }}
              data-testid={`event-rsvp-maybe-${e.id}`}
              title={t("rsvp_maybe_title", "Belki katılacak")}
            >
              🤔 {rsvpCounts[e.id].maybe_count}
            </span>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ background: "rgba(239,68,68,0.12)", color: "#FCA5A5",
                       border: "1px solid rgba(239,68,68,0.30)" }}
              data-testid={`event-rsvp-no-${e.id}`}
              title={t("rsvp_no_title", "Katılmayacak")}
            >
              ❌ {rsvpCounts[e.id].no_count}
            </span>
          </div>
        )}
        {/* v124 — Takvimime Ekle + Etkinlik Sohbeti. Rendered inline as
            secondary CTAs; stop propagation so the card click (detail
            modal) doesn't fire. */}
        <div className="w-full flex items-center gap-1 flex-wrap mt-1" onClick={(ev) => ev.stopPropagation()}>
          <AddToCalendarButton event={e} compact />
          <button
            type="button"
            onClick={() => setChatEventId(e.id)}
            data-testid={`event-chat-open-${e.id}`}
            className="inline-flex items-center gap-1 rounded-md font-bold uppercase"
            style={{
              padding: "4px 8px",
              fontSize: 10,
              letterSpacing: "0.08em",
              background: "rgba(245,166,35,0.12)",
              color: "#F5A623",
              border: "1px solid rgba(245,166,35,0.35)",
            }}
            title="Etkinlik Sohbeti"
          >
            <MessageCircle style={{ width: 10, height: 10 }} /> {t("event_chat")}
          </button>
        </div>
        <CanEdit>
          <RsvpSummaryChip eventId={e.id} />
        </CanEdit>
        {/* v135.8 — Şablon kaynağı chip: hangi şablondan oluşturulduğunu
            gösterir. Yalnızca template_source_name doluysa render eder.
            Mor renk şeması Etkinlik Şablonu vurgusuyla tutarlı. */}
        {e.template_source_name && (
          <span
            data-testid={`event-template-chip-${e.id}`}
            className="inline-flex items-center gap-1 rounded-full font-bold"
            style={{
              padding: "2px 8px",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "rgba(168,85,247,0.15)",
              color: "#C4B5FD",
              border: "1px solid rgba(168,85,247,0.45)",
              marginTop: 2,
              whiteSpace: "nowrap",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`Şablondan oluşturuldu: ${e.template_source_name}`}
          >
            📋 Şablon: {e.template_source_name}
          </span>
        )}
      </motion.div>
    );
  };

  // Full group block (header + rename controls + archive/delete + event list)
  const renderGroupBlock = (group, list) => {
    const gc = groupColor(group);
    return (
      <div
        key={group}
        className="mb-5 mx-auto"
        data-testid={`event-group-block-${group}`}
        style={{
          maxWidth: "min(100%, 720px)",
          width: "94%",
        }}
      >
        <div
          className="mb-2"
          data-testid={`event-group-action-bar-${group}`}
          style={{
            background:
              "linear-gradient(90deg, #14081F 0%, #1F1140 25%, #2A1653 55%, #1B0E38 80%, #0C0619 100%)",
            borderRadius: 10,
            border: "1px solid rgba(212,175,55,0.55)",
            boxShadow:
              "inset 0 1px 0 rgba(255,220,150,0.20), inset 0 0 22px rgba(147,51,234,0.22), 0 4px 14px rgba(0,0,0,0.65), 0 0 0 1px rgba(147,51,234,0.24)",
            padding: "10px 14px",
          }}
        >
          {/* v134.2 — Row 1: Grup adı satırı (yatay, beyaz, ellipsis) */}
          <div className="flex items-center gap-2 min-w-0 mb-2">
            <button
              type="button"
              onClick={() => toggleCollapsedGroup(group)}
              data-testid={`event-group-toggle-${group}`}
              className="flex-shrink-0 flex items-center justify-center rounded transition-transform hover:scale-110"
              style={{
                width: 22, height: 22, background: "rgba(0,0,0,0.35)",
                border: `1px solid ${gc}66`, color: "#F5E7A8",
              }}
              title={collapsedGroups[group] ? "Etkinlikleri göster" : "Etkinlikleri gizle"}
              aria-expanded={!collapsedGroups[group]}
            >
              {collapsedGroups[group]
                ? <ChevronRight className="w-3.5 h-3.5" />
                : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <span
              data-testid={`event-group-dot-${group}`}
              style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: gc, boxShadow: `0 0 6px ${gc}80`, flexShrink: 0 }}
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
                className="flex-1 px-2 py-0.5 text-sm rounded"
                style={{ background: "#1A1210", color: "#F5F0E8", border: `1px solid ${gc}88`, minWidth: 0 }}
              />
            ) : (
              <h3
                onClick={() => toggleCollapsedGroup(group)}
                data-testid={`event-group-title-${group}`}
                className="cursor-pointer"
                title={group}
                style={{
                  /* v134.2 — Düz beyaz metin (silver-gradient kaldırıldı,
                     bazı cihazlarda transparent render'ı grup adını
                     görünmez yapıyordu). Yatay, tek satır, ellipsis. */
                  writingMode: "horizontal-tb",
                  transform: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  wordBreak: "normal",
                  overflowWrap: "normal",
                  lineHeight: 1.2,
                  minWidth: 0,
                  flex: "1 1 auto",
                  display: "block",
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#FFFFFF",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontFamily: "'Cinzel', 'Rajdhani', serif",
                  textShadow: `0 0 10px ${gc}, 0 2px 3px rgba(0,0,0,1)`,
                }}
              >
                {(group && String(group).trim()) || `Grup ${list.length}`}
              </h3>
            )}
            <span
              data-testid={`event-group-count-badge-${group}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "rgba(245, 158, 11, 0.85)",
                color: "#FFFFFF",
                fontSize: 12,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: "0 0 8px rgba(245,158,11,0.55), inset 0 -1px 2px rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.25)",
                flexShrink: 0,
              }}
              title={`${list.length} etkinlik`}
            >
              {list.length}
            </span>
          </div>

          {/* v134.2 — Row 2: Aksiyon butonları (kompakt, sağa yaslı) */}
          <CanEdit>
            <div className="flex items-center justify-end gap-1 flex-wrap" data-testid={`event-group-actions-${group}`}>
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
                  {/* v134.2 — Explicit "Gizle / Göster" collapse toggle button. */}
                  <button
                    onClick={() => toggleCollapsedGroup(group)}
                    data-testid={`event-group-collapse-btn-${group}`}
                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 flex items-center gap-1"
                    title={collapsedGroups[group] ? t("show_events", "Etkinlikleri göster") : t("hide_events", "Etkinlikleri gizle")}
                  >
                    {collapsedGroups[group]
                      ? <><Eye className="w-3 h-3" /> {t("show", "Göster")}</>
                      : <><EyeOff className="w-3 h-3" /> {t("hide", "Gizle")}</>}
                  </button>
                  <button
                    onClick={async () => {
                      const allHidden = list.every((e) => e.hidden_from_leaderboard);
                      const next = !allHidden;
                      if (!window.confirm(next
                        ? t("ev_group_hide_confirm", { group, n: list.length })
                        : t("ev_group_show_confirm", { group, n: list.length }))) return;
                      try {
                        const res = await api.post("/events/hide-group", { group_name: group, hidden: next });
                        mutate((k) => typeof k === "string" && k.startsWith("/events"));
                        mutate((k) => typeof k === "string" && k.startsWith("/leaderboard"));
                        toast.success(`${res.data.modified} etkinlik ${next ? "gizlendi" : "geri eklendi"}`);
                      } catch (err) {
                        toast.error(err?.response?.data?.detail || err.message);
                      }
                    }}
                    data-testid={`event-group-hide-badge-${group}`}
                    className="text-[10px] font-bold uppercase rounded-full flex items-center gap-1 transition-all hover:scale-[1.04]"
                    style={list.every((e) => e.hidden_from_leaderboard)
                      ? {
                          padding: "3px 10px",
                          background: "linear-gradient(180deg, rgba(107,114,128,0.28), rgba(31,41,55,0.55))",
                          color: "#E5E7EB",
                          border: "1px solid rgba(148,163,184,0.60)",
                          letterSpacing: "0.12em",
                          boxShadow: "inset 0 0 6px rgba(148,163,184,0.20)",
                        }
                      : {
                          padding: "2px 8px",
                          background: "transparent",
                          color: "#6B7280",
                          border: "1px dashed rgba(107,114,128,0.35)",
                          letterSpacing: "0.10em",
                          opacity: 0.55,
                        }}
                    title={list.every((e) => e.hidden_from_leaderboard)
                      ? t("ev_group_hidden_hint_hidden")
                      : t("ev_group_hidden_hint_visible")}
                  >
                    {list.every((e) => e.hidden_from_leaderboard)
                      ? <>{t("ev_group_hidden_badge")}</>
                      : <><EyeOff className="w-3 h-3" /></>}
                  </button>
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

        {!collapsedGroups[group] && (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            data-testid={`event-group-grid-${group}`}
          >
            {applyManualOrder(list, `group:${group}`).map((e) =>
              renderEventCard(e, gc, group, `group:${group}`)
            )}
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div data-testid={EVENTS.container}>
      <Header title={t("nav_events")}>
        <div className="flex items-center justify-between mb-2">
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
              onClick={() => { setNewEventOpen((v) => !v); }}
              className="btn-gold flex items-center gap-1.5 text-xs relative"
              aria-haspopup="menu"
              aria-expanded={newEventOpen}
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
              <ChevronDown className="w-3 h-3" />
            </button>
            {newEventOpen && (
              <div
                ref={newEventMenuRef}
                data-testid="events-new-menu"
                className="absolute right-4 mt-16 w-64 rounded shadow-lg z-40"
                style={{ background: "#0F0910", border: "1px solid rgba(245,166,35,0.55)" }}
              >
                <button
                  type="button"
                  data-testid="events-new-menu-bireysel"
                  onClick={() => { setNewEventOpen(false); setShowBireyselForm(true); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-violet-500/20 transition-colors border-b border-white/5 flex items-start gap-2"
                  style={{ color: "#C4B5FD" }}
                >
                  <User className="w-3.5 h-3.5 mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold">{t("events_new_bireysel_label", "Bireysel Etkinlik")}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5 leading-snug">
                      {t("events_new_bireysel_hint", "Bireysel Etkinlik")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="events-new-menu-alliance"
                  onClick={() => { setNewEventOpen(false); setEditing(null); setShowForm(true); setPrefillTpl(null); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-500/20 transition-colors flex items-start gap-2"
                  style={{ color: "#F5A623" }}
                >
                  <Users className="w-3.5 h-3.5 mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold">{t("events_new_alliance_label", "İttifak Etkinliği")}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5 leading-snug">
                      {t("events_new_alliance_hint", "SvS, Kristal, kale savaşı")}
                    </span>
                  </span>
                </button>
              </div>
            )}
          </CanEdit>
        </div>
        {/* View toggle — Liste vs Takvim */}
        <div className="flex gap-1.5" data-testid="events-view-toggle">
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
            <span aria-hidden="true" style={{ fontSize: 12 }}>📋</span> {t("event_view_list", "Liste")}
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
            <span aria-hidden="true" style={{ fontSize: 12 }}>📅</span> {t("event_view_calendar", "Takvim")}
          </button>
        </div>
      </Header>

      <div className="px-4">

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
              <span>{t("event_tab_reminded", "Hatırlatmalı")}</span>
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
              <span>{t("event_tab_unreminded", "Hatırlatmasız")}</span>
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
              <span>{t("archive", "Arşiv")}</span>
            </span>
            <span className="mono text-[10px] opacity-90">({archivedCount})</span>
          </button>
        </div>


        {/* Sub-filter chips removed per user request — Kolektif / Bireysel
            distinction is gone. All events surface in a single flow. */}

        {/* Visibility filter row removed — hidden and visible events now
            render together in the list. Each hidden event still shows a
            small "🚫 Sıralama dışı" badge on its card so admins can
            distinguish them without a filter chip. */}

        {/* Split preset chips removed — Kolektif/Bireysel split gone. */}

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
                {/* v136.3 — Gelişmiş Arşiv Filtreleri */}
                <ArchiveFilterPanel
                  filter={archFilter}
                  setFilter={setArchFilter}
                  filteredCount={filteredEvents.length}
                  totalCount={events.length}
                />
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {cards.map((c) => {
                    const isSel = folderId === c.id || (folderId === "none" && c.id === "__none__");
                    const isDrag = dragFolderId === c.id;
                    const isDropTarget = dragFolderId && dragFolderId !== c.id && !c.isSpecial;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-testid={`events-archive-card-${c.id}`}
                        draggable={!c.isSpecial}
                        onDragStart={(ev) => {
                          if (c.isSpecial) return;
                          setDragFolderId(c.id);
                          ev.dataTransfer.setData("application/x-folder-id", c.id);
                          ev.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragFolderId(null)}
                        onClick={() => {
                          const nxt = c.id === "__none__" ? "none" : c.id;
                          setFolderId(isSel ? null : nxt);
                        }}
                        onDragOver={(e) => {
                          // Accept both folder-reorder drops AND event-card
                          // drops (from the expanded panel below).
                          if (
                            e.dataTransfer.types.includes("application/x-event-id") ||
                            (isDropTarget && e.dataTransfer.types.includes("application/x-folder-id"))
                          ) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(e) => {
                          // Folder → folder reorder
                          const fromFolder = e.dataTransfer.getData("application/x-folder-id");
                          if (fromFolder && isDropTarget) {
                            e.preventDefault();
                            const ids = folders.map((x) => x.id);
                            const from = ids.indexOf(fromFolder);
                            const to = ids.indexOf(c.id);
                            if (from >= 0 && to >= 0 && from !== to) {
                              ids.splice(to, 0, ids.splice(from, 1)[0]);
                              api.post("/event-folders/reorder", { ids })
                                .then(() => { mutate("/event-folders"); toast.success("Klasör sırası güncellendi"); })
                                .catch((err) => toast.error(err?.response?.data?.detail || err.message));
                            }
                            setDragFolderId(null);
                            return;
                          }
                          // Event → folder assign
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
                        className="relative rounded-xl p-2 text-center transition-all"
                        style={{
                          background: isSel
                            ? `linear-gradient(160deg, ${c.color}55 0%, rgba(20,12,10,0.95) 60%)`
                            : "linear-gradient(160deg, rgba(35,20,12,0.85) 0%, rgba(15,8,5,0.95) 100%)",
                          border: isSel ? `2px solid ${c.color}` : "1px solid rgba(212,115,10,0.35)",
                          boxShadow: isSel
                            ? `0 0 20px ${c.color}, 0 0 36px ${c.color}55, inset 0 0 16px ${c.color}22`
                            : "0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,170,80,0.08)",
                          outline: isDropTarget ? `2px dashed ${c.color}` : "none",
                          outlineOffset: 3,
                          minHeight: 90,
                          cursor: c.isSpecial ? "pointer" : "grab",
                          opacity: isDrag ? 0.5 : 1,
                        }}
                      >
                        {!c.isSpecial && (
                          <CanEdit>
                            <div className="absolute top-1 right-1 flex items-center gap-0.5">
                              <button
                                type="button"
                                data-testid={`events-archive-card-rename-${c.id}`}
                                onClick={(ev) => { ev.stopPropagation(); renameCard(c); }}
                                className="p-0.5 rounded hover:bg-white/10"
                                style={{ color: "#93C5FD" }}
                                title={t("action_rename")}
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                data-testid={`events-archive-card-delete-${c.id}`}
                                onClick={(ev) => { ev.stopPropagation(); deleteCard(c); }}
                                className="p-0.5 rounded hover:bg-white/10"
                                style={{ color: "#FCA5A5" }}
                                title={t("delete", "Sil")}
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </CanEdit>
                        )}
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
                          <Folder
                            size={34}
                            strokeWidth={2}
                            style={{
                              color: "#f97316",
                              filter: "drop-shadow(0 0 6px #f97316) drop-shadow(0 0 14px rgba(249,115,22,0.55))",
                            }}
                          />
                        </div>
                        <div
                          className="text-[11px] font-bold mt-1 truncate leading-tight"
                          style={{
                            color: isSel ? "#FFF7ED" : "#F5F0E8",
                            fontFamily: "Cinzel, serif",
                            letterSpacing: "0.04em",
                            textShadow: isSel ? `0 0 6px ${c.color}` : "0 1px 2px rgba(0,0,0,0.8)",
                          }}
                          title={c.name}
                        >
                          {c.name}
                        </div>
                        <div className="text-[9px] mt-0.5 mono" style={{ color: isSel ? c.color : "#94A3B8" }}>
                          {c.events.length}
                        </div>
                      </button>
                    );
                  })}
                  <CanEdit>
                    <button
                      type="button"
                      data-testid="events-archive-card-new"
                      onClick={openNewFolder}
                      className="rounded-xl p-2 text-center transition-all"
                      style={{
                        background: "rgba(20,12,10,0.4)",
                        border: "2px dashed rgba(245,166,35,0.4)",
                        minHeight: 90,
                        cursor: "pointer",
                        color: "#F5A623",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
                        <Folder
                          size={34}
                          strokeWidth={2}
                          style={{
                            color: "#f97316",
                            opacity: 0.75,
                            filter: "drop-shadow(0 0 4px rgba(249,115,22,0.55))",
                          }}
                        />
                      </div>
                      <div className="text-[11px] font-bold mt-1" style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }}>
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
                        {t("lb_folder_no_events")}
                      </div>
                    ) : (() => {
                      // Group events by group_name. If ANY group_name is
                      // present, render an accordion: group headers with
                      // date range chips first (nested events hidden).
                      // If NO groups, render flat event list.
                      const bySub = {};
                      selectedEvents.forEach((e) => {
                        const k = e.group_name && e.group_name.trim() ? e.group_name : "__ungrouped__";
                        (bySub[k] = bySub[k] || []).push(e);
                      });
                      const hasGroups = Object.keys(bySub).some((k) => k !== "__ungrouped__");
                      const renderEvent = (e) => (
                        <div
                          key={e.id}
                          data-testid={`events-archive-expanded-item-${e.id}`}
                          draggable
                          onDragStart={(ev) => { ev.dataTransfer.setData("application/x-event-id", e.id); ev.dataTransfer.effectAllowed = "move"; }}
                          onClick={(ev) => { ev.stopPropagation(); setDetailId(e.id); }}
                          className="rounded-lg px-3 py-2 cursor-pointer transition-all hover:scale-[1.02]"
                          style={{
                            background: "linear-gradient(160deg, rgba(35,20,12,0.90) 0%, rgba(15,8,5,0.95) 100%)",
                            border: `1px solid ${selected.color}55`,
                            boxShadow: `0 0 8px ${selected.color}22, inset 0 1px 0 rgba(255,170,80,0.08)`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif", whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.25 }} title={`${e.group_name ? e.group_name + " / " : ""}${e.name}`}>
                                {/* v61 — Grup Adı / Etkinlik Adı formatı */}
                                {e.group_name && String(e.group_name).trim() ? (
                                  <>
                                    <span style={{ color: "#D4AF37", fontWeight: 800 }}>{String(e.group_name).trim()}</span>
                                    <span style={{ color: "#94A3B8", padding: "0 4px" }}>/</span>
                                    <span>{e.name}</span>
                                  </>
                                ) : (
                                  e.name
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[10px]" style={{ color: "#94A3B8" }}>
                                <span>{String(e.date || "").slice(0, 10)}</span>
                                <span className="font-bold mono" style={{ color: selected.color }}>×{e.multiplier ?? 1}</span>
                              </div>
                            </div>
                            <CanEdit>
                              <select
                                data-testid={`events-expanded-move-${e.id}`}
                                value={selected.id === "__none__" ? "__none__" : selected.id}
                                onChange={(ev) => {
                                  ev.stopPropagation();
                                  const v = ev.target.value;
                                  const target = v === "__none__" ? null : v;
                                  api.post("/event-folders/assign", { event_ids: [e.id], folder_id: target })
                                    .then(() => {
                                      mutate((k) => typeof k === "string" && k.startsWith("/events"));
                                      mutate("/event-folders");
                                      const label = target ? (folders.find((f) => f.id === target)?.name || "klasör") : "Klasörsüz";
                                      toast.success(`→ ${label}`);
                                    })
                                    .catch((err) => toast.error(err?.response?.data?.detail || err.message));
                                }}
                                onClick={(ev) => ev.stopPropagation()}
                                className="chip text-[9px] flex-shrink-0"
                                style={{
                                  padding: "2px 5px",
                                  borderColor: `${selected.color}55`,
                                  color: selected.color,
                                  background: "rgba(20,12,10,0.85)",
                                  cursor: "pointer",
                                  maxWidth: 130,
                                }}
                                title="Klasöre taşı"
                              >
                                <option value="__none__">📂 Klasörsüz</option>
                                {folders.map((ff) => (
                                  <option key={ff.id} value={ff.id}>{ff.icon || "📁"} {ff.name}</option>
                                ))}
                              </select>
                            </CanEdit>
                          </div>
                        </div>
                      );
                      if (!hasGroups) {
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedEvents.map(renderEvent)}
                          </div>
                        );
                      }
                      // Group accordion: sort collective first, then alphabetical.
                      const subs = Object.entries(bySub)
                        .map(([sk, list]) => ({ key: sk, isCollective: sk !== "__ungrouped__", label: sk === "__ungrouped__" ? "Grupsuz Etkinlikler" : sk, events: list }))
                        .sort((x, y) => {
                          if (x.isCollective !== y.isCollective) return x.isCollective ? -1 : 1;
                          return x.key.localeCompare(y.key);
                        });
                      return (
                        <div className="flex flex-col gap-2" data-testid="events-archive-groups-accordion">
                          {subs.map((sg) => {
                            const isOpen = openedGroups[`${selected.id}::${sg.key}`];
                            const dates = sg.events.map((ev) => String(ev.date || "").slice(0, 10)).filter(Boolean).sort();
                            const range = dates.length === 0 ? "—" : dates.length === 1 ? dates[0] : `${dates[0]} — ${dates[dates.length - 1]}`;
                            return (
                              <div key={sg.key}>
                                <button
                                  type="button"
                                  data-testid={`events-archive-group-header-${selected.id}-${sg.key}`}
                                  onClick={() => setOpenedGroups((prev) => ({ ...prev, [`${selected.id}::${sg.key}`]: !isOpen }))}
                                  className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all hover:scale-[1.005]"
                                  style={{
                                    background: `linear-gradient(90deg, ${selected.color}22 0%, rgba(20,12,10,0.85) 100%)`,
                                    border: `1px solid ${selected.color}55`,
                                    boxShadow: isOpen ? `0 0 12px ${selected.color}44` : "none",
                                  }}
                                >
                                  <span style={{ fontSize: 12 }}>{isOpen ? "▼" : "▶"}</span>
                                  <span style={{ fontSize: 14 }}>{sg.isCollective ? "🤝" : "📄"}</span>
                                  <span
                                    className="text-sm font-bold flex-1"
                                    style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.06em", whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.25 }}
                                    title={sg.label}
                                  >
                                    {sg.label}
                                  </span>
                                  <span className="text-[10px] mono opacity-80" style={{ color: selected.color }}>
                                    {range}
                                  </span>
                                  <span
                                    className="text-[10px] font-bold mono px-2 py-0.5 rounded-full flex-shrink-0"
                                    style={{ background: `${selected.color}20`, color: selected.color, border: `1px solid ${selected.color}55` }}
                                  >
                                    {sg.events.length}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 pl-4" data-testid={`events-archive-group-body-${selected.id}-${sg.key}`}>
                                    {sg.events.map(renderEvent)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()
        ) : (

        (() => {
          return (
        <div className="flex flex-col gap-4" data-testid="events-single-list">
          {Object.entries(groupedMap).map(([group, list]) => renderGroupBlock(group, list))}
          {ungrouped.length > 0 && (
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
                    toast.success("→ Grupsuz");
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
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                data-testid="events-ungrouped-grid"
              >
                {applyManualOrder(ungrouped, "ungrouped").map((e) =>
                  renderEventCard(e, "#818cf8", "", "ungrouped")
                )}
              </motion.div>
            </section>
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
        // v140.46 — Edit modunda event_type'a göre doğru form: "bireysel" ise
        // BireyselEventForm, aksi hâlde İttifak EventForm. Yeni kayıt akışı
        // hâlâ event_type=undefined ile EventForm'u seçer (varsayılan İttifak).
        ((editing && (editing.event_type || "").toLowerCase() === "bireysel")
          ? <BireyselEventForm initial={editing}
                onClose={() => { setShowForm(false); setEditing(null); setPrefillTpl(null); }} />
          : <EventForm initial={editing} initialTemplate={prefillTpl}
                onClose={() => { setShowForm(false); setEditing(null); setPrefillTpl(null); }} />
        )
      )}
      {seriesTpl && (
        <TemplateSeriesModal
          template={seriesTpl}
          onClose={() => setSeriesTpl(null)}
          onCreated={() => setSeriesTpl(null)}
        />
      )}
      {showBireyselForm && (
        <BireyselEventForm onClose={() => setShowBireyselForm(false)} />
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

      {/* v124 — Event chat drawer. Renders when chatEventId is set. */}
      {chatEventId && (
        <EventChatDrawer
          event={events.find((x) => x.id === chatEventId) || allActive.find((x) => x.id === chatEventId) || null}
          currentUser={me}
          onClose={() => setChatEventId(null)}
        />
      )}

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
          placeholder: t("event_form_select_event"),
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
          if (!extra?.event_id) throw new Error(t("event_no_event_selected"));
          const res = await api.post("/ocr/apply-event-points", {
            event_id: extra.event_id,
            participants: parts,
            overwrite_duplicates: !!extra.overwrite_duplicates,
          });
          mutate("/events");
          mutate((k) => typeof k === "string" && k.startsWith("/points"));
          mutate((k) => typeof k === "string" && k.startsWith("/members"));
          mutate(`/ocr/event-participants/${extra.event_id}`);
          mutate("/stats");
          const errs = (res.data.errors || []).length;
          const newMembers = res.data.new_members_created || 0;
          const skipped = (res.data.skipped_duplicates || []);
          const overwritten = res.data.overwritten || 0;
          const parts_msg =
            `${res.data.created} puan '${res.data.event_name}' etkinliğine eklendi` +
            (overwritten ? ` · ${overwritten} üzerine yazıldı` : "") +
            (newMembers ? ` · ${newMembers} yeni üye oluşturuldu` : "") +
            (skipped.length ? ` · ${skipped.length} mükerrer atlandı` : "") +
            (errs ? ` · ${errs} hata` : "");
          if (skipped.length > 0) {
            const names = skipped.slice(0, 5).map((s) => s.name).join(", ");
            const downloadSkippedCsv = () => {
              const header = "İsim,Üye ID,Denemek istenen puan\n";
              const body = skipped
                .map((s) => {
                  const nm = String(s.name || "").replace(/"/g, '""');
                  return `"${nm}","${s.member_id || ""}","${s.attempted_points || 0}"`;
                })
                .join("\n");
              const csv = "\uFEFF" + header + body + "\n"; // BOM for Excel utf-8
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              const safeEv = String(res.data.event_name || "etkinlik").replace(/[^a-z0-9-]+/gi, "_");
              a.href = url;
              a.download = `ocr-atlanan-${safeEv}-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success("CSV indirildi");
            };
            toast.success(parts_msg, {
              description: `⚠ Atlanan (bu etkinlikte zaten puanı olan): ${names}${skipped.length > 5 ? ` +${skipped.length - 5}` : ""}`,
              duration: 10000,
              action: {
                label: "CSV indir",
                onClick: downloadSkippedCsv,
              },
            });
          } else {
            toast.success(parts_msg);
          }
        }}
      />
    </div>
  );
}


// v138.3 — Etkinlik detayı için "İlk 10" paneli. Backend
// `/leaderboard?event_id=X` bu etkinliğe atanmış puanlara göre sıralanmış
// üye listesini döndürür; ilk 10'unu render ederiz. Fallback: veri
// gelmezse panel gizlenir (sessiz). Tüm metinler useTranslation() ile.
//
// v140.28 — Yeni mantık:
//  - Etkinliğin `group_name`'i varsa: o grubun TÜM etkinliklerinin puanları
//    toplanır (`/leaderboard?group_name=X`).
//  - Yoksa: aynı ada sahip (recurring series) tüm etkinliklerin puanları
//    toplanır (`/leaderboard?event_name=X`).
function EventTop10Panel({ event }) {
  const { t } = useTranslation();
  const eventId = event?.id;
  const groupName = (event?.group_name || "").trim();
  const eventName = (event?.name || "").trim();
  const qs = groupName
    ? `group_name=${encodeURIComponent(groupName)}`
    : eventName
      ? `event_name=${encodeURIComponent(eventName)}`
      : (eventId ? `event_id=${encodeURIComponent(eventId)}` : "");
  const { data = [], error } = useSWR(
    qs ? `/leaderboard?${qs}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const top10 = data.slice(0, 10);
  const scopeHint = groupName
    ? t("event_top10_hint_group", "Bu grubun tüm etkinliklerinden toplanan puanlar")
    : t("event_top10_hint_series", "Aynı ada sahip tüm etkinliklerden toplanan puanlar");
  return (
    <div
      data-testid={`event-top10-${eventId}`}
      className="rounded-lg p-3 mt-3"
      style={{
        background: "linear-gradient(180deg, rgba(245,166,35,0.10), rgba(15,10,20,0.65))",
        border: "1px solid rgba(245,166,35,0.35)",
      }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
        style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}
      >
        🏆 {t("event_top10_title", "Etkinlik İlk 10")}
        {groupName && (
          <span className="text-[9px] font-normal opacity-70 ml-1" style={{ color: "#C7BFB4" }}>
            · {groupName}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {top10.map((row, i) => {
          const rank = i + 1;
          const isPodium = rank <= 3;
          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
          return (
            <div
              key={row.id || i}
              data-testid={`event-top10-row-${eventId}-${rank}`}
              className="flex items-center justify-between px-2 py-1 rounded"
              style={{
                background: isPodium ? "rgba(245,166,35,0.14)" : "rgba(11,7,4,0.35)",
                border: `1px solid ${isPodium ? "rgba(245,166,35,0.4)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[11px] font-bold" style={{ color: isPodium ? "#F5A623" : "#94A3B8", minWidth: 24 }}>{medal}</span>
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "#F5F0E8" }}
                  title={row.name}
                >
                  {row.name}
                </span>
                {row.alliance_name && (
                  <span className="text-[9px] chip" style={{ borderColor: "rgba(148,163,184,0.5)", color: "#C7BFB4", padding: "1px 5px" }}>
                    {row.alliance_name}
                  </span>
                )}
              </div>
              <span
                className="text-xs font-bold mono"
                style={{ color: isPodium ? "#F5A623" : "#E0E7FF", fontVariantNumeric: "tabular-nums" }}
              >
                {Number(row.total_points || 0).toLocaleString("tr-TR")}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] mt-2 opacity-60" style={{ color: "#94A3B8" }}>
        {scopeHint}
      </div>
    </div>
  );
}


function EventDetailModal({ event, open, onClose, onEdit, events = [], onNavigate }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);
  // v135.29 — Auto-generated share image modal (admin only).
  const [shareOpen, setShareOpen] = React.useState(false);

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
      // v136.3 — Serinin bu son etkinliği mi? Aynı `series_id`'ye sahip
      // mevcut event listesinde başka etkinlik yoksa 3 seçenekli prompt
      // yerine tek soru sor: "Tüm seriyi sil?" — kazayla yarım seri kalmasın.
      const siblings = events.filter((x) => x.series_id === e.series_id && x.id !== e.id);
      if (siblings.length === 0) {
        if (!window.confirm(
          t("confirm_delete_last_series",
            "Bu, serinin son etkinliği. Tüm seriyi (kayıtları dahil) silmek istiyor musun?",
          ))) return;
        setBusy(true);
        try {
          await api.delete(`/events/series/${e.series_id}`);
          mutate((k) => typeof k === "string" && k.startsWith("/events"));
          mutate("/stats");
          toast.success(t("series_deleted", "Seri silindi"));
          onClose();
        } catch (err) { toast.error(err?.response?.data?.detail || err.message); }
        finally { setBusy(false); }
        return;
      }
      const scope = window.prompt(
        `Bu etkinlik bir seriye ait (${e.series_id.slice(0, 6)}, ${siblings.length + 1} etkinlik). Ne silmek istersin?\n\n` +
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
              style={{ fontFamily: "Cinzel, serif", color: "#F5F0E8", fontSize: 18, letterSpacing: "0.06em", lineHeight: 1.2, whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}
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
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="chip text-[10px]"
                style={{ borderColor: "#F5A623", color: "#F5A623",
                         background: "rgba(245,166,35,0.10)" }}
                data-testid={`event-share-image-btn-${e.id}`}
              >
                🖼️ {t("event_share_image_btn", "Paylaşım Görseli")}
              </button>
            )}
          </div>

          {/* v138.3 — Etkinlik İlk 10 paneli */}
          <EventTop10Panel event={e} />
          {shareOpen && (
            <EventShareImageModal
              event={e}
              onClose={() => setShareOpen(false)}
            />
          )}

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
                {e.archived ? `♻️ ${t("unarchive", "Arşivden Çıkar")}` : `📦 ${t("archive_action", "Arşive Al")}`}
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

// v135.29 — Auto-generated event share image modal.
// Renders `<img src="/api/events/{id}/share-image.png">` inside the detail
// modal so admins can preview the composed poster + push it to the group
// chat with a single click, or download as PNG for external sharing.
function EventShareImageModal({ event, onClose }) {
  const { t } = useTranslation();
  const [sending, setSending] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(Date.now());
  // v135.30 — Six poster themes; picker sends `?theme=` to the backend.
  const THEMES = [
    { key: "fire",   label: t("event_share_theme_fire",   "Ateş"),    swatch: "linear-gradient(135deg,#7a1e10,#f5a623)" },
    { key: "onyx",   label: t("event_share_theme_onyx",   "Oniks"),   swatch: "linear-gradient(135deg,#0a0a10,#b4b4be)" },
    { key: "amber",  label: t("event_share_theme_amber",  "Kehribar"), swatch: "linear-gradient(135deg,#3e2c0a,#ffc850)" },
    { key: "buz",    label: t("event_share_theme_buz",    "Buz"),     swatch: "linear-gradient(135deg,#04122e,#60b0ff)" },
    { key: "zumrut", label: t("event_share_theme_zumrut", "Zümrüt"),  swatch: "linear-gradient(135deg,#0a3c28,#34d399)" },
    { key: "bosluk", label: t("event_share_theme_bosluk", "Boşluk"),  swatch: "linear-gradient(135deg,#100630,#a855f7)" },
  ];
  const [theme, setTheme] = React.useState("fire");
  const src = `${process.env.REACT_APP_BACKEND_URL}/api/events/${event.id}/share-image.png?theme=${theme}&ts=${reloadKey}`;
  const sendToTelegram = async () => {
    if (!window.confirm(t("event_share_send_confirm",
      "Görseli Telegram grubuna göndermek istiyor musun?"))) return;
    setSending(true);
    try {
      await api.post(`/events/${event.id}/share-image/send-telegram?theme=${theme}`);
      toast.success(t("event_share_sent_toast",
        "Görsel Telegram grubuna gönderildi"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Gönderilemedi");
    } finally { setSending(false); }
  };
  const downloadPng = async () => {
    try {
      const r = await fetch(src);
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `titanxis-${theme}-${(event.name || "event").replace(/\s+/g, "-").toLowerCase()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    } catch (e) {
      toast.error(t("event_share_download_failed", "İndirilemedi"));
    }
  };
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.90)" }}
      onClick={onClose}
      data-testid="event-share-image-modal"
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="card-red-gold p-4 max-w-2xl w-full space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
            {t("event_share_image_title", "Paylaşım Görseli")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-white"
            data-testid="event-share-image-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Theme picker — six swatches with click-to-preview. */}
        <div className="grid grid-cols-6 gap-2" data-testid="event-share-theme-picker">
          {THEMES.map((th) => (
            <button
              key={th.key}
              type="button"
              onClick={() => { setTheme(th.key); setReloadKey(Date.now()); }}
              className="rounded overflow-hidden text-center"
              data-testid={`event-share-theme-${th.key}`}
              style={{
                border: theme === th.key ? "2px solid #F5A623" : "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.35)",
                boxShadow: theme === th.key ? "0 0 8px rgba(245,166,35,0.5)" : "none",
                padding: 2,
              }}
              aria-pressed={theme === th.key}
              title={th.label}
            >
              <div style={{ height: 42, background: th.swatch, borderRadius: 3 }} />
              <div className="text-[9px] font-bold mt-1 mb-1" style={{ color: theme === th.key ? "#F5A623" : "#EAD8B0" }}>
                {th.label}
              </div>
            </button>
          ))}
        </div>
        <div
          className="rounded overflow-hidden"
          style={{ background: "rgba(0,0,0,0.35)",
                   border: "1px solid rgba(245,166,35,0.30)" }}
        >
          <img
            src={src}
            alt={event.name}
            className="w-full block"
            style={{ maxHeight: "50vh", objectFit: "contain" }}
            data-testid="event-share-image-preview"
          />
        </div>
        <div className="text-[11px] text-muted-foreground leading-snug">
          {t("event_share_image_hint",
             "Otomatik oluşturuldu — etkinlik adı, TR saati, grup ve çarpan bilgisi görsele yerleştirildi. Admin banner_url ekleyince arka plan olarak kullanılır.")}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={sendToTelegram}
            disabled={sending}
            className="btn-gold text-sm px-4 py-2 flex items-center gap-1.5"
            data-testid="event-share-image-send"
          >
            {sending ? "⏳" : "📤"}
            {sending
              ? t("event_share_sending", "Gönderiliyor…")
              : t("event_share_send_btn", "Telegram Grubuna Gönder")}
          </button>
          <button
            type="button"
            onClick={downloadPng}
            className="chip text-xs px-3 py-2"
            data-testid="event-share-image-download"
          >
            💾 {t("event_share_download_btn", "PNG İndir")}
          </button>
          <button
            type="button"
            onClick={() => setReloadKey(Date.now())}
            className="chip text-xs px-3 py-2 ml-auto"
            data-testid="event-share-image-refresh"
            title={t("event_share_refresh_title", "Görseli yenile")}
          >
            🔄 {t("event_share_refresh_btn", "Yenile")}
          </button>
        </div>
      </div>
    </div>
  );
}



function EventsBulkToolbar({ filteredEvents, selectedIds, setSelectedIds, clearSelection, folders = [], onDone }) {
  const { t } = useTranslation();
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

  const bulkToggleArchive = async (archived, folderId = undefined) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error("Önce etkinlik seç"); return; }
    setBusy(true);
    try {
      const payload = { ids, archived };
      if (archived && folderId !== undefined) payload.folder_id = folderId;
      const res = await api.post("/events/bulk-archive", payload);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      const folderLabel = archived && folderId
        ? (folderId === "__none__" ? " (klasörsüz)" : ` → ${folders.find((f) => f.id === folderId)?.name || "klasör"}`)
        : "";
      toast.success(`${res.data.modified} etkinlik ${archived ? "arşive alındı" : "arşivden çıkarıldı"}${folderLabel}`);
      clearSelection();
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setBusy(false); }
  };

  const bulkToggleBreakdown = async (showBreakdown) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { toast.error("Önce etkinlik seç"); return; }
    setBusy(true);
    try {
      const res = await api.post("/events/bulk-breakdown", { ids, show_breakdown: showBreakdown });
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      toast.success(`${res.data.modified} etkinliğin alt detayı ${showBreakdown ? "gösterilecek" : "gizli"}`);
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
        title="Seçili etkinlikleri arşive al (klasörsüz)"
      >
        <Archive className="w-3 h-3" /> {t("archive_action", "Arşive Al")}
      </button>
      {folders.length > 0 && (
        <select
          data-testid="events-bulk-archive-to-folder"
          disabled={busy || selectedIds.size === 0}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            bulkToggleArchive(true, v);
            e.target.value = "";
          }}
          className="chip text-[10px]"
          style={{
            borderColor: "rgba(245,166,35,0.55)",
            color: "#FCD34D",
            background: "rgba(245,166,35,0.10)",
            cursor: "pointer",
          }}
          title="Seçili etkinlikleri klasöre taşı ve arşive al"
          defaultValue=""
        >
          <option value="" disabled>{t("bulk_archive_to_folder", "📦 Klasöre Arşivle…")}</option>
          <option value="__none__">{t("bulk_archive_no_folder", "Klasörsüz Arşivle")}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => bulkToggleArchive(false)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-unarchive"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(34,197,94,0.55)", color: "#86EFAC", background: "rgba(34,197,94,0.10)" }}
        title="Seçili etkinlikleri arşivden çıkar"
      >
        <ArchiveRestore className="w-3 h-3" /> {t("unarchive", "Arşivden Çıkar")}
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
      <button
        type="button"
        onClick={() => bulkToggleBreakdown(false)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-breakdown-hide"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(59,130,246,0.55)", color: "#93C5FD", background: "rgba(59,130,246,0.10)" }}
        title={t("ev_bulk_breakdown_hide_tip")}
      >
        {t("ev_bulk_breakdown_hide")}
      </button>
      <button
        type="button"
        onClick={() => bulkToggleBreakdown(true)}
        disabled={busy || selectedIds.size === 0}
        data-testid="events-bulk-breakdown-show"
        className="chip text-[10px] flex items-center gap-1"
        style={{ borderColor: "rgba(34,197,94,0.55)", color: "#86EFAC", background: "rgba(34,197,94,0.10)" }}
        title={t("ev_bulk_breakdown_show_tip")}
      >
        {t("ev_bulk_breakdown_show")}
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

// v136.3 — Gelişmiş Arşiv Arama Paneli: tarih aralığı + tip/isim araması +
// katılımcı adı ile filtreleme. Tümü client-side; participantQuery ≥ 2 char
// olunca `/points?search=X` çekilir (parent'ta) ve o event_id'ler set olarak
// ana filtreye uygulanır.
function ArchiveFilterPanel({ filter, setFilter, filteredCount, totalCount }) {
  const { t } = useTranslation();
  const patch = (delta) => setFilter((prev) => ({ ...prev, ...delta }));
  const anyActive =
    !!filter.dateFrom || !!filter.dateTo ||
    !!filter.typeQuery.trim() || !!filter.participantQuery.trim();
  return (
    <div
      data-testid="archive-filter-panel"
      className="mb-3 rounded-lg p-2 space-y-2"
      style={{
        background: "linear-gradient(180deg, rgba(139,92,246,0.10) 0%, rgba(15,10,20,0.65) 100%)",
        border: "1px solid rgba(139,92,246,0.35)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5"
          style={{ color: "#C4B5FD" }}
        >
          <SlidersHorizontal className="w-3 h-3" />
          {t("archive_filter_title", "Gelişmiş Arşiv Filtresi")}
        </span>
        <span className="text-[10px] font-mono" style={{ color: anyActive ? "#F5A623" : "#94A3B8" }}>
          {filteredCount} / {totalCount}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            {t("archive_filter_from", "Tarih (başlangıç)")}
          </span>
          <input
            type="date"
            data-testid="archive-filter-date-from"
            value={filter.dateFrom}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-400"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            {t("archive_filter_to", "Tarih (bitiş)")}
          </span>
          <input
            type="date"
            data-testid="archive-filter-date-to"
            value={filter.dateTo}
            onChange={(e) => patch({ dateTo: e.target.value })}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-400"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            {t("archive_filter_type", "Tür / Etkinlik Adı")}
          </span>
          <input
            type="text"
            data-testid="archive-filter-type"
            placeholder={t("archive_filter_type_placeholder", "SvS, Kristal, Kupa…")}
            value={filter.typeQuery}
            onChange={(e) => patch({ typeQuery: e.target.value })}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-400"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            {t("archive_filter_participant", "Katılımcı (üye adı)")}
          </span>
          <input
            type="text"
            data-testid="archive-filter-participant"
            placeholder={t("archive_filter_participant_placeholder", "İsmin en az 2 karakteri…")}
            value={filter.participantQuery}
            onChange={(e) => patch({ participantQuery: e.target.value })}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-400"
          />
        </label>
      </div>
      {anyActive && (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="archive-filter-reset"
            onClick={() => setFilter({ dateFrom: "", dateTo: "", typeQuery: "", participantQuery: "" })}
            className="chip text-[10px] flex items-center gap-1"
            style={{ borderColor: "rgba(148,163,184,0.55)", color: "#E5E7EB" }}
          >
            <X className="w-3 h-3" /> {t("archive_filter_reset", "Filtreleri Temizle")}
          </button>
        </div>
      )}
    </div>
  );
}



function EventForm({ initial, initialTemplate, onClose }) {  const { t } = useTranslation();
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
  // v140.43 — İlk 10 raporlama toggle'ı EventForm'a taşındı: Grup Var/Yok
  // fark etmeksizin daima görünür. State edit modunda mevcut değerden gelir.
  const [autoReport, setAutoReport] = useState(!!(initial && initial.auto_report_top10));
  const [reportChannels, setReportChannels] = useState(() => {
    const arr = (initial && Array.isArray(initial.report_channels)) ? initial.report_channels : [];
    return {
      telegram: arr.includes("telegram"),
      push: arr.includes("push"),
      message: arr.includes("message"),
    };
  });
  const [reminderEnabled, setReminderEnabled] = useState(
    initial ? initial.reminder_enabled !== false : true,
  );
  // v135.26 — Pre-event auto reminder lead in minutes. Empty string = kapalı,
  // otherwise one of "15" / "30" / "60" / "120". Persisted as number|null on
  // the Event doc via `reminder_minutes`.
  const [reminderMinutes, setReminderMinutes] = useState(
    initial && initial.reminder_minutes ? String(initial.reminder_minutes) : "",
  );
  const [hiddenFromLb, setHiddenFromLb] = useState(
    initial ? !!initial.hidden_from_leaderboard : false,
  );
  const [attendanceEnabled, setAttendanceEnabled] = useState(
    initial ? initial.attendance_enabled !== false : true,
  );
  // v129 — Auto-archive knobs on the event form.
  const [autoArchive, setAutoArchive] = useState(!!(initial && initial.auto_archive));
  const [autoArchiveFolderId, setAutoArchiveFolderId] = useState(
    (initial && initial.auto_archive_folder_id) || "",
  );
  // v135.36 — Otomatik sertifika: arşive taşındığında tüm katılımcılara
  // sertifika üretilsin mi? Başlık boşsa etkinlik adı kullanılır.
  const [autoCertificate, setAutoCertificate] = useState(!!(initial && initial.auto_certificate));
  const [autoCertificateTitle, setAutoCertificateTitle] = useState(
    (initial && initial.auto_certificate_title) || "",
  );
  // v132 — Minimum Puan Eşiği accordion. Stores optional per-alliance
  // (`alliance_thresholds`) and per-member (`member_thresholds`) point
  // floors that admins can quick-fill via [50M] / [150M] chips or key in
  // manually. Persisted on the Event doc.
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [allianceThresholds, setAllianceThresholds] = useState(
    (initial && Array.isArray(initial.alliance_thresholds)) ? initial.alliance_thresholds : [],
  );
  const [memberThresholds, setMemberThresholds] = useState(
    (initial && Array.isArray(initial.member_thresholds)) ? initial.member_thresholds : [],
  );
  const { data: formFolders = [] } = useSWR("/event-folders", fetcher, { refreshInterval: 30000 });
  const [allianceScope, setAllianceScope] = useState(
    (initial?.alliance_scope || "GOW").toString(),
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
  // v135.6 — Etkinlik şablonu: form açılırken şablonlardan seçilerek tüm
  // alanlar doldurulabilir (tarih hariç). Form kaydedilirken "Şablon olarak
  // kaydet" checkbox işaretliyse POST /event-templates çağrılır.
  const { data: templatesData } = useSWR(!initial ? "/event-templates" : null, fetcher);
  const templates = templatesData?.items || [];
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSourceName, setTemplateSourceName] = useState(initial?.template_source_name || ""); // v135.8
  const applyTemplate = (tid) => {
    const tpl = templates.find((x) => x.id === tid);
    if (!tpl) return;
    setName(tpl.name || "");
    setMultiplier(tpl.multiplier || 1);
    setSubtitle(tpl.subtitle || "");
    setGroupName(tpl.group_name || "SvS vs 10007");
    setGrouped(!!(tpl.group_name && String(tpl.group_name).trim()));
    setReminderEnabled(tpl.reminder_enabled !== false);
    setHiddenFromLb(!!tpl.hidden_from_leaderboard);
    if (tpl.banner_url) setBanner([{ id: "tpl", url: tpl.banner_url, filename: "template-banner" }]);
    setTemplateSourceName(tpl.template_name || tpl.name || ""); // v135.8 — chip için hatırla
    toast.success(`Şablon yüklendi: ${tpl.template_name}`);
  };

  // v135.39 — /etkinlikler > "Şablondan" dropdown ile pre-fill: dışarıdan
  // seçilen tpl geldiğinde form açılışta otomatik apply eder. Sadece 1 kez —
  // SWR revalidate sonrası tekrar apply etmesin diye ref-guard.
  const prefillApplied = React.useRef(false);
  useEffect(() => {
    if (prefillApplied.current) return;
    if (!initial && initialTemplate && templates.length > 0) {
      const found = templates.find((x) => x.id === initialTemplate.id);
      if (found) {
        applyTemplate(found.id);
        prefillApplied.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplate?.id, templates.length]);

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
        reminder_minutes: reminderEnabled && reminderMinutes
          ? parseInt(reminderMinutes, 10)
          : null,
        hidden_from_leaderboard: hiddenFromLb,
        attendance_enabled: attendanceEnabled,
        auto_archive: autoArchive,
        auto_archive_folder_id: autoArchive ? (autoArchiveFolderId || null) : null,
        auto_certificate: autoCertificate,
        auto_certificate_title: autoCertificate ? (autoCertificateTitle.trim() || null) : null,
        auto_certificate_theme: autoCertificate ? "amber" : null,
        alliance_scope: "GOW",
        // v132 — Minimum Puan Eşiği — sadece dolu olanları gönder.
        alliance_thresholds: (allianceThresholds || [])
          .filter((r) => (r.alliance_name || "").trim() && (parseInt(r.threshold, 10) || 0) > 0)
          .map((r) => ({ alliance_name: String(r.alliance_name).trim(), threshold: parseInt(r.threshold, 10) || 0 })),
        member_thresholds: (memberThresholds || [])
          .filter((r) => (r.member_id || "").trim() && (parseInt(r.threshold, 10) || 0) > 0)
          .map((r) => ({ member_id: String(r.member_id).trim(), threshold: parseInt(r.threshold, 10) || 0 })),
        recurrence_interval: recurInterval,
        recurrence_count: Number(recurCount) || 1,
        // v135.8 — Şablon izleme: seçili bir şablondan oluşturulduysa şablon
        // adını backend'e gönder → Event.template_source_name alanında saklanır
        // → kartın üstünde küçük mor "Şablon: X" chip'i olarak görünür.
        template_source_name: (!initial && templateSourceName) ? templateSourceName : undefined,
        // v140.43 — Grup toggle'ı event_type'ı değiştirmez; İttifak formu
        // hep "ittifak" kaydeder. Edit modunda mevcut event_type korunur.
        event_type: (initial && initial.event_type) || "ittifak",
        // v140.43 — İlk 10 otomatik raporla (Grup Var/Yok'tan bağımsız).
        auto_report_top10: autoReport,
        report_channels: autoReport
          ? Object.keys(reportChannels).filter((k) => reportChannels[k])
          : [],
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
      // v135.6 — Şablon olarak kaydet: create/update sonrası ayrı POST
      // /event-templates çağrısı. Hatası sessiz — asıl etkinlik yaratma
      // başarılıyken şablon oluşturma başarısızsa toast uyarısı verir.
      if (!initial && saveAsTemplate) {
        try {
          const tplBody = {
            template_name: templateName.trim() || `${name.trim()} Şablonu`,
            name: name.trim(),
            group_name: grouped ? (groupName || "").trim() || null : null,
            multiplier: Number(multiplier),
            subtitle: subtitle.trim() || null,
            banner_url: banner[0]?.url || null,
            reminder_enabled: reminderEnabled,
            hidden_from_leaderboard: hiddenFromLb,
          };
          await api.post("/event-templates", tplBody);
          mutate("/event-templates");
          toast.success(`Şablon kaydedildi: ${tplBody.template_name}`);
        } catch (tplErr) {
          toast.warning("Etkinlik oluşturuldu ama şablon kaydedilemedi.");
        }
      }
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose} data-testid="event-form-container">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative" style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? t("edit_event") : t("new_event")}</h3>

        {/* v135.6 — Yeni etkinlik oluştururken şablondan yükleyebilir. Edit
            modunda gizli tutuluyor. */}
        {!initial && templates.length > 0 && (
          <div className="mb-3 rounded p-2" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.35)" }} data-testid="event-form-template-row">
            <label className="block text-[10px] uppercase font-bold tracking-widest mb-1" style={{ color: "#C4B5FD" }}>📋 Şablondan Oluştur</label>
            <select
              data-testid="event-form-template-select"
              onChange={(e) => e.target.value && applyTemplate(e.target.value)}
              defaultValue=""
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs text-white"
            >
              <option value="">— Şablon seç (tarih dışındaki alanları doldurur) —</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.template_name} · {tpl.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("name_field") || "Etkinlik Adı"}</label>
        <input data-testid={EVENTS.formName} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Kafes 1, SvS vs 10007, Kale Savaşı"
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

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("ev_group_type_label")}</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            data-testid="event-form-grouped-yes"
            onClick={() => setGrouped(true)}
            className={`chip justify-center py-2 ${grouped ? "active" : ""}`}
            aria-pressed={grouped}
          >
            {t("ev_group_type_grouped")}
          </button>
          <button
            type="button"
            data-testid="event-form-grouped-no"
            onClick={() => setGrouped(false)}
            className={`chip justify-center py-2 ${!grouped ? "active" : ""}`}
            aria-pressed={!grouped}
          >
            {t("ev_group_type_ungrouped")}
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

        {/* v140.43 — İlk 10 otomatik raporla (Grup Var/Yok bağımsız — HER ZAMAN görünür) */}
        <div
          className="mt-3 rounded p-3"
          style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.30)" }}
          data-testid="event-form-reporting-section"
        >
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-2">
            {t("event_reporting_section", "RAPORLAMA")}
          </div>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={autoReport}
              onChange={(e) => setAutoReport(e.target.checked)}
              data-testid="event-form-auto-report-checkbox"
              className="cursor-pointer"
            />
            <span className="text-sm font-bold text-white">📊 {t("event_reporting_top10", "İlk 10 kişiyi otomatik raporla")}</span>
          </label>
          {autoReport && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1.5">
                {t("event_reporting_channels", "Raporlama kanalları (çoklu seçim)")}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { key: "telegram", label: "📨 Telegram" },
                  { key: "push", label: "🔔 Push" },
                  { key: "message", label: "💬 Mesaj" },
                ].map((ch) => {
                  const active = !!reportChannels[ch.key];
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => setReportChannels({ ...reportChannels, [ch.key]: !active })}
                      className="chip justify-center text-[10px] py-1.5"
                      data-testid={`event-form-channel-${ch.key}`}
                      style={active ? {
                        background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(3,105,161,0.25))",
                        borderColor: "#38BDF8",
                        color: "#F0F9FF",
                      } : { opacity: 0.65 }}
                      aria-pressed={active}
                    >
                      {ch.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Etkinlik Görseli</label>
        <ImageDropzone purpose="event" value={banner} onChange={setBanner} max={1} compact />

        {/* v132.2 — Row 1: [Hatırlatma kurulabilir] [Sıralamada göster] (2-col) */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded p-3" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.30)" }} data-testid="event-form-reminder-toggle">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                data-testid="event-form-reminder-checkbox"
                className="cursor-pointer mt-0.5"
              />
              <span className="block text-xs font-bold text-white leading-tight">🔔 Hatırlatma kurulabilir</span>
            </label>
            {reminderEnabled && (
              <div className="mt-2" data-testid="event-form-reminder-minutes-row">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
                  Otomatik Hatırlatma
                </div>
                <select
                  data-testid="event-form-reminder-minutes"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-white"
                >
                  <option value="">Kapalı</option>
                  <option value="15">15 dakika önce</option>
                  <option value="30">30 dakika önce</option>
                  <option value="60">1 saat önce</option>
                  <option value="120">2 saat önce</option>
                </select>
              </div>
            )}
          </div>
          <div className="rounded p-3" style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.30)" }} data-testid="event-form-visibility-toggle">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!hiddenFromLb}
                onChange={(e) => setHiddenFromLb(!e.target.checked)}
                data-testid="event-form-visibility-checkbox"
                className="cursor-pointer mt-0.5"
              />
              <span className="block text-xs font-bold text-white leading-tight">🏆 Sıralamada göster</span>
            </label>
          </div>
        </div>

        {/* v132.2 — Row 2: [Katılımlı] [Otomatik Arşive Taşı] (2-col); klasör dropdown auto-archive işaretliyken hemen altında full-width satırda açılır. */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded p-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.30)" }} data-testid="event-form-attendance-toggle">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={attendanceEnabled}
                onChange={(e) => setAttendanceEnabled(e.target.checked)}
                data-testid="event-form-attendance-checkbox"
                className="cursor-pointer mt-0.5"
              />
              <span className="block text-xs font-bold text-white leading-tight">
                {attendanceEnabled ? "🟢 Katılımlı" : "🔒 Katılımsız"}
              </span>
            </label>
          </div>
          <div className="rounded p-3" style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.35)" }} data-testid="event-form-auto-archive-toggle">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoArchive}
                onChange={(e) => setAutoArchive(e.target.checked)}
                data-testid="event-form-auto-archive-checkbox"
                className="cursor-pointer mt-0.5"
              />
              <span className="block text-xs font-bold text-white leading-tight">📦 Otomatik Arşive Taşı</span>
            </label>
          </div>
        </div>
        {autoArchive && (
          <div className="mt-2 rounded p-3 flex items-center gap-2" style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.35)" }} data-testid="event-form-auto-archive-folder-row">
            <label className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Klasör</label>
            <select
              data-testid="event-form-auto-archive-folder"
              value={autoArchiveFolderId}
              onChange={(e) => setAutoArchiveFolderId(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            >
              <option value="">Klasörsüz</option>
              {formFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.icon || "📁"} {f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* v135.36 — Otomatik Sertifika: arşive taşıma anında katılımcılara sertifika üretir. */}
        <div className="mt-2 rounded p-3" style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.35)" }} data-testid="event-form-auto-cert-toggle">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCertificate}
              onChange={(e) => setAutoCertificate(e.target.checked)}
              data-testid="event-form-auto-cert-checkbox"
              className="cursor-pointer mt-0.5"
            />
            <span className="block leading-tight">
              <span className="block text-xs font-bold text-white">🏆 Otomatik Sertifika Ver</span>
              <span className="block text-[10px] text-muted-foreground mt-0.5">
                Etkinlik arşive taşındığında katılımcılara toplu sertifika üretir.
              </span>
            </span>
          </label>
          {autoCertificate && (
            <input
              type="text"
              placeholder={"Sertifika başlığı (boş → etkinlik adı)"}
              value={autoCertificateTitle}
              onChange={(e) => setAutoCertificateTitle(e.target.value)}
              data-testid="event-form-auto-cert-title"
              className="mt-2 w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            />
          )}
        </div>

        {/* v132 — Minimum Puan Eşiği accordion. Group + per-member thresholds
            persisted on Event doc. Quick-fill chips: 50M / 150M / Manuel. */}
        <div className="mt-3 rounded" style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.35)" }}>
          <button
            type="button"
            onClick={() => setThresholdOpen(!thresholdOpen)}
            className="w-full flex items-center gap-2 p-3 text-left"
            data-testid="event-form-threshold-accordion"
          >
            {thresholdOpen ? <ChevronDown className="w-4 h-4" style={{ color: "#F5A623" }} /> : <ChevronRight className="w-4 h-4" style={{ color: "#F5A623" }} />}
            <span className="text-sm font-bold text-white flex-1">📊 Minimum Puan Eşiği</span>
            {(allianceThresholds.length + memberThresholds.length) > 0 && (
              <span className="chip text-[10px]" style={{ color: "#F5A623", borderColor: "rgba(245,166,35,0.55)" }}>
                {allianceThresholds.length + memberThresholds.length} kural
              </span>
            )}
          </button>
          {thresholdOpen && (
            <div className="p-3 pt-0 space-y-4" data-testid="event-form-threshold-panel">
              {/* GRUP EŞİĞİ */}
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-2">GRUP EŞİĞİ</div>
                {allianceThresholds.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 mb-1.5 flex-wrap" data-testid={`event-form-alliance-threshold-row-${idx}`}>
                    <input
                      value={row.alliance_name || ""}
                      onChange={(e) => setAllianceThresholds(allianceThresholds.map((r, i) => i === idx ? { ...r, alliance_name: e.target.value } : r))}
                      placeholder="İttifak"
                      data-testid={`event-form-alliance-threshold-name-${idx}`}
                      className="bg-background border border-border rounded-md px-2 py-1 text-xs text-white"
                      style={{ minWidth: 80, flex: "1 1 80px" }}
                    />
                    <button type="button" onClick={() => setAllianceThresholds(allianceThresholds.map((r, i) => i === idx ? { ...r, threshold: 50_000_000 } : r))} className="chip text-[10px]" data-testid={`event-form-alliance-threshold-50m-${idx}`}>50M</button>
                    <button type="button" onClick={() => setAllianceThresholds(allianceThresholds.map((r, i) => i === idx ? { ...r, threshold: 150_000_000 } : r))} className="chip text-[10px]" data-testid={`event-form-alliance-threshold-150m-${idx}`}>150M</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={row.threshold || ""}
                      onChange={(e) => setAllianceThresholds(allianceThresholds.map((r, i) => i === idx ? { ...r, threshold: parseInt(e.target.value, 10) || 0 } : r))}
                      placeholder="Manuel"
                      data-testid={`event-form-alliance-threshold-manual-${idx}`}
                      className="w-24 bg-background border border-border rounded-md px-2 py-1 text-xs text-white mono"
                    />
                    <button type="button" onClick={() => setAllianceThresholds(allianceThresholds.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 p-1" data-testid={`event-form-alliance-threshold-remove-${idx}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAllianceThresholds([...allianceThresholds, { alliance_name: "GOW", threshold: 0 }])}
                  className="chip text-[10px] mt-1"
                  data-testid="event-form-alliance-threshold-add"
                >
                  <Plus className="w-3 h-3 inline mr-1" /> Grup Ekle
                </button>
              </div>

              {/* ÖZEL EŞİK */}
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-2">ÖZEL EŞİK</div>
                {memberThresholds.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 mb-1.5 flex-wrap" data-testid={`event-form-member-threshold-row-${idx}`}>
                    <input
                      value={row.member_id || ""}
                      onChange={(e) => setMemberThresholds(memberThresholds.map((r, i) => i === idx ? { ...r, member_id: e.target.value } : r))}
                      placeholder="Üye ID / ad"
                      data-testid={`event-form-member-threshold-name-${idx}`}
                      className="bg-background border border-border rounded-md px-2 py-1 text-xs text-white"
                      style={{ minWidth: 80, flex: "1 1 80px" }}
                    />
                    <button type="button" onClick={() => setMemberThresholds(memberThresholds.map((r, i) => i === idx ? { ...r, threshold: 50_000_000 } : r))} className="chip text-[10px]" data-testid={`event-form-member-threshold-50m-${idx}`}>50M</button>
                    <button type="button" onClick={() => setMemberThresholds(memberThresholds.map((r, i) => i === idx ? { ...r, threshold: 150_000_000 } : r))} className="chip text-[10px]" data-testid={`event-form-member-threshold-150m-${idx}`}>150M</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={row.threshold || ""}
                      onChange={(e) => setMemberThresholds(memberThresholds.map((r, i) => i === idx ? { ...r, threshold: parseInt(e.target.value, 10) || 0 } : r))}
                      placeholder="Manuel"
                      data-testid={`event-form-member-threshold-manual-${idx}`}
                      className="w-24 bg-background border border-border rounded-md px-2 py-1 text-xs text-white mono"
                    />
                    <button type="button" onClick={() => setMemberThresholds(memberThresholds.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 p-1" data-testid={`event-form-member-threshold-remove-${idx}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setMemberThresholds([...memberThresholds, { member_id: "", threshold: 0 }])}
                  className="chip text-[10px] mt-1"
                  data-testid="event-form-member-threshold-add"
                >
                  <Plus className="w-3 h-3 inline mr-1" /> Kişi Ekle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* v135.6 — Şablon olarak kaydet checkbox — sadece yeni etkinlik oluştururken görünür. */}
        {!initial && (
          <div className="mt-4 rounded p-3" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.35)" }} data-testid="event-form-save-as-template-row">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                data-testid="event-form-save-as-template"
                className="cursor-pointer"
              />
              <span className="text-xs font-bold" style={{ color: "#C4B5FD" }}>📋 Bu etkinliği şablon olarak kaydet</span>
            </label>
            {saveAsTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                data-testid="event-form-template-name"
                placeholder={`Şablon adı (boş bırakırsan "${(name || "…")} Şablonu")`}
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-white mt-2"
              />
            )}
          </div>
        )}

        <button data-testid={EVENTS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : initial ? t("update") : t("add_short")}
        </button>
      </form>
    </div>
  );
}

function BireyselEventForm({ initial = null, onClose }) {
  const { data: activeGroups = [] } = useSWR("/event-groups?active_only=true", fetcher);
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(
    initial?.date
      ? (() => {
          const d = new Date(initial.date);
          const tz = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - tz).toISOString().slice(0, 16);
        })()
      : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );
  const [description, setDescription] = useState(initial?.description || "");
  // v140.29 — Grup seçimi ("none" = Grup Yok, "existing" = Mevcut, "new" = Yeni ad)
  // v140.46 — Edit modunda mevcut group_name'e göre modu türet.
  const [groupMode, setGroupMode] = useState(
    initial && (initial.group_name || "").trim() ? "existing" : "none",
  );
  const [selectedGroup, setSelectedGroup] = useState(initial?.group_name || "");
  const [newGroupName, setNewGroupName] = useState("");

  const [showInLb, setShowInLb] = useState(initial ? !initial.hidden_from_leaderboard : true);
  const [autoReport, setAutoReport] = useState(!!(initial && initial.auto_report_top10));
  const [channels, setChannels] = useState(() => {
    const arr = (initial && Array.isArray(initial.report_channels)) ? initial.report_channels : [];
    return {
      telegram: arr.includes("telegram"),
      push: arr.includes("push"),
      message: arr.includes("message"),
    };
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Etkinlik adı gerekli"); return; }
    if (groupMode === "existing" && !selectedGroup.trim()) {
      toast.error("Grup seçmelisin veya 'Grup Yok' seçeneğine dön");
      return;
    }
    if (groupMode === "new" && !newGroupName.trim()) {
      toast.error("Yeni grup adı boş olamaz");
      return;
    }
    setSaving(true);
    try {
      const selected = Object.keys(channels).filter((k) => channels[k]);
      // v140.30 — mod'a göre grup adını çöz
      const resolvedGroupName =
        groupMode === "existing" ? selectedGroup.trim()
        : groupMode === "new" ? newGroupName.trim()
        : "";
      const body = {
        name: name.trim(),
        date: new Date(date).toISOString(),
        subtitle: null,
        description: description.trim() || null,
        multiplier: 1,
        group_name: resolvedGroupName,
        banner_url: null,
        hidden_from_leaderboard: !showInLb,
        attendance_enabled: false,
        reminder_enabled: false,
        alliance_scope: "GOW",
        auto_archive: false,
        auto_report_top10: autoReport,
        report_channels: autoReport ? selected : [],
        // v140.43 — Grup atansa bile bu etkinlik BİREYSEL kalır; kolon
        // kategorileme event_type üzerinden yapılır.
        event_type: "bireysel",
      };
      if (isEdit) {
        await api.patch(`/events/${initial.id}`, body);
      } else {
        await api.post("/events", body);
      }
      mutate((k) => typeof k === "string" && (k.startsWith("/events") || k.startsWith("/event-groups")));
      mutate("/stats");
      toast.success(isEdit ? "Bireysel etkinlik güncellendi" : "Bireysel etkinlik oluşturuldu");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      data-testid="bireysel-event-modal"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
        data-testid="bireysel-event-form"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-white"
          data-testid="bireysel-close-btn"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
          <User className="w-4 h-4" style={{ color: "#A78BFA" }} /> Bireysel Etkinlik
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
          Kişisel bir görev, mini rekor veya kişisel bir hedef — grup/ittifak konfigüne gerek yok.
        </p>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Etkinlik Adı</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Kişisel Kafes 500K"
          data-testid="bireysel-name"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Tarih / Saat</label>
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="bireysel-date"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Açıklama</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Bu etkinliğin amacı, hedefi, notların..."
          data-testid="bireysel-description"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white resize-none"
        />

        {/* v140.30 — Grup seçimi: Yok / Mevcut / Yeni (3 chip) */}
        <div className="mt-3 rounded p-3" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.30)" }} data-testid="bireysel-group-section">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-2">GRUP SEÇİMİ</div>
          <div className="flex gap-2 mb-2 flex-wrap">
            <button
              type="button"
              data-testid="bireysel-group-mode-none"
              onClick={() => { setGroupMode("none"); setSelectedGroup(""); setNewGroupName(""); }}
              className="chip text-xs px-3 py-1.5 flex-1 min-w-[90px]"
              style={{
                borderColor: groupMode === "none" ? "#A78BFA" : "rgba(148,163,184,0.5)",
                color: groupMode === "none" ? "#C4B5FD" : "#94A3B8",
                background: groupMode === "none" ? "rgba(168,85,247,0.15)" : "transparent",
              }}
              aria-pressed={groupMode === "none"}
            >
              🚫 Grup Yok
            </button>
            <button
              type="button"
              data-testid="bireysel-group-mode-existing"
              onClick={() => { setGroupMode("existing"); setNewGroupName(""); }}
              className="chip text-xs px-3 py-1.5 flex-1 min-w-[90px]"
              style={{
                borderColor: groupMode === "existing" ? "#A78BFA" : "rgba(148,163,184,0.5)",
                color: groupMode === "existing" ? "#C4B5FD" : "#94A3B8",
                background: groupMode === "existing" ? "rgba(168,85,247,0.15)" : "transparent",
              }}
              aria-pressed={groupMode === "existing"}
            >
              📁 Mevcut Grup
            </button>
            <button
              type="button"
              data-testid="bireysel-group-mode-new"
              onClick={() => { setGroupMode("new"); setSelectedGroup(""); }}
              className="chip text-xs px-3 py-1.5 flex-1 min-w-[90px]"
              style={{
                borderColor: groupMode === "new" ? "#A78BFA" : "rgba(148,163,184,0.5)",
                color: groupMode === "new" ? "#C4B5FD" : "#94A3B8",
                background: groupMode === "new" ? "rgba(168,85,247,0.15)" : "transparent",
              }}
              aria-pressed={groupMode === "new"}
            >
              ✨ Yeni Grup
            </button>
          </div>
          {groupMode === "existing" && (
            <div data-testid="bireysel-group-select-row">
              {/* v140.31 — Özel liste-picker: grup adı + silme butonu.
                  `/event-groups?active_only=true` zaten arşivlenen grupları
                  filtreler; burada admin ayrıca manuel silebilir (cascade). */}
              {(activeGroups || []).length === 0 ? (
                <div className="text-xs opacity-70 py-2" style={{ color: "#94A3B8" }}>
                  Henüz aktif grup yok.
                </div>
              ) : (
                <div className="rounded-md border border-border overflow-hidden max-h-56 overflow-y-auto" data-testid="bireysel-group-list">
                  {(activeGroups || []).map((g) => {
                    const gname = g.name || g;
                    const isSelected = selectedGroup === gname;
                    return (
                      <div
                        key={gname}
                        data-testid={`bireysel-group-row-${gname}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0"
                        style={{
                          background: isSelected ? "rgba(168,85,247,0.15)" : "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedGroup(gname)}
                      >
                        <span className="text-sm flex items-center gap-2 min-w-0 flex-1" style={{ color: isSelected ? "#C4B5FD" : "#F5F0E8" }}>
                          {isSelected ? "✅" : "📁"} <span className="truncate">{gname}</span>
                          {typeof g.active === "number" && (
                            <span className="text-[10px] opacity-60 ml-1">({g.active})</span>
                          )}
                        </span>
                        <button
                          type="button"
                          data-testid={`bireysel-group-delete-${gname}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`"${gname}" grubunu ve içindeki tüm etkinlik + puanları KALICI olarak silmek istediğinden emin misin?`)) return;
                            try {
                              await api.delete(`/events/group/${encodeURIComponent(gname)}`);
                              toast.success("Grup silindi");
                              if (selectedGroup === gname) setSelectedGroup("");
                              mutate("/event-groups?active_only=true");
                              mutate((k) => typeof k === "string" && (k.startsWith("/events") || k.startsWith("/event-groups")));
                            } catch (err) {
                              toast.error(err?.response?.data?.detail || err.message);
                            }
                          }}
                          className="text-red-400 hover:text-red-300 p-1 rounded"
                          title={`"${gname}" grubunu sil`}
                          aria-label={`"${gname}" grubunu sil`}
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] mt-1 opacity-70" style={{ color: "#94A3B8" }}>
                Aynı gruba ait etkinliklerin puanları birlikte toplanır. Arşive giden grup burada görünmez; 🗑️ ile kalıcı silinir (cascade).
              </p>
            </div>
          )}
          {groupMode === "new" && (
            <div data-testid="bireysel-group-new-row">
              <input
                type="text"
                data-testid="bireysel-group-new-input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Yeni grup adı (örn. Kış Turnuvası)"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
                maxLength={60}
              />
              <p className="text-[10px] mt-1 opacity-70" style={{ color: "#94A3B8" }}>
                Yeni bir grup adı yazıyorsun. Kaydedince aktif gruplar listesine eklenecek.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 rounded p-3" style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.30)" }}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInLb}
              onChange={(e) => setShowInLb(e.target.checked)}
              data-testid="bireysel-visible-checkbox"
              className="cursor-pointer"
            />
            <span className="text-sm font-bold text-white">🏆 Sıralamada görünsün</span>
          </label>
        </div>

        <div className="mt-3 rounded p-3" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.30)" }} data-testid="bireysel-reporting-section">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-2">RAPORLAMA</div>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={autoReport}
              onChange={(e) => setAutoReport(e.target.checked)}
              data-testid="bireysel-auto-report-checkbox"
              className="cursor-pointer"
            />
            <span className="text-sm font-bold text-white">📊 İlk 10 kişiyi otomatik raporla</span>
          </label>
          {autoReport && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1.5">Raporlama kanalları (çoklu seçim)</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { key: "telegram", label: "📨 Telegram" },
                  { key: "push", label: "🔔 Push" },
                  { key: "message", label: "💬 Mesaj" },
                ].map((ch) => {
                  const active = !!channels[ch.key];
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => setChannels({ ...channels, [ch.key]: !active })}
                      className="chip justify-center text-[10px] py-1.5"
                      data-testid={`bireysel-channel-${ch.key}`}
                      style={active ? {
                        background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(3,105,161,0.25))",
                        borderColor: "#38BDF8",
                        color: "#F0F9FF",
                      } : { opacity: 0.65 }}
                      aria-pressed={active}
                    >
                      {ch.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          data-testid="bireysel-submit"
          type="submit"
          disabled={saving}
          className="btn-gold w-full mt-5"
          style={{ background: "linear-gradient(135deg,#8B5CF6,#5B21B6)", borderColor: "#A78BFA" }}
        >
          {saving ? "Kaydediliyor..." : "Bireysel Etkinlik Oluştur"}
        </button>
      </form>
    </div>
  );
}

function EventFolderManager({ folders, onClose }) {
  const { t } = useTranslation();
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
              {t("archive_folders", "Arşiv Klasörleri")}
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
              placeholder={t("form_new_folder_name")}
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


// v135.39 — /etkinlikler sayfasında "Yeni Etkinlik" butonunun yanındaki
// tek tıklama şablon seçici. Aktif event-template'leri fetch eder; dropdown'da
// bir şablon seçilince onPicked callback'i çağrılır (EventForm açılır ve
// initialTemplate ile pre-fill olur).
// v135.40 — Her satırda ayrıca "Seri" mini butonu — tek tıkla haftalık/aylık
// tekrarlı etkinlik serisi oluşturmak için modal açar.
function TemplateQuickPickButton({ onPicked, onPickedSeries }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useSWR(open ? "/event-templates" : null, fetcher);
  const items = data?.items || [];
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={wrapRef} className="relative" data-testid="events-tpl-quickpick">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-gold flex items-center gap-1.5 text-xs"
        style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", borderColor: "#A78BFA" }}
        data-testid="events-tpl-quickpick-btn"
        title={t("events_tpl_quickpick_hint", "Kayıtlı bir şablondan yeni etkinlik oluştur")}
      >
        <LayoutTemplate className="w-4 h-4" /> {t("events_tpl_quickpick_label", "Şablondan")}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-72 max-h-96 overflow-auto rounded shadow-lg z-40"
          style={{ background: "#0F0910", border: "1px solid rgba(168,85,247,0.55)" }}
          data-testid="events-tpl-quickpick-menu"
        >
          {!items.length && (
            <div className="p-3 text-xs text-muted-foreground text-center">
              {t("events_tpl_quickpick_empty", "Kayıtlı şablon yok. /sablonlar sayfasından ekleyebilirsin.")}
            </div>
          )}
          {items.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-stretch border-b border-white/5 last:border-b-0"
              data-testid={`events-tpl-quickpick-row-${tpl.id}`}
            >
              <button
                type="button"
                onClick={() => { setOpen(false); onPicked(tpl); }}
                data-testid={`events-tpl-quickpick-item-${tpl.id}`}
                className="flex-1 text-left px-3 py-2 text-xs text-white hover:bg-violet-500/20 transition-colors"
              >
                <div className="font-bold truncate">📋 {tpl.template_name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {tpl.name} · ×{tpl.multiplier || 1}{tpl.group_name ? ` · ${tpl.group_name}` : ""}
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); onPickedSeries(tpl); }}
                data-testid={`events-tpl-quickpick-series-${tpl.id}`}
                title={t("events_tpl_series_hint", "Bu şablondan tekrarlı seri oluştur")}
                className="px-2 flex items-center gap-1 text-[10px] font-bold hover:bg-fuchsia-500/25 transition-colors border-l border-white/5"
                style={{ color: "#F0ABFC" }}
              >
                🔁 {t("events_tpl_series_label", "Seri")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// v135.40 — Şablondan Tekrarlı Etkinlik: Preset ile veya özel interval+count
// ile POST /events (recurrence_interval + recurrence_count) tek çağrıyla seriyi
// yaratır. Backend zaten seri yaratmayı destekliyor (bkz. server.py POST /events).
function TemplateSeriesModal({ template, onClose, onCreated }) {
  const { t } = useTranslation();
  // Varsayılan başlangıç: yarın 20:00 (yerel).
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(20, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);
  const PRESETS = useMemo(() => ([
    { key: "weekly4",  interval: "weekly",  count: 4, label: t("tpl_series_preset_w4", "Haftalık × 4 hafta") },
    { key: "weekly8",  interval: "weekly",  count: 8, label: t("tpl_series_preset_w8", "Haftalık × 8 hafta") },
    { key: "monthly3", interval: "monthly", count: 3, label: t("tpl_series_preset_m3", "Aylık × 3 ay") },
    { key: "monthly6", interval: "monthly", count: 6, label: t("tpl_series_preset_m6", "Aylık × 6 ay") },
    { key: "daily7",   interval: "daily",   count: 7, label: t("tpl_series_preset_d7", "Günlük × 7 gün") },
    { key: "custom",   interval: null,      count: null, label: t("tpl_series_preset_custom", "Özel") },
  ]), [t]);
  const [preset, setPreset] = useState("weekly4");
  const [interval, setInterval] = useState("weekly");
  const [count, setCount] = useState(4);
  const [date, setDate] = useState(defaultStart);
  const [saving, setSaving] = useState(false);

  const applyPreset = (key) => {
    setPreset(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p && p.interval && p.count) {
      setInterval(p.interval);
      setCount(p.count);
    }
  };

  // Tarihleri önden hesapla — kullanıcı ne oluşturacağını görsün.
  const previewDates = useMemo(() => {
    if (!date) return [];
    const start = new Date(date);
    if (isNaN(start.getTime())) return [];
    const out = [];
    for (let i = 0; i < Math.min(count || 0, 24); i++) {
      const d = new Date(start.getTime());
      if (interval === "daily")   d.setDate(d.getDate() + i);
      if (interval === "weekly")  d.setDate(d.getDate() + i * 7);
      if (interval === "monthly") d.setMonth(d.getMonth() + i);
      out.push(d);
    }
    return out;
  }, [date, interval, count]);

  const submit = async () => {
    if (!date) { toast.error(t("tpl_series_date_required", "Başlangıç tarihi gerekli")); return; }
    const n = Math.max(1, Math.min(24, Number(count) || 0));
    if (n < 1) { toast.error(t("tpl_series_count_range", "Adet 1-24 arası olmalı")); return; }
    if (!["daily", "weekly", "monthly"].includes(interval)) {
      toast.error(t("tpl_series_interval_required", "Tekrar aralığı seçilmeli"));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: template.name,
        date: new Date(date).toISOString(),
        multiplier: Number(template.multiplier) || 1,
        subtitle: template.subtitle || null,
        group_name: template.group_name || null,
        banner_url: template.banner_url || null,
        reminder_enabled: template.reminder_enabled !== false,
        attendance_enabled: template.attendance_enabled !== false,
        hidden_from_leaderboard: !!template.hidden_from_leaderboard,
        alliance_scope: "GOW",
        auto_archive: false,
        recurrence_interval: interval,
        recurrence_count: n,
        template_source_name: template.template_name || template.name,
      };
      const res = await api.post("/events", body);
      const spawned = res?.data?.recurrence_created || n;
      toast.success(t("tpl_series_created_toast",
        "{{spawned}} etkinlik oluşturuldu (şablon: {{tn}})",
        { spawned, tn: template.template_name }));
      // Yeni etkinlikler görünsün
      mutate((k) => typeof k === "string" && (k.startsWith("/events") || k.startsWith("/event-groups")));
      mutate("/stats");
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
         onClick={onClose}
         data-testid="tpl-series-modal">
      <div onClick={(e) => e.stopPropagation()}
           className="card-red-gold w-full max-w-md p-5 fade-in relative"
           style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <button type="button" onClick={onClose}
                className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase mb-1" style={{ color: "#F0ABFC" }}>
          🔁 {t("tpl_series_title", "Şablondan Seri Oluştur")}
        </h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          {t("tpl_series_hint", "Şablon: {{tn}} — {{en}}", { tn: template.template_name, en: template.name })}
        </p>

        <label className="block text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">
          {t("tpl_series_start_date", "Başlangıç tarihi ve saati")}
        </label>
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid="tpl-series-start-date"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mb-3"
        />

        <label className="block text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">
          {t("tpl_series_preset_label", "Ön Ayar")}
        </label>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className="chip justify-center text-[10px] py-1.5"
              data-testid={`tpl-series-preset-${p.key}`}
              aria-pressed={preset === p.key}
              style={preset === p.key ? {
                background: "rgba(240,171,252,0.20)",
                borderColor: "#F0ABFC",
                color: "#F0ABFC",
              } : { opacity: 0.65 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("tpl_series_interval", "Tekrar")}
            </div>
            <select
              value={interval}
              onChange={(e) => { setInterval(e.target.value); setPreset("custom"); }}
              data-testid="tpl-series-interval"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            >
              <option value="daily">{t("tpl_series_daily", "Günlük")}</option>
              <option value="weekly">{t("tpl_series_weekly", "Haftalık")}</option>
              <option value="monthly">{t("tpl_series_monthly", "Aylık")}</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("tpl_series_count", "Adet (1-24)")}
            </div>
            <input
              type="number"
              min={1}
              max={24}
              value={count}
              onChange={(e) => { setCount(e.target.value); setPreset("custom"); }}
              data-testid="tpl-series-count"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono"
            />
          </label>
        </div>

        {previewDates.length > 0 && (
          <div className="rounded p-2 mb-4" style={{ background: "rgba(240,171,252,0.06)", border: "1px solid rgba(240,171,252,0.35)" }}
               data-testid="tpl-series-preview">
            <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">
              {t("tpl_series_preview_label", "Oluşturulacak Etkinlikler ({{n}})", { n: previewDates.length })}
            </div>
            <div className="max-h-32 overflow-auto space-y-0.5 text-[10px] mono text-white">
              {previewDates.map((d, i) => (
                <div key={i} className="truncate">
                  {i + 1}. {d.toLocaleString("tr-TR")}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          data-testid="tpl-series-submit"
          className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
          style={{ background: "linear-gradient(135deg,#A21CAF,#701A75)", borderColor: "#F0ABFC" }}
        >
          {saving ? t("saving", "Kaydediliyor…") : t("tpl_series_submit_btn", "Seriyi Oluştur")}
        </button>
      </div>
    </div>
  );
}
