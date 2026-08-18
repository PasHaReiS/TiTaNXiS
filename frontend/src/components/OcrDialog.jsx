import React, { useRef, useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, Check, AlertTriangle, Upload, Scissors, Trash2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import CropDialog from "@/components/CropDialog";

const _fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Reusable OCR dialog.
 *
 * Props:
 *   open, onClose       — modal control
 *   mode                — "members" | "event" | "war"
 *   onApply(data, extra)— called with parsed rows + optional extra (e.g. { event_id })
 *   title?              — custom dialog title
 *   requireSelection?   — object { type: "event", options: [{id,label}] } — when set,
 *                         Apply is blocked until the user picks a value from the dropdown.
 */
export default function OcrDialog({ open, onClose, mode, onApply, title, requireSelection }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const supportsMulti = mode === "event" || mode === "members";

  // For members/event mode we need the existing roster so we can flag each parsed
  // row as "new" (will be created) vs "existing" (case-insensitive name match).
  const { data: existingMembers = [] } = useSWR(
    open && (mode === "members" || mode === "event") ? "/members" : null,
    _fetcher,
  );
  const existingNamesLc = React.useMemo(
    () => new Set((existingMembers || []).map((m) => (m.name || "").trim().toLowerCase())),
    [existingMembers],
  );

  // Strip a leading "[TAG]" bracket to check membership against the roster.
  const _stripTag = (n) => {
    const m = /^\s*\[[^\]]+\]\s*(.+)$/.exec(String(n || ""));
    return (m ? m[1] : String(n || "")).trim();
  };
  const [previews, setPreviews] = useState([]); // [{file, url, cropped?}]
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [result, setResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selection, setSelection] = useState("");
  const [mergeStrategy, setMergeStrategy] = useState("sum"); // sum | max | first
  const [cropIdx, setCropIdx] = useState(-1); // index of image currently being cropped, -1 = none
  // Preview-and-eliminate: OCR rows the user has struck out before save.
  // Keyed by row index so a re-scan (which resets result → rows) also wipes
  // stale exclusions. Only kept rows are sent to /ocr/apply-*.
  const [excludedRows, setExcludedRows] = useState(() => new Set());
  // Per-row inline edits — `{ [rowIdx]: { name?: string, points?: number } }`.
  // Applied on top of the OCR row before doApply so admins can hand-fix a
  // misread without deleting the whole row.
  const [rowEdits, setRowEdits] = useState({});
  // Keep raw parsed chunks so we can re-merge live when the admin flips the
  // "Topla / En yüksek / İlkini kullan" chip after already seeing the preview.
  const [rawChunks, setRawChunks] = useState([]);
  // Collapsible "N yeni üye oluşacak" panel — starts open so admins see the
  // warning up-front but can hide it once they've reviewed.
  const [showNewList, setShowNewList] = useState(true);
  React.useEffect(() => { setExcludedRows(new Set()); setRowEdits({}); setShowNewList(true); }, [result]);

  // Progress-UI heuristic: for 2+ images we show a live X/N counter and bar.
  // Every image is always dispatched as its own /ocr/parse request (below) —
  // NEVER batched — so Cloudflare's 100s edge timeout can't be hit.
  const SEQUENTIAL_THRESHOLD = 2;

  if (!open) return null;

  const pick = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList).filter((f) => /^image\/(png|jpe?g|webp)$/i.test(f.type));
    if (arr.length === 0) {
      toast.error("PNG, JPEG veya WEBP yükleyin");
      return;
    }
    setResult(null);
    const readers = arr.map(
      (f) => new Promise((resolve) => {
        const r = new FileReader();
        r.onload = (e) => resolve({ file: f, url: e.target.result });
        r.readAsDataURL(f);
      }),
    );
    Promise.all(readers).then((items) => {
      setPreviews(supportsMulti ? items : items.slice(0, 1));
    });
  };

  const removePreview = (idx) => {
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  // Merge helper: dedupe rows by normalised name (alliance-tag-stripped, lowercased).
  // For `event` mode we apply the chosen strategy to `points`. For `members` mode
  // we keep the first non-empty scalar per field. Both track `sources` count.
  const _mergeRows = (all) => {
    const merged = new Map();
    let event_hint = null;
    for (const chunk of all) {
      if (mode === "event") {
        if (!event_hint && chunk?.event_hint) event_hint = chunk.event_hint;
        for (const p of chunk?.participants || []) {
          const raw = String(p.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          const pts = Number(p.points || 0) || 0;
          if (!merged.has(key)) {
            merged.set(key, { name: raw, points: pts, sources: 1 });
          } else {
            const cur = merged.get(key);
            cur.sources += 1;
            if (mergeStrategy === "sum") cur.points += pts;
            else if (mergeStrategy === "max") cur.points = Math.max(cur.points, pts);
            // 'first' → keep original
          }
        }
      } else if (mode === "members") {
        for (const r of chunk?.members || []) {
          const raw = String(r.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          if (!merged.has(key)) {
            merged.set(key, { ...r, name: raw, sources: 1 });
          } else {
            const cur = merged.get(key);
            cur.sources += 1;
            for (const fld of ["power", "castle_level", "rank", "alliance_name"]) {
              if (!cur[fld] && r[fld]) cur[fld] = r[fld];
            }
          }
        }
      }
    }
    const arr = Array.from(merged.values());
    if (mode === "event") arr.sort((a, b) => (b.points || 0) - (a.points || 0));
    else arr.sort((a, b) => (b.power || 0) - (a.power || 0));
    return { arr, event_hint };
  };

  const runParse = async () => {
    if (previews.length === 0) return;
    setParsing(true);
    setResult(null);
    setProgress({ current: 0, total: previews.length, errors: 0 });

    // Always dispatch ONE /ocr/parse request PER image, sequentially. Never
    // batch. Each request stays well under Cloudflare's 100s edge timeout.
    // Frontend merges the chunks below (`_mergeRows`) — identical logic to
    // what the old server-side batch endpoint did.
    const chunks = [];
    let errCount = 0;
    for (let i = 0; i < previews.length; i++) {
      setProgress({ current: i, total: previews.length, errors: errCount });
      const fd = new FormData();
      fd.append("file", previews[i].file);
      try {
        const res = await api.post(`/ocr/parse?mode=${mode}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 90000,
        });
        chunks.push(res.data?.data || {});
      } catch (e) {
        errCount += 1;
        toast.error(`Resim ${i + 1}/${previews.length}: ${apiErr(e)}`);
      }
      setProgress({ current: i + 1, total: previews.length, errors: errCount });
    }

    // Single-image shortcut: pass through unchanged so the raw parse response
    // shape is preserved (mostly cosmetic — merge still works with 1 chunk).
    if (previews.length === 1) {
      const only = chunks[0] || {};
      setRawChunks(chunks);
      const single =
        mode === "war"
          ? only
          : mode === "event"
          ? { participants: only.participants || [], event_hint: only.event_hint || null }
          : { members: only.members || [] };
      setResult({ mode, data: single });
      setParsing(false);
      if (errCount) toast.error("OCR başarısız");
      else toast.success("OCR analizi tamamlandı");
      return;
    }

    const { arr, event_hint } = _mergeRows(chunks);
    setRawChunks(chunks);
    const merged =
      mode === "event"
        ? { participants: arr, event_hint }
        : { members: arr };
    setResult({
      mode,
      data: merged,
      merge_strategy: mergeStrategy,
      per_image_errors: errCount,
    });
    setProgress({ current: previews.length, total: previews.length, errors: errCount });
    if (errCount) {
      toast.success(
        `${previews.length - errCount}/${previews.length} resim başarılı · ${errCount} hata`,
      );
    } else {
      toast.success(`${previews.length} resim analiz edildi`);
    }
    setParsing(false);
  };

  // Re-merge stored chunks whenever the admin flips the merge strategy chip
  // AFTER the preview is on screen. Skips single-image case (no dedupe there).
  const remergeWithStrategy = (nextStrategy) => {
    setMergeStrategy(nextStrategy);
    if (!result || rawChunks.length === 0 || previews.length <= 1) return;
    // Rebuild with the fresh strategy by cloning _mergeRows logic — we can't
    // call _mergeRows directly because it reads state which hasn't tick'd yet.
    const merged = new Map();
    let event_hint = null;
    for (const chunk of rawChunks) {
      if (mode === "event") {
        if (!event_hint && chunk?.event_hint) event_hint = chunk.event_hint;
        for (const p of chunk?.participants || []) {
          const raw = String(p.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          const pts = Number(p.points || 0) || 0;
          if (!merged.has(key)) merged.set(key, { name: raw, points: pts, sources: 1 });
          else {
            const cur = merged.get(key);
            cur.sources += 1;
            if (nextStrategy === "sum") cur.points += pts;
            else if (nextStrategy === "max") cur.points = Math.max(cur.points, pts);
          }
        }
      } else if (mode === "members") {
        for (const r of chunk?.members || []) {
          const raw = String(r.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          if (!merged.has(key)) merged.set(key, { ...r, name: raw, sources: 1 });
          else {
            const cur = merged.get(key);
            cur.sources += 1;
            for (const fld of ["power", "castle_level", "rank", "alliance_name"]) {
              if (!cur[fld] && r[fld]) cur[fld] = r[fld];
            }
          }
        }
      }
    }
    const arr = Array.from(merged.values());
    if (mode === "event") arr.sort((a, b) => (b.points || 0) - (a.points || 0));
    else arr.sort((a, b) => (b.power || 0) - (a.power || 0));
    const nextData = mode === "event" ? { participants: arr, event_hint } : { members: arr };
    setResult({ mode, data: nextData, merge_strategy: nextStrategy, per_image_errors: 0 });
  };

  const doApply = async () => {
    if (!result?.data) return;
    if (requireSelection && !selection) {
      toast.error("Lütfen bir seçim yapın");
      return;
    }
    setApplying(true);
    try {
      const extra = requireSelection ? { [`${requireSelection.type}_id`]: selection } : {};
      // Merge inline edits + drop excluded rows so only "approved" names
      // (with any manual fixes) ever hit the DB.
      const applyEditsAndKeep = (arr, kind) => {
        if (!Array.isArray(arr)) return arr;
        return arr
          .map((r, i) => {
            const patch = rowEdits[i] || {};
            const next = { ...r };
            if (typeof patch.name === "string") next.name = patch.name;
            if (kind === "event" && patch.points !== undefined) next.points = Number(patch.points) || 0;
            return next;
          })
          .filter((_, i) => !excludedRows.has(i));
      };
      const filteredData = { ...result.data };
      if (mode === "event") filteredData.participants = applyEditsAndKeep(result.data.participants || [], "event");
      else if (mode === "members") filteredData.members = applyEditsAndKeep(result.data.members || [], "members");
      await onApply(filteredData, extra);
      onClose?.();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setApplying(false);
    }
  };

  const rows = (() => {
    if (!result?.data) return [];
    if (mode === "members") return result.data.members || [];
    if (mode === "event") return result.data.participants || [];
    if (mode === "war") return [result.data]; // single-row summary
    return [];
  })();

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={applying ? undefined : onClose}
        data-testid="ocr-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          className="card-red-gold w-full max-w-lg p-5 relative max-h-[90vh] flex flex-col"
          data-testid="ocr-dialog"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.7 }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 text-muted-foreground hover:text-white"
            data-testid="ocr-close"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
            <Camera className="w-4 h-4" /> {title || "Ekran Görüntüsünden Aktar"}
            <span
              className="text-[9px] font-normal px-1.5 py-0.5 rounded"
              style={{ background: "rgba(34,197,94,0.2)", color: "#4ade80", letterSpacing: "0.1em" }}
              data-testid="ocr-version"
              title="Per-image sequential mode — Cloudflare 524 fix"
            >
              v2 • SEQ
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Ekran görüntüsünü yükle, AI ile analiz et, önizle, onayla.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple={supportsMulti}
            className="hidden"
            data-testid="ocr-file-input"
            onChange={(e) => pick(e.target.files)}
          />

          {previews.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-gold w-full py-6 justify-center flex-col gap-2"
              data-testid="ocr-select"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">
                {supportsMulti ? "Ekran Görüntüleri Seç (çoklu)" : "Ekran Görüntüsü Seç"}
              </span>
              <span className="text-[10px] opacity-75">PNG / JPEG / WEBP</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex gap-2 overflow-x-auto flex-shrink-0" data-testid="ocr-thumbs">
                {previews.map((p, i) => (
                  <div key={i} className="relative flex-shrink-0" style={{ width: 90, height: 60 }}>
                    <img src={p.url} alt={`preview-${i}`} className="w-full h-full object-cover rounded border border-white/10"
                      data-testid={`ocr-image-preview-${i}`} />
                    {p.cropped && (
                      <span
                        className="absolute top-0.5 left-0.5 px-1 rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-0.5"
                        style={{ background: "rgba(245,166,35,0.85)", color: "#0A0806" }}
                        data-testid={`ocr-cropped-badge-${i}`}
                        title="Kırpıldı"
                      >
                        <Scissors className="w-2 h-2" /> KIRP
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCropIdx(i)}
                      className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/80 hover:bg-amber-500/90 text-amber-400 hover:text-black flex items-center justify-center transition-colors"
                      data-testid={`ocr-crop-${i}`}
                      title="Kırp"
                    >
                      <Scissors className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePreview(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"
                      data-testid={`ocr-remove-${i}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {supportsMulti && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex-shrink-0 rounded border border-dashed border-white/25 hover:border-amber-500/60 text-muted-foreground hover:text-amber-400 flex items-center justify-center"
                    style={{ width: 90, height: 60 }}
                    data-testid="ocr-add-more"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                )}
              </div>

              {supportsMulti && previews.length > 1 && !result && (
                <div className="flex items-center gap-1.5 text-[10px]" data-testid="ocr-merge-strategy">
                  <span className="uppercase tracking-widest text-muted-foreground mr-1">
                    Tekrarlanan üyeler:
                  </span>
                  {[
                    { id: "sum", label: "Topla" },
                    { id: "max", label: "En yüksek" },
                    { id: "first", label: "İlkini kullan" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMergeStrategy(opt.id)}
                      data-testid={`ocr-merge-${opt.id}`}
                      className={`chip px-2 py-1 text-[10px] ${mergeStrategy === opt.id ? "active" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {supportsMulti && previews.length > 1 && result && (
                <div className="flex items-center gap-1.5 text-[10px]" data-testid="ocr-merge-strategy-inline">
                  <span className="uppercase tracking-widest mr-1" style={{ color: "#A78BFA" }}>
                    Tekrar birleştirme:
                  </span>
                  {[
                    { id: "sum", label: "Topla" },
                    { id: "max", label: "En yüksek" },
                    { id: "first", label: "İlkini kullan" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => remergeWithStrategy(opt.id)}
                      data-testid={`ocr-merge-inline-${opt.id}`}
                      className={`chip px-2 py-1 text-[10px] ${mergeStrategy === opt.id ? "active" : ""}`}
                      title={mergeStrategy === opt.id ? "Aktif" : "Değiştir → satırlar anında yeniden birleştirilir"}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {!result && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={runParse}
                    disabled={parsing}
                    data-testid="ocr-analyze"
                    className="btn-gold w-full py-3 justify-center"
                  >
                    {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {parsing
                      ? progress.total > 1 && previews.length >= SEQUENTIAL_THRESHOLD
                        ? `Analiz ediliyor… ${progress.current}/${progress.total}`
                        : `Analiz ediliyor (${previews.length} resim)…`
                      : `AI ile Analiz Et (${previews.length} resim)`}
                  </button>

                  {parsing && progress.total > 1 && previews.length >= SEQUENTIAL_THRESHOLD && (
                    <div className="flex flex-col gap-1" data-testid="ocr-progress">
                      <div
                        className="w-full h-2 rounded overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${Math.round((progress.current / progress.total) * 100)}%`,
                            background: "linear-gradient(90deg, #F5A623, #FF6B00)",
                          }}
                          data-testid="ocr-progress-bar"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span data-testid="ocr-progress-label">
                          {progress.current}/{progress.total} resim
                          {progress.errors > 0 && (
                            <span className="text-red-400 ml-1.5">· {progress.errors} hata</span>
                          )}
                        </span>
                        <span className="opacity-60">
                          ~{Math.max(1, Math.round(((progress.total - progress.current) * 10) / 60))} dk kaldı
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div
                  className="flex-1 min-h-0 overflow-y-auto rounded-lg p-3"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,166,35,0.3)" }}
                  data-testid="ocr-result-panel"
                >
                  <div className="text-[10px] uppercase tracking-widest gold-text mb-2 flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" /> {rows.length - excludedRows.size} / {rows.length} onaylı
                    </span>
                    {excludedRows.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setExcludedRows(new Set())}
                        className="text-[9px] normal-case font-normal underline decoration-dotted hover:text-white"
                        style={{ color: "#93C5FD" }}
                        data-testid="ocr-restore-all"
                      >
                        ↩ {excludedRows.size} elenen kişiyi geri al
                      </button>
                    )}
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Hiç veri okunmadı — daha net bir görüntü deneyin.
                    </div>
                  ) : (
                    <>
                        {/* Bulk actions for auto-created members — collapsible warning above the table */}
                        {(mode === "members" || mode === "event") && (() => {
                          const newRows = rows
                            .map((r, i) => {
                              const currName = rowEdits[i]?.name ?? r.name;
                              const clean = _stripTag(currName);
                              const isNew = !existingNamesLc.has(clean.toLowerCase());
                              const origClean = _stripTag(r.name);
                              const origWasExisting = existingNamesLc.has(origClean.toLowerCase());
                              const editedIntoNew = origWasExisting && isNew && (rowEdits[i]?.name !== undefined);
                              return { i, name: currName, isNew, editedIntoNew, isExcluded: excludedRows.has(i) };
                            })
                            .filter((x) => x.isNew && !x.isExcluded);
                          if (newRows.length === 0) return null;
                          const editedTypos = newRows.filter((x) => x.editedIntoNew).length;
                          return (
                            <div
                              className="rounded-lg p-2 mb-2"
                              style={{ background: editedTypos > 0 ? "rgba(245,166,35,0.10)" : "rgba(34,197,94,0.08)", border: `1px solid ${editedTypos > 0 ? "rgba(245,166,35,0.45)" : "rgba(34,197,94,0.35)"}` }}
                              data-testid="ocr-new-members-panel"
                            >
                              <button
                                type="button"
                                onClick={() => setShowNewList((v) => !v)}
                                className="w-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: editedTypos > 0 ? "#FCD34D" : "#4ade80" }}
                                data-testid="ocr-new-members-toggle"
                              >
                                {showNewList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {editedTypos > 0 ? <AlertTriangle className="w-3 h-3" /> : <span>+</span>}
                                {newRows.length} yeni üye oluşacak
                                {editedTypos > 0 && (
                                  <span className="normal-case font-normal opacity-90" title="Düzenlediğin isim mevcut bir üyeye tam eşleşmiyor — yazım hatası olabilir">
                                    · ⚠ {editedTypos} olası yazım hatası
                                  </span>
                                )}
                                <span className="ml-auto normal-case font-normal opacity-70">
                                  {showNewList ? "gizle" : "göster"}
                                </span>
                              </button>
                              {showNewList && (
                                <div className="mt-1.5 flex flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setExcludedRows((prev) => {
                                      const nx = new Set(prev);
                                      newRows.forEach((x) => nx.add(x.i));
                                      return nx;
                                    })}
                                    data-testid="ocr-new-members-exclude-all"
                                    className="chip text-[9px] self-start"
                                    style={{ borderColor: "rgba(248,113,113,0.55)", color: "#FCA5A5" }}
                                    title="Yeni oluşacak tüm satırları tek tıkla ele"
                                  >
                                    <Trash2 className="w-3 h-3" /> Hepsini Ele
                                  </button>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                    {newRows.map((x) => (
                                      <div
                                        key={x.i}
                                        className="flex items-center gap-2 text-[10px] rounded px-2 py-1"
                                        style={{ background: "rgba(20,15,10,0.55)" }}
                                        data-testid={`ocr-new-member-${x.i}`}
                                      >
                                        {x.editedIntoNew && (
                                          <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: "#FCD34D" }} />
                                        )}
                                        <span className="truncate flex-1 text-white" title={x.name}>{x.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => setExcludedRows((prev) => { const nx = new Set(prev); nx.add(x.i); return nx; })}
                                          className="opacity-70 hover:opacity-100"
                                          style={{ color: "#F87171" }}
                                          title="Bu satırı ele"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-muted-foreground uppercase tracking-widest">
                          {(mode === "members" || mode === "event") && (
                            <th className="text-center py-1 w-8" title="Elenen satırlar veritabanına yazılmaz">✓</th>
                          )}
                          {mode === "members" && (<>
                            <th className="text-left py-1">İsim</th>
                            <th className="text-right py-1">Güç</th>
                            <th className="text-right py-1">Kale</th>
                            <th className="text-right py-1">Rank</th>
                            <th className="text-right py-1">İttifak</th>
                            <th className="text-right py-1">Durum</th>
                          </>)}
                          {mode === "event" && (<>
                            <th className="text-left py-1">İsim</th>
                            <th className="text-right py-1">Puan</th>
                            <th className="text-right py-1">Kaynak</th>
                            <th className="text-right py-1">Durum</th>
                          </>)}
                          {mode === "war" && (<>
                            <th className="text-left py-1">Kazanan</th>
                            <th className="text-left py-1">Kaybeden</th>
                            <th className="text-right py-1">Kayıp+</th>
                            <th className="text-right py-1">Kayıp−</th>
                          </>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const isExcluded = excludedRows.has(i);
                          const toggleExclude = () => setExcludedRows((prev) => {
                            const nx = new Set(prev);
                            nx.has(i) ? nx.delete(i) : nx.add(i);
                            return nx;
                          });
                          return (
                          <tr
                            key={i}
                            className="border-t border-white/5"
                            data-testid={`ocr-row-${i}`}
                            style={isExcluded ? { opacity: 0.35, textDecoration: "line-through" } : undefined}
                          >
                            {(mode === "members" || mode === "event") && (
                              <td className="text-center py-1">
                                <button
                                  type="button"
                                  onClick={toggleExclude}
                                  data-testid={`ocr-row-toggle-${i}`}
                                  title={isExcluded ? "Bu satırı geri al" : "Bu satırı elemekte"}
                                  className="p-0.5 rounded hover:bg-white/10 transition"
                                  style={{ color: isExcluded ? "#93C5FD" : "#F87171" }}
                                >
                                  {isExcluded
                                    ? <RotateCcw className="w-3.5 h-3.5" />
                                    : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                            )}
                            {mode === "members" && (() => {
                              const cleanName = _stripTag(rowEdits[i]?.name ?? r.name);
                              const isExisting = existingNamesLc.has(cleanName.toLowerCase());
                              // Alliance tag: prefer explicit field, else bracket in name
                              let allianceGuess = r.alliance_name;
                              if (!allianceGuess) {
                                const mm = /^\s*\[([^\]]+)\]/.exec(String(rowEdits[i]?.name ?? r.name ?? ""));
                                if (mm) allianceGuess = mm[1].trim();
                              }
                              return (<>
                                <td className="py-1 max-w-[140px]">
                                  <input
                                    type="text"
                                    value={rowEdits[i]?.name ?? r.name ?? ""}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-name-${i}`}
                                    className="w-full bg-transparent text-white outline-none border-b border-transparent hover:border-white/30 focus:border-amber-400 text-[10px]"
                                    title="Adı düzeltmek için tıkla"
                                  />
                                </td>
                                <td className="text-right mono py-1" style={{ color: "#FF6B00" }}>
                                  {r.power ? Number(r.power).toLocaleString("tr-TR") : "—"}
                                </td>
                                <td className="text-right py-1 gold-text mono">{r.castle_level ? `F${r.castle_level}` : "—"}</td>
                                <td className="text-right py-1 text-white/70">{r.rank || "—"}</td>
                                <td className="text-right py-1 text-white/70">{allianceGuess || "—"}</td>
                                <td className="text-right py-1">
                                  {isExisting ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(107,114,128,0.25)", color: "#9ca3af" }}>
                                      MEVCUT
                                    </span>
                                  ) : (() => {
                                    const origClean = _stripTag(r.name);
                                    const origWasExisting = existingNamesLc.has(origClean.toLowerCase());
                                    const editedIntoNew = origWasExisting && (rowEdits[i]?.name !== undefined);
                                    return editedIntoNew ? (
                                      <span
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold inline-flex items-center gap-0.5"
                                        style={{ background: "rgba(245,166,35,0.25)", color: "#FCD34D" }}
                                        title="Bu ismi düzenledin ve artık mevcut hiçbir üyeye eşleşmiyor — yazım hatası olabilir. Kaydedilirse yeni üye açılır."
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5" /> YENİ ⚠
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#4ade80" }}>
                                        YENİ
                                      </span>
                                    );
                                  })()}
                                </td>
                              </>);
                            })()}
                            {mode === "event" && (() => {
                              const currName = rowEdits[i]?.name ?? r.name;
                              const cleanName = _stripTag(currName);
                              const isExisting = existingNamesLc.has(cleanName.toLowerCase());
                              const currPoints = rowEdits[i]?.points ?? r.points ?? 0;
                              const origClean = _stripTag(r.name);
                              const origWasExisting = existingNamesLc.has(origClean.toLowerCase());
                              const editedIntoNew = origWasExisting && !isExisting && (rowEdits[i]?.name !== undefined);
                              return (<>
                                <td className="py-1 max-w-[180px]">
                                  <input
                                    type="text"
                                    value={currName ?? ""}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-name-${i}`}
                                    className="w-full bg-transparent text-white outline-none border-b border-transparent hover:border-white/30 focus:border-amber-400 text-[10px]"
                                    title="Adı düzeltmek için tıkla"
                                  />
                                </td>
                                <td className="py-1">
                                  <input
                                    type="number"
                                    value={currPoints}
                                    min={0}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], points: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-points-${i}`}
                                    className="w-full bg-transparent gold-text mono outline-none border-b border-transparent hover:border-white/30 focus:border-amber-400 text-[10px] text-right"
                                    title="Puanı düzeltmek için tıkla"
                                  />
                                </td>
                                <td className="text-right py-1 text-white/60">
                                  {r.sources > 1 ? (
                                    <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.2)", color: "#A78BFA" }}>
                                      ×{r.sources}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="text-right py-1">
                                  {isExisting ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(107,114,128,0.25)", color: "#9ca3af" }}>
                                      MEVCUT
                                    </span>
                                  ) : editedIntoNew ? (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold inline-flex items-center gap-0.5"
                                      style={{ background: "rgba(245,166,35,0.25)", color: "#FCD34D" }}
                                      title="Bu ismi düzenledin ve artık mevcut hiçbir üyeye eşleşmiyor — yazım hatası olabilir. Kaydedilirse yeni üye açılır."
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5" /> YENİ ⚠
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#4ade80" }} title="Yeni üye oluşturulacak">
                                      + YENİ
                                    </span>
                                  )}
                                </td>
                              </>);
                            })()}
                            {mode === "war" && (<>
                              <td className="text-green-400 py-1">{r.winner || "—"}</td>
                              <td className="text-red-400 py-1">{r.loser || "—"}</td>
                              <td className="text-right py-1 text-white/70">{r.casualties_won || "—"}</td>
                              <td className="text-right py-1 text-white/70">{r.casualties_lost || "—"}</td>
                            </>)}
                          </tr>
                        );
                        })}
                      </tbody>
                    </table>
                    </>
                  )}
                </div>
              )}

              {result && rows.length > 0 && requireSelection && (
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.4)" }}
                  data-testid="ocr-selection-panel"
                >
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#A78BFA" }}>
                    {requireSelection.label || "Bir seçim yapın"}
                  </div>
                  <select
                    data-testid="ocr-selection-input"
                    value={selection}
                    onChange={(e) => setSelection(e.target.value)}
                    className="w-full card-dark text-sm text-white px-3 py-2 focus:outline-none focus:border-primary"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                  >
                    <option value="">— {requireSelection.placeholder || "Seçim yapın"} —</option>
                    {(requireSelection.options || []).map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {result && rows.length > 0 && (
                <button
                  type="button"
                  onClick={doApply}
                  disabled={applying || (requireSelection && !selection) || (rows.length - excludedRows.size) === 0}
                  data-testid="ocr-apply"
                  className="btn-gold w-full py-3 justify-center"
                  style={(requireSelection && !selection) || (rows.length - excludedRows.size) === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {applying ? "Kaydediliyor…" : `Onayla & Kaydet (${rows.length - excludedRows.size})`}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
      <CropDialog
        open={cropIdx >= 0 && cropIdx < previews.length}
        imageUrl={cropIdx >= 0 ? previews[cropIdx]?.url : null}
        originalFile={cropIdx >= 0 ? previews[cropIdx]?.file : null}
        onCancel={() => setCropIdx(-1)}
        onConfirm={(file, url) => {
          setPreviews((prev) => prev.map((p, i) => (i === cropIdx ? { file, url, cropped: true } : p)));
          setResult(null); // invalidate any previous OCR result since input changed
          setCropIdx(-1);
          toast.success("Kırpma uygulandı");
        }}
      />
    </AnimatePresence>
  );
}
