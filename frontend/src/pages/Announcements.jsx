import React, { useState } from "react";
import useSWR from "swr";
import { Megaphone, Send, Trash2, Loader2, Radio, Users, MessageCircle, Bell, History, ChevronDown, Undo2, Search, Filter } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { useUndo } from "@/context/UndoContext";
import ImageDropzone from "@/components/ImageDropzone";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Announcements page — admin creates a broadcast that fans out across
 * Web Push + Telegram Group + Telegram DMs (country-translated) + in-app
 * bell in a single action. Non-admin visitors just see the list of active
 * announcements below the create form (which is hidden for them).
 *
 * When `embedded` is true (rendered inside the /etkinlik-bildirimleri hub)
 * we skip the page-level max-width wrapper and title so the parent tab
 * layout owns the vertical rhythm.
 */
export default function Announcements({ embedded = false }) {
  const { isAdmin } = useAuth();
  const { showUndo } = useUndo();
  // History drawer is collapsed by default so the admin sees the compose
  // form first; toggling reveals the list which is now more compact.
  const [historyOpen, setHistoryOpen] = useState(false);
  // Revert diff modal — populated with {id, prev, current} when the admin
  // clicks the ⟲ button; a two-column dialog compares old vs new and
  // confirms the pop-from-history call.
  const [revertPreview, setRevertPreview] = useState(null);
  // Search + filter for the announcement history list.
  const [searchQ, setSearchQ] = useState("");
  const [filterKind, setFilterKind] = useState("all"); // all | urgent | scheduled | normal | archived
  // v135.36 — Bulk selection state for the "archived" filter view. Only
  // rendered when filterKind === "archived" so it can't leak into normal
  // moderation flows.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const listUrl = `/announcements?limit=50${searchQ.trim() ? `&search=${encodeURIComponent(searchQ.trim())}` : ""}${filterKind !== "all" ? `&filter=${filterKind}` : ""}`;
  const { data, mutate, isLoading } = useSWR(listUrl, fetcher, { refreshInterval: 60000 });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  // Local file(s) uploaded via ImageDropzone. When set, its .url wins over
  // the manual URL field below so admins can either paste a link or pick
  // a file from their device — whichever is faster in the moment.
  const [imageFiles, setImageFiles] = useState([]);
  const [broadcast, setBroadcast] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [pinned, setPinned] = useState(false); // v135.6 — sabit anasayfa banner'ı
  const [pinnedUntil, setPinnedUntil] = useState(""); // v135.8 — otomatik kaldırma zamanı (local yyyy-MM-ddTHH:mm)
  const [scheduledAt, setScheduledAt] = useState(""); // local yyyy-MM-ddTHH:mm; empty = anlık gönder
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  // When set, submit issues PATCH /announcements/{editingId} instead of POST
  // (silent edit-in-place, no re-broadcast).
  const [editingId, setEditingId] = useState(null);

  const finalImageUrl = imageFiles[0]?.url || imageUrl.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { toast.error("Başlık ve içerik zorunlu"); return; }
    // Convert local datetime-local string to ISO with local timezone offset.
    let scheduledIso = null;
    if (scheduledAt && !editingId) {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) { toast.error("Geçersiz zaman"); return; }
      if (d.getTime() <= Date.now()) { toast.error("Zamanlanmış tarih gelecekte olmalı"); return; }
      scheduledIso = d.toISOString();
    }
    setSending(true);
    try {
      if (editingId) {
        // In-place edit — no re-broadcast, silent update.
        await api.patch(`/announcements/${editingId}`, {
          title, body, image_url: finalImageUrl || null, urgent,
        });
        toast.success("Duyuru güncellendi");
      } else {
        const r = await api.post("/announcements", {
          title, body,
          image_url: finalImageUrl || undefined,
          broadcast, urgent, pinned,
          pinned_until: pinnedUntil ? new Date(pinnedUntil).toISOString() : undefined,
          scheduled_at: scheduledIso || undefined,
        });
        if (scheduledIso) {
          toast.success(`⏰ Duyuru zamanlandı — ${new Date(scheduledIso).toLocaleString("tr-TR")}`);
          setLastResult(null);
        } else {
          toast.success(urgent ? "🚨 Acil duyuru dağıtıldı" : "Duyuru gönderildi");
          setLastResult(r.data.fanout || null);
        }
      }
      setTitle(""); setBody(""); setImageUrl(""); setImageFiles([]); setUrgent(false); setPinned(false); setPinnedUntil("");
      setScheduledAt("");
      setEditingId(null);
      mutate();
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSending(false);
    }
  };

  // Load an existing announcement for IN-PLACE edit. Sets editingId so the
  // next submit fires PATCH (silent, no re-broadcast) instead of POST.
  const copyToForm = (a) => {
    setEditingId(a.id);
    setTitle((a.title || "").replace(/^🚨\s*/, ""));
    setBody(a.body || "");
    setImageUrl(a.image_url || "");
    setImageFiles([]);
    setUrgent(!!a.urgent);
    setBroadcast(true);
    setHistoryOpen(false);
    toast.info("Düzenleme modu — Kaydet'e basınca yayınlanmadan güncellenir");
    try {
      document.querySelector('[data-testid="announcement-form"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch { /* noop */ }
  };

  // Load an existing announcement back into the compose form so the admin
  // can tweak it and re-send. We do NOT auto-delete the source — the admin
  // can hit the 🗑️ button on the original row afterwards if they want.

  const remove = async (id) => {
    if (!window.confirm("Duyuruyu tamamen silmek istiyor musun? Geri alınamaz.")) return;
    try {
      const snapshot = items.find((x) => x.id === id);
      await api.delete(`/announcements/${id}`);
      mutate();
      toast.success("Duyuru silindi");
      if (snapshot) {
        showUndo({
          message: `${snapshot.title} silindi`,
          onUndo: async () => {
            await api.post("/announcements", {
              title: snapshot.title.replace(/^🚨 /, ""),
              body: snapshot.body,
              url: snapshot.url,
              image_url: snapshot.image_url,
              urgent: snapshot.urgent,
              broadcast: false,
              pinned: snapshot.pinned,
            });
            mutate();
          },
        });
      }
    } catch (e) { toast.error(apiErr(e)); }
  };

  const revert = async (id, historyCount) => {
    // Load the latest history entry so we can render a diff before the
    // admin commits. `history` is already on the announcement doc.
    const a = items.find((x) => x.id === id);
    const prev = a?.history?.[a.history.length - 1];
    if (!prev) { toast.error("Geri alınacak sürüm yok"); return; }
    setRevertPreview({ id, historyCount, prev, current: { title: a.title, body: a.body, image_url: a.image_url, urgent: a.urgent } });
  };
  const commitRevert = async () => {
    if (!revertPreview) return;
    try {
      await api.post(`/announcements/${revertPreview.id}/revert`);
      mutate();
      toast.success("Önceki sürüme dönüldü");
      setRevertPreview(null);
    } catch (e) { toast.error(apiErr(e)); }
  };

  // v135.36 — Bulk archive actions.
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`${ids.length} arşiv duyurusunu KALICI olarak silmek istiyor musun? Geri alınamaz.`)) return;
    setBulkBusy(true);
    try {
      const r = await api.post("/announcements/bulk-delete", { ids });
      toast.success(`${r.data?.deleted ?? 0} duyuru silindi`);
      clearSelection();
      mutate();
    } catch (e) { toast.error(apiErr(e)); } finally { setBulkBusy(false); }
  };
  const bulkRestore = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const r = await api.post("/announcements/bulk-restore", { ids });
      toast.success(`${r.data?.restored ?? 0} duyuru geri yüklendi`);
      clearSelection();
      mutate();
    } catch (e) { toast.error(apiErr(e)); } finally { setBulkBusy(false); }
  };

  // Word-level diff — splits both strings on whitespace-preserving tokens
  // and marks tokens that don't appear in the other side. Naive but
  // enough to make small typo fixes visually obvious without an LCS lib.
  const wordDiff = (a, b) => {
    const toks = (s) => (s || "").split(/(\s+)/);
    const wa = toks(a), wb = toks(b);
    const setB = new Set(wb.filter((w) => w.trim()));
    const setA = new Set(wa.filter((w) => w.trim()));
    return {
      a: wa.map((w) => ({ text: w, changed: !!w.trim() && !setB.has(w) })),
      b: wb.map((w) => ({ text: w, changed: !!w.trim() && !setA.has(w) })),
    };
  };
  const DiffText = ({ tokens, tone }) => (
    <span>
      {tokens.map((tk, i) =>
        tk.changed ? (
          <mark
            key={i}
            style={{
              background: tone === "removed" ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)",
              color: tone === "removed" ? "#FCA5A5" : "#86EFAC",
              padding: "0 2px",
              borderRadius: 2,
            }}
          >
            {tk.text}
          </mark>
        ) : (
          <span key={i}>{tk.text}</span>
        ),
      )}
    </span>
  );

  const items = data?.items || [];

  // NOTE: We deliberately do NOT wrap this render in a component defined inside
  // Announcements. Doing so (previous `const Wrapper = ...` pattern) recreates
  // the wrapper's function identity on every keystroke, unmounting all inputs
  // and closing the mobile keyboard after every character.
  const wrapperClass = embedded
    ? "space-y-4"
    : "max-w-4xl mx-auto py-6 px-4 space-y-6";

  return (
    <div className={wrapperClass} data-testid="announcements-page">
      {!embedded && (
        <div className="flex items-center gap-2">
          <Megaphone className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">Duyurular</h1>
        </div>
      )}

      {isAdmin && (
        <form onSubmit={submit} className="card-red-gold p-4 space-y-3" data-testid="announcement-form">
          <div className="flex items-center gap-2 text-xs uppercase font-bold gold-text">
            <Radio className="w-3.5 h-3.5" /> Yeni Duyuru
          </div>
          <input
            data-testid="announcement-title"
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Duyuru başlığı"
            className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-sm"
          />
          <textarea
            data-testid="announcement-body"
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Duyuru içeriği (Telegram + Web Push + In-App bell'e gider)"
            rows={4}
            className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-sm resize-y"
          />
          <div className="space-y-2">
            <div className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
              Görsel (opsiyonel)
            </div>
            <ImageDropzone
              purpose="misc"
              value={imageFiles}
              onChange={setImageFiles}
              max={1}
              compact
            />
            <div className="text-[10px] text-muted-foreground text-center">— veya —</div>
            <input
              data-testid="announcement-image-url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Resim URL'i (https://... .jpg / .png)"
              disabled={imageFiles.length > 0}
              className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-xs disabled:opacity-40"
            />
            {finalImageUrl && imageFiles.length === 0 && (
              <img src={finalImageUrl} alt="preview"
                   data-testid="announcement-image-preview"
                   className="max-h-40 rounded border border-border object-contain mx-auto"
                   onError={(e) => { e.target.style.display = "none"; }} />
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)}
                   data-testid="announcement-broadcast" />
            <span>Tüm kanallara dağıt (Telegram Kanal + DM + Web Push + Uygulama)</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold" style={{ color: urgent ? "#F87171" : "#94A3B8" }}>
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)}
                   data-testid="announcement-urgent" />
            <span>🚨 ACİL — başlığa alarm ikonu ekle, kırmızı rozetle işaretle</span>
          </label>
          {/* v135.6 — Sabitle: pinned duyuru anasayfada amber banner olarak görünür */}
          <label className="flex items-center gap-2 text-xs font-bold" style={{ color: pinned ? "#F5A623" : "#94A3B8" }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)}
                   data-testid="announcement-pinned" />
            <span>📌 Sabitle — anasayfada amber banner olarak göster</span>
          </label>
          {/* v135.8 — Otomatik Kaldır: sabit duyurunun banner'ı bu zamandan
              sonra client-side filtreyle gizlenir. Boş → süresiz. */}
          {pinned && (
            <div className="ml-6 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">⏱ Otomatik Kaldır:</span>
              <input
                type="datetime-local"
                value={pinnedUntil}
                onChange={(e) => setPinnedUntil(e.target.value)}
                data-testid="announcement-pinned-until"
                className="bg-background border border-border rounded-md px-2 py-1 text-xs text-white"
              />
              {pinnedUntil && (
                <button
                  type="button"
                  onClick={() => setPinnedUntil("")}
                  className="text-[10px] text-muted-foreground hover:text-white underline"
                >temizle</button>
              )}
            </div>
          )}

          {/* Zamanlama — boş bırakılırsa anlık gönderim yapılır. Sadece yeni
              duyurularda görünür (edit modunda gizli). */}
          {!editingId && (
            <div className="space-y-1" data-testid="announcement-schedule-row">
              <div className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <span aria-hidden style={{ fontSize: 12 }}>⏰</span>
                <span>Zamanla (opsiyonel)</span>
                {scheduledAt && (
                  <button
                    type="button"
                    onClick={() => setScheduledAt("")}
                    className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 hover:bg-red-500/25"
                    data-testid="announcement-schedule-clear"
                  >
                    Temizle
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                data-testid="announcement-scheduled-at"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-xs"
              />
              <div className="text-[10px] text-muted-foreground">
                {scheduledAt
                  ? `Bu duyuru ${new Date(scheduledAt).toLocaleString("tr-TR")} tarihinde gönderilecek.`
                  : "Boş bırakılırsa duyuru hemen gönderilir."}
              </div>
            </div>
          )}
          <button type="submit" disabled={sending}
                  className="btn-gold px-4 py-2 flex items-center gap-2 text-sm justify-center"
                  data-testid="announcement-submit">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Gönderiliyor…" : (scheduledAt && !editingId ? "Zamanla" : "Duyur ve Kaydet")}
          </button>

          {lastResult && (
            <div className="text-[11px] p-2 rounded flex flex-wrap gap-2"
                 style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)", color: "#6EE7B7" }}
                 data-testid="announcement-fanout-summary">
              <span className="flex items-center gap-1"><Radio className="w-3 h-3" /> Kanal: {lastResult.telegram_channel_sent ? "✓" : "✗"}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> DM: {lastResult.telegram_dm_sent} ({lastResult.telegram_dm_translated} çevrildi)</span>
              <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> Push: {lastResult.push_sent}</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> App: {lastResult.app_notif_sent}</span>
              {Object.entries(lastResult.telegram_dm_langs || {}).map(([code, n]) => (
                <span key={code} className="px-1 rounded"
                      style={{ background: "rgba(59,130,246,0.20)", color: "#93C5FD" }}>{code}:{n}</span>
              ))}
            </div>
          )}
        </form>
      )}

      {/* Gönderim geçmişi — default kapalı, tıklanarak açılan drawer.
          Uzun listeler compose formunun altında yer kaplamasın diye böyle
          tasarlandı. Her satırın Trash butonu her admin için görünür. */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(245,166,35,0.25)" }}>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase font-bold gold-text tracking-widest hover:bg-amber-500/5 transition-colors"
          style={{ background: "rgba(15,8,20,0.55)" }}
          data-testid="announcements-history-toggle"
          aria-expanded={historyOpen}
        >
          <span className="flex items-center gap-2">
            <History className="w-3.5 h-3.5" />
            <span>Gönderim Geçmişi</span>
            <span className="text-[10px] mono opacity-70">({items.length})</span>
          </span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform"
            style={{ transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
        {historyOpen && (
      <div className="space-y-1.5 p-2" data-testid="announcements-list">
        {/* Search + filter bar — client sends q/filter query params so
            /announcements does the heavy lifting (regex on title+body). */}
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="announcements-search-bar">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Başlık / içerikte ara…"
              className="w-full pl-7 pr-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
              data-testid="announcements-search-input"
            />
            {searchQ && (
              <button type="button" onClick={() => setSearchQ("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white text-[10px]"
                      data-testid="announcements-search-clear">✕</button>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <Filter className="w-3 h-3 gold-text" />
            {[
              { key: "all", label: "Tümü" },
              { key: "urgent", label: "🚨 Acil" },
              { key: "scheduled", label: "⏰ Zamanlı" },
              { key: "normal", label: "Normal" },
              { key: "archived", label: "🗂 Arşiv" },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => { setFilterKind(f.key); clearSelection(); }}
                className="chip text-[10px]"
                style={{
                  background: filterKind === f.key
                    ? "linear-gradient(180deg, rgba(245,166,35,0.28), rgba(180,83,9,0.45))"
                    : "rgba(20,15,25,0.65)",
                  color: filterKind === f.key ? "#FFEDD5" : "#78716C",
                  borderColor: filterKind === f.key ? "#F5A623" : "rgba(120,53,15,0.35)",
                }}
                data-testid={`announcements-filter-${f.key}`}
              >{f.label}</button>
            ))}
          </div>
        </div>
        {isLoading && <div className="text-center text-xs text-muted-foreground py-6">Yükleniyor…</div>}
        {!isLoading && items.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8" data-testid="announcements-empty">
            {searchQ || filterKind !== "all" ? "Filtreye uyan duyuru yok." : "Henüz duyuru yok."}
          </div>
        )}
        {/* v135.36 — Bulk toolbar (arşiv filtresi seçiliyken) */}
        {isAdmin && filterKind === "archived" && items.length > 0 && (
          <div
            className="flex items-center gap-2 p-2 rounded flex-wrap"
            style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.4)" }}
            data-testid="announcements-bulk-toolbar"
          >
            <label className="flex items-center gap-1.5 text-[11px] font-bold gold-text cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === items.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedIds(new Set(items.map((x) => x.id)));
                  else clearSelection();
                }}
                data-testid="announcements-bulk-select-all"
              />
              <span>Tümünü Seç ({selectedIds.size}/{items.length})</span>
            </label>
            <button
              type="button"
              disabled={!selectedIds.size || bulkBusy}
              onClick={bulkRestore}
              className="chip text-[11px] disabled:opacity-40"
              style={{ color: "#86EFAC", borderColor: "rgba(34,197,94,0.55)" }}
              data-testid="announcements-bulk-restore"
            >
              ↺ Geri Yükle
            </button>
            <button
              type="button"
              disabled={!selectedIds.size || bulkBusy}
              onClick={bulkDelete}
              className="chip text-[11px] disabled:opacity-40"
              style={{ color: "#FCA5A5", borderColor: "rgba(239,68,68,0.55)" }}
              data-testid="announcements-bulk-delete"
            >
              🗑 Kalıcı Sil
            </button>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[10px] text-muted-foreground hover:text-white underline ml-auto"
                data-testid="announcements-bulk-clear"
              >
                seçimi temizle
              </button>
            )}
          </div>
        )}
        {items.map((a) => (
          <div key={a.id}
               className="card-red-gold p-2"
               style={{ opacity: a.active ? 1 : 0.5, borderColor: a.urgent ? "#EF4444" : (selectedIds.has(a.id) ? "#F5A623" : undefined) }}
               data-testid={`announcement-item-${a.id}`}>
            <div className="flex items-start justify-between gap-2">
              {isAdmin && filterKind === "archived" && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => toggleSelected(a.id)}
                  className="mt-1 cursor-pointer flex-shrink-0"
                  data-testid={`announcement-select-${a.id}`}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {a.urgent
                    ? <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: "#EF4444", color: "white" }} data-testid={`announcement-urgent-${a.id}`}>ACİL</span>
                    : <Megaphone className="w-3 h-3 gold-text flex-shrink-0" />}
                  <h3 className={`text-xs font-bold ${a.active ? (a.urgent ? "text-red-300" : "text-white") : "text-muted-foreground line-through"}`}>{a.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-2">{a.body}</p>
                {a.image_url && (
                  <img src={a.image_url} alt={a.title}
                       data-testid={`announcement-image-${a.id}`}
                       className="mt-1.5 max-h-32 rounded border border-border object-contain"
                       onError={(e) => { e.target.style.display = "none"; }} />
                )}
                <div className="text-[9px] text-muted-foreground mt-1 flex items-center gap-1.5">
                  <span>{a.created_by_username || "sistem"}</span>
                  <span>·</span>
                  <span>{new Date(a.created_at).toLocaleString("tr-TR")}</span>
                  {!a.active && <span className="px-1 rounded bg-red-500/20 text-red-300">arşiv</span>}
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {(a.history?.length || 0) > 0 && (
                    <button onClick={() => revert(a.id, a.history.length)}
                            className="p-1 rounded hover:bg-amber-500/20 gold-text relative"
                            title={`Son sürüme geri dön (${a.history.length} kayıt)`}
                            data-testid={`announcement-revert-${a.id}`}>
                      <Undo2 className="w-3 h-3" />
                      <span
                        className="absolute -top-1 -right-1 text-[8px] font-bold rounded-full px-1 leading-none"
                        style={{ background: "#F5A623", color: "#0A0004" }}
                      >
                        {a.history.length}
                      </span>
                    </button>
                  )}
                  <button onClick={() => copyToForm(a)}
                          className="p-1 rounded hover:bg-blue-500/20 text-blue-400"
                          title="Bu duyuruyu forma yükle"
                          data-testid={`announcement-copy-${a.id}`}>
                    <span aria-hidden style={{ fontSize: 12 }}>✏️</span>
                  </button>
                  <button onClick={() => remove(a.id)}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400"
                          title="Duyuruyu tamamen sil"
                          data-testid={`announcement-delete-${a.id}`}>
                    <span aria-hidden style={{ fontSize: 12 }}>🗑️</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
        )}
      </div>

      {/* Revert diff dialog — side-by-side comparison of the current title/body
          vs the most recent history snapshot. Admins hit ↩ to confirm the
          revert or × to cancel without any DB write. */}
      {revertPreview && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setRevertPreview(null)}
          data-testid="revert-diff-backdrop"
        >
          <div
            className="card-red-gold p-4 max-w-3xl w-full max-h-[80vh] overflow-y-auto"
            style={{ background: "#150911" }}
            onClick={(ev) => ev.stopPropagation()}
            data-testid="revert-diff-dialog"
          >
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 gold-text" />
              <h3 className="text-sm font-bold uppercase tracking-widest gold-text">Sürüm Karşılaştır</h3>
              <span className="chip text-[10px] ml-auto">{revertPreview.historyCount} önceki sürüm</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {(() => {
                const titleDiff = wordDiff(revertPreview.prev.title, revertPreview.current.title);
                const bodyDiff = wordDiff(revertPreview.prev.body, revertPreview.current.body);
                const prevTs = revertPreview.prev.edited_at
                  ? new Date(revertPreview.prev.edited_at).toLocaleString("tr-TR")
                  : "Sürüm zamanı yok";
                const nowTs = new Date().toLocaleString("tr-TR");
                return (
                  <>
                    <div className="p-3 rounded border" style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.05)" }} data-testid="revert-current-pane">
                      <div className="text-[10px] uppercase font-bold text-red-300 mb-1 flex items-center justify-between gap-2">
                        <span>Şu anki (silinecek)</span>
                        <span className="mono text-[9px] opacity-70" data-testid="revert-current-ts">{nowTs}</span>
                      </div>
                      <div className="text-sm font-bold text-white break-words">
                        <DiffText tokens={titleDiff.b} tone="removed" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                        <DiffText tokens={bodyDiff.b} tone="removed" />
                      </div>
                      {revertPreview.current.urgent && <div className="mt-2 text-[9px] font-bold text-red-400">ACİL</div>}
                    </div>
                    <div className="p-3 rounded border" style={{ borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.06)" }} data-testid="revert-prev-pane">
                      <div className="text-[10px] uppercase font-bold text-green-300 mb-1 flex items-center justify-between gap-2">
                        <span>Geri gelecek</span>
                        <span className="mono text-[9px] opacity-70" data-testid="revert-prev-ts">{prevTs}</span>
                      </div>
                      <div className="text-sm font-bold text-white break-words">
                        <DiffText tokens={titleDiff.a} tone="added" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                        <DiffText tokens={bodyDiff.a} tone="added" />
                      </div>
                      {revertPreview.prev.urgent && <div className="mt-2 text-[9px] font-bold text-red-400">ACİL</div>}
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRevertPreview(null)}
                className="chip text-[11px]"
                data-testid="revert-cancel"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={commitRevert}
                className="btn-gold text-[11px] flex items-center gap-1"
                data-testid="revert-confirm"
              >
                <Undo2 className="w-3 h-3" /> Geri Dön
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
