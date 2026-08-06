import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, LogIn, LogOut, User as UserIcon, Shield, Settings, Download, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LEADERBOARD } from "@/constants/testIds";
import { api } from "@/lib/api";
import { toast } from "sonner";

const BRAND_LOGO_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/4e1d325e85084ea69c28857dabe96728_1000073434.jpg";

function MenuItem({ icon: Icon, label, onClick, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-primary/15 text-left transition-colors"
      style={{ fontFamily: "Cinzel, Rajdhani, serif", letterSpacing: "0.06em" }}
    >
      <Icon className="w-3.5 h-3.5 gold-text flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function Header({ title }) {
  const { theme, toggle } = useTheme();
  const { user, isAdmin, canEdit, logout } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const downloadXlsx = () => {
    try {
      const url = `${api.defaults.baseURL}/export/xlsx`;
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `detayli_rapor_${today}.xlsx`;
      a.click();
      toast.success(t("report_downloaded"));
    } catch (e) {
      toast.error(t("report_failed"));
    }
    setMenuOpen(false);
  };

  const goto = (path) => { nav(path); setMenuOpen(false); };

  return (
    <header
      className="px-4 pt-2 pb-1 fade-in sticky top-0 z-50"
      style={{
        background:
          "linear-gradient(180deg, rgba(15,10,10,0.96) 0%, rgba(20,12,12,0.92) 70%, rgba(20,12,12,0.85) 100%)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <img
            src={BRAND_LOGO_URL}
            alt="Brand"
            data-testid="header-brand-logo"
            className="flex-1 min-w-0 header-brand-logo"
            style={{ width: "100%", maxWidth: "100%", height: "auto", maxHeight: 120, objectFit: "contain", objectPosition: "left center", borderRadius: 6 }}
          />
        </div>

        <LanguageSwitcher />

        <button
          data-testid={LEADERBOARD.themeToggle}
          onClick={toggle}
          className="w-8 h-8 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors flex-shrink-0"
          aria-label={t("choose_language")}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5 gold-text" /> : <Moon className="w-3.5 h-3.5 red-text" />}
        </button>

        {user ? (
          <div ref={menuRef} className="relative">
            <button
              data-testid="header-profile"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1 px-1.5 h-8 rounded-full border border-border hover:border-primary transition-colors flex-shrink-0"
              title={user.username}
              aria-expanded={menuOpen}
            >
              {isAdmin ? <Shield className="w-3 h-3 gold-text" /> : <UserIcon className="w-3 h-3 text-white" />}
              <span className="text-[10px] font-bold uppercase truncate max-w-[52px]">{user.username}</span>
            </button>

            {menuOpen && ReactDOM.createPortal(
              <>
                <div
                  data-testid="header-profile-overlay"
                  onClick={() => setMenuOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 999998, background: "transparent" }}
                />
                <div
                  data-testid="header-profile-dropdown"
                  style={{
                    position: "fixed",
                    top: "60px",
                    right: "8px",
                    zIndex: 999999,
                    minWidth: 220,
                    background: "#1E1410",
                    border: "1px solid #E74C1A",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.95)",
                    borderRadius: 8,
                    overflow: "visible",
                  }}
                >
                  <MenuItem
                    icon={UserIcon}
                    label={t("my_profile")}
                    onClick={() => goto("/profil")}
                    testId="dropdown-profile"
                  />
                  {isAdmin && (
                    <MenuItem
                      icon={Settings}
                      label={t("user_mgmt")}
                      onClick={() => goto("/kullanicilar")}
                      testId="dropdown-users"
                    />
                  )}
                  <MenuItem
                    icon={KeyRound}
                    label={t("change_password_title")}
                    onClick={() => goto("/profil")}
                    testId="dropdown-password"
                  />
                  {isAdmin && (
                    <MenuItem
                      icon={Download}
                      label={t("detailed_report")}
                      onClick={downloadXlsx}
                      testId="dropdown-export"
                    />
                  )}
                  <div style={{ height: 1, background: "rgba(231,76,26,0.3)" }} />
                  <MenuItem
                    icon={LogOut}
                    label={t("logout")}
                    onClick={() => {
                      logout();
                      nav("/");
                      toast.success(t("logout_done"));
                      setMenuOpen(false);
                    }}
                    testId="dropdown-logout"
                  />
                </div>
              </>,
              document.body
            )}
          </div>
        ) : (
          loc.pathname !== "/login" && (
            <button
              data-testid="header-login-btn"
              onClick={() => nav("/login")}
              className="flex items-center gap-1 px-2 h-8 rounded-full red-gold-gradient text-white text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
            >
              <LogIn className="w-3 h-3" /> {t("login")}
            </button>
          )
        )}
      </div>

      {user && (
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {isAdmin && <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">{t("admin").toUpperCase()}</span>}
          {!isAdmin && canEdit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">{t("can_edit_badge").toUpperCase()}</span>}
          {!isAdmin && !canEdit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">{t("view_only").toUpperCase()}</span>}
        </div>
      )}

      <div className="relative flex items-center justify-center" style={{ marginTop: title ? 8 : 2, marginBottom: title ? 6 : 0, minHeight: title ? 32 : 0 }}>
        <div className="divider-glow absolute left-0 right-0" style={{ top: "50%", transform: "translateY(-50%)" }} />
        {title && (
          <h2
            data-testid="page-header-title"
            className="text-xl font-bold uppercase tracking-wider whitespace-nowrap relative"
            style={{
              zIndex: 2,
              padding: "3px 18px",
              background:
                "linear-gradient(180deg, rgba(30,15,10,0.96) 0%, rgba(20,10,8,0.98) 50%, rgba(30,15,10,0.96) 100%)",
              border: "1px solid rgba(231,76,26,0.55)",
              borderRadius: 6,
              boxShadow:
                "0 0 12px rgba(231,76,26,0.35), inset 0 1px 0 rgba(255,200,120,0.15)",
              fontFamily: "'Cinzel', 'Rajdhani', serif",
              letterSpacing: "0.14em",
              color: "#F5A623",
              WebkitTextFillColor: "#F5A623",
              WebkitBackgroundClip: "border-box",
              backgroundClip: "border-box",
              textShadow: "0 0 8px rgba(231,76,26,0.55), 0 1px 0 rgba(0,0,0,0.6)",
            }}
          >
            {title}
          </h2>
        )}
      </div>
    </header>
  );
}
