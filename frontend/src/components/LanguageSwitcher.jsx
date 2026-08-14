import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Globe, ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { LANGUAGES } from "@/i18n";
import { ensureLanguageTranslated } from "@/lib/deeplTranslate";
import { api } from "@/lib/api";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [switching, setSwitching] = useState(null); // code being switched to
  const [query, setQuery] = useState("");
  const btnRef = useRef(null);

  const active = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    if (!open) setQuery("");
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    const onScroll = (e) => {
      // Only close on page scroll — ignore scrolls inside the language panel itself.
      const panel = document.querySelector('[data-testid="lang-panel"]');
      if (panel && e.target && panel.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.label.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [query]);

  const setLang = async (code) => {
    if (code === i18n.language) { setOpen(false); return; }
    localStorage.setItem("ol_lang", code);
    // Switch immediately so the UI reflects the user's choice — whatever keys
    // already exist show through, missing ones fall back to TR while DeepL
    // hydrates the rest in the background.
    await i18n.changeLanguage(code);
    setOpen(false);
    const label = LANGUAGES.find((l) => l.code === code)?.name || code;
    const tid = toast.loading(t("lang_switching", { name: label }));
    setSwitching(code);
    try {
      const added = await ensureLanguageTranslated(code);
      if (added > 0) {
        toast.success(t("lang_switched", { name: label, count: added }), { id: tid });
      } else {
        toast.success(t("lang_switched_cached", { name: label }), { id: tid });
      }
    } catch {
      toast.dismiss(tid);
    } finally {
      setSwitching(null);
    }
  };

  // Hydrate cached translations for the initially selected language on mount.
  useEffect(() => {
    ensureLanguageTranslated(i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="lang-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("choose_language")}
        className="flex items-center gap-1 h-8 px-2 rounded-full border transition-colors flex-shrink-0"
        style={{
          background: "rgba(26,26,26,0.9)",
          borderColor: open ? "rgba(245,166,35,0.7)" : "rgba(220,38,38,0.5)",
        }}
      >
        <span className="text-sm leading-none">{active.flag}</span>
        <span className="text-[10px] font-bold tracking-wider gold-text">{active.label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && createPortal(
        <>
          {/* Full-screen click-catcher overlay closes the panel */}
          <div
            onClick={() => setOpen(false)}
            data-testid="lang-panel-overlay"
            style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(0,0,0,0.35)" }}
          />
          <div
            role="listbox"
            data-testid="lang-panel"
            className="fade-in"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              width: 220,
              zIndex: 999999,
              background: "linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)",
              border: "1px solid rgba(220,38,38,0.6)",
              borderRadius: 10,
              boxShadow: "0 12px 30px rgba(0,0,0,0.55), 0 0 20px rgba(220,38,38,0.15)",
              display: "flex",
              flexDirection: "column",
              overflow: "visible",
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
            <div
              className="px-2 py-1.5"
              style={{ borderBottom: "1px solid rgba(220,38,38,0.25)", background: "rgba(0,0,0,0.25)" }}
            >
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded"
                style={{ background: "rgba(20,12,10,0.9)", border: "1px solid rgba(245,166,35,0.35)" }}
              >
                <Search className="w-3 h-3" style={{ color: "#F5A623" }} />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("search")}
                  data-testid="lang-search"
                  className="flex-1 bg-transparent outline-none text-xs"
                  style={{ color: "#F5F0E8" }}
                />
              </div>
            </div>
            <ul
              className="py-1 lang-scroll"
              data-testid="lang-list"
              style={{
                maxHeight: 220,
                overflowY: "scroll",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
                display: "block",
              }}
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {filtered.length === 0 && (
                <li
                  data-testid="lang-empty"
                  className="px-3 py-2 text-xs text-center text-muted-foreground"
                >
                  —
                </li>
              )}
              {filtered.map((l) => {
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
                      {switching === l.code ? (
                        <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" style={{ color: "#F5A623" }} />
                      ) : isActive ? (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F5A623" }} />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
