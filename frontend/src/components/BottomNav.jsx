import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Trophy, Shield, ListOrdered, PlusCircle, Users, Calendar, Lock } from "lucide-react";
import { NAV } from "@/constants/testIds";
import { useAuth } from "@/context/AuthContext";

// items visible to all: leaderboard, commanders
// items requiring auth: points, add-points, members, events
// Note: User management moved to Header ⚙️ icon; removed from bottom nav.
const allItems = [
  { to: "/", label: "Sıralama", icon: Trophy, testId: NAV.leaderboard, guest: true },
  { to: "/komutanlar", label: "Komutan", icon: Shield, testId: NAV.commanders, guest: true },
  { to: "/puanlar", label: "Puanlar", icon: ListOrdered, testId: NAV.points, guest: false },
  { to: "/puan-ekle", label: "Ekle", icon: PlusCircle, testId: NAV.addPoints, guest: false, requiresEdit: true },
  { to: "/uyeler", label: "Üyeler", icon: Users, testId: NAV.members, guest: false },
  { to: "/etkinlikler", label: "Etkinlik", icon: Calendar, testId: NAV.events, guest: false },
];

export default function BottomNav() {
  const { user, isAdmin, canEdit } = useAuth();
  const location = useLocation();
  if (location.pathname === "/login") return null;

  const items = allItems.filter((it) => {
    if (it.adminOnly) return isAdmin;
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
            title={disabledEdit ? "Değişiklik yetkiniz yok" : undefined}
          >
            <div className="relative">
              <it.icon className="w-5 h-5" />
              {disabledEdit && <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1 gold-text" />}
            </div>
            <span>{it.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
