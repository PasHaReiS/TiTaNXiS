import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

/**
 * RadialMenu (v98)
 *
 * Single central TiTaNXiS button anchored to the bottom-center of the viewport.
 * When toggled open, 6 menu icons fan outward in an UPWARD semi-circle. Each
 * icon slides on its own delay so the reveal reads as a hand-cranked pop-out.
 *
 * Behaviour rules (per user spec):
 *   • On `/anasayfa` the menu opens automatically on mount.
 *   • On every other page the menu starts closed. Tapping the pill toggles it.
 *   • Choosing an icon navigates and always closes the fan again.
 */
const ICONS = {
  siralama:    "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/bf98124273b9447cafc9dba6b96fb8cf_siralama.png",
  loj:         "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/e1d6cc8a38464270b9b13ebed7404ad3_loj_hakkinda.png",
  hesapla:     "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/5b65f92ee4f148ec98c287f169d237d6_puan_hesapla.png",
  etkinlikler: "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/0606132b2dd04361aab583e1e78ffa89_etkinlikler.png",
  raporlar:    "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/377279baeda14126ba092e559488c7c8_katilim.png",
  uyeler:      "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/d2f02c41130d47e7b5fd241e1ae28d0a_uyeler.png",
};

const ITEMS = [
  { key: "siralama",    labelKey: "nav_leaderboard", path: "/" },
  { key: "loj",         labelKey: "nav_commanders",  path: "/komutanlar" },
  { key: "hesapla",     labelKey: "nav_point_calc",  path: "/puan-hesaplama" },
  { key: "etkinlikler", labelKey: "nav_events",      path: "/etkinlikler" },
  { key: "raporlar",    labelKey: "nav_reports",     path: "/raporlar", adminOnly: true },
  { key: "uyeler",      labelKey: "nav_members",     path: "/uyeler" },
];

// Radius (px) icons orbit around the central pill.
const RADIUS = 170;
// Central pill diameter.
const CENTER = 88;
// Icon tile size.
const ICON = 70;

