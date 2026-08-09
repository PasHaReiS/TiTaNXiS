import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock, Trophy, Swords, BarChart2, Calculator, Users, Flag, LayoutGrid, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV } from "@/constants/testIds";
import { useAuth } from "@/context/AuthContext";

const buildItems = () => [
  { to: "/", labelKey: "nav_leaderboard", Icon: Trophy, testId: NAV.leaderboard, guest: true },
  { to: "/komutanlar", labelKey: "nav_commanders", Icon: Swords, testId: NAV.commanders, guest: true },
  { to: "/puan-hesaplama", labelKey: "nav_point_calc", Icon: Calculator, testId: NAV.pointCalc, guest: true },
  { to: "/puanlar-hakkinda", labelKey: "nav_points_about", Icon: BarChart2, testId: NAV.pointsAbout, guest: false },
  { to: "/uyeler", labelKey: "nav_members", Icon: Users, testId: NAV.members, guest: false },
  { to: "/etkinlikler", labelKey: "nav_events", Icon: Flag, testId: NAV.events, guest: false },
  { to: "/gosterge-paneli", labelKey: "nav_live_dashboard", Icon: Activity, testId: "nav-live-dashboard", guest: false },
  { to: "/widget-kitapligi", labelKey: "nav_widget_library", Icon: LayoutGrid, testId: "nav-widget-library", guest: false },
];

const ACTIVE = "#E74C1A";
const INACTIVE = "#666";

export default function BottomNav() {
  const { user, canEdit } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (location.pathname === "/login") return null;

  const items = buildItems().filter((it) => (it.guest ? true : !!user));
  const cols = items.length;

  return (
    <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((it) => {
        const disabledEdit = it.requiresEdit && !canEdit;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === "/"}
            data-testid={it.testId}
            className={({ isActive }) => `bottom-nav-btn flex flex-col items-center justify-center text-center ${isActive ? "active" : ""}`}
            onClick={(e) => { if (disabledEdit) { e.preventDefault(); } }}
            style={disabledEdit ? { opacity: 0.5 } : undefined}
            title={disabledEdit ? t("view_only") : undefined}
          >
            {({ isActive }) => {
              const color = isActive ? ACTIVE : INACTIVE;
              const iconStyle = isActive
                ? { color, filter: "drop-shadow(0 0 6px rgba(231,76,26,0.5))" }
                : { color };
              return (
                <>
                  <div className="relative" style={iconStyle}>
                    <it.Icon className="w-[22px] h-[22px]" strokeWidth={2} />
                    {disabledEdit && <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1 gold-text" />}
                  </div>
                  <span
                    className="text-center leading-tight w-full"
                    style={{
                      color,
                      fontWeight: isActive ? 700 : 500,
                      textShadow: isActive ? "0 0 6px rgba(231,76,26,0.5)" : "none",
                    }}
                  >
                    {t(it.labelKey)}
                  </span>
                </>
              );
            }}
          </NavLink>
        );
      })}
    </nav>
  );
}
