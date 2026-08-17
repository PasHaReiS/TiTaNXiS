import React, { useRef, useState } from "react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { motion, AnimatePresence } from "framer-motion";
import { X, Scissors, RotateCcw, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Image crop modal.
 *
 * Props:
 *   open              — modal control
 *   imageUrl          — data:URL of the source image (from FileReader)
 *   originalFile      — original File object (kept for MIME type + name)
 *   onCancel()        — user closed the dialog without applying
 *   onConfirm(file, url)
 *                     — user pressed apply. `file` is a new File built from
 *                       the cropped canvas, `url` is a fresh data:URL preview.
 *
 * The cropper is pixel-based (no fixed aspect) so OCR users can trim edges
 * on either members-list OR event-score screenshots without switching modes.
 */
export default function CropDialog({ open, imageUrl, originalFile, originalUrl, onCancel, onConfirm, onRestore }) {
  const imgRef = useRef(null);
  const [crop, setCrop] = useState({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);

  if (!open) return null;

  const reset = () => setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });

  const restore = async () => {
    if (!onRestore) return;
    if (!window.confirm("Bu görselin orijinalini geri yükle? Kırpma işlemi kaybolacak.")) return;
    setRestoring(true);
    try {
      await onRestore();
    } catch (e) {
      toast.error(`Geri yükleme hatası: ${e.message || e}`);
    } finally {
      setRestoring(false);
    }
  };

  const apply = async () => {
    const img = imgRef.current;
    if (!img) return;
    // Convert whatever unit ReactCrop is currently in into pixel coords based
    // on the natural (source) resolution — never the on-screen size — so the
    // cropped output preserves full detail for OCR.
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    let sx, sy, sw, sh;
    if (crop.unit === "%") {
      sx = (crop.x / 100) * img.naturalWidth;
      sy = (crop.y / 100) * img.naturalHeight;
      sw = (crop.width / 100) * img.naturalWidth;
      sh = (crop.height / 100) * img.naturalHeight;
    } else {
      sx = crop.x * scaleX;
      sy = crop.y * scaleY;
      sw = crop.width * scaleX;
      sh = crop.height * scaleY;
    }
    if (!sw || !sh || sw < 10 || sh < 10) {
      toast.error("Kırpma alanı çok küçük");
      return;
    }
    setApplying(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const mime = originalFile?.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = mime === "image/png" ? undefined : 0.92;
      const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
      if (!blob) {
        toast.error("Kırpma başarısız");
        setApplying(false);
        return;
      }
      const ext = mime === "image/png" ? "png" : "jpg";
      const baseName = (originalFile?.name || "crop").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${baseName}-cropped.${ext}`, { type: mime });
      const url = canvas.toDataURL(mime, quality);
      onConfirm?.(file, url);
    } catch (e) {
      toast.error(`Kırpma hatası: ${e.message || e}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
        onClick={applying ? undefined : onCancel}
        data-testid="crop-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          className="card-red-gold w-full max-w-3xl p-5 relative flex flex-col max-h-[92vh]"
          data-testid="crop-dialog"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.7 }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="absolute top-3 right-3 text-muted-foreground hover:text-white disabled:opacity-40"
            data-testid="crop-close"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
            <Scissors className="w-4 h-4" /> Görüntüyü Kırp
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Sadece OCR ile taranmasını istediğin bölgeyi seç. Kenarlıklar, reklam alanları veya alakasız
            paneller kırpıldığında model çok daha az hata yapar.
          </p>

          <div
            className="flex-1 min-h-0 overflow-auto rounded-lg p-2 mb-3"
            style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(245,166,35,0.25)" }}
            data-testid="crop-canvas-wrap"
          >
            <ReactCrop
              crop={crop}
              onChange={(_c, pc) => setCrop(pc)}
              keepSelection
              minWidth={20}
              minHeight={20}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="crop-source"
                style={{ maxHeight: "60vh", maxWidth: "100%", display: "block" }}
                data-testid="crop-image"
              />
            </ReactCrop>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={reset}
              disabled={applying || restoring}
              className="chip px-3 py-2 text-[11px] uppercase tracking-widest flex items-center gap-1.5"
              data-testid="crop-reset"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Sıfırla
            </button>
            {onRestore && (
              <button
                type="button"
                onClick={restore}
                disabled={applying || restoring}
                className="chip px-3 py-2 text-[11px] uppercase tracking-widest flex items-center gap-1.5"
                style={{ borderColor: "rgba(59,130,246,0.55)", color: "#93C5FD" }}
                data-testid="crop-restore-original"
                title="Orijinali Geri Yükle"
              >
                {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Orijinali Geri Yükle
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className="chip px-3 py-2 text-[11px] uppercase tracking-widest"
              data-testid="crop-cancel"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying}
              className="btn-gold px-4 py-2 justify-center flex items-center gap-1.5 text-xs"
              data-testid="crop-apply"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {applying ? "Uygulanıyor…" : "Kırpmayı Uygula"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
