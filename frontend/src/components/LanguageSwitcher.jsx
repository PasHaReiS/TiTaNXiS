import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe, ChevronDown } from "lucide-react";
import { LANGUAGES } from "@/i18n";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const active = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const setLang = (code) => {
    localStorage.setItem("ol_lang", code);
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-shrink-0" style={{ zIndex: 60 }} data-testid="language-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="lang-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("choose_language")}
        className="flex items-center gap-1 h-8 px-2 rounded-full border transition-colors"
        style={{
          background: "rgba(26,26,26,0.9)",
          borderColor: open ? "rgba(245,166,35,0.7)" : "rgba(220,38,38,0.5)",
        }}
      >
        <span className="text-sm leading-none">{active.flag}</span>
        <span className="text-[10px] font-bold tracking-wider gold-text">{active.label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="lang-panel"
          className="absolute right-0 top-[calc(100%+6px)] z-50 fade-in overflow-hidden"
          style={{
            width: 200,
            background: "linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)",
            border: "1px solid rgba(220,38,38,0.6)",
            borderRadius: 10,
            boxShadow: "0 12px 30px rgba(0,0,0,0.55), 0 0 20px rgba(220,38,38,0.15)",
          }}
        >
          <div
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest font-bold"
            style={{
              color: "#F5A623",
              borderBottom: "1px solid rgba(220,38,38,0.35)",
              background: "rgba(220,38,38,0.08)",
            }}
          >
            <Globe className="w-3 h-3" />
            {t("choose_language")}
          </div>
          <ul className="py-1 max-h-72 overflow-y-auto">
            {LANGUAGES.map((l) => {
              const isActive = l.code === i18n.language;
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => setLang(l.code)}
                    data-testid={`lang-${l.code}`}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    style={{
                      background: isActive ? "rgba(245,166,35,0.12)" : "transparent",
                      borderLeft: isActive ? "3px solid #F5A623" : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(220,38,38,0.10)"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span className="text-lg leading-none flex-shrink-0">{l.flag}</span>
                    <span
                      className="flex-1 text-sm font-semibold truncate"
                      style={{ color: isActive ? "#F5A623" : "#fff" }}
                    >
                      {l.name}
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-muted-foreground">{l.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F5A623" }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
