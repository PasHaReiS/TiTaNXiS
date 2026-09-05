import React, { useState, useEffect, useRef } from "react";
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
  { key: "siralama",    labelKey: "nav_leaderboard", path: "/", guestPublic: true },
  { key: "loj",         labelKey: "nav_commanders",  path: "/komutanlar", guestPublic: true },
  { key: "hesapla",     labelKey: "nav_point_calc",  path: "/puan-hesaplama", guestPublic: true },
  { key: "etkinlikler", labelKey: "nav_events",      path: "/etkinlikler" },
  { key: "raporlar",    labelKey: "nav_reports",     path: "/raporlar", adminOnly: true },
  { key: "uyeler",      labelKey: "nav_members",     path: "/uyeler" },
  { key: "notifrouting",labelKey: "nav_notif_routing", path: "/admin/bildirim-yonlendirme", adminOnly: true, emoji: "🔔" },
  { key: "pushanalytics",labelKey: "nav_push_analytics", path: "/admin/push-analitik", adminOnly: true, emoji: "📊" },
];

// Radius (px) icons orbit around the central pill.
const RADIUS = 170;
// Central pill diameter.
const CENTER = 44;
// Icon tile size.
const ICON = 70;
// Central pill brand mark (jpg served from /public/brand).
const BRAND_LOGO_URL = "/brand/titanxis-logo.jpg";

