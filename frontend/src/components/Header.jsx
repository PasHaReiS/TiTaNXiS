import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { Sun, Moon, Trophy } from "lucide-react";
import { LEADERBOARD } from "@/constants/testIds";

export default function Header({ title = "Oyun Loncası", subtitle }) {
  const { theme, toggle } = useTheme();
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
          className="w-9 h-9 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors"
          aria-label="Tema değiştir"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 gold-text" /> : <Moon className="w-4 h-4 red-text" />}
        </button>
      </div>
      <div className="divider-glow mt-4" />
    </header>
  );
}
