import React from "react";
import { NavLink } from "react-router-dom";
import { Trophy, Shield, ListOrdered, PlusCircle, Users, Calendar } from "lucide-react";
import { NAV } from "@/constants/testIds";

const items = [
  { to: "/", label: "Sıralama", icon: Trophy, testId: NAV.leaderboard },
  { to: "/komutanlar", label: "Komutan", icon: Shield, testId: NAV.commanders },
  { to: "/puanlar", label: "Puanlar", icon: ListOrdered, testId: NAV.points },
  { to: "/puan-ekle", label: "Ekle", icon: PlusCircle, testId: NAV.addPoints },
  { to: "/uyeler", label: "Üyeler", icon: Users, testId: NAV.members },
  { to: "/etkinlikler", label: "Etkinlik", icon: Calendar, testId: NAV.events },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === "/"}
          data-testid={it.testId}
          className={({ isActive }) => `bottom-nav-btn ${isActive ? "active" : ""}`}
        >
          <it.icon className="w-5 h-5" />
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
