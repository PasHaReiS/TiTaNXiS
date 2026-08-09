import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import { WIDGETS_META } from "@/components/WidgetGrid";
import { Plus, Check, Search, X } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "titanxis_widgets_v1";

// Category grouping (soft) — used only for filtering chips
const CATEGORIES = [
  { key: "all", labelKey: "wglib_cat_all", match: () => true },
  { key: "guild", labelKey: "wglib_cat_guild", keys: ["top_member","active_events","total_power","member_count","alliance_snapshot","alliance_top3","alliance_duel"] },
  { key: "personal", labelKey: "wglib_cat_personal", keys: ["personal_points","personal_rank","personal_progress"] },
  { key: "event", labelKey: "wglib_cat_event", keys: ["rally_countdown","todays_event"] },
];

export default function WidgetLibrary() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
    return [];
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)); } catch {}
  }, [enabled]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGETS_META.filter((w) => {
      // Category filter
      const cat = CATEGORIES.find((c) => c.key === category);
      if (cat && cat.keys && !cat.keys.includes(w.key)) return false;
      if (!q) return true;
      const label = (t(w.labelKey) || "").toLowerCase();
      const desc = (t(w.descKey || "") || "").toLowerCase();
      return label.includes(q) || desc.includes(q) || w.key.toLowerCase().includes(q);
    });
  }, [query, category, t]);

  const toggle = (key) => {
    if (enabled.includes(key)) {
      setEnabled(enabled.filter((k) => k !== key));
      toast.success(t("wglib_removed"));
    } else {
      setEnabled([...enabled, key]);
      toast.success(t("wglib_added"));
    }
  };

  return (
    <div data-testid="widget-library-page">
      <Header title={t("wglib_title")} />
      <div className="px-4 pb-6">
        <p className="text-xs mb-3" style={{ color: "#F5F0E8", opacity: 0.7 }}>
          {t("wglib_intro")}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#F5A623", opacity: 0.7 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="wglib-search"
              placeholder={t("wglib_search_placeholder")}
              className="w-full pl-8 pr-8 py-2 rounded-lg text-sm"
              style={{ background: "#1A1210", border: "1px solid rgba(231,76,26,0.3)", color: "#F5F0E8" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                data-testid="wglib-search-clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
                style={{ color: "#F5F0E8" }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex gap-1 flex-wrap" data-testid="wglib-category-strip">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                data-testid={`wglib-cat-${c.key}`}
                aria-pressed={category === c.key}
                className="px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase"
                style={{
                  background: category === c.key ? "linear-gradient(135deg,#D4730A,#E74C1A)" : "rgba(30,20,16,0.6)",
                  border: `1px solid ${category === c.key ? "#F5A623" : "rgba(255,255,255,0.15)"}`,
                  color: category === c.key ? "#0B0704" : "#F5F0E8",
                  letterSpacing: "0.06em",
                }}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[10px] mb-2 opacity-60" style={{ color: "#F5F0E8" }} data-testid="wglib-result-count">
          {visible.length} / {WIDGETS_META.length} {t("wglib_results")}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {visible.map((w) => {
            const Icon = w.icon;
            const on = enabled.includes(w.key);
            return (
              <div
                key={w.key}
                data-testid={`wglib-card-${w.key}`}
                className="relative rounded-xl p-4 transition-transform hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, rgba(30,20,16,0.95), rgba(18,12,10,0.95))",
                  border: `1px solid ${w.color}66`,
                  boxShadow: `0 4px 18px rgba(0,0,0,0.5), inset 0 0 18px ${w.color}18`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: 40, height: 40, background: `${w.color}22`, border: `1px solid ${w.color}80` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: w.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold uppercase" style={{ color: w.color, fontFamily: "Cinzel, serif", letterSpacing: "0.08em" }}>
                      {t(w.labelKey)}
                    </div>
                    {on && (
                      <div className="text-[9px] uppercase mt-0.5 inline-flex items-center gap-0.5" style={{ color: "#4ADE80" }}>
                        <Check className="w-2.5 h-2.5" /> {t("wglib_active")}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[11px] mb-3 min-h-[42px]" style={{ color: "#F5F0E8", opacity: 0.75 }}>
                  {t(w.descKey || w.labelKey + "_desc") || ""}
                </p>
                <button
                  type="button"
                  onClick={() => toggle(w.key)}
                  data-testid={`wglib-toggle-${w.key}`}
                  className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                  style={{
                    background: on ? "rgba(20,12,10,0.6)" : `linear-gradient(135deg,${w.color},${w.color}CC)`,
                    color: on ? "#F5F0E8" : "#0B0704",
                    border: on ? `1px solid ${w.color}55` : "none",
                  }}
                >
                  {on ? t("wglib_remove") : <><Plus className="w-3 h-3" /> {t("wglib_add")}</>}
                </button>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="col-span-full text-center p-6 rounded-lg" data-testid="wglib-empty"
              style={{ background: "rgba(20,12,10,0.5)", border: "1px dashed rgba(255,255,255,0.15)", color: "#F5F0E8", opacity: 0.6 }}>
              {t("wglib_no_match")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
