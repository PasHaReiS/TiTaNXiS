import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock, Trophy, Swords, BarChart2, PlusCircle, Users, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV } from "@/constants/testIds";
import { useAuth } from "@/context/AuthContext";

const buildItems = () => [
  { to: "/", labelKey: "nav_leaderboard", Icon: Trophy, testId: `${NAV.leaderboard}-side`, guest: true },
  { to: "/komutanlar", labelKey: "nav_commanders", Icon: Swords, testId: `${NAV.commanders}-side`, guest: true },
  { to: "/puanlar", labelKey: "nav_points", Icon: BarChart2, testId: `${NAV.points}-side`, guest: false },
  { to: "/puan-ekle", labelKey: "nav_add_points", Icon: PlusCircle, testId: `${NAV.addPoints}-side`, guest: false, requiresEdit: true },
  { to: "/uyeler", labelKey: "nav_members", Icon: Users, testId: `${NAV.members}-side`, guest: false },
  { to: "/etkinlikler", labelKey: "nav_events", Icon: Flag, testId: `${NAV.events}-side`, guest: false },
];

const ACTIVE = "#E74C1A";
const INACTIVE = "#aa9c92";

export default function SideNav() {
  const { user, canEdit } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (location.pathname === "/login") return null;

  const items = buildItems().filter((it) => (it.guest ? true : !!user));

  return (
    <aside className="side-nav" data-testid="side-nav">
      <div className="side-nav-inner">
        {items.map((it) => {
          const disabledEdit = it.requiresEdit && !canEdit;
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              data-testid={it.testId}
              className={({ isActive }) => `side-nav-btn ${isActive ? "active" : ""}`}
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
                    <div className="relative flex-shrink-0" style={iconStyle}>
                      <it.Icon className="w-[20px] h-[20px]" strokeWidth={2} />
                      {disabledEdit && <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1 gold-text" />}
                    </div>
                    <span
                      className="side-nav-label truncate"
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
      </div>
    </aside>
  );
}
