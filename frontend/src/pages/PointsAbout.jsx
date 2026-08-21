import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, PlusCircle, ListOrdered } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";

const TABS = [
  { key: "add", label: "PUAN EKLE", Icon: PlusCircle, requiresEdit: true },
  { key: "list", label: "PUAN LİSTESİ", Icon: ListOrdered, requiresEdit: false },
];

// Same fixed width + height for both buttons — matches the site's red/gold
// fire-warrior theme (Cinzel serif, ember gradient border, dark stone slab).
const TAB_W = 200;
const TAB_H = 56;

function TabButton({ tabKey, label, Icon, active, disabled, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      data-testid={`points-about-tab-${tabKey}`}
      style={{
        position: "relative",
        width: TAB_W,
        height: TAB_H,
        boxSizing: "border-box",
        background: active
          ? "linear-gradient(135deg, rgba(60,10,5,0.95) 0%, rgba(120,25,10,0.85) 55%, rgba(60,10,5,0.95) 100%)"
          : "linear-gradient(135deg, rgba(20,10,6,0.9), rgba(10,6,4,0.95))",
        border: "2px solid",
        borderImage: active
          ? "linear-gradient(135deg, #F5A623 0%, #E74C1A 45%, #DC2626 100%) 1"
          : "linear-gradient(135deg, #7a4a12, #5c1a0a, #7a4a12) 1",
        color: "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "filter 0.25s ease, transform 0.15s ease",
        filter: active ? "brightness(1.15) drop-shadow(0 0 12px rgba(231,76,26,0.55))" : "brightness(0.7)",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: "'Cinzel', serif",
        fontWeight: 900,
        fontSize: 14,
        letterSpacing: "0.18em",
        textShadow: active
          ? "0 0 10px rgba(255,180,80,0.9), 0 1px 2px rgba(0,0,0,0.9)"
          : "0 1px 2px rgba(0,0,0,0.9)",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(1.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <Icon
        className="w-4 h-4 flex-shrink-0"
        style={{
          color: active ? "#F5A623" : "#8a6a3a",
          filter: active ? "drop-shadow(0 0 6px rgba(245,166,35,0.8))" : "none",
        }}
      />
      <span>{label}</span>
      {disabled && (
        <Lock
          style={{ position: "absolute", top: 4, right: 6, width: 12, height: 12, color: "#F5A623", opacity: 0.85 }}
        />
      )}
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
        <Header title={t("nav_points_about")}>
          <div
            style={{ display: "flex", gap: 16, justifyContent: "center" }}
            data-testid="pa-sidebar-list"
            role="tablist"
          >
            {TABS.map(({ key, label, Icon, requiresEdit }) => {
              const disabled = requiresEdit && !canEdit;
              return (
                <TabButton
                  key={key}
                  tabKey={key}
                  label={label}
                  Icon={Icon}
                  active={tab === key}
                  disabled={disabled}
                  onClick={() => setTab(key)}
                />
              );
            })}
          </div>
        </Header>

        <div className="flex flex-col gap-4" data-testid="pa-layout">
          <div className="min-w-0" data-testid={`points-about-panel-${tab}`}>
            {tab === "add" ? <AddPoints hideHeader /> : <PointsList hideHeader />}
          </div>
        </div>
      </div>
    </div>
  );
}
