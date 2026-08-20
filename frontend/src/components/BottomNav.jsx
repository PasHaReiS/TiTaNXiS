import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV } from "@/constants/testIds";
import { useAuth } from "@/context/AuthContext";

/**
 * Bottom nav — swapped Lucide icons for matching colored emojis as a
 * design preview. The emojis are wrapped in a fixed-size box so the icon
 * footprint stays consistent with the previous Lucide layout.
 *
 * Emoji ↔ label mapping is intentionally domain-flavoured:
 *   🏆 Sıralama · ⚔️ Loj Hakkında · 🧮 Puan Hesaplama
 *   📊 Puanlar Hakkında · 👥 Üyeler · 📅 Etkinlikler
 */
const buildItems = () => [
  { to: "/", labelKey: "nav_leaderboard", emoji: "🏆", testId: NAV.leaderboard, guest: true },
  { to: "/komutanlar", labelKey: "nav_commanders", emoji: "⚔️", testId: NAV.commanders, guest: true },
  { to: "/puan-hesaplama", labelKey: "nav_point_calc", emoji: "🧮", testId: NAV.pointCalc, guest: true },
  { to: "/raporlar", labelKey: "nav_reports", emoji: "📊", testId: NAV.reports, guest: false, adminOnly: true },
  { to: "/uyeler", labelKey: "nav_members", emoji: "👥", testId: NAV.members, guest: false },
  { to: "/etkinlikler", labelKey: "nav_events", emoji: "📅", testId: NAV.events, guest: false },
];

const ACTIVE = "#E74C1A";
const INACTIVE = "#666";

export default function BottomNav() {
  const { user, canEdit, isAdmin } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (location.pathname === "/login") return null;

  const items = buildItems().filter((it) => {
    if (!it.guest && !user) return false;
    if (it.adminOnly && !isAdmin) return false;
    return true;
  });
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
              return (
                <>
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      fontSize: 20,
                      lineHeight: 1,
                      filter: isActive
                        ? "drop-shadow(0 0 6px rgba(231,76,26,0.5))"
                        : "grayscale(0.15) opacity(0.92)",
                      transition: "filter 0.2s",
                    }}
                  >
                    <span aria-hidden="true">{it.emoji}</span>
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
