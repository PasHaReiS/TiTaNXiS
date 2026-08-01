import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV } from "@/constants/testIds";
import { useAuth } from "@/context/AuthContext";

// Custom runic SVG icons — carved-stone style, use currentColor so the active/inactive
// palette in the .bottom-nav-btn styles drives their tint.
const runeStroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };

const RuneTrophy = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <path d="M12 2 L8 8 H4 L6 14 H18 L20 8 H16 Z M9 16 L9 20 H15 L15 16 Z M7 20 H17 V22 H7 Z" fill="currentColor" />
  </svg>
);
const RuneSwords = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <path d="M2 2 L10 10 M14 14 L22 22 M22 2 L14 10 M10 14 L2 22 M10 10 L14 14" {...runeStroke} strokeWidth="2.5" />
  </svg>
);
const RuneTablet = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <rect x="3" y="2" width="18" height="20" rx="2" {...runeStroke} strokeWidth="2" />
    <path d="M7 7 H17 M7 11 H17 M7 15 H13" {...runeStroke} strokeWidth="1.6" />
  </svg>
);
const RunePlus = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <circle cx="12" cy="12" r="10" {...runeStroke} strokeWidth="2" />
    <path d="M12 7 V17 M7 12 H17" {...runeStroke} strokeWidth="2.5" />
  </svg>
);
const RuneWarriors = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <circle cx="9" cy="6" r="3" {...runeStroke} strokeWidth="2" />
    <circle cx="17" cy="8" r="2.5" {...runeStroke} strokeWidth="1.5" />
    <path d="M3 20 C3 15 15 15 15 20" {...runeStroke} strokeWidth="2" />
    <path d="M15 19 C15 16 22 16 22 19" {...runeStroke} strokeWidth="1.5" />
  </svg>
);
const RuneTiwaz = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <path d="M12 2 L12 22 M7 7 L12 2 L17 7" {...runeStroke} strokeWidth="2.5" />
    <path d="M6 12 H18" {...runeStroke} strokeWidth="1.6" />
  </svg>
);

const buildItems = () => [
  { to: "/", labelKey: "nav_leaderboard", Icon: RuneTrophy, testId: NAV.leaderboard, guest: true },
  { to: "/komutanlar", labelKey: "nav_commanders", Icon: RuneSwords, testId: NAV.commanders, guest: true },
  { to: "/puanlar", labelKey: "nav_points", Icon: RuneTablet, testId: NAV.points, guest: false },
  { to: "/puan-ekle", labelKey: "nav_add_points", Icon: RunePlus, testId: NAV.addPoints, guest: false, requiresEdit: true },
  { to: "/uyeler", labelKey: "nav_members", Icon: RuneWarriors, testId: NAV.members, guest: false },
  { to: "/etkinlikler", labelKey: "nav_events", Icon: RuneTiwaz, testId: NAV.events, guest: false },
];

const ACTIVE = "#D4730A";
const INACTIVE = "#aa9c92";

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
            className={({ isActive }) => `bottom-nav-btn ${isActive ? "active" : ""}`}
            onClick={(e) => { if (disabledEdit) { e.preventDefault(); } }}
            style={disabledEdit ? { opacity: 0.5 } : undefined}
            title={disabledEdit ? t("view_only") : undefined}
          >
            {({ isActive }) => {
              const color = isActive ? ACTIVE : INACTIVE;
              return (
                <>
                  <div className="relative" style={{ color }}>
                    <it.Icon />
                    {disabledEdit && <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1 gold-text" />}
                  </div>
                  <span style={{ color, fontWeight: isActive ? 700 : 500 }}>{t(it.labelKey)}</span>
                </>
              );
            }}
          </NavLink>
        );
      })}
    </nav>
  );
}
