import React, { useCallback, useRef, useState } from "react";
import { UploadCloud, X, Loader2, Scissors } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import CropDialog from "@/components/CropDialog";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Drag-and-drop + click-to-select image uploader.
 * Props:
 *  - purpose: "vip" | "commander" | "event" | "misc"  (goes into ?purpose=)
 *  - value:   [{ id, url, filename, size }]           (controlled)
 *  - onChange(next[])
 *  - max:     max number of files (default 6)
 *  - compact: bool — smaller layout for inline use in reply areas
 */
export default function ImageDropzone({
  purpose = "misc",
  value = [],
  onChange,
  max = 6,
  compact = false,
}) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [cropTarget, setCropTarget] = useState(null); // { id, url, file }
  const [cropUploading, setCropUploading] = useState(false);
  const inputRef = useRef(null);

  const upload = useCallback(async (files) => {
    const remaining = Math.max(0, max - value.length);
    if (remaining === 0) {
      toast.error(`En fazla ${max} dosya yükleyebilirsin`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setBusy(true);
    const results = [];
    for (const f of list) {
      if (!ACCEPT.includes(f.type)) {
        toast.error(`Sadece görsel: ${f.name}`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`8MB üstü: ${f.name}`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await api.post(`/uploads/image?purpose=${purpose}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        results.push(res.data);
      } catch (e) {
        toast.error(e?.response?.data?.detail || `Yükleme başarısız: ${f.name}`);
      }
    }
    if (results.length) {
      onChange?.([...value, ...results]);
      toast.success(`${results.length} dosya yüklendi`);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [max, value, purpose, onChange]);

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDrag(false);
    if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files);
  };

  const remove = (id) => onChange?.(value.filter((f) => f.id !== id));

  // Open CropDialog for an already-uploaded item. We fetch the remote URL as
  // a blob first (avoids cross-origin canvas tainting from object-storage
  // CDNs) then hand a fresh data:URL + File to CropDialog just like OCR does.
  const openCrop = async (item) => {
    try {
      const res = await fetch(item.url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const mime = blob.type || "image/jpeg";
      const ext = mime === "image/png" ? "png" : "jpg";
      const baseName = (item.filename || "image").replace(/\.[^.]+$/, "");
      const file = new File([blob], `${baseName}.${ext}`, { type: mime });
      setCropTarget({ id: item.id, url: dataUrl, file });
    } catch (e) {
      toast.error(`Kırpma için resim yüklenemedi: ${e.message || e}`);
    }
  };

  // CropDialog handed us the trimmed file — re-upload and swap the entry in
  // `value` while preserving order so the parent form doesn't reshuffle.
  const applyCrop = async (file, _dataUrl) => {
    if (!cropTarget) return;
    const targetId = cropTarget.id;
    setCropUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/uploads/image?purpose=${purpose}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange?.(value.map((v) => (v.id === targetId ? res.data : v)));
      toast.success("Kırpma uygulandı");
      setCropTarget(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Kırpma yüklenemedi");
    } finally {
      setCropUploading(false);
    }
  };

  return (
    <div className="w-full" data-testid={`image-dropzone-${purpose}`}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg flex flex-col items-center justify-center text-center transition-colors ${
          compact ? "py-2 px-3" : "py-4 px-4"
        }`}
        style={{
          border: `1px dashed ${drag ? "#F59E0B" : "rgba(139,92,246,0.5)"}`,
          background: drag ? "rgba(245,158,11,0.08)" : "rgba(139,92,246,0.05)",
          color: drag ? "#F59E0B" : "rgba(196,181,253,0.85)",
        }}
        data-testid="dropzone-target"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <UploadCloud className={compact ? "w-4 h-4" : "w-5 h-5"} />
            <span className={`font-bold uppercase tracking-wider ${compact ? "text-[9px] mt-1" : "text-[10px] mt-1.5"}`}>
              Görsel bırak veya seç
            </span>
            {!compact && (
              <span className="text-[9px] opacity-60 mt-0.5">
                JPG/PNG/WEBP/GIF · maks 8MB · en fazla {max} dosya
              </span>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="hidden"
          data-testid={`file-input-${purpose}`}
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((f) => (
            <div
              key={f.id}
              className="relative rounded overflow-visible"
              style={{ border: "1px solid rgba(139,92,246,0.4)", width: 64, height: 64 }}
              data-testid={`attachment-preview-${f.id}`}
            >
              <img
                src={f.url}
                alt={f.filename}
                className="w-16 h-16 object-cover rounded"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openCrop(f); }}
                className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "rgba(0,0,0,0.75)", color: "#F5A623" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,166,35,0.9)"; e.currentTarget.style.color = "#0A0806"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.75)"; e.currentTarget.style.color = "#F5A623"; }}
                data-testid={`attachment-crop-${f.id}`}
                title="Kırp"
                aria-label="Kırp"
              >
                <Scissors className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(f.id); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}
                data-testid={`attachment-remove-${f.id}`}
                title="Kaldır"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <CropDialog
        open={!!cropTarget && !cropUploading}
        imageUrl={cropTarget?.url}
        originalFile={cropTarget?.file}
        onCancel={() => setCropTarget(null)}
        onConfirm={applyCrop}
      />
    </div>
  );
}
