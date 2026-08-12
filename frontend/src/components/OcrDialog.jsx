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
  const [preview, setPreview] = useState(null); // dataURL for image preview
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null); // parsed payload from backend
  const [applying, setApplying] = useState(false);
  const [selection, setSelection] = useState("");

  if (!open) return null;

  const pick = (f) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
      toast.error("PNG, JPEG veya WEBP yükleyin");
      return;
    }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const runParse = async () => {
    if (!file) return;
    setParsing(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/ocr/parse?mode=${mode}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
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
            className="hidden"
            data-testid="ocr-file-input"
            onChange={(e) => pick(e.target.files?.[0])}
          />

          {!preview ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-gold w-full py-6 justify-center flex-col gap-2"
              data-testid="ocr-select"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">Ekran Görüntüsü Seç</span>
              <span className="text-[10px] opacity-75">PNG / JPEG / WEBP</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{ maxHeight: 200 }}>
                <img src={preview} alt="preview" className="w-full h-auto object-contain max-h-[200px]" data-testid="ocr-image-preview" />
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null); setResult(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-red-500/60 text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!result && (
                <button
                  type="button"
                  onClick={runParse}
                  disabled={parsing}
                  data-testid="ocr-analyze"
                  className="btn-gold w-full py-3 justify-center"
                >
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  {parsing ? "Analiz ediliyor…" : "AI ile Analiz Et"}
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
