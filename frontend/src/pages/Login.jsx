import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LogIn, User, Lock, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const HERO_BANNER_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/3ec94e48802d40188393d56de578ede6_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15339.jpg";
const STONE_CALENDAR_URL = "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/82de5ccf97bf5aa0573e1f3842df81872f0621de875297b34b0fcbd8f5facd62.jpeg";
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

  return (
    <div className="min-h-screen px-4 py-5" data-testid="guest-home" style={{ background: "transparent" }}>
      <div className="w-full max-w-md mx-auto fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Row 1 — Header cleaned: only language switcher top-right */}
        <div style={{ position: "relative", height: 40 }} data-testid="guest-header">
          <div style={{ position: "absolute", top: 0, right: 0 }}>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Row 2 — Hero banner (no border, no card) */}
        <img
          src={HERO_BANNER_URL}
          alt="TiTaNXiS Hero"
          data-testid="guest-hero-banner"
          style={{
            width: "100%",
            height: 160,
            objectFit: "cover",
            display: "block",
            borderRadius: 6,
            border: "none",
            boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
          }}
        />

        {/* Row 3 — "ETKİNLİK TAKVİMİ" large gold title, centered */}
        <div
          data-testid="guest-calendar-title"
          style={{
            textAlign: "center",
            fontFamily: "Cinzel, serif",
            fontWeight: 800,
            fontSize: "22px",
            letterSpacing: "0.22em",
            color: "#F5A623",
            textShadow: "0 0 16px rgba(245,166,35,0.55), 0 2px 6px rgba(0,0,0,0.75)",
            marginTop: 4,
          }}
        >
          ETKİNLİK TAKVİMİ
        </div>

        {/* Row 4 — 3D Stone Calendar image (darken blend hides white/checker JPEG bg) */}
        <div style={{ width: "100%", background: "transparent", display: "flex", justifyContent: "center", isolation: "isolate" }}>
          <img
            src={STONE_CALENDAR_URL}
            alt="Etkinlik Takvimi"
            data-testid="guest-stone-calendar"
            style={{
              width: "100%",
              maxHeight: 280,
              objectFit: "contain",
              display: "block",
              background: "transparent",
              border: "none",
              mixBlendMode: "darken",
            }}
          />
        </div>

        {/* Row 5 — Event pills (no card wrapper) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="guest-event-pills">
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

        {/* Row 6 — Login button (amber gradient) */}
        <button
          data-testid="guest-login-btn"
          onClick={() => setShowLogin(true)}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)",
            color: "#0a0a0a",
            fontFamily: "Cinzel, serif",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            boxShadow: "0 0 24px rgba(245,166,35,0.5), 0 6px 14px rgba(0,0,0,0.55)",
            cursor: "pointer",
          }}
        >
          🔑 GİRİŞ YAP
        </button>

        {/* Row 7 — Signup button (dark, amber border) */}
        <button
          data-testid="guest-signup-btn"
          onClick={() => nav("/signup")}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 10,
            background: "rgba(10,6,4,0.85)",
            color: "#F5A623",
            border: "2px solid #D4730A",
            fontFamily: "Cinzel, serif",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            boxShadow: "inset 0 0 16px rgba(212,115,10,0.18), 0 6px 14px rgba(0,0,0,0.55)",
            cursor: "pointer",
          }}
        >
          ⚔️ KAYIT OL
        </button>
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
