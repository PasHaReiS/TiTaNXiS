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
  const W = 160;
  const H = 60;
  const R = 10; // border-radius
  const BORDER = 2; // ring thickness

  // Particle stream: sharp conic gradient with narrow bright arcs + dark gaps
  // rotating continuously → reads as light "particles" chasing round the border.
  // Purple → Blue → Orange as the user asked.
  const PARTICLE_RING = (a) =>
    a
      ? "conic-gradient(from 0deg, #8B5CF6 0deg 6deg, transparent 6deg 45deg, #3B82F6 45deg 51deg, transparent 51deg 90deg, #F97316 90deg 96deg, transparent 96deg 135deg, #A855F7 135deg 141deg, transparent 141deg 180deg, #60A5FA 180deg 186deg, transparent 186deg 225deg, #FB923C 225deg 231deg, transparent 231deg 270deg, #8B5CF6 270deg 276deg, transparent 276deg 315deg, #3B82F6 315deg 321deg, transparent 321deg 360deg)"
      : "conic-gradient(from 0deg, rgba(139,92,246,0.7) 0deg 4deg, transparent 4deg 60deg, rgba(59,130,246,0.7) 60deg 64deg, transparent 64deg 120deg, rgba(249,115,22,0.7) 120deg 124deg, transparent 124deg 180deg, rgba(139,92,246,0.7) 180deg 184deg, transparent 184deg 240deg, rgba(59,130,246,0.7) 240deg 244deg, transparent 244deg 300deg, rgba(249,115,22,0.7) 300deg 304deg, transparent 304deg 360deg)";

  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      data-testid={`points-about-tab-${tabKey}`}
      initial={false}
      animate={{ scale: active ? 1.02 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={disabled ? undefined : { scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className="relative inline-block overflow-hidden"
      style={{
        width: W,
        height: H,
        padding: 0,
        border: "none",
        borderRadius: R,
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        outline: "none",
        // Overall glow scales with active state
        filter: active
          ? "drop-shadow(0 0 10px rgba(139,92,246,0.75)) drop-shadow(0 0 24px rgba(59,130,246,0.4))"
          : "drop-shadow(0 0 6px rgba(139,92,246,0.35))",
      }}
    >
      {/* Rotating particle ring — full-size conic clipped to a ring by mask.
          Framer Motion drives `rotate` so we avoid CSS @keyframes injection. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: R,
          background: PARTICLE_RING(active),
          WebkitMask:
            `linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)`,
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: BORDER,
        }}
        animate={{ rotate: 360 }}
        transition={{
          repeat: Infinity,
          duration: active ? 3.5 : 7,
          ease: "linear",
        }}
      />

      {/* Dark inner core with subtle purple→blue radial glow */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: BORDER,
          left: BORDER,
          right: BORDER,
          bottom: BORDER,
          borderRadius: R - 1,
          background: active
            ? "radial-gradient(ellipse at 30% 30%, rgba(139,92,246,0.35) 0%, rgba(59,130,246,0.18) 40%, rgba(10,10,26,0.92) 80%)"
            : "radial-gradient(ellipse at 30% 30%, rgba(139,92,246,0.18) 0%, rgba(59,130,246,0.08) 40%, rgba(10,10,26,0.92) 80%)",
        }}
      />

      {/* Faint horizontal data-flow lines shimmering across the core.
          `backgroundPosition` animates via Framer Motion → real "particle
          stream" feel through the middle of the button. */}
      <motion.span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: BORDER,
          left: BORDER,
          right: BORDER,
          bottom: BORDER,
          borderRadius: R - 1,
          background:
            "repeating-linear-gradient(90deg, transparent 0 8px, rgba(139,92,246,0.10) 8px 10px, transparent 10px 20px, rgba(59,130,246,0.10) 20px 22px, transparent 22px 40px, rgba(249,115,22,0.10) 40px 42px, transparent 42px 60px)",
          backgroundSize: "200% 100%",
          mixBlendMode: "screen",
        }}
        animate={{ backgroundPositionX: ["0%", "200%"] }}
        transition={{ repeat: Infinity, duration: active ? 4 : 8, ease: "linear" }}
      />

      {/* 3 orbiting particles — small bright dots that trace the border path.
          Rotate a small offset element around the button center. */}
      {active && [0, 120, 240].map((deg, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute pointer-events-none rounded-full"
          style={{
            width: 5,
            height: 5,
            top: "50%",
            left: "50%",
            marginTop: -2.5,
            marginLeft: -2.5,
            background: i === 0 ? "#C4B5FD" : i === 1 ? "#93C5FD" : "#FDBA74",
            boxShadow: `0 0 8px ${i === 0 ? "#8B5CF6" : i === 1 ? "#3B82F6" : "#F97316"}, 0 0 14px ${i === 0 ? "#A855F7" : i === 1 ? "#60A5FA" : "#FB923C"}`,
            transformOrigin: "center center",
          }}
          animate={{ rotate: [deg, deg + 360] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }}
        >
          {/* Inner translate positions the dot on the border ellipse */}
          <span
            className="block rounded-full w-full h-full"
            style={{
              transform: `translate(${W / 2 - BORDER - 1}px, 0)`,
              background: "inherit",
            }}
          />
        </motion.span>
      ))}

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
            color: active ? "#E9D5FF" : "#C4B5FD",
            textShadow: active
              ? "0 0 8px rgba(196,181,253,0.9), 0 1px 2px rgba(0,0,0,0.9)"
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
              fontSize: 19,
              letterSpacing: "0.22em",
              color: "#FFFFFF",
              textShadow: active
                ? "0 0 10px rgba(147,197,253,0.9), 0 0 22px rgba(139,92,246,0.5), 0 2px 3px rgba(0,0,0,0.9)"
                : "0 0 8px rgba(139,92,246,0.4), 0 1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {bottom}
          </span>
        )}
      </span>

      {disabled && (
        <Lock
          className="absolute z-10"
          style={{ width: 14, height: 14, top: 6, right: 10, color: "#C4B5FD", opacity: 0.85 }}
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
          {/* Particle / data-flow tab picker — buttons float centered, no container */}
          <div
            className="flex flex-row items-center justify-center py-3"
            style={{ gap: 16 }}
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
