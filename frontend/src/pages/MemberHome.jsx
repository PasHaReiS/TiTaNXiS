import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import useSWR from "swr";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
// v67 — no lucide icon needed anymore for uyeler (replaced with inline
// Spartan helmet SVG). Import removed.
const fetcher = (url) => api.get(url).then((r) => r.data);

// Map an event's group_name → single runic glyph. Case-insensitive substring
// match; falls back to ⚡ so every event still gets an icon.
function iconForGroup(group) {
  const g = String(group || "").toLowerCase();
  if (g.includes("kafes")) return "ᚱ";
  if (g.includes("kristal")) return "ᚢ";
  if (g.includes("savaş") || g.includes("savas") || g.includes("kale")) return "ᚹ";
  return "⚡";
}

// Human-friendly countdown: returns { label, done } where done=true means the
// event has already started. Uses the current tick as reference so callers can
// force re-renders by bumping a `now` state each minute.
function formatCountdown(iso, now) {
  const start = new Date(iso).getTime();
  const diff = start - now;
  if (Number.isNaN(start)) return { label: "", done: false };
  if (diff <= 0) return { label: "✅ Tamamlandı", done: true };
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  let human;
  if (days > 0)      human = `${days}g ${hours}s sonra başlıyor`;
  else if (hours > 0) human = `${hours}s ${m}dk sonra başlıyor`;
  else if (m > 0)     human = `${m}dk sonra başlıyor`;
  else                human = `Şu an başlıyor`;
  return { label: `⏱ ${human}`, done: false };
}

const HERO_BANNER_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/3ec94e48802d40188393d56de578ede6_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15339.jpg";
const STONE_CALENDAR_URL = "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/82de5ccf97bf5aa0573e1f3842df81872f0621de875297b34b0fcbd8f5facd62.jpeg";
const ICON_SPRITE_URL = "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/4f2914e2f219f1731b523b4ddab587b1a982e976a84d1585945b44ec43d46abe.jpeg";

// Sprite is 2 cols × 3 rows (portrait). Pixel-precise crop with zoom so
// baked-in corner numbers (1-6) and label texts stay outside the visible tile.
const SPRITE_CELLS = {
  siralama:     { col: 0, row: 0 }, // lightning
  loj:          { col: 1, row: 0 }, // scroll
  hesapla:      { col: 0, row: 1 }, // scales
  etkinlikler:  { col: 1, row: 1 }, // crossed swords
  raporlar:     { col: 0, row: 2 }, // bar graph
  uyeler:       { col: 1, row: 2 }, // shield
};

