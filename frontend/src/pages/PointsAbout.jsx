import React, { useState } from "react";
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

function FlameTab({ tabKey, label, active, disabled, onClick }) {
  const [top, bottom] = splitLabel(label);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      data-testid={`points-about-tab-${tabKey}`}
      className={`lava-btn${active ? " is-active" : ""}`}
    >
      {/* Three visual layers behind the content — order matters (z-index in CSS). */}
      <span className="lava-glow" aria-hidden />
      <span className="lava-ring" aria-hidden />
      <span className="lava-inner" aria-hidden />

      {/* Spark particles — only animate when active (CSS rule pauses them
          on non-active buttons so the passive one stays calm). */}
      <span className="spark" aria-hidden />
      <span className="spark" aria-hidden />
      <span className="spark" aria-hidden />
      <span className="spark" aria-hidden />
      <span className="spark" aria-hidden />
      <span className="spark" aria-hidden />

      <span className="lava-label">
        <span className="lava-label-top">{top}</span>
        {bottom && <span className="lava-label-bottom">{bottom}</span>}
      </span>
      {disabled && <Lock className="lava-lock" />}
    </button>
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
