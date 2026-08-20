import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const HERO_BANNER_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/3ec94e48802d40188393d56de578ede6_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15339.jpg";
const STONE_CALENDAR_URL = "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/82de5ccf97bf5aa0573e1f3842df81872f0621de875297b34b0fcbd8f5facd62.jpeg";
const ICON_SPRITE_URL = "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/4f2914e2f219f1731b523b4ddab587b1a982e976a84d1585945b44ec43d46abe.jpeg";

// Sprite is 2 cols × 3 rows (Gemini vision analysis confirms row-by-row layout)
// x: 0% (col 0), 100% (col 1)  |  y: 0% (row 0), 50% (row 1), 100% (row 2)
const SPRITE_POS = {
  siralama:     { x: "0%",   y: "0%"   }, // lightning bolt — row 0 left
  loj:          { x: "100%", y: "0%"   }, // scroll — row 0 right
  hesapla:      { x: "0%",   y: "50%"  }, // balance scale — row 1 left
  etkinlikler:  { x: "100%", y: "50%"  }, // crossed swords — row 1 right
  raporlar:     { x: "0%",   y: "100%" }, // bar graph — row 2 left
  uyeler:       { x: "100%", y: "100%" }, // shield — row 2 right
};

function MenuTile({ spriteKey, label, sub, locked, onClick, testId }) {
  const pos = SPRITE_POS[spriteKey];
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
          width: 62,
          height: 62,
          backgroundImage: `url(${ICON_SPRITE_URL})`,
          backgroundSize: "200% 300%",
          backgroundPosition: `${pos.x} ${pos.y}`,
          backgroundRepeat: "no-repeat",
          mixBlendMode: "screen",
          filter: "drop-shadow(2px 4px 8px rgba(0,0,0,0.9)) drop-shadow(0px 2px 4px rgba(249,115,22,0.4))",
          opacity: locked ? 0.65 : 1,
        }}
      />
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

// Örnek etkinlik verisi — YYYY-MM-DD → [{ time, title, icon }]
function useEventsMap() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const iso = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return useMemo(() => ({
    [iso(today.getDate())]:      [{ time: "19:00", title: "Kale Savaşı", icon: "ᚱ" }, { time: "21:00", title: "Zindan Görevi", icon: "ᚢ" }],
    [iso(today.getDate() + 2)]:  [{ time: "20:30", title: "Kale Savaşı", icon: "ᚱ" }],
    [iso(today.getDate() + 5)]:  [{ time: "19:00", title: "Zindan Görevi", icon: "ᚢ" }, { time: "22:00", title: "İttifak Boss", icon: "ᛒ" }],
    [iso(today.getDate() + 8)]:  [{ time: "18:00", title: "Kale Savaşı", icon: "ᚱ" }],
  }), [today.getDate(), m, y]);
}

export default function MemberHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const eventsMap = useEventsMap();

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
  const selectedIso = selectedDay ? isoFor(selectedDay) : null;
  const selectedEvents = (selectedIso && eventsMap[selectedIso]) || [];

  const lockedToast = () => toast.error("Bu bölüme erişim yetkiniz yok.");

  return (
    <div className="min-h-screen px-4 py-4" data-testid="member-home" style={{ background: "transparent" }}>
      <div className="w-full max-w-md mx-auto" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Row 1 — Welcome subtitle (Header globally rendered by Layout) */}
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
          HOŞ GELDİNİZ, {(user?.username || "MİSAFİR").toUpperCase()}!
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
          <MenuTile spriteKey="siralama"     label="SIRALAMA"      onClick={() => nav("/")} testId="menu-siralama" />
          <MenuTile spriteKey="loj"          label="LOJ HAKKINDA"  onClick={() => nav("/komutanlar")} testId="menu-loj" />
          <MenuTile spriteKey="hesapla"      label="PUAN HESAPLA"  onClick={() => nav("/puan-hesaplama")} testId="menu-hesapla" />
          <MenuTile spriteKey="etkinlikler"  label="ETKİNLİKLER"   onClick={() => nav("/etkinlikler")} testId="menu-etkinlikler" />
          <MenuTile spriteKey="raporlar"     label="RAPORLAR"      locked onClick={lockedToast} testId="menu-raporlar" />
          <MenuTile spriteKey="uyeler"       label="ÜYELER"        sub="Salt Görüntüleme" locked onClick={() => nav("/uyeler")} testId="menu-uyeler" />
        </div>

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
          }}
        >
          ETKİNLİK TAKVİMİ
        </div>

        {/* Row 5 — Stone icon + real calendar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <img
            src={STONE_CALENDAR_URL}
            alt=""
            aria-hidden="true"
            data-testid="member-home-stone-icon"
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              display: "block",
              background: "transparent",
              border: "none",
              boxShadow: "none",
              mixBlendMode: "multiply",
            }}
          />
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
                {String(selectedDay).padStart(2, "0")} {monthName.split(" ")[0]} · ETKİNLİKLER
              </div>
              {selectedEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(245,240,232,0.5)", fontStyle: "italic" }}>
                  Bu gün planlı etkinlik yok.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedEvents.map((ev, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(231,76,26,0.10)",
                        border: "1px solid rgba(245,166,35,0.28)",
                      }}
                    >
                      <span style={{ fontFamily: "Cinzel, serif", fontSize: 14, color: "#F5A623", fontWeight: 700, textShadow: "0 0 6px rgba(245,166,35,0.5)" }}>{ev.icon}</span>
                      <span style={{ fontSize: 12, color: "#F5F0E8", fontWeight: 700, letterSpacing: "0.04em" }}>{ev.title}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "#F5A623", fontWeight: 700 }}>{ev.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 6 — Event pills */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="member-home-events">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 999,
              background: "rgba(10,6,4,0.72)",
              border: "1.5px solid rgba(245,166,35,0.55)",
              boxShadow: "0 0 14px rgba(245,166,35,0.15), inset 0 0 10px rgba(0,0,0,0.4)",
            }}
          >
            <span style={{ fontFamily: "Cinzel, serif", fontSize: 16, color: "#F5A623", fontWeight: 700, textShadow: "0 0 8px rgba(245,166,35,0.6)" }}>ᚱ</span>
            <span style={{ fontFamily: "Cinzel, serif", fontSize: 13, color: "#F5F0E8", fontWeight: 700, letterSpacing: "0.05em" }}>Kale Savaşı</span>
            <span style={{ marginLeft: "auto", fontFamily: "Cinzel, serif", fontSize: 13, color: "#F5A623", fontWeight: 700, letterSpacing: "0.05em" }}>19:00</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 999,
              background: "rgba(10,6,4,0.72)",
              border: "1.5px solid rgba(245,166,35,0.55)",
              boxShadow: "0 0 14px rgba(245,166,35,0.15), inset 0 0 10px rgba(0,0,0,0.4)",
            }}
          >
            <span style={{ fontFamily: "Cinzel, serif", fontSize: 16, color: "#F5A623", fontWeight: 700, textShadow: "0 0 8px rgba(245,166,35,0.6)" }}>ᚢ</span>
            <span style={{ fontFamily: "Cinzel, serif", fontSize: 13, color: "#F5F0E8", fontWeight: 700, letterSpacing: "0.05em" }}>Zindan Görevi</span>
            <span style={{ marginLeft: "auto", fontFamily: "Cinzel, serif", fontSize: 13, color: "#F5A623", fontWeight: 700, letterSpacing: "0.05em" }}>21:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}
