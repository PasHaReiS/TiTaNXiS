import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Trophy, Shield, ListOrdered, PlusCircle, Users, Calendar, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV } from "@/constants/testIds";
import { useAuth } from "@/context/AuthContext";

// items visible to all: leaderboard, commanders
// items requiring auth: points, add-points, members, events
// Note: User management moved to Header ⚙️ icon; removed from bottom nav.
const buildItems = (t) => [
  { to: "/", labelKey: "nav_leaderboard", icon: Trophy, testId: NAV.leaderboard, guest: true },
  { to: "/komutanlar", labelKey: "nav_commanders", icon: Shield, testId: NAV.commanders, guest: true },
  { to: "/puanlar", labelKey: "nav_points", icon: ListOrdered, testId: NAV.points, guest: false },
  { to: "/puan-ekle", labelKey: "nav_add_points", icon: PlusCircle, testId: NAV.addPoints, guest: false, requiresEdit: true },
  { to: "/uyeler", labelKey: "nav_members", icon: Users, testId: NAV.members, guest: false },
  { to: "/etkinlikler", labelKey: "nav_events", icon: Calendar, testId: NAV.events, guest: false },
];

export default function BottomNav() {
  const { user, canEdit } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (location.pathname === "/login") return null;

  const items = buildItems(t).filter((it) => {
    if (it.guest) return true;
    return !!user;
  });

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
            className={({ isActive }) => `bottom-nav-btn ${isActive ? "active" : ""}`}
            onClick={(e) => { if (disabledEdit) { e.preventDefault(); } }}
            style={disabledEdit ? { opacity: 0.5 } : undefined}
            title={disabledEdit ? t("view_only") : undefined}
          >
            <div className="relative">
              <it.icon className="w-5 h-5" />
              {disabledEdit && <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1 gold-text" />}
            </div>
            <span>{t(it.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
