import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, LogIn, LogOut, User as UserIcon, Shield, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LEADERBOARD } from "@/constants/testIds";

const BRAND_LOGO_URL = "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/c07b4fb61b36495797d713aa97cdd08f_1000073363.jpg";

export default function Header({ subtitle }) {
  const { theme, toggle } = useTheme();
  const { user, isAdmin, canEdit } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <header className="px-4 pt-5 pb-3 fade-in">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <img
            src={BRAND_LOGO_URL}
            alt="Brand"
            data-testid="header-brand-logo"
            className="flex-shrink-0 rounded-md"
            style={{ height: 42, width: "auto", maxWidth: 140, objectFit: "contain" }}
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
          <>
            {isAdmin && loc.pathname !== "/kullanicilar" && (
              <button
                data-testid="header-settings-btn"
                onClick={() => nav("/kullanicilar")}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors flex-shrink-0"
                aria-label={t("user_mgmt")}
                title={t("user_mgmt")}
              >
                <Settings className="w-3.5 h-3.5 gold-text" />
              </button>
            )}
            <button
              data-testid="header-profile"
              onClick={() => nav("/profil")}
              className="flex items-center gap-1 px-1.5 h-8 rounded-full border border-border hover:border-primary transition-colors flex-shrink-0"
              title={user.username}
            >
              {isAdmin ? <Shield className="w-3 h-3 gold-text" /> : <UserIcon className="w-3 h-3 text-white" />}
              <span className="text-[10px] font-bold uppercase truncate max-w-[52px]">{user.username}</span>
            </button>
          </>
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
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {isAdmin && <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">{t("admin").toUpperCase()}</span>}
          {!isAdmin && canEdit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">{t("can_edit_badge").toUpperCase()}</span>}
          {!isAdmin && !canEdit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">{t("view_only").toUpperCase()}</span>}
        </div>
      )}

      <div className="divider-glow mt-3" />
    </header>
  );
}
