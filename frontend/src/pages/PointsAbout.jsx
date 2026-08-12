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
  const [hovered, setHovered] = useState(false);
  const W = 170;
  const H = 65;
  const R = 6;
  const OUTER_BORDER = 2; // orange ring thickness
  const INNER_BORDER = 2; // blue/purple ring thickness
  const INNER_INSET = 4;  // gap between the two rings

  // Sharp bright arcs against transparent gaps → reads as light "particles"
  // orbiting the border when the conic is rotated.
  const ORANGE_PARTICLES =
    "conic-gradient(from 0deg, #F97316 0deg 3deg, transparent 3deg 40deg, #FB923C 40deg 43deg, transparent 43deg 90deg, #FDBA74 90deg 93deg, transparent 93deg 140deg, #F97316 140deg 143deg, transparent 143deg 200deg, #FB923C 200deg 203deg, transparent 203deg 260deg, #FDBA74 260deg 263deg, transparent 263deg 320deg, #F97316 320deg 323deg, transparent 323deg 360deg)";
  const BLUE_PURPLE_PARTICLES =
    "conic-gradient(from 0deg, #38BDF8 0deg 3deg, transparent 3deg 60deg, #A855F7 60deg 63deg, transparent 63deg 120deg, #38BDF8 120deg 123deg, transparent 123deg 180deg, #A855F7 180deg 183deg, transparent 183deg 240deg, #38BDF8 240deg 243deg, transparent 243deg 300deg, #A855F7 300deg 303deg, transparent 303deg 360deg)";

  // Ring speeds — active/hover chase faster.
  const outerDur = hovered ? 2.2 : active ? 4.5 : 7;
  const innerDur = hovered ? 2.8 : active ? 6 : 9;

  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onHoverStart={() => !disabled && setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      data-testid={`points-about-tab-${tabKey}`}
      initial={false}
      animate={{ scale: active ? 1.02 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={disabled ? undefined : { scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className="relative inline-block"
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
        filter: active
          ? "drop-shadow(0 0 10px rgba(249,115,22,0.75)) drop-shadow(0 0 22px rgba(56,189,248,0.45))"
          : "drop-shadow(0 0 6px rgba(249,115,22,0.35))",
      }}
    >
      {/* Layer 0 — near-black inner slab (behind everything) */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          inset: 0,
          borderRadius: R,
          background: hovered
            ? "linear-gradient(135deg, #0A0A1F 0%, #0F0F26 100%)"
            : "#05050F",
        }}
      />

      {/* Layer 1 — inner glow (purple/blue radial, brightens on hover/active) */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          inset: OUTER_BORDER + INNER_INSET + INNER_BORDER,
          borderRadius: Math.max(0, R - 2),
          background:
            "radial-gradient(ellipse at 30% 40%, rgba(168,85,247,0.28) 0%, rgba(56,189,248,0.14) 45%, rgba(5,5,15,0) 80%)",
          opacity: hovered ? 1 : active ? 0.85 : 0.5,
          transition: "opacity 250ms ease",
        }}
      />

      {/* Layer 2 — OUTER orange particle ring (rotates clockwise). Full-size
          conic gradient clipped to a thin ring via mask xor. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: R,
          background: ORANGE_PARTICLES,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: OUTER_BORDER,
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: outerDur, ease: "linear" }}
      />

      {/* Layer 3 — INNER blue+purple particle ring (rotates counter-clockwise
          for a woven dual-particle feel). Inset by OUTER_BORDER + INNER_INSET. */}
      <motion.span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: OUTER_BORDER + INNER_INSET,
          left: OUTER_BORDER + INNER_INSET,
          right: OUTER_BORDER + INNER_INSET,
          bottom: OUTER_BORDER + INNER_INSET,
          borderRadius: Math.max(0, R - 2),
          background: BLUE_PURPLE_PARTICLES,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: INNER_BORDER,
        }}
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: innerDur, ease: "linear" }}
      />

      {/* Content: two-line label */}
      <span
        className="relative z-10 flex flex-col items-center justify-center h-full w-full leading-none select-none"
        style={{ gap: 4 }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontWeight: 700,
            fontSize: 9,
            letterSpacing: "0.4em",
            color: active || hovered ? "#FED7AA" : "#FDBA74",
            textShadow: "0 0 8px rgba(253,186,116,0.85), 0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          {top}
        </span>
        {bottom && (
          <span
            style={{
              fontFamily: "Cinzel, serif",
              fontWeight: 900,
              fontSize: 17,
              letterSpacing: "0.22em",
              color: "#FFFFFF",
              textShadow: active || hovered
                ? "0 0 10px rgba(147,197,253,0.9), 0 0 22px rgba(168,85,247,0.6), 0 2px 3px rgba(0,0,0,0.95)"
                : "0 0 8px rgba(168,85,247,0.4), 0 1px 2px rgba(0,0,0,0.95)",
            }}
          >
            {bottom}
          </span>
        )}
      </span>

      {disabled && (
        <Lock
          className="absolute z-10"
          style={{ width: 14, height: 14, top: 6, right: 10, color: "#FDBA74", opacity: 0.85 }}
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
