import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const HERO_BANNER_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/3ec94e48802d40188393d56de578ede6_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15339.jpg";
const STONE_CALENDAR_URL = "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/82de5ccf97bf5aa0573e1f3842df81872f0621de875297b34b0fcbd8f5facd62.jpeg";

function MenuTile({ emoji, label, sub, locked, onClick, testId }) {
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
      <span
        style={{
          fontSize: 48,
          lineHeight: 1,
          filter: "drop-shadow(2px 4px 8px rgba(0,0,0,0.9)) drop-shadow(0px 2px 4px rgba(249,115,22,0.4))",
          opacity: locked ? 0.65 : 1,
        }}
      >
        {emoji}
      </span>
      {locked && (
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 10,
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

export default function MemberHome() {
  const { user } = useAuth();
  const nav = useNavigate();

  // Küçük takvim grid'i (mevcut ay)
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Pzt=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthName = today.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }).toUpperCase();

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
          <MenuTile emoji="⚡" label="SIRALAMA" onClick={() => nav("/")} testId="menu-siralama" />
          <MenuTile emoji="📜" label="LOJ HAKKINDA" onClick={() => nav("/komutanlar")} testId="menu-loj" />
          <MenuTile emoji="⚖️" label="PUAN HESAPLA" onClick={() => nav("/puan-hesaplama")} testId="menu-hesapla" />
          <MenuTile emoji="🗡️" label="ETKİNLİKLER" onClick={() => nav("/etkinlikler")} testId="menu-etkinlikler" />
          <MenuTile emoji="📊" label="RAPORLAR" locked onClick={lockedToast} testId="menu-raporlar" />
          <MenuTile emoji="🛡️" label="ÜYELER" sub="Salt Görüntüleme" locked onClick={() => nav("/uyeler")} testId="menu-uyeler" />
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
                return (
                  <div
                    key={i}
                    style={{
                      textAlign: "center",
                      padding: "5px 0",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: isToday ? 800 : 400,
                      background: isToday ? "rgba(231,76,26,0.32)" : "transparent",
                      color: isToday ? "#F5F0E8" : d ? "rgba(245,240,232,0.55)" : "transparent",
                      border: isToday ? "1px solid rgba(231,76,26,0.6)" : "1px solid transparent",
                    }}
                  >
                    {d || "·"}
                  </div>
                );
              })}
            </div>
          </div>
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