function MenuTile({ spriteKey, label, sub, locked, onClick, testId }) {
  const { col, row } = SPRITE_CELLS[spriteKey];
  // v75 — İkon boyutu = daire çapının %60'ı (108 * 0.6 ≈ 65px). Hem sprite
  // hem warband trio 65px'e sabit. Pedestal flex-center içinde hem yatay
  // hem dikey ortalanmış. object-fit spec'ini sprite'a taşıyabilmek için
  // crop viewport 65px, sprite icon body native center'a kilitli.
  const CELL = 100;
  const ICON_SIZE = 65;                        // 60% of 108
  const xShift = (CELL - ICON_SIZE) / 2;       // 17.5 — dead-center horizontal
  const yShift = 10;                            // dead-center vertical
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      style={{
        background: "transparent",
        border: "none",
        padding: "8px 4px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        position: "relative",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 108,               // v71 — pedestal 108px görünür altın halka
          height: 108,
          overflow: "visible",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* v74 — Daire zemini ŞEFFAF: arka planda taş dokusu görünüyor.
            Sadece amber halka çizgisi + yumuşak dış glow kaldı. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "transparent",
            border: "2px solid rgba(249,115,22,0.6)",
            boxShadow:
              "0 8px 22px -8px rgba(0,0,0,0.65), " +
              "0 0 18px -4px rgba(249,115,22,0.45), " +
              "0 0 34px -10px rgba(245,208,106,0.28)",
          }}
        />
        {/* v74 — Inner glass hi-light kaldırıldı; şeffaf zemin istendi. */}
        {/* v73 — İç daire wrapper KALDIRILDI. Sprite/SVG doğrudan 108px
            pedestal'ın flex-centered child'ı olarak zeminine oturuyor. */}
        {spriteKey === "uyeler" ? (
          // Warband trio 50px sabit — pedestal'ın tam ortasında
          <svg
            viewBox="0 0 100 100"
            width={ICON_SIZE}
            height={ICON_SIZE}
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "relative",
              zIndex: 1,
              filter: "drop-shadow(2px 4px 8px rgba(0,0,0,0.9)) drop-shadow(0px 2px 4px rgba(249,115,22,0.4))",
              opacity: locked ? 0.65 : 1,
            }}
            data-testid="uyeler-warband-trio"
          >
              <defs>
                <linearGradient id="warriorDark" x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#3A2610" />
                  <stop offset="50%" stopColor="#1A0F08" />
                  <stop offset="100%" stopColor="#08030A" />
                </linearGradient>
                <linearGradient id="warriorRim" x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#FFF4B8" />
                  <stop offset="35%" stopColor="#F5D06A" />
                  <stop offset="70%" stopColor="#C08820" />
                  <stop offset="100%" stopColor="#7A4E10" />
                </linearGradient>
              </defs>
              {/* LEFT warrior */}
              <g opacity="0.72">
                <line x1="18" y1="10" x2="18" y2="60" stroke="url(#warriorRim)" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M 15 8 L 18 3 L 21 8 L 18 14 Z" fill="url(#warriorRim)" />
                <path d="M 20 44 Q 24 32 30 32 Q 36 32 40 44 L 39 82 Q 30 86 21 82 Z" fill="url(#warriorDark)" stroke="url(#warriorRim)" strokeWidth="1" />
                <path d="M 24 24 Q 24 16 30 16 Q 36 16 36 24 L 36 32 Q 30 34 24 32 Z" fill="url(#warriorDark)" stroke="url(#warriorRim)" strokeWidth="1" />
                <path d="M 28 14 Q 30 8 32 14 L 31 18 Q 30 16 29 18 Z" fill="url(#warriorRim)" />
              </g>
              {/* RIGHT warrior */}
              <g opacity="0.72">
                <line x1="82" y1="10" x2="82" y2="60" stroke="url(#warriorRim)" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M 79 8 L 82 3 L 85 8 L 82 14 Z" fill="url(#warriorRim)" />
                <path d="M 60 44 Q 64 32 70 32 Q 76 32 80 44 L 79 82 Q 70 86 61 82 Z" fill="url(#warriorDark)" stroke="url(#warriorRim)" strokeWidth="1" />
                <path d="M 64 24 Q 64 16 70 16 Q 76 16 76 24 L 76 32 Q 70 34 64 32 Z" fill="url(#warriorDark)" stroke="url(#warriorRim)" strokeWidth="1" />
                <path d="M 68 14 Q 70 8 72 14 L 71 18 Q 70 16 69 18 Z" fill="url(#warriorRim)" />
              </g>
              {/* CENTER warrior */}
              <g>
                <path d="M 49 6 L 51 6 L 52 44 L 48 44 Z" fill="url(#warriorRim)" />
                <rect x="42" y="43" width="16" height="3" fill="url(#warriorRim)" />
                <circle cx="50" cy="49" r="2.4" fill="url(#warriorRim)" />
                <path d="M 36 48 Q 42 34 50 34 Q 58 34 64 48 L 63 90 Q 50 94 37 90 Z" fill="url(#warriorDark)" stroke="url(#warriorRim)" strokeWidth="1.4" />
                <path d="M 42 28 Q 42 18 50 18 Q 58 18 58 28 L 58 36 Q 50 39 42 36 Z" fill="url(#warriorDark)" stroke="url(#warriorRim)" strokeWidth="1.4" />
                <path d="M 46 16 Q 50 6 54 16 L 53 22 Q 50 18 47 22 Z" fill="url(#warriorRim)" />
                <rect x="46" y="27" width="8" height="1.6" fill="#08030A" />
              </g>
            </svg>
          ) : (
            // v75 — Sprite crop 65px (=%60 of pedestal). Doğrudan pedestal
            // flex-centered zeminine oturuyor (hem yatay hem dikey ortalı).
            <div
              style={{
                width: ICON_SIZE,
                height: ICON_SIZE,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
              }}
            >
              <img
                src={ICON_SPRITE_URL}
                alt=""
                style={{
                  position: "absolute",
                  width: CELL * 2,
                  height: CELL * 3,
                  left: -(col * CELL + xShift),
                  top: -(row * CELL + yShift),
                  maxWidth: "none",
                  display: "block",
                  mixBlendMode: "screen",
                  filter: "drop-shadow(2px 4px 8px rgba(0,0,0,0.9)) drop-shadow(0px 2px 4px rgba(249,115,22,0.4))",
                  opacity: locked ? 0.65 : 1,
                }}
              />
            </div>
          )}
      </div>
      {locked && (
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 12,
            fontSize: 14,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
          }}
        >
          🔒
        </span>
      )}
      <p
        style={{
          color: "#F5F0E8",
          fontWeight: 800,
          fontSize: 12,
          margin: "4px 0 0",
          letterSpacing: "0.08em",
          fontFamily: "Cinzel, serif",
          textShadow: "0 2px 4px rgba(0,0,0,0.9)",
        }}
      >
        {label}
      </p>
      {sub && (
        <p
          style={{
            color: "#D4730A",
            fontWeight: 600,
            fontSize: 9,
            margin: 0,
            letterSpacing: "0.08em",
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          }}
        >
          {sub}
        </p>
      )}
    </button>
  );
}

