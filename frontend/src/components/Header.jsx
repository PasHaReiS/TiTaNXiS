import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, Trophy, LogIn, LogOut, User as UserIcon, Shield, Settings } from "lucide-react";
import { LEADERBOARD } from "@/constants/testIds";

export default function Header({ title = "Oyun Loncası", subtitle }) {
  const { theme, toggle } = useTheme();
  const { user, isAdmin, canEdit } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <header className="px-4 pt-5 pb-3 fade-in">
      <div className="flex items-center gap-3">
        <div className="tr-flag" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 gold-text" />
            <h1 className="text-lg font-bold uppercase tracking-wider" style={{ fontFamily: "Rajdhani" }}>
              <span className="red-text">OYUN</span> <span className="gold-text">LONCASI</span>
            </h1>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>

        <button
          data-testid={LEADERBOARD.themeToggle}
          onClick={toggle}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors flex-shrink-0"
          aria-label="Tema değiştir"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 gold-text" /> : <Moon className="w-4 h-4 red-text" />}
        </button>

        {user ? (
          <>
            {isAdmin && loc.pathname !== "/kullanicilar" && (
              <button
                data-testid="header-settings-btn"
                onClick={() => nav("/kullanicilar")}
                className="w-9 h-9 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors flex-shrink-0"
                aria-label="Kullanıcı yönetimi"
                title="Kullanıcı yönetimi"
              >
                <Settings className="w-4 h-4 gold-text" />
              </button>
            )}
            <button
              data-testid="header-profile"
              onClick={() => nav("/profil")}
              className="flex items-center gap-1.5 px-2 h-9 rounded-full border border-border hover:border-primary transition-colors flex-shrink-0"
              title={user.username}
            >
              {isAdmin ? <Shield className="w-3.5 h-3.5 gold-text" /> : <UserIcon className="w-3.5 h-3.5 text-white" />}
              <span className="text-xs font-bold uppercase truncate max-w-[64px]">{user.username}</span>
            </button>
          </>
        ) : (
          loc.pathname !== "/login" && (
            <button
              data-testid="header-login-btn"
              onClick={() => nav("/login")}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full red-gold-gradient text-white text-xs font-bold uppercase tracking-wider flex-shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" /> Giriş
            </button>
          )
        )}
      </div>

      {user && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {isAdmin && <span className="text-[9px] px-1.5 py-0.5 rounded gold-gradient font-bold">ADMIN</span>}
          {!isAdmin && canEdit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/25 text-green-300 border border-green-500/40 font-bold">DÜZENLEYEBİLİR</span>}
          {!isAdmin && !canEdit && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">SALT-GÖRÜNTÜLE</span>}
        </div>
      )}

      <div className="divider-glow mt-3" />
    </header>
  );
}
