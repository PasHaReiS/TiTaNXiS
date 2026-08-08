import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart2, PlusCircle, ChevronRight, Lock } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";

const TABS = [
  { key: "add", labelKey: "nav_add_points", Icon: PlusCircle, requiresEdit: true },
  { key: "list", labelKey: "nav_points", Icon: BarChart2, requiresEdit: false },
];

export default function PointsAbout() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [tab, setTab] = useState(canEdit ? "add" : "list");

  return (
    <div className="min-h-screen" data-testid="points-about-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("nav_points_about")} />

        <div className="grid gap-3" style={{ gridTemplateColumns: "170px 1fr" }} data-testid="pa-layout">
          {/* Sidebar (same aesthetic as PointCalcPage) */}
          <aside
            className="rounded-xl p-3 flex flex-col gap-2"
            data-testid="pa-sidebar"
            style={{
              background: "linear-gradient(180deg, rgba(76,29,149,0.35), rgba(30,58,138,0.35))",
              border: "1px solid rgba(168,85,247,0.4)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 0 24px rgba(139,92,246,0.15)",
              minHeight: 280,
              alignSelf: "start",
            }}
          >
            <div className="flex flex-col gap-1.5" data-testid="pa-sidebar-list">
              {TABS.map(({ key, labelKey, Icon, requiresEdit }) => {
                const disabled = requiresEdit && !canEdit;
                const active = tab === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={active}
                    disabled={disabled}
                    onClick={() => !disabled && setTab(key)}
                    data-testid={`points-about-tab-${key}`}
                    className="group rounded-lg flex items-center gap-2 px-2 py-2 transition-all text-left"
                    style={{
                      background: active
                        ? "linear-gradient(135deg, rgba(139,92,246,0.85), rgba(59,130,246,0.75))"
                        : "rgba(30,20,35,0.55)",
                      border: `1px solid ${active ? "#A855F7" : "rgba(255,255,255,0.08)"}`,
                      boxShadow: active ? "0 0 12px rgba(168,85,247,0.6)" : "none",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.45 : 1,
                    }}
                  >
                    <Icon
                      className="w-4 h-4"
                      style={{
                        color: active ? "#FFFFFF" : "#F5A623",
                        filter: active ? "drop-shadow(0 0 6px rgba(255,255,255,0.4))" : "none",
                      }}
                    />
                    <span
                      className="flex-1 text-sm font-bold truncate"
                      style={{
                        color: active ? "#FFFFFF" : "#E0E7FF",
                        fontFamily: "Cinzel, serif",
                        letterSpacing: "0.04em",
                        textShadow: active ? "0 0 8px rgba(255,255,255,0.35)" : "none",
                      }}
                    >
                      {t(labelKey)}
                    </span>
                    {disabled && <Lock className="w-3 h-3" style={{ color: "#F5A623", opacity: 0.7 }} />}
                    {active && !disabled && <ChevronRight className="w-3.5 h-3.5" style={{ color: "#FFFFFF" }} />}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0" data-testid={`points-about-panel-${tab}`}>
            {tab === "add" ? <AddPoints hideHeader /> : <PointsList hideHeader />}
          </div>
        </div>
      </div>
    </div>
  );
}
