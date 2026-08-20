import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LogIn, User, Lock, Calendar, Swords, Castle, X } from "lucide-react";

const HERO_BANNER_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/3ec94e48802d40188393d56de578ede6_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15339.jpg";
const BRAND_LOGO_URL = "/brand/titanxis-logo.jpg";

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const nav = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { toast.error(t("login_missing_credentials")); return; }
    setLoading(true);
    try {
      const u = await login(username.trim().toLowerCase(), password);
      toast.success(t("welcome_user", { name: u.username }));
      nav(u.must_change_password ? "/profil" : "/dashboard", { replace: true });
    } catch (err) { toast.error(apiErr(err)); }
    finally { setLoading(false); }
  };

  // Küçük takvim grid'i (mevcut ay).
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Pzt=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthName = today.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }).toUpperCase();

  return (
    <div className="min-h-screen px-4 py-6" data-testid="guest-home">
      <div className="w-full max-w-md mx-auto fade-in">
        {/* Header: circular gold logo + TiTaNXiS text */}
        <div className="flex flex-col items-center mb-4" data-testid="guest-header">
          <div
            className="mb-3"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              overflow: "hidden",
              border: "2px solid #F5A623",
              boxShadow: "0 0 24px rgba(245,166,35,0.55), inset 0 0 12px rgba(212,115,10,0.35)",
              background: "#0a0a0a",
            }}
          >
            <img
              src={BRAND_LOGO_URL}
              alt="TiTaNXiS"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
          <h1
            style={{
              fontFamily: "Cinzel, serif",
              fontWeight: 800,
              fontSize: "28px",
              letterSpacing: "0.18em",
              color: "#F5A623",
              textShadow: "0 0 14px rgba(245,166,35,0.55), 0 2px 6px rgba(0,0,0,0.6)",
              margin: 0,
            }}
          >
            TiTaNXiS
          </h1>
        </div>

        {/* Hero Banner (referans görsel) */}
        <div
          data-testid="guest-hero-banner"
          className="mb-4"
          style={{
            width: "100%",
            height: 170,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(245,166,35,0.55)",
            boxShadow: "0 0 25px rgba(231,76,26,0.25), 0 4px 18px rgba(0,0,0,0.5)",
            position: "relative",
            background: "#0f0806",
          }}
        >
          <img
            src={HERO_BANNER_URL}
            alt="TiTaNXiS Hero"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        {/* Etkinlik Takvimi */}
        <div className="card-red-gold p-4 mb-4" data-testid="guest-calendar">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 18, filter: "drop-shadow(0 0 6px rgba(245,166,35,0.5))" }}>📅</span>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
              ETKİNLİK TAKVİMİ
            </div>
            <div className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">{monthName}</div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-3">
            {["Pt","Sa","Ça","Pe","Cu","Ct","Pz"].map((d) => (
              <div key={d} className="text-[9px] text-center font-bold uppercase" style={{ color: "#D4730A" }}>{d}</div>
            ))}
            {cells.map((d, i) => (
              <div key={i} className="text-[10px] text-center py-1 rounded" style={{
                background: d === today.getDate() ? "rgba(231,76,26,0.30)" : "transparent",
                color: d === today.getDate() ? "#F5F0E8" : d ? "rgba(245,240,232,0.55)" : "transparent",
                border: d === today.getDate() ? "1px solid rgba(231,76,26,0.6)" : "1px solid transparent",
                fontWeight: d === today.getDate() ? 700 : 400,
              }}>{d || "·"}</div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{
              background: "rgba(231,76,26,0.10)", border: "1px solid rgba(231,76,26,0.35)",
            }}>
              <Castle className="w-3.5 h-3.5" style={{ color: "#E74C1A" }} />
              <span className="text-[11px] font-bold" style={{ color: "#F5F0E8" }}>Kale Savaşı</span>
              <span className="ml-auto text-[10px] mono" style={{ color: "#F5A623" }}>19:00</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{
              background: "rgba(212,115,10,0.10)", border: "1px solid rgba(212,115,10,0.35)",
            }}>
              <Swords className="w-3.5 h-3.5" style={{ color: "#D4730A" }} />
              <span className="text-[11px] font-bold" style={{ color: "#F5F0E8" }}>Zindan Görevi</span>
              <span className="ml-auto text-[10px] mono" style={{ color: "#F5A623" }}>21:00</span>
            </div>
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex flex-col gap-2.5">
          <button
            data-testid="guest-login-btn"
            onClick={() => setShowLogin(true)}
            className="w-full py-3 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)",
              color: "#0a0a0a", boxShadow: "0 0 20px rgba(245,166,35,0.4)",
              fontFamily: "Cinzel, serif",
            }}
          >
            🔑 GİRİŞ YAP
          </button>
          <button
            data-testid="guest-signup-btn"
            onClick={() => nav("/signup")}
            className="w-full py-3 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2"
            style={{
              background: "rgba(15,8,6,0.85)",
              color: "#F5A623", border: "2px solid #D4730A",
              boxShadow: "inset 0 0 15px rgba(212,115,10,0.15)",
              fontFamily: "Cinzel, serif",
            }}
          >
            ⚔️ KAYIT OL
          </button>
        </div>
      </div>

      {/* Giriş formu modalı */}
      {showLogin && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          onClick={() => setShowLogin(false)}
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={submit} className="card-red-gold p-5 space-y-4 relative">
              <button type="button" onClick={() => setShowLogin(false)} className="absolute top-2 right-2 p-1 rounded hover:bg-white/10" data-testid="login-close-btn">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold uppercase tracking-widest gold-text" style={{ fontFamily: "Cinzel, serif" }}>{t("login_subtitle")}</h2>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">{t("username")}</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input data-testid="login-username" value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">{t("password")}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 text-white" />
                </div>
              </div>
              <button data-testid="login-submit" type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)", color: "#0a0a0a", fontFamily: "Cinzel, serif" }}
              >
                <LogIn className="w-4 h-4" /> {loading ? "..." : t("sign_in")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
