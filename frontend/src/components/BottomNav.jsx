import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Trophy, Swords, BarChart2, Calculator, Users, Flag } from "lucide-react";
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
    <motion.nav
      className="bottom-nav"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
      }}
    >
      {items.map((it) => {
        const disabledEdit = it.requiresEdit && !canEdit;
        return (
          <motion.div
            key={it.to}
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 420, damping: 26 } },
            }}
            whileHover={disabledEdit ? undefined : { scale: 1.06, filter: "drop-shadow(0 0 8px rgba(245,166,35,0.55))" }}
            whileTap={disabledEdit ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
          >
          <NavLink
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
          </motion.div>
        );
      })}
    </motion.nav>
  );
}
