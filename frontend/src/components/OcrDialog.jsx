import React, { useRef, useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, Check, AlertTriangle, Upload } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const [previews, setPreviews] = useState([]); // [{file, url}]
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [result, setResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selection, setSelection] = useState("");
  const [mergeStrategy, setMergeStrategy] = useState("sum"); // sum | max | first

  // (Legacy) threshold constant kept only for the progress-UI heuristic below —
  // all parsing now goes through per-image sequential calls to avoid Cloudflare's
  // 100s edge timeout (524) that hit /parse-multi on large batches.
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

    // Always call /ocr/parse ONCE PER IMAGE, sequentially. A single request
    // batching all files exceeds Cloudflare's 100s edge timeout on 3+ images
    // (524). Per-image calls stay well under 100s each (~5–20s w/ vision).
    // Frontend merges the results in `_mergeRows` — same logic that the old
    // /parse-multi endpoint used server-side.
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

  const doApply = async () => {
    if (!result?.data) return;
    if (requireSelection && !selection) {
      toast.error("Lütfen bir seçim yapın");
      return;
    }
    setApplying(true);
    try {
      const extra = requireSelection ? { [`${requireSelection.type}_id`]: selection } : {};
      await onApply(result.data, extra);
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
                  <div className="text-[10px] uppercase tracking-widest gold-text mb-2 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {rows.length} sonuç
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Hiç veri okunmadı — daha net bir görüntü deneyin.
                    </div>
                  ) : (
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-muted-foreground uppercase tracking-widest">
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
                        {rows.map((r, i) => (
                          <tr key={i} className="border-t border-white/5" data-testid={`ocr-row-${i}`}>
                            {mode === "members" && (() => {
                              const cleanName = _stripTag(r.name);
                              const isExisting = existingNamesLc.has(cleanName.toLowerCase());
                              // Alliance tag: prefer explicit field, else bracket in name
                              let allianceGuess = r.alliance_name;
                              if (!allianceGuess) {
                                const mm = /^\s*\[([^\]]+)\]/.exec(String(r.name || ""));
                                if (mm) allianceGuess = mm[1].trim();
                              }
                              return (<>
                                <td className="text-white py-1 truncate max-w-[140px]">{cleanName}</td>
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
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#4ade80" }}>
                                      YENİ
                                    </span>
                                  )}
                                </td>
                              </>);
                            })()}
                            {mode === "event" && (() => {
                              const cleanName = _stripTag(r.name);
                              const isExisting = existingNamesLc.has(cleanName.toLowerCase());
                              return (<>
                                <td className="text-white py-1 truncate max-w-[180px]">{r.name}</td>
                                <td className="text-right mono py-1 gold-text">{Number(r.points || 0).toLocaleString("tr-TR")}</td>
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
                        ))}
                      </tbody>
                    </table>
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
                  disabled={applying || (requireSelection && !selection)}
                  data-testid="ocr-apply"
                  className="btn-gold w-full py-3 justify-center"
                  style={requireSelection && !selection ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {applying ? "Kaydediliyor…" : `Onayla & Kaydet (${rows.length})`}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
