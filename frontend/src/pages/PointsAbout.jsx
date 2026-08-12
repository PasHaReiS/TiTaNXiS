import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import "./PointsAbout.css";

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

// Pre-rendered stone/lava border artwork — loaded as background-image so the
// entire button chrome is a single image (no runtime SVG/CSS animation).
const LAVA_BG =
  "url('https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/07710d216980683f752205b302c41d253827054fb1d2f282bdab27d6e4081652.jpeg')";

function FlameTab({ tabKey, label, active, disabled, onClick }) {
  const [, bottom] = splitLabel(label);
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      data-testid={`points-about-tab-${tabKey}`}
      whileHover={disabled ? undefined : { scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      style={{
        position: "relative",
        backgroundImage: LAVA_BG,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        border: "none",
        padding: "18px 36px",
        color: "white",
        fontWeight: 900,
        fontSize: 15,
        letterSpacing: "3px",
        cursor: disabled ? "not-allowed" : "pointer",
        minWidth: 170,
        textShadow: "0 0 12px rgba(255,255,255,0.9)",
        filter: active ? "brightness(1.2)" : "brightness(0.75)",
        transition: "filter 0.3s ease",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <span style={{ display: "block", fontSize: 10, letterSpacing: "4px", opacity: 0.85 }}>
        PUAN
      </span>
      <span style={{ display: "block", fontSize: 16, letterSpacing: "3px" }}>
        {bottom || ""}
      </span>
      {disabled && (
        <Lock
          style={{ position: "absolute", top: 6, right: 10, width: 14, height: 14, color: "#fff", opacity: 0.85 }}
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
