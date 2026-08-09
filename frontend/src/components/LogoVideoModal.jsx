import React, { useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";

const VIDEOS = [
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/c41c7b9dcc514286a12488c0edfba15e_1000074064.mp4",
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/4b6e3c972e9d464696fdfe6e52bd3b25_1000074063.mp4",
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/1b570bfd882a442daa4853148e12cdba_1000074062.mp4",
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/0c9b57fa0a394c74b9643c1ce0312379_1000044256.mp4",
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/d15f1fb1e315490baedf6f57188a1f45_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15266.mp4",
];

export default function LogoVideoModal({ onClose }) {
  const videoRef = useRef(null);
  const src = useMemo(() => VIDEOS[Math.floor(Math.random() * VIDEOS.length)], []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      v.volume = 1;
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      data-testid="logo-video-modal"
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 2147483647, background: "rgba(0,0,0,0.94)" }}
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        data-testid="logo-video-close"
        aria-label="Kapat"
        className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center transition-all"
        style={{
          background: "rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.35)",
          color: "#fff",
          zIndex: 10,
        }}
      >
        <X className="w-5 h-5" />
      </button>

      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        controls={false}
        onEnded={onClose}
        onClick={(e) => e.stopPropagation()}
        data-testid="logo-video-player"
        style={{
          maxWidth: "96vw",
          maxHeight: "96vh",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          boxShadow: "0 0 40px rgba(231,76,26,0.35)",
          borderRadius: 8,
        }}
      />
    </div>,
    document.body
  );
}