export default function RadialMenu() {
  const { t } = useTranslation();
  const { user, isAdmin, canEdit } = useAuth() || {};
  const nav = useNavigate();
  const loc = useLocation();
  const isPrivileged = isAdmin || canEdit;
  const isHome = loc.pathname === "/anasayfa";
  const [open, setOpen] = useState(isHome);

  // Reset open state whenever the route changes: home → auto-open, else close.
  useEffect(() => {
    setOpen(isHome);
  }, [loc.pathname, isHome]);

  if (!user) return null;
  if (loc.pathname === "/login") return null;

  const N = ITEMS.length;
  // Distribute icons across the upper semi-circle. Angles run from 180° (left)
  // to 360° (right) sweeping through 270° at the top. sin() is negative there
  // so translate(y) moves each icon upward automatically.
  const startAngle = 180;
  const endAngle = 360;
  const step = (endAngle - startAngle) / (N - 1);

  const handleItemClick = (item) => {
    if (item.adminOnly && !isPrivileged) {
      toast.error(t("home_forbidden"));
      return;
    }
    nav(item.path);
    setOpen(false);
  };

  return (
    <>
      {/* Tap-anywhere backdrop only when open on non-home pages so users can
          dismiss the fan without picking a destination. */}
      {open && !isHome && (
        <div
          data-testid="radial-menu-backdrop"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 45,
            background: "rgba(4,2,6,0.45)",
            backdropFilter: "blur(1px)",
          }}
        />
      )}
      <div
        data-testid="radial-menu"
        style={{
          position: "fixed",
          bottom: 30, // sits above the viewport bottom, clear of any tables/buttons
          left: "50%",
          transform: "translateX(-50%)",
          width: CENTER,
          height: CENTER,
          zIndex: 50,
        }}
      >
        {/* Glowing amber connection rays from center to each icon. Rendered
            below the icons and above the backdrop. Opacity + drop-shadow are
            driven by `open` so the rays animate in with the fan. */}
        {(() => {
          const svgSize = 2 * (RADIUS + ICON / 2);
          const cx = svgSize / 2;
          const cy = svgSize / 2;
          return (
            <svg
              data-testid="radial-menu-rays"
              width={svgSize}
              height={svgSize}
              style={{
                position: "absolute",
                left: CENTER / 2 - svgSize / 2,
                top: CENTER / 2 - svgSize / 2,
                pointerEvents: "none",
                filter: "drop-shadow(0 0 4px #f59e0b)",
                opacity: open ? 0.7 : 0,
                transition: "opacity 0.35s ease 0.05s",
              }}
            >
              <defs>
                {ITEMS.map((_, i) => {
                  const angle = startAngle + i * step;
                  const rad = (angle * Math.PI) / 180;
                  const x2 = cx + RADIUS * Math.cos(rad);
                  const y2 = cy + RADIUS * Math.sin(rad);
                  return (
                    <linearGradient
                      key={i}
                      id={`radial-ray-${i}`}
                      gradientUnits="userSpaceOnUse"
                      x1={cx}
                      y1={cy}
                      x2={x2}
                      y2={y2}
                    >
                      <stop offset="0" stopColor="#f59e0b" stopOpacity="1" />
                      <stop offset="1" stopColor="#f59e0b" stopOpacity="0.12" />
                    </linearGradient>
                  );
                })}
              </defs>
              {ITEMS.map((_, i) => {
                const angle = startAngle + i * step;
                const rad = (angle * Math.PI) / 180;
                const x2 = cx + RADIUS * Math.cos(rad);
                const y2 = cy + RADIUS * Math.sin(rad);
                return (
                  <line
                    key={i}
                    x1={cx}
                    y1={cy}
                    x2={x2}
                    y2={y2}
                    stroke={`url(#radial-ray-${i})`}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>
          );
        })()}
        {/* Fan icons */}
        {ITEMS.map((item, i) => {
          const angle = startAngle + i * step;
          const rad = (angle * Math.PI) / 180;
          const x = RADIUS * Math.cos(rad);
          const y = RADIUS * Math.sin(rad);
          const locked = item.adminOnly && !isPrivileged;
          // Icons in the top arc (y significantly negative) surface their
          // labels ABOVE the tile so they do not crash into the labels of the
          // side icons underneath. Side icons keep their label under the tile.
          const labelAbove = y < -RADIUS * 0.55;
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`radial-menu-${item.key}`}
              onClick={() => handleItemClick(item)}
              aria-label={t(item.labelKey)}
              style={{
                position: "absolute",
                left: CENTER / 2,
                top: CENTER / 2,
                width: ICON,
                height: ICON,
                marginLeft: -ICON / 2,
                marginTop: -ICON / 2,
                transform: open
                  ? `translate(${x}px, ${y}px) scale(1)`
                  : "translate(0px, 0px) scale(0.15)",
                opacity: open ? (locked ? 0.55 : 1) : 0,
                pointerEvents: open ? "auto" : "none",
                transition: `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 40}ms, opacity 0.25s ease ${i * 40}ms`,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              <img
                src={ICONS[item.key]}
                alt=""
                style={{
                  width: ICON,
                  height: ICON,
                  objectFit: "contain",
                  imageRendering: "crisp-edges",
                  filter: locked ? "grayscale(1)" : "none",
                  transition: "transform 0.22s ease, filter 0.22s ease",
                  display: "block",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  ...(labelAbove
                    ? { bottom: "calc(100% + 4px)" }
                    : { top: "calc(100% + 4px)" }),
                  fontFamily: "Cinzel, serif",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  textTransform: "uppercase",
                  textAlign: "center",
                  letterSpacing: "0.06em",
                  lineHeight: 1.2,
                  width: 82,
                  whiteSpace: "normal",
                  overflowWrap: "normal",
                  wordBreak: "normal",
                  background: "rgba(0,0,0,0.65)",
                  borderRadius: 4,
                  padding: "2px 5px",
                  boxSizing: "border-box",
                  pointerEvents: "none",
                }}
              >
                {t(item.labelKey)}
              </div>
            </button>
          );
        })}

        {/* Central toggle (v100 grand medallion with outer amber ring) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: -8,
            top: -8,
            width: CENTER + 16,
            height: CENTER + 16,
            borderRadius: "50%",
            pointerEvents: "none",
            border: "2px solid rgba(245,166,35,0.55)",
            boxShadow:
              "0 0 24px rgba(245,166,35,0.55), inset 0 0 12px rgba(245,166,35,0.35)",
            background: "radial-gradient(circle, rgba(245,166,35,0.15) 0%, rgba(245,166,35,0) 65%)",
          }}
        />
        <button
          type="button"
          data-testid="radial-menu-toggle"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: CENTER,
            height: CENTER,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 28%, #FFD787 0%, #F5A623 32%, #B45309 68%, #4A1B08 100%)",
            border: "2px solid rgba(245,166,35,0.9)",
            boxShadow:
              "0 0 30px rgba(245,166,35,0.8), 0 0 60px rgba(231,76,26,0.4), inset 0 0 14px rgba(0,0,0,0.6)",
            color: "#FFF5D9",
            fontFamily: "Cinzel, serif",
            fontWeight: 900,
            fontSize: 17,
            letterSpacing: "0.1em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: open ? "rotate(135deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease, box-shadow 0.3s ease",
            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          <span style={{ transform: open ? "rotate(-135deg)" : "none", display: "inline-block" }}>
            TN
          </span>
        </button>
      </div>
    </>
  );
}