export default function RadialMenu() {
  const { t } = useTranslation();
  const { user, isAdmin, canEdit, isGuest } = useAuth() || {};
  const nav = useNavigate();
  const loc = useLocation();
  const isPrivileged = isAdmin || canEdit;
  const isHome = loc.pathname === "/anasayfa";
  const [open, setOpen] = useState(isHome);

  // Reset open state whenever the route changes: home → auto-open, else close.
  useEffect(() => {
    setOpen(isHome);
  }, [loc.pathname, isHome]);

  // Web Audio whoosh generator — cached so we only build the AudioContext once
  // and reuse it whenever the fan opens. Silent-fails on browsers without
  // Web Audio (e.g. very old iOS or headless testing envs).
  const audioCtxRef = useRef(null);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Respect user's mute preference set in Profile settings.
      const muted = typeof window !== "undefined" && localStorage.getItem("ol_radial_mute") === "1";
      if (muted) { prevOpenRef.current = open; return; }
      try {
        if (!audioCtxRef.current) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) audioCtxRef.current = new AC();
        }
        const ctx = audioCtxRef.current;
        if (ctx) {
          if (ctx.state === "suspended") ctx.resume().catch(() => {});
          const now = ctx.currentTime;
          // Whoosh = short filtered noise burst with an exponential decay.
          const bufferSize = ctx.sampleRate * 0.35;
          const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;
          const bandpass = ctx.createBiquadFilter();
          bandpass.type = "bandpass";
          bandpass.frequency.setValueAtTime(900, now);
          bandpass.frequency.exponentialRampToValueAtTime(2200, now + 0.25);
          bandpass.Q.value = 1.4;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
          noise.connect(bandpass).connect(gain).connect(ctx.destination);
          noise.start(now);
          noise.stop(now + 0.34);
        }
      } catch (_) { /* audio is optional; ignore failures */ }
    }
    prevOpenRef.current = open;
  }, [open]);

  if (!user && !isGuest) return null;
  if (loc.pathname === "/login") return null;

  const N = ITEMS.length;
  // Distribute icons across the FULL 180° upper semi-circle so adjacent tiles
  // have generous breathing room. Angles run 180° → 360° with a 36° step;
  // sin() ≤ 0 across the range so every icon stays above the pill center.
  const startAngle = 180;
  const endAngle = 360;
  const step = (endAngle - startAngle) / (N - 1);

  const handleItemClick = (item) => {
    if (item.adminOnly && !isPrivileged) {
      toast.error(t("home_forbidden"));
      return;
    }
    // v136 — Ziyaretçi: sadece guestPublic olan sayfalara doğrudan gidebilir.
    // Kilitli olanlar tıklandığında toast gösterilir ve LockedPage'e düşer.
    if (isGuest && !user && !item.guestPublic) {
      toast.error(t("locked_page_message", "Bu sayfayı görüntülemek için giriş yapmalısınız"));
      nav(item.path); // yine de yönlendir — RequireAuth wrapper LockedPage'i gösterecek
      setOpen(false);
      return;
    }
    nav(item.path);
    setOpen(false);
  };

  return (
    <>
      {/* v106 — Pulse keyframes for the amber connection rays. Kept inline so
          the animation is self-contained with the component. */}
      <style>{`
        @keyframes radial-ray-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px #f59e0b); opacity: 0.55; }
          50%      { filter: drop-shadow(0 0 10px #f59e0b); opacity: 0.9; }
        }
      `}</style>
      {/* Tap-anywhere backdrop only when open on non-home pages so users can
          dismiss the fan without picking a destination. */}
      {open && !isHome && (
        <div
          data-testid="radial-menu-backdrop"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1595, // v135.5 — above LegalFooter (z:1500) so tap-outside dismisses correctly
            background: "rgba(4,2,6,0.45)",
            backdropFilter: "blur(1px)",
          }}
        />
      )}
      <div
        data-testid="radial-menu"
        style={{
          position: "fixed",
          bottom: 52, // v135.5 — was 20; lifted 32px so the button clears the fixed LegalFooter (30px + 2px breathing room)
          left: "50%",
          transform: "translateX(-50%)",
          width: CENTER,
          height: CENTER,
          zIndex: 1600, // v135.5 — above LegalFooter (z:1500) so ring always visible/clickable
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
                animation: open ? "radial-ray-pulse 2.2s ease-in-out infinite" : "none",
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
          // v136 — Ziyaretçi için `guestPublic` olmayan tüm item'lar da kilitli sayılır.
          const guestLocked = isGuest && !user && !item.guestPublic;
          const locked = (item.adminOnly && !isPrivileged) || guestLocked;
          // v106 — Every label sits ABOVE its icon so side icons (LEADERBOARD,
          // MEMBERS) don't push labels into the space below the fan.
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`radial-menu-${item.key}${locked ? "-locked" : ""}`}
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
                opacity: open ? (locked ? 0.5 : 1) : 0,
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
                  filter: locked ? "grayscale(1) brightness(0.8)" : "none",
                  transition: "transform 0.22s ease, filter 0.22s ease",
                  display: "block",
                }}
              />
              {/* v136 — Küçük kilit rozeti sadece guest-locked (veya adminOnly)
                   item'ların sağ üst köşesinde. */}
              {locked && (
                <span
                  data-testid={`radial-menu-${item.key}-lock-badge`}
                  aria-hidden
                  style={{
                    position: "absolute",
                    right: -2,
                    top: -2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(15,10,16,0.9)",
                    border: "1.5px solid rgba(245,166,35,0.75)",
                    boxShadow: "0 0 8px rgba(245,166,35,0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    lineHeight: 1,
                    color: "#F5A623",
                    fontWeight: 900,
                    pointerEvents: "none",
                  }}
                >
                  🔒
                </span>
              )}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  bottom: "calc(100% + 4px)",
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

        {/* Central toggle (v104 compact medallion 44px with outer amber ring) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: -5,
            top: -5,
            width: CENTER + 10,
            height: CENTER + 10,
            borderRadius: "50%",
            pointerEvents: "none",
            border: "1.5px solid rgba(245,166,35,0.55)",
            boxShadow:
              "0 0 18px rgba(245,166,35,0.55), inset 0 0 8px rgba(245,166,35,0.35)",
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
            border: "1.5px solid rgba(245,166,35,0.9)",
            boxShadow:
              "0 0 20px rgba(245,166,35,0.8), 0 0 40px rgba(231,76,26,0.4), inset 0 0 8px rgba(0,0,0,0.6)",
            color: "#FFF5D9",
            fontFamily: "Cinzel, serif",
            fontWeight: 900,
            fontSize: 11,
            letterSpacing: "0.05em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: open ? "rotate(135deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease, box-shadow 0.3s ease",
            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          <span style={{
            transform: open ? "rotate(-135deg)" : "none",
            display: "inline-flex",
            width: "72%",
            height: "72%",
            borderRadius: "50%",
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,220,150,0.5)",
            boxShadow: "inset 0 0 4px rgba(0,0,0,0.5)",
          }}>
            <img
              src={BRAND_LOGO_URL}
              alt="TiTaNXiS"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </span>
        </button>
      </div>
    </>
  );
}
