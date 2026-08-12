import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, Check, AlertTriangle, Upload } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const supportsMulti = mode === "event";
  const [previews, setPreviews] = useState([]); // [{file, url}]
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selection, setSelection] = useState("");
  const [mergeStrategy, setMergeStrategy] = useState("sum"); // sum | max | first

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

  const runParse = async () => {
    if (previews.length === 0) return;
    setParsing(true);
    setResult(null);
    try {
      const fd = new FormData();
      let url;
      if (supportsMulti && previews.length > 1) {
        previews.forEach((p) => fd.append("files", p.file));
        url = `/ocr/parse-multi?mode=${mode}&merge=${mergeStrategy}`;
      } else {
        fd.append("file", previews[0].file);
        url = `/ocr/parse?mode=${mode}`;
      }
      const res = await api.post(url, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      setResult(res.data);
      toast.success("OCR analizi tamamlandı");
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setParsing(false);
    }
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
                <button
                  type="button"
                  onClick={runParse}
                  disabled={parsing}
                  data-testid="ocr-analyze"
                  className="btn-gold w-full py-3 justify-center"
                >
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  {parsing
                    ? `Analiz ediliyor (${previews.length} resim)…`
                    : `AI ile Analiz Et (${previews.length} resim)`}
                </button>
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
                          </>)}
                          {mode === "event" && (<>
                            <th className="text-left py-1">İsim</th>
                            <th className="text-right py-1">Puan</th>
                            <th className="text-right py-1">Kaynak</th>
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
                            {mode === "members" && (<>
                              <td className="text-white py-1 truncate max-w-[140px]">{r.name}</td>
                              <td className="text-right mono py-1" style={{ color: "#FF6B00" }}>
                                {r.power ? Number(r.power).toLocaleString("tr-TR") : "—"}
                              </td>
                              <td className="text-right py-1 gold-text mono">{r.castle_level ? `F${r.castle_level}` : "—"}</td>
                              <td className="text-right py-1 text-white/70">{r.rank || "—"}</td>
                            </>)}
                            {mode === "event" && (<>
                              <td className="text-white py-1 truncate max-w-[220px]">{r.name}</td>
                              <td className="text-right mono py-1 gold-text">{Number(r.points || 0).toLocaleString("tr-TR")}</td>
                              <td className="text-right py-1 text-white/60">
                                {r.sources > 1 ? (
                                  <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.2)", color: "#A78BFA" }}>
                                    ×{r.sources}
                                  </span>
                                ) : "—"}
                              </td>
                            </>)}
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
