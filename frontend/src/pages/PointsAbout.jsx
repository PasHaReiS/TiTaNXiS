import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";

const TABS = [
  { key: "add", labelKey: "nav_add_points", requiresEdit: true },
  { key: "list", labelKey: "nav_points", requiresEdit: false },
];

// Split "Puan Ekle" → ["PUAN", "EKLE"]. Single-word labels fall back to
// [word, ""] so the button still renders without an empty second line.
const splitLabel = (raw) => {
  const s = String(raw || "").trim();
  const parts = s.split(/\s+/);
  if (parts.length === 1) return [parts[0].toUpperCase(), ""];
  return [parts[0].toUpperCase(), parts.slice(1).join(" ").toUpperCase()];
};

function FlameTab({ tabKey, label, active, disabled, onClick }) {
  const [top, bottom] = splitLabel(label);

  // 12px chamfer on all corners — the canonical "cyber" bevelled octagon.
  const CLIP =
    "polygon(12px 0%, calc(100% - 12px) 0%, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0% calc(100% - 12px), 0% 12px)";

  // Faint diagonal scanline pattern for the cyber-grid vibe (10% opacity).
  const SCANLINES =
    "repeating-linear-gradient(45deg, rgba(255,180,80,0.10) 0 1px, transparent 1px 6px)";

  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      data-testid={`points-about-tab-${tabKey}`}
      initial={false}
      animate={{
        scale: active ? 1.03 : 1,
        filter: active
          ? "drop-shadow(0 0 10px rgba(255,102,0,0.85)) drop-shadow(0 0 22px rgba(255,51,0,0.55))"
          : "drop-shadow(0 0 6px rgba(255,102,0,0.28))",
      }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={disabled ? undefined : { scale: active ? 1.06 : 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className="relative inline-block"
      style={{
        width: 130,
        height: 80,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        outline: "none",
      }}
    >
      {/* Layer 1 — neon frame: full-size gradient clipped to the octagon. */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: CLIP,
          background: active
            ? "linear-gradient(135deg, #FFB347 0%, #FF6B00 45%, #E74C1A 70%, #FF3300 100%)"
            : "linear-gradient(135deg, rgba(255,140,50,0.85), rgba(231,76,26,0.75), rgba(255,51,0,0.85))",
        }}
      />

      {/* Layer 2 — inner fill inset by 2px so Layer 1 shows as a neon border. */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: 2,
          left: 2,
          right: 2,
          bottom: 2,
          clipPath: CLIP,
          background: active
            ? "linear-gradient(135deg, #FF7A1A 0%, #E23E12 55%, #B01F05 100%)"
            : "linear-gradient(135deg, rgba(20,10,6,0.92), rgba(12,6,4,0.96))",
        }}
      />

      {/* Layer 3 — diagonal scanline pattern for cyber grid feel. */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: 2,
          left: 2,
          right: 2,
          bottom: 2,
          clipPath: CLIP,
          background: SCANLINES,
          mixBlendMode: "overlay",
          opacity: active ? 0.9 : 0.6,
        }}
      />

      {/* Layer 4 — corner neon accent dots at the 8 chamfer joints. */}
      {[
        [12, 0], [130 - 12, 0], [130, 12], [130, 80 - 12],
        [130 - 12, 80], [12, 80], [0, 80 - 12], [0, 12],
      ].map(([x, y], i) => (
        <span
          key={i}
          aria-hidden
          className="absolute pointer-events-none rounded-full"
          style={{
            left: x - 2,
            top: y - 2,
            width: 4,
            height: 4,
            background: active ? "#FFF4D9" : "#FF6B00",
            boxShadow: active
              ? "0 0 8px rgba(255,220,120,0.95), 0 0 14px rgba(255,120,50,0.7)"
              : "0 0 6px rgba(255,102,0,0.7)",
          }}
        />
      ))}

      {/* Active-only inner glow pulse. */}
      {active && (
        <motion.span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: 2, left: 2, right: 2, bottom: 2,
            clipPath: CLIP,
            background:
              "radial-gradient(ellipse at 50% 55%, rgba(255,200,120,0.35) 0%, rgba(255,80,0,0) 65%)",
          }}
          animate={{ opacity: [0.55, 1, 0.7, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        />
      )}

      {/* Content: two-line label */}
      <span
        className="relative z-10 flex flex-col items-center justify-center h-full w-full leading-none select-none"
        style={{ gap: 4 }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: "0.35em",
            color: active ? "#FFF4D9" : "#F5A623",
            textShadow: active
              ? "0 0 8px rgba(255,220,120,0.9), 0 1px 2px rgba(0,0,0,0.85)"
              : "0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          {top}
        </span>
        {bottom && (
          <span
            style={{
              fontFamily: "Cinzel, serif",
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: "0.22em",
              color: active ? "#FFFFFF" : "#F5F0E8",
              textShadow: active
                ? "0 0 12px rgba(255,180,80,0.95), 0 0 24px rgba(255,80,0,0.55), 0 2px 3px rgba(0,0,0,0.85)"
                : "0 1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {bottom}
          </span>
        )}
      </span>

      {disabled && (
        <Lock
          className="absolute z-10"
          style={{ width: 14, height: 14, top: 6, right: 18, color: "#F5A623", opacity: 0.85 }}
        />
      )}
    </motion.button>
  );
}

export default function PointsAbout() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [tab, setTab] = useState(canEdit ? "add" : "list");

  return (
    <div className="min-h-screen" data-testid="points-about-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("nav_points_about")} />

        <div className="flex flex-col gap-4" data-testid="pa-layout">
          {/* Cyber-cut octagonal tab picker — buttons float centered, no container */}
          <div
            className="flex flex-row items-center justify-center py-3"
            style={{ gap: 12 }}
            data-testid="pa-sidebar-list"
            role="tablist"
          >
            {TABS.map(({ key, labelKey, requiresEdit }) => {
              const disabled = requiresEdit && !canEdit;
              return (
                <FlameTab
                  key={key}
                  tabKey={key}
                  label={t(labelKey)}
                  active={tab === key}
                  disabled={disabled}
                  onClick={() => setTab(key)}
                />
              );
            })}
          </div>

          {/* Content */}
          <div className="min-w-0" data-testid={`points-about-panel-${tab}`}>
            {tab === "add" ? <AddPoints hideHeader /> : <PointsList hideHeader />}
          </div>
        </div>
      </div>
    </div>
  );
}
