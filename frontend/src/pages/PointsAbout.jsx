import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Lock, Flame } from "lucide-react";
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
        scale: active ? 1.06 : 1,
        boxShadow: active
          ? "0 0 22px rgba(255,102,0,0.85), 0 0 46px rgba(255,51,0,0.55), inset 0 0 22px rgba(255,140,50,0.35)"
          : "0 0 10px rgba(255,102,0,0.28), inset 0 0 12px rgba(0,0,0,0.55)",
      }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      whileHover={disabled ? undefined : { scale: active ? 1.08 : 1.04 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className="relative flex flex-col items-center justify-center"
      style={{
        width: 108,
        height: 108,
        borderRadius: "50%",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        // Molten outer ring: layered radial + conic for a live flame edge.
        background: active
          ? "radial-gradient(circle at 50% 55%, rgba(255,200,120,0.35) 0%, rgba(231,76,26,0.75) 42%, rgba(120,20,10,0.9) 78%, rgba(30,10,5,0.95) 100%)"
          : "radial-gradient(circle at 50% 55%, rgba(20,10,6,0.85) 0%, rgba(12,6,4,0.92) 60%, rgba(6,3,2,0.95) 100%)",
        border: "none",
        outline: "none",
      }}
    >
      {/* Animated flame halo ring — pulses on active */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          padding: 2,
          background:
            "conic-gradient(from 0deg, #FFB347, #FF6B00, #E74C1A, #7A1C0F, #FF3300, #FFB347)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          filter: active ? "brightness(1.15) saturate(1.1)" : "brightness(0.55) saturate(0.7)",
        }}
        animate={active ? { rotate: 360 } : { rotate: 0 }}
        transition={active ? { repeat: Infinity, duration: 6, ease: "linear" } : { duration: 0.4 }}
      />

      {/* Flicker overlay: active only, subtle brightness pulse */}
      {active && (
        <motion.span
          aria-hidden
          className="absolute inset-1 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 60%, rgba(255,180,80,0.35) 0%, rgba(255,80,0,0.0) 65%)",
          }}
          animate={{ opacity: [0.65, 1, 0.8, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        />
      )}

      {/* Center flame icon behind the text — very subtle */}
      <Flame
        className="absolute"
        style={{
          width: 88,
          height: 88,
          top: 10,
          color: active ? "rgba(255,180,80,0.18)" : "rgba(255,120,50,0.08)",
          filter: active ? "drop-shadow(0 0 10px rgba(255,120,50,0.55))" : "none",
          pointerEvents: "none",
        }}
      />

      {/* Two-line label */}
      <div
        className="relative z-10 flex flex-col items-center justify-center leading-none select-none"
        style={{ gap: 4 }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "0.14em",
            color: active ? "#FFF6E5" : "#F5A623",
            textShadow: active
              ? "0 0 10px rgba(255,180,80,0.9), 0 1px 2px rgba(0,0,0,0.8)"
              : "0 1px 2px rgba(0,0,0,0.8)",
          }}
        >
          {top}
        </span>
        {bottom && (
          <span
            style={{
              fontFamily: "Cinzel, serif",
              fontWeight: 900,
              fontSize: 15,
              letterSpacing: "0.1em",
              color: active ? "#FFE9C2" : "#D4730A",
              textShadow: active
                ? "0 0 8px rgba(255,140,50,0.8), 0 1px 2px rgba(0,0,0,0.8)"
                : "0 1px 2px rgba(0,0,0,0.8)",
            }}
          >
            {bottom}
          </span>
        )}
      </div>

      {disabled && (
        <Lock
          className="absolute"
          style={{ width: 14, height: 14, top: 8, right: 14, color: "#F5A623", opacity: 0.85 }}
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
          {/* Flame tab picker — no container chrome, buttons float centered */}
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
