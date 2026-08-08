import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart2, PlusCircle } from "lucide-react";
import AddPoints from "@/pages/AddPoints";
import PointsList from "@/pages/PointsList";
import { useAuth } from "@/context/AuthContext";

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
        <h1
          className="text-2xl font-bold mb-4 heading-cinzel"
          style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}
        >
          {t("nav_points_about")}
        </h1>

        <div
          role="tablist"
          className="flex gap-2 mb-4 border-b"
          style={{ borderColor: "rgba(231,76,26,0.35)" }}
          data-testid="points-about-tabs"
        >
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
                className="px-4 py-2 rounded-t-lg font-bold uppercase transition-all flex items-center gap-2"
                style={{
                  background: active ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "#1A1210",
                  border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                  borderBottom: active ? "1px solid #E74C1A" : "1px solid transparent",
                  color: active ? "#0B0704" : "#F5F0E8",
                  boxShadow: active ? "0 0 10px rgba(231,76,26,0.5)" : "none",
                  fontFamily: "Cinzel, serif",
                  letterSpacing: "0.06em",
                  fontSize: 13,
                  opacity: disabled ? 0.4 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <Icon className="w-4 h-4" />
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        <div data-testid={`points-about-panel-${tab}`}>
          {tab === "add" ? <AddPoints /> : <PointsList />}
        </div>
      </div>
    </div>
  );
}
