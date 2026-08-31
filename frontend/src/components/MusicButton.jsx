import React, { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import useDraggableFab from "@/hooks/useDraggableFab";

const MUSIC_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/e58e30f1ad7d4f2dba1cef9a53d427a7_joelfazhari-against-all-gods-epic-viking-tribal-adventure-music-464889.mp3";

export default function MusicButton() {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  // v138.4 — Draggable across mobile + desktop; position persisted in localStorage.
  const { pos, hasDragged, dragProps } = useDraggableFab({
    storageKey: "music",
    defaultPos: { top: 70, right: 16 },
    size: 36,
  });

  useEffect(() => {
    const a = new Audio(MUSIC_URL);
    a.loop = true;
    a.volume = 0.4;
    a.preload = "auto";
    audioRef.current = a;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const toggle = () => {
    if (hasDragged) return;
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.then(() => setIsPlaying(true)).catch(() => {
          toast.error(t("music_blocked"));
          setIsPlaying(false);
        });
      } else {
        setIsPlaying(true);
      }
    }
  };

  return (
    <button
      onClick={toggle}
      {...dragProps}
      data-testid="floating-music-btn"
      aria-pressed={isPlaying}
      title={isPlaying ? t("music_stop") : t("music_play")}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #C0392B 0%, #E74C1A 100%)",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 3px 10px rgba(231,76,26,0.5)",
        zIndex: 9000,
        cursor: "grab",
        touchAction: "none",
        animation: isPlaying ? "musicPulse 2s infinite" : "none",
        transition: "all 0.3s ease",
      }}
    >
      {isPlaying ? <Volume2 size={16} color="#fff" /> : <VolumeX size={16} color="#fff" />}
    </button>
  );
}
