import React, { useState, useEffect } from "react";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import axios from "axios";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LogIn, User, Lock, X, KeyRound, UserPlus, Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const HERO_BANNER_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/3ec94e48802d40188393d56de578ede6_8c7af15c-9c2e-40cf-9dbb-0cc91f601ffe-1_all_15339.jpg";
const BRAND_LOGO_URL = "/brand/titanxis-logo.jpg";
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Login() {
  const { user, login, loginAsGuest, isGuest, adoptSession } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  // v140.34 — Kayıt Ol modal state
  const [showRegister, setShowRegister] = useState(false);
  const [regInviteCode, setRegInviteCode] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  // v140.35 — Telegram /davet linki: /kayit?davet=CODE veya /login?davet=CODE
  // → register modal'ı otomatik aç ve kodu ön-doldur. Query'yi silmek için
  // URL'i temizle (kullanıcı geri gitse aynı davranış tekrarlanmasın).
  useEffect(() => {
    if (user) return;
    const params = new URLSearchParams(location.search);
    const code = (params.get("davet") || params.get("code") || "").trim().toUpperCase();
    if (code) {
      setRegInviteCode(code);
      setShowRegister(true);
      // URL'den kodu temizle — modal state artık kodu tutuyor.
      const cleanPath = location.pathname === "/kayit" ? "/login" : location.pathname;
      window.history.replaceState({}, "", cleanPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user) return <Navigate to="/" replace />;

  const enterAsGuest = () => {
    loginAsGuest();
    toast.success(t("guest_login_hint", "Sadece Sıralama ekranını görüntüle"));
    nav("/", { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { toast.error(t("login_missing_credentials")); return; }
    setLoading(true);
    try {
      const u = await login(username.trim().toLowerCase(), password);
      toast.success(t("welcome_user", { name: u.username }));
      nav(u.must_change_password ? "/profil" : "/anasayfa", { replace: true });
    } catch (err) { toast.error(apiErr(err)); }
    finally { setLoading(false); }
  };

  // v140.34 — Davet kodlu kayıt akışı
  const submitRegister = async (e) => {
    e.preventDefault();
    const code = regInviteCode.trim().toUpperCase();
    const uname = regUsername.trim().toLowerCase();
    if (!code) {
      toast.error(t("register_missing_code", "Davet kodu zorunlu"));
      return;
    }
    if (!uname || uname.length < 3) {
      toast.error(t("register_username_short", "Kullanıcı adı en az 3 karakter olmalı"));
      return;
    }
    if (regPassword.length < 6) {
      toast.error(t("register_password_short", "Şifre en az 6 karakter olmalı"));
      return;
    }
    setRegBusy(true);
    try {
      const { data } = await axios.post(`${API}/auth/register`, {
        invite_code: code,
        username: uname,
        password: regPassword,
        terms_accepted_at: new Date().toISOString(),
      });
      adoptSession(data.token, data.user);
      toast.success(t("register_welcome", "Hoşgeldin {{name}}!", { name: data.user.username }));
      setShowRegister(false);
      nav("/anasayfa", { replace: true });
    } catch (err) {
      // Backend has friendly Turkish messages; also handle 400 with fallback.
      const detail = err?.response?.data?.detail;
      const friendly = detail || t("register_invalid_code", "Davet kodunuz geçersiz veya kullanılmış. Yönetici ile iletişime geçin.");
      toast.error(friendly);
    } finally {
      setRegBusy(false);
    }
  };

  // Küçük takvim grid'i (mevcut ay — Ağustos 2026 vb.)
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Pzt=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthName = today.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }).toUpperCase();

  return (
    <div className="min-h-screen px-4 py-5" data-testid="guest-home" style={{ background: "transparent" }}>
      <div className="w-full max-w-md mx-auto" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

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

        {/* Row 3 — "ETKİNLİK TAKVİMİ" başlığı v132.5'te kaldırıldı; takvim doğrudan hero banner'ın altında gösterilir. */}

        {/* Row 4 — Gerçek interaktif takvim (dekoratif taş ikon v132.4'te kaldırıldı) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }} data-testid="guest-calendar-block">
          {/* Gerçek interaktif takvim */}
          <div
            data-testid="guest-real-calendar"
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
              data-testid="guest-real-calendar-month"
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

        {/* v136 — Ziyaretçi Girişi. Sadece Sıralama'ya erişim verir; diğer
            korumalı sayfalar kilit ekranı gösterir. */}
        <button
          data-testid="guest-enter-btn"
          onClick={enterAsGuest}
          style={{
            width: "100%",
            padding: "12px 20px",
            borderRadius: 10,
            border: "1.5px solid rgba(148,163,184,0.55)",
            background: "rgba(15,10,16,0.72)",
            color: "#E5E7EB",
            fontFamily: "Cinzel, serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
            cursor: "pointer",
            marginTop: -4,
          }}
        >
          {t("guest_login_btn", "🎭 Ziyaretçi Olarak Gir")}
        </button>

        {/* v140.34 — Kayıt Ol (Davet Kodu ile) — Ziyaretçi butonunun altında */}
        <button
          data-testid="guest-register-btn"
          onClick={() => setShowRegister(true)}
          style={{
            width: "100%",
            padding: "12px 20px",
            borderRadius: 10,
            border: "1.5px solid rgba(245,166,35,0.65)",
            background: "rgba(20,12,8,0.75)",
            color: "#F5A623",
            fontFamily: "Cinzel, serif",
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            boxShadow: "0 4px 12px rgba(0,0,0,0.45), inset 0 0 12px rgba(245,166,35,0.10)",
            cursor: "pointer",
            marginTop: -4,
          }}
        >
          🔑 {t("register_btn", "Davet Kodu ile Kayıt Ol")}
        </button>

        {isGuest && (
          <div
            data-testid="guest-mode-indicator"
            className="text-[10px] text-center"
            style={{ color: "#94A3B8", marginTop: -6 }}
          >
            {t("guest_login_hint", "Sadece Sıralama ekranını görüntüle")}
          </div>
        )}
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

      {/* v140.34 — Davet Kodlu Kayıt Modalı */}
      {showRegister && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          onClick={() => setShowRegister(false)}
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          data-testid="register-modal"
        >
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={submitRegister} className="card-red-gold p-5 space-y-4 relative">
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className="absolute top-2 right-2 p-1 rounded hover:bg-white/10"
                data-testid="register-close-btn"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="text-center mb-2">
                <div
                  className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-2"
                  style={{ background: "linear-gradient(135deg, #F5A623, #E74C1A)" }}
                >
                  <UserPlus className="w-7 h-7 text-black" />
                </div>
                <h2
                  className="text-lg font-bold uppercase tracking-widest gold-text"
                  style={{ fontFamily: "Cinzel, serif" }}
                >
                  {t("register_title", "Davet Kodu ile Kayıt")}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t("register_hint", "Yönetici tarafından verilen 8 haneli kodu gir.")}
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                  {t("register_code_label", "Davet Kodu")}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    data-testid="register-invite-code"
                    value={regInviteCode}
                    onChange={(e) => setRegInviteCode(e.target.value.toUpperCase())}
                    maxLength={16}
                    required
                    placeholder="XXXXXXXX"
                    className="w-full bg-black/40 border border-amber-500/40 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 text-white font-mono tracking-widest"
                    style={{ letterSpacing: "0.18em" }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                  {t("username")}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    data-testid="register-username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    minLength={3}
                    maxLength={32}
                    required
                    placeholder={t("register_username_placeholder", "3-32 karakter")}
                    className="w-full bg-black/40 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                  {t("password")}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    data-testid="register-password"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    minLength={6}
                    required
                    placeholder={t("register_password_placeholder", "En az 6 karakter")}
                    className="w-full bg-black/40 border border-white/10 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 text-white"
                  />
                </div>
              </div>

              <button
                data-testid="register-submit"
                type="submit"
                disabled={regBusy}
                className="w-full py-2.5 rounded-lg font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #F5A623 0%, #D4730A 50%, #E74C1A 100%)",
                  color: "#0a0a0a",
                  fontFamily: "Cinzel, serif",
                }}
              >
                {regBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {regBusy ? t("register_busy", "Kayıt yapılıyor…") : t("register_submit", "Kayıt Ol")}
              </button>

              <button
                type="button"
                onClick={() => { setShowRegister(false); setShowLogin(true); }}
                className="w-full text-center text-[10px] text-muted-foreground hover:gold-text uppercase tracking-widest"
                data-testid="register-goto-login"
              >
                {t("register_have_account", "Hesabın var mı? Giriş yap")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
