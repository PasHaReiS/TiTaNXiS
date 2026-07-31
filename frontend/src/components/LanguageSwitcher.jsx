import React from "react";
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "tr", flag: "🇹🇷", label: "TR" },
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "ru", flag: "🇷🇺", label: "RU" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const setLang = (code) => {
    localStorage.setItem("ol_lang", code);
    i18n.changeLanguage(code);
  };

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-background/50 px-1 py-0.5" data-testid="language-switcher">
      {LANGS.map((l) => {
        const active = i18n.language === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            data-testid={`lang-${l.code}`}
            className="w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all"
            style={{
              opacity: active ? 1 : 0.4,
              background: active ? "rgba(245,166,35,0.2)" : "transparent",
              border: active ? "1px solid rgba(245,166,35,0.6)" : "1px solid transparent",
              transform: active ? "scale(1.08)" : "scale(1)",
            }}
            title={l.label}
            aria-label={`Switch to ${l.label}`}
          >
            <span>{l.flag}</span>
          </button>
        );
      })}
    </div>
  );
}
