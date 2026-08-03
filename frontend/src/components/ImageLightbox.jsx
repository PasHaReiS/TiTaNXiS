import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Reusable full-screen image lightbox with carousel + description.
 * Props:
 *   images: string[]       — resolved image URLs
 *   initialIndex?: number  — default 0
 *   title?: string         — heading shown above description
 *   description?: string   — caption/description under the image
 *   onClose: () => void
 */
export default function ImageLightbox({ images = [], initialIndex = 0, title, description, onClose }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));

  const total = images.length;
  const goPrev = useCallback((e) => { e && e.stopPropagation(); setIdx((i) => (i - 1 + total) % total); }, [total]);
  const goNext = useCallback((e) => { e && e.stopPropagation(); setIdx((i) => (i + 1) % total); }, [total]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && total > 1) setIdx((i) => (i - 1 + total) % total);
      else if (e.key === "ArrowRight" && total > 1) setIdx((i) => (i + 1) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, total]);

  if (total === 0) return null;

  const content = (
    <div
      onClick={onClose}
      data-testid="image-lightbox"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "fadeInUp 0.25s ease-out both",
      }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        data-testid="image-lightbox-close"
        aria-label={t("close")}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 2,
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(13,11,10,0.85)",
          border: "1px solid rgba(212,115,10,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(231,76,26,0.35)",
        }}
      >
        <X className="w-5 h-5" style={{ color: "#F5A623" }} />
      </button>

      {/* Prev / Next */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            data-testid="image-lightbox-prev"
            aria-label="Previous"
            style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(13,11,10,0.75)",
              border: "1px solid rgba(212,115,10,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 2,
              boxShadow: "0 4px 14px rgba(231,76,26,0.3)",
            }}
          >
            <ChevronLeft className="w-6 h-6" style={{ color: "#D4730A" }} />
          </button>
          <button
            type="button"
            onClick={goNext}
            data-testid="image-lightbox-next"
            aria-label="Next"
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(13,11,10,0.75)",
              border: "1px solid rgba(212,115,10,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 2,
              boxShadow: "0 4px 14px rgba(231,76,26,0.3)",
            }}
          >
            <ChevronRight className="w-6 h-6" style={{ color: "#D4730A" }} />
          </button>
        </>
      )}

      {/* Body */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(96vw, 1200px)",
          maxHeight: "94vh",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 14,
        }}
      >
        <img
          src={images[idx]}
          alt={title || `image-${idx + 1}`}
          data-testid={`image-lightbox-img-${idx}`}
          style={{
            maxWidth: "min(96vw, 1200px)",
            maxHeight: "72vh",
            objectFit: "contain",
            borderRadius: 12,
            border: "2px solid rgba(231,76,26,0.5)",
            boxShadow: "0 8px 40px rgba(231,76,26,0.35), inset 0 0 20px rgba(0,0,0,0.6)",
            background: "rgba(0,0,0,0.4)",
          }}
        />

        {/* Caption box */}
        <div
          style={{
            width: "100%",
            maxWidth: 900,
            background: "linear-gradient(180deg, rgba(30,20,16,0.85), rgba(20,14,12,0.9))",
            border: "1px solid rgba(212,115,10,0.4)",
            borderRadius: 10,
            padding: "12px 16px",
            textAlign: "center",
          }}
        >
          {title && (
            <div
              data-testid="image-lightbox-title"
              style={{
                fontFamily: "Cinzel, Rajdhani, serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#F5A623",
                letterSpacing: "0.06em",
                textShadow: "0 0 8px rgba(231,76,26,0.35)",
                marginBottom: description ? 6 : 0,
              }}
            >
              {title}
            </div>
          )}
          {description && (
            <div
              data-testid="image-lightbox-description"
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "#F5F0E8",
                whiteSpace: "pre-wrap",
              }}
            >
              {description}
            </div>
          )}
          {total > 1 && (
            <div
              data-testid="image-lightbox-counter"
              style={{
                marginTop: 8,
                fontSize: 11,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#D4730A",
                fontFamily: "Cinzel, Rajdhani, serif",
                fontWeight: 700,
              }}
            >
              {idx + 1} / {total}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