// Live event map derived from /api/events. Only events with
// show_in_calendar !== false and archived === false surface in the calendar.
// Keyed by "YYYY-MM-DD" (local time) → [{ id, title, time, iso }].
function useEventsMap(locale = "tr-TR") {
  const { data } = useSWR("/events?archived=false", fetcher);
  return useMemo(() => {
    const items = Array.isArray(data) ? data : (data?.items || []);
    const map = {};
    for (const ev of items) {
      if (ev.show_in_calendar === false) continue;
      if (!ev.date) continue;
      const d = new Date(ev.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const dateLabel = d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
      (map[key] ||= []).push({
        id: ev.id,
        title: ev.name,
        time,
        iso: ev.date,
        dateLabel,
        group: ev.group_name || null,
        subtitle: ev.subtitle || null,
        multiplier: ev.multiplier || 1,
      });
    }
    // Chronological order within each day
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.iso.localeCompare(b.iso));
    return map;
  }, [data, locale]);
}

export default function MemberHome() {
  const { user, isAdmin, canEdit } = useAuth();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  // Map i18next language code → BCP-47 locale used by Intl.DateTimeFormat.
  // Falls back gracefully to just the base tag (e.g. "en") so unknown codes
  // still render localized month names instead of the Turkish default.
  const locale = (i18n.language || "tr").replace("_", "-");
  const eventsMap = useEventsMap(locale);
  const isPrivileged = isAdmin || canEdit;

  // Küçük takvim grid'i (mevcut ay)
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Pzt=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthName = today.toLocaleDateString(locale, { month: "long", year: "numeric" }).toUpperCase();

  const isoFor = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [popoverEvent, setPopoverEvent] = useState(null); // {id,title,time,iso,dateLabel,group}
  const [rsvpStatus, setRsvpStatus] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Ask for browser Notification permission once per user, right after the
  // first anasayfa mount. If already granted or denied, nothing happens.
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      const asked = localStorage.getItem("mh_notif_asked");
      if (!asked) {
        localStorage.setItem("mh_notif_asked", "1");
        try { Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
      }
    }
  }, []);

  // In-app reminder fallback for users without browser push permission. Once
  // per session (per event) we surface the same "starts in ≤30 min" toast the
  // cron would have pushed. Members with push granted rely on the cron job.
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") return;
    const upcoming = [];
    for (const list of Object.values(eventsMap)) {
      for (const ev of list) {
        const diff = new Date(ev.iso).getTime() - now;
        if (diff > 0 && diff <= 30 * 60 * 1000) {
          upcoming.push({ ...ev, diffMin: Math.max(1, Math.round(diff / 60000)) });
        }
      }
    }
    for (const ev of upcoming) {
      const key = `mh_reminder_shown_${ev.id}`;
      if (sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, "1");
      toast(`⏰ ${ev.title} ${ev.diffMin} dakika sonra başlıyor!`, {
        duration: 10000,
        action: { label: "Kapat", onClick: () => {} },
      });
    }
  }, [eventsMap, now]);

  useEffect(() => {
    if (!popoverEvent) { setRsvpStatus(null); return; }
    let alive = true;
    api.get(`/events/${popoverEvent.id}/rsvp/me`)
      .then((r) => { if (alive) setRsvpStatus(r.data?.status || null); })
      .catch(() => { if (alive) setRsvpStatus(null); });
    return () => { alive = false; };
  }, [popoverEvent?.id]);
  const sendRsvp = async (next) => {
    if (!popoverEvent) return;
    // Tapping the active choice clears it (toggle-off).
    const effective = rsvpStatus === next ? null : next;
    try {
      await api.post(`/events/${popoverEvent.id}/rsvp`, { status: effective });
      setRsvpStatus(effective);
      toast.success(
        effective === "yes" ? "✅ Katılacağım olarak işaretlendi"
        : effective === "maybe" ? "🤔 Belki olarak işaretlendi"
        : effective === "no" ? "❌ Katılamam olarak işaretlendi"
        : "RSVP temizlendi"
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || "RSVP kaydedilemedi");
    }
  };
  const selectedIso = selectedDay ? isoFor(selectedDay) : null;
  const selectedEvents = (selectedIso && eventsMap[selectedIso]) || [];

  const lockedToast = () => toast.error(t("home_forbidden"));

  return (
    <div className="min-h-screen px-4 py-4" data-testid="member-home" style={{ background: "transparent" }}>
      <div className="w-full max-w-md mx-auto" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Row 0 — Top-right language switcher (only page-level control since Breadcrumb hides on /anasayfa) */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -6 }} data-testid="member-home-lang">
          <LanguageSwitcher />
        </div>

        {/* Row 1 — Welcome subtitle */}
        <div
          data-testid="member-home-welcome"
          style={{
            textAlign: "center",
            fontFamily: "Cinzel, serif",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "#D4730A",
            textTransform: "uppercase",
            textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            marginTop: 2,
          }}
        >
          {t("home_welcome", { name: (user?.username || "").toUpperCase() })}
        </div>

        {/* Row 2 — Hero banner */}
        <img
          src={HERO_BANNER_URL}
          alt="TiTaNXiS Hero"
          data-testid="member-home-hero"
          style={{
            width: "100%",
            height: 150,
            objectFit: "cover",
            display: "block",
            borderRadius: 6,
            border: "none",
            boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
          }}
        />

        {/* Row 3 — 3x2 menu grid (fully transparent tiles) */}
        <div
          data-testid="member-home-menu"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(2, auto)",
            gap: 8,
            marginTop: 4,
          }}
        >
          <MenuTile spriteKey="siralama"     label={t("nav_leaderboard").toUpperCase()}   onClick={() => nav("/")} testId="menu-siralama" />
          <MenuTile spriteKey="loj"          label={t("nav_commanders").toUpperCase()}    onClick={() => nav("/komutanlar")} testId="menu-loj" />
          <MenuTile spriteKey="hesapla"      label={t("nav_point_calc").toUpperCase()}    onClick={() => nav("/puan-hesaplama")} testId="menu-hesapla" />
          <MenuTile spriteKey="etkinlikler"  label={t("nav_events").toUpperCase()}        onClick={() => nav("/etkinlikler")} testId="menu-etkinlikler" />
          <MenuTile
            spriteKey="raporlar"
            label={t("nav_reports").toUpperCase()}
            locked={!isPrivileged}
            onClick={() => (isPrivileged ? nav("/raporlar") : lockedToast())}
            testId="menu-raporlar"
          />
          <MenuTile
            spriteKey="uyeler"
            label={t("nav_members").toUpperCase()}
            sub={isPrivileged ? undefined : t("home_view_only")}
            locked={!isPrivileged}
            onClick={() => nav("/uyeler")}
            testId="menu-uyeler"
          />
        </div>

        {/* Admin Dashboard strip — only visible to admin/editor */}
        {isPrivileged && (
          <button
            type="button"
            onClick={() => nav("/dashboard")}
            data-testid="member-home-dashboard-strip"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1.5px solid rgba(245,166,35,0.55)",
              background: "linear-gradient(135deg, rgba(231,76,26,0.22) 0%, rgba(212,115,10,0.18) 50%, rgba(245,166,35,0.15) 100%)",
              boxShadow: "0 0 18px rgba(245,166,35,0.20), inset 0 0 12px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 22 }}>⚡</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span
                style={{
                  fontFamily: "Cinzel, serif",
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: "0.16em",
                  color: "#F5A623",
                  textShadow: "0 0 6px rgba(245,166,35,0.6)",
                }}
              >
                {t("home_admin_panel").toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: "rgba(245,240,232,0.65)", letterSpacing: "0.06em" }}>
                {t("home_admin_panel_sub")}
              </span>
            </div>
            <span style={{ marginLeft: "auto", color: "#F5A623", fontSize: 18 }}>›</span>
          </button>
        )}

        {/* Row 4 — "ETKİNLİK TAKVİMİ" title */}
        <div
          data-testid="member-home-calendar-title"
          style={{
            textAlign: "center",
            fontFamily: "Cinzel, serif",
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "0.22em",
            color: "#F5A623",
            textShadow: "0 0 16px rgba(245,166,35,0.55), 0 2px 6px rgba(0,0,0,0.75)",
            marginTop: 4,
            textTransform: "uppercase",
          }}
        >
          {t("home_calendar_title")}
        </div>

        {/* Row 5 — Real calendar (stone icon ghost removed) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div
            data-testid="member-home-calendar"
            style={{
              width: "100%",
              background: "rgba(10,6,4,0.72)",
              border: "1.5px solid rgba(245,166,35,0.45)",
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: "0 0 18px rgba(245,166,35,0.12), inset 0 0 12px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                textAlign: "center",
                fontFamily: "Cinzel, serif",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.28em",
                color: "#F5A623",
                marginBottom: 10,
                textShadow: "0 0 8px rgba(245,166,35,0.5)",
              }}
            >
              {monthName}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {["Pt","Sa","Ça","Pe","Cu","Ct","Pz"].map((d) => (
                <div key={d} style={{ fontSize: 9, textAlign: "center", fontWeight: 700, textTransform: "uppercase", color: "#D4730A", letterSpacing: "0.06em" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {cells.map((d, i) => {
                const isToday = d === today.getDate();
                const isSelected = d && d === selectedDay;
                const hasEvent = d && !!eventsMap[isoFor(d)];
                return (
                  <div
                    key={i}
                    data-testid={d ? `cal-day-${d}` : undefined}
                    onClick={() => d && setSelectedDay(d)}
                    style={{
                      position: "relative",
                      textAlign: "center",
                      padding: "5px 0 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: isToday ? 800 : 400,
                      background: isSelected ? "rgba(231,76,26,0.32)" : "transparent",
                      color: isSelected ? "#F5F0E8" : d ? "rgba(245,240,232,0.55)" : "transparent",
                      border: isSelected
                        ? "1px solid rgba(231,76,26,0.6)"
                        : (isToday ? "1px solid rgba(245,166,35,0.5)" : "1px solid transparent"),
                      cursor: d ? "pointer" : "default",
                    }}
                  >
                    {d || "·"}
                    {hasEvent && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          bottom: 2,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "#F5A623",
                          boxShadow: "0 0 4px rgba(245,166,35,0.9)",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seçili günün etkinlikleri */}
          {selectedDay && (
            <div
              data-testid="member-home-day-events"
              style={{
                width: "100%",
                background: "rgba(10,6,4,0.68)",
                border: "1px solid rgba(245,166,35,0.35)",
                borderRadius: 10,
                padding: "10px 14px",
                marginTop: -4,
              }}
            >
              <div
                style={{
                  fontFamily: "Cinzel, serif",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  color: "#F5A623",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  textShadow: "0 0 6px rgba(245,166,35,0.4)",
                }}
              >
                {String(selectedDay).padStart(2, "0")} {monthName.split(" ")[0]} · {t("home_day_events_suffix").toUpperCase()}
              </div>
              {selectedEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(245,240,232,0.5)", fontStyle: "italic" }}>
                  {t("home_no_events_today")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedEvents.map((ev) => (
                    <button
                      type="button"
                      key={ev.id}
                      data-testid={`day-event-${ev.id}`}
                      onClick={() => setPopoverEvent(ev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(231,76,26,0.10)",
                        border: "1px solid rgba(245,166,35,0.28)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontFamily: "Cinzel, serif", fontSize: 14, color: "#F5A623", fontWeight: 700, textShadow: "0 0 6px rgba(245,166,35,0.5)" }}>{iconForGroup(ev.group)}</span>
                      <span style={{ fontSize: 12, color: "#F5F0E8", fontWeight: 700, letterSpacing: "0.04em", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                      {(() => {
                        const cd = formatCountdown(ev.iso, now);
                        // Compact: strip trailing "sonra başlıyor" so the pill stays short.
                        const compact = cd.done
                          ? "✅"
                          : cd.label.replace(" sonra başlıyor", "").replace("Şu an başlıyor", "🔴 canlı");
                        return (
                          <span
                            data-testid={`day-event-countdown-${ev.id}`}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.02em",
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: cd.done ? "rgba(34,197,94,0.16)" : "rgba(245,166,35,0.14)",
                              border: cd.done ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(245,166,35,0.45)",
                              color: cd.done ? "#4ade80" : "#F5A623",
                            }}
                          >
                            {compact}
                          </span>
                        );
                      })()}
                      <span style={{ fontSize: 12, color: "#F5A623", fontWeight: 700 }}>{ev.time}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Etkinlik detay popover'ı */}
      {popoverEvent && (
        <div
          onClick={() => setPopoverEvent(null)}
          data-testid="event-popover-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9990,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="event-popover"
            style={{
              width: "100%",
              maxWidth: 320,
              background: "linear-gradient(180deg, rgba(20,10,6,0.98) 0%, rgba(10,6,4,0.98) 100%)",
              border: "1.5px solid rgba(245,166,35,0.55)",
              borderRadius: 12,
              padding: "16px 18px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 24px rgba(245,166,35,0.25)",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setPopoverEvent(null)}
              data-testid="event-popover-close"
              style={{
                position: "absolute",
                top: 6,
                right: 10,
                background: "transparent",
                border: "none",
                color: "rgba(245,240,232,0.6)",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "Cinzel, serif",
                fontWeight: 800,
                fontSize: 18,
                color: "#F5F0E8",
                letterSpacing: "0.04em",
                marginBottom: 10,
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                paddingRight: 20,
              }}
              data-testid="event-popover-title"
            >
              <span style={{ fontSize: 22, color: "#F5A623", textShadow: "0 0 8px rgba(245,166,35,0.55)" }} data-testid="event-popover-icon">
                {iconForGroup(popoverEvent.group)}
              </span>
              <span>{popoverEvent.title}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              <div
                style={{ fontSize: 13, color: "#F5A623", fontWeight: 700, letterSpacing: "0.08em", textShadow: "0 0 6px rgba(245,166,35,0.4)" }}
                data-testid="event-popover-datetime"
              >
                📅 {popoverEvent.dateLabel} · 🕐 {popoverEvent.time}
              </div>
              {(() => {
                const cd = formatCountdown(popoverEvent.iso, now);
                return (
                  <div
                    data-testid="event-popover-countdown"
                    style={{
                      alignSelf: "flex-start",
                      display: "inline-block",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      background: cd.done ? "rgba(34,197,94,0.14)" : "rgba(245,166,35,0.14)",
                      border: cd.done ? "1px solid rgba(34,197,94,0.5)" : "1px solid rgba(245,166,35,0.5)",
                      color: cd.done ? "#4ade80" : "#F5A623",
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                    }}
                  >
                    {cd.label}
                  </div>
                );
              })()}
              {popoverEvent.group && (
                <div
                  style={{ fontSize: 12, color: "rgba(245,240,232,0.75)", letterSpacing: "0.06em" }}
                  data-testid="event-popover-group"
                >
                  <span style={{ color: "#D4730A", fontWeight: 700 }}>Grup:</span>{" "}
                  <span style={{ color: "#F5F0E8", fontWeight: 600 }}>{popoverEvent.group}</span>
                </div>
              )}
              {popoverEvent.subtitle && (
                <div style={{ fontSize: 11, color: "rgba(245,240,232,0.55)", fontStyle: "italic" }}>
                  {popoverEvent.subtitle}
                </div>
              )}
            </div>

            {/* RSVP toggle group */}
            <div
              data-testid="event-popover-rsvp"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}
            >
              {[
                { key: "yes",   label: "✅ Katılacağım", active: "rgba(34,197,94,0.28)",  border: "rgba(34,197,94,0.7)",  fg: "#4ade80" },
                { key: "maybe", label: "🤔 Belki",        active: "rgba(245,166,35,0.28)", border: "rgba(245,166,35,0.7)", fg: "#F5A623" },
                { key: "no",    label: "❌ Katılamam",   active: "rgba(220,38,38,0.28)",  border: "rgba(220,38,38,0.7)",  fg: "#fca5a5" },
              ].map((b) => {
                const isActive = rsvpStatus === b.key;
                return (
                  <button
                    type="button"
                    key={b.key}
                    data-testid={`rsvp-${b.key}`}
                    aria-pressed={isActive}
                    onClick={() => sendRsvp(b.key)}
                    style={{
                      padding: "8px 4px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: isActive ? b.active : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${isActive ? b.border : "rgba(255,255,255,0.15)"}`,
                      color: isActive ? b.fg : "rgba(245,240,232,0.65)",
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: "0.02em",
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                      boxShadow: isActive ? `inset 0 0 8px ${b.active}` : "none",
                    }}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setPopoverEvent(null);
                nav(`/etkinlikler#event-${popoverEvent.id}`);
              }}
              data-testid="event-popover-goto"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)",
                color: "#0a0a0a",
                fontFamily: "Cinzel, serif",
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5), 0 0 14px rgba(245,166,35,0.35)",
                cursor: "pointer",
              }}
            >
              🗡️ Etkinliğe Git
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
