import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";

const TABS = [
  { key: "add", label: "PUAN EKLE", requiresEdit: true },
  { key: "list", label: "PUAN LİSTESİ", requiresEdit: false },
];

const TAB_BTN_STYLE = {
  background: "transparent",
  border: "2px solid",
  borderImage: "linear-gradient(90deg, #9333ea, #38bdf8, #f97316) 1",
  color: "white",
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: 2,
  padding: "10px 24px",
  cursor: "pointer",
  transition: "opacity 0.3s",
};

export default function PointsAbout() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [tab, setTab] = useState(canEdit ? "add" : "list");

  return (
    <div className="min-h-screen" data-testid="points-about-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("nav_points_about")} />

        <div className="flex flex-col gap-4" data-testid="pa-layout">
          <div
            style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}
            data-testid="pa-sidebar-list"
            role="tablist"
          >
            {TABS.map(({ key, label, requiresEdit }) => {
              const disabled = requiresEdit && !canEdit;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  aria-disabled={disabled || undefined}
                  disabled={disabled}
                  onClick={disabled ? undefined : () => setTab(key)}
                  data-testid={`points-about-tab-${key}`}
                  style={{
                    ...TAB_BTN_STYLE,
                    opacity: disabled ? 0.35 : tab === key ? 1 : 0.5,
                    cursor: disabled ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  {label}
                  {disabled && (
                    <Lock
                      style={{ position: "absolute", top: 4, right: 6, width: 12, height: 12, color: "#fff", opacity: 0.85 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-w-0" data-testid={`points-about-panel-${tab}`}>
            {tab === "add" ? <AddPoints hideHeader /> : <PointsList hideHeader />}
          </div>
        </div>
      </div>
    </div>
  );
}
