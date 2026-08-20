import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import useSWR from "swr";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const fetcher = (url) => api.get(url).then((r) => r.data);

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
  // Sprite scaled so each of the 2×3 cells is 100×100 in-view. Container is
  // 62×62 → shows top-center 62px of each 100px cell (skips labels/numbers).
  const CELL = 100;
  const CONTAINER = 62;
  const xShift = (CELL - CONTAINER) / 2; // center horizontally = 19
  const yShift = 6; // slight top margin so top-corner number stays clipped
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
          width: CONTAINER,
          height: CONTAINER,
          overflow: "hidden",
          borderRadius: 6,
          position: "relative",
        }}
      >
        <img
          src={ICON_SPRITE_URL}
          alt=""
          style={{
            position: "absolute",
            width: CELL * 2,   // 2 columns
            height: CELL * 3,  // 3 rows
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
function useEventsMap() {
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
      (map[key] ||= []).push({ id: ev.id, title: ev.name, time, iso: ev.date });
    }
    // Chronological order within each day
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.iso.localeCompare(b.iso));
    return map;
  }, [data]);
}

export default function MemberHome() {
  const { user, isAdmin, canEdit } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const eventsMap = useEventsMap();
  const isPrivileged = isAdmin || canEdit;

  // Küçük takvim grid'i (mevcut ay)
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Pzt=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthName = today.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }).toUpperCase();

  const isoFor = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [popoverEvent, setPopoverEvent] = useState(null); // {id,title,time}
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
                      <span style={{ fontFamily: "Cinzel, serif", fontSize: 14, color: "#F5A623", fontWeight: 700, textShadow: "0 0 6px rgba(245,166,35,0.5)" }}>ᚱ</span>
                      <span style={{ fontSize: 12, color: "#F5F0E8", fontWeight: 700, letterSpacing: "0.04em" }}>{ev.title}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "#F5A623", fontWeight: 700 }}>{ev.time}</span>
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
                fontFamily: "Cinzel, serif",
                fontWeight: 800,
                fontSize: 16,
                color: "#F5F0E8",
                letterSpacing: "0.04em",
                marginBottom: 8,
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                paddingRight: 20,
              }}
              data-testid="event-popover-title"
            >
              {popoverEvent.title}
            </div>
            <div
              style={{
                fontFamily: "Cinzel, serif",
                fontSize: 14,
                color: "#F5A623",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textShadow: "0 0 8px rgba(245,166,35,0.5)",
              }}
              data-testid="event-popover-time"
            >
              🕐 {popoverEvent.time}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
