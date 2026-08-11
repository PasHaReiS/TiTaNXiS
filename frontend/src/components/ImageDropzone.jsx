import React, { useCallback, useRef, useState } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

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
              className="relative rounded overflow-hidden"
              style={{ border: "1px solid rgba(139,92,246,0.4)" }}
              data-testid={`attachment-preview-${f.id}`}
            >
              <img
                src={f.url}
                alt={f.filename}
                className="w-16 h-16 object-cover"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(f.id); }}
                className="absolute top-0.5 right-0.5 rounded-full p-0.5"
                style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                data-testid={`attachment-remove-${f.id}`}
                title="Kaldır"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
