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
  const W = 160;
  const H = 60;
  const R = 6;

  // Animation speed: base 3s, hover 1s (matches user spec).
  const flowDur = hovered ? 1 : 3;

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
      className="relative inline-block overflow-hidden"
      style={{
        width: W,
        height: H,
        padding: 0,
        border: "none",
        borderRadius: R,
        background: "#05050f",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        outline: "none",
        boxShadow:
          "0 0 15px rgba(139,92,246,0.65), 0 0 30px rgba(59,130,246,0.45)",
      }}
    >
      {/* ::before equivalent — flowing gradient border. Sits at inset:-2px so
          it bleeds beyond the button, then the ::after slab masks the middle
          leaving only a 2px animated ring visible. */}
      <motion.span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: -2,
          left: -2,
          right: -2,
          bottom: -2,
          borderRadius: R + 2,
          background:
            "linear-gradient(90deg, #8B5CF6, #3B82F6, #F97316, #8B5CF6)",
          backgroundSize: "300% 300%",
          zIndex: 0,
        }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ repeat: Infinity, duration: flowDur, ease: "linear" }}
      />

      {/* ::after equivalent — inner dark slab, revealing only the ring above. */}
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: 2,
          left: 2,
          right: 2,
          bottom: 2,
          background: "#05050f",
          borderRadius: R - 1,
          zIndex: 1,
        }}
      />

      {/* Content — two-line label sits on top of both layers. */}
      <span
        className="absolute inset-0 flex flex-col items-center justify-center leading-none select-none"
        style={{ zIndex: 2, gap: 4 }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: "0.4em",
            color: "#E9D5FF",
            textShadow:
              "0 0 8px rgba(139,92,246,0.9), 0 1px 2px rgba(0,0,0,0.95)",
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
              textShadow:
                "0 0 10px rgba(147,197,253,0.9), 0 0 22px rgba(168,85,247,0.55), 0 2px 3px rgba(0,0,0,0.95)",
            }}
          >
            {bottom}
          </span>
        )}
      </span>

      {disabled && (
        <Lock
          className="absolute"
          style={{ zIndex: 3, width: 14, height: 14, top: 6, right: 10, color: "#C4B5FD", opacity: 0.85 }}
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
