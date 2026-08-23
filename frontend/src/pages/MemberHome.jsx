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
// v82 — Individual fire statue icons per menu item (no sprite crop).
// Each icon is a standalone JPEG; `mix-blend-mode: screen` neutralises the
// baked-in black background so only the fire statue shines through the
// stone texture. No pedestal ring/box — icons float directly on the wall.
const MENU_ICONS = {
  siralama:    "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/ea24193415c9fee95255be500556222fb965fb6734ffe8d7a2b9633499a7f981.jpeg",
  loj:         "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/dbdacf762a56c722e36c8362d564b949993d6d6024da5887c214b71884863020.jpeg",
  hesapla:     "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/4631334e63ad677308061f4a66ea29b84abed3b9c74a43823e31df4c3a8c3225.jpeg",
  etkinlikler: "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/33ccbbd80ac7859c7b27c871fc0b0e02829643135dfac97aaa43ea539aa80a11.jpeg",
  raporlar:    "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/c736bfe00f8057a4bf06dce68b368b2a027409eb2a98983f33ca01b5613b2507.jpeg",
  uyeler:      "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/929e07a7075b4d27741a4109659ad8f570a3b1de1eb605bf1cc59554b28e2a47.jpeg",
};

function MenuTile({ spriteKey, label, sub, locked, onClick, testId }) {
  const iconUrl = MENU_ICONS[spriteKey];
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="menu-tile-item"
      style={{
        background: "transparent",
        border: "none",
        padding: "8px 4px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        position: "relative",
      }}
    >
      <img
        src={iconUrl}
        alt=""
        className="menu-tile-icon"
        style={{
          width: 85,
          height: 85,
          objectFit: "contain",
          mixBlendMode: "screen",
          filter: "brightness(1.1) contrast(1.05) drop-shadow(0 4px 10px rgba(0,0,0,0.7))",
          background: "transparent",
          transition: "transform 0.22s ease, filter 0.22s ease",
          opacity: locked ? 0.55 : 1,
        }}
      />
      <div
        style={{
          fontFamily: "Cinzel, serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "#F5E7A8",
          textShadow: "0 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(212,175,55,0.35)",
          textTransform: "uppercase",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      {sub && (
        <p
          className="mono text-[10px]"
          style={{ color: "#94A3B8", textAlign: "center", margin: 0 }}
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
      {/* v76 — SVG feColorMatrix filter: sprite JPEG'in siyah arka planını
          luminance-based alpha ile şeffaflaştırır. Referans: `filter:
          url(#titanxis-kill-black)` ikon <img>'larına uygulanıyor. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id="titanxis-kill-black" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0.4 0.4 0.4 0 -0.10"
            />
          </filter>
        </defs>
      </svg>
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
