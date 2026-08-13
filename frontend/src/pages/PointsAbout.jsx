import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";

// Pre-rendered tab artwork — the whole button chrome (frame + label) is baked
// into the image, so the component just paints an <img> and toggles opacity
// between active (1) and passive (0.55).
const TAB_IMAGES = {
  add: "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/6b4408956b748829151946dc73056e9b9b4a3d004cd9bf75fc0717d7403e9ee9.jpeg",
  list: "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/42f60090e6263319c2d7ca442fcdf65f6de23e8dc0dc3ca81b6dbdc18316132d.jpeg",
};

const TABS = [
  { key: "add", labelKey: "nav_add_points", requiresEdit: true, imgAlt: "Puan Ekle" },
  { key: "list", labelKey: "nav_points", requiresEdit: false, imgAlt: "Puan Listesi" },
];

function TabButton({ tabKey, imgUrl, alt, active, disabled, onClick }) {
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
        background: "none",
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : active ? 1 : 0.55,
        transition: "opacity 0.3s",
        position: "relative",
      }}
    >
      <img
        src={imgUrl}
        alt={alt}
        style={{ width: 170, height: "auto", display: "block" }}
      />
      {disabled && (
        <Lock
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            width: 14,
            height: 14,
            color: "#fff",
            opacity: 0.85,
          }}
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
          {/* Tab picker — buttons float centered, no container chrome */}
          <div
            className="flex flex-row items-center justify-center py-3"
            style={{ gap: 16 }}
            data-testid="pa-sidebar-list"
            role="tablist"
          >
            {TABS.map(({ key, requiresEdit, imgAlt }) => {
              const disabled = requiresEdit && !canEdit;
              return (
                <TabButton
                  key={key}
                  tabKey={key}
                  imgUrl={TAB_IMAGES[key]}
                  alt={imgAlt}
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
