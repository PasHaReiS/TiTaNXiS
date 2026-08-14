import React, { useState } from "react";
import { mutate } from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Camera, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import CanEdit from "@/components/CanEdit";
import ImageDropzone from "@/components/ImageDropzone";

/**
 * Post-event Result Screenshot Archive — collapsible gallery of rank/reward
 * captures for a finished event. Admins upload via existing ImageDropzone,
 * URLs are persisted on the event doc (`result_screenshots: string[]`), and
 * anyone with view access sees the gallery.
 *
 * Props:
 *   - event: full event doc (must include `id`, `result_screenshots`)
 *   - defaultOpen?: boolean — auto-expand when the event date is in the past.
 */
export default function EventResultGallery({ event, defaultOpen = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [uploading, setUploading] = useState([]);
  const [preview, setPreview] = useState(null);
  const shots = event.result_screenshots || [];

  const addScreenshots = async (files) => {
    if (!files || !files.length) return;
    for (const f of files) {
      try {
        await api.post(`/events/${event.id}/screenshots`, { url: f.url });
      } catch (e) {
        toast.error(apiErr(e));
        return;
      }
    }
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    setUploading([]);
    toast.success(t("event_result_uploaded") || "Ekran görüntüsü eklendi");
  };

  const removeShot = async (url) => {
    if (!window.confirm(t("event_result_remove_confirm") || "Bu görüntüyü silmek istiyor musun?")) return;
    try {
      await api.delete(`/events/${event.id}/screenshots`, { params: { url } });
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      toast.success(t("event_result_removed") || "Silindi");
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  return (
    <div
      data-testid={`event-result-gallery-${event.id}`}
      className="border-t border-white/5 mt-2 pt-2"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`event-result-toggle-${event.id}`}
        className="w-full flex items-center gap-2 text-[11px] uppercase font-bold tracking-widest text-yellow-400/80 hover:text-yellow-300 transition"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <Camera className="w-3 h-3" />
        <span className="flex-1 text-left">
          🏆 {t("event_result_title") || "Sonuç Ekran Görüntüleri"}
        </span>
        <span
          className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
          style={{ background: "rgba(245,166,35,0.15)", color: "#F5A623" }}
          data-testid={`event-result-count-${event.id}`}
        >
          {shots.length}
        </span>
      </button>

      {open && (
        <div className="mt-2">
          {shots.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5" data-testid={`event-result-grid-${event.id}`}>
              {shots.map((url) => (
                <div key={url} className="relative group" style={{ aspectRatio: "1 / 1" }}>
                  <img
                    src={url}
                    alt="result"
                    className="w-full h-full object-cover rounded cursor-pointer"
                    onClick={() => setPreview(url)}
                    data-testid={`event-result-thumb-${event.id}`}
                  />
                  <CanEdit>
                    <button
                      type="button"
                      onClick={() => removeShot(url)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded bg-red-500/70 text-white opacity-0 group-hover:opacity-100 transition"
                      data-testid={`event-result-delete-${event.id}`}
                      title={t("delete")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </CanEdit>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic text-center py-2" data-testid={`event-result-empty-${event.id}`}>
              {t("event_result_empty") || "Henüz sonuç yok. Etkinlik bitince rank/ödül ekran görüntülerini yükle."}
            </p>
          )}

          <CanEdit>
            <div className="mt-2">
              <ImageDropzone
                purpose="event"
                value={uploading}
                onChange={(files) => {
                  setUploading(files);
                  const withUrl = files.filter((f) => f.url);
                  if (withUrl.length) addScreenshots(withUrl);
                }}
                max={5}
                compact
              />
            </div>
          </CanEdit>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
          data-testid={`event-result-preview-${event.id}`}
        >
          <img src={preview} alt="preview" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
