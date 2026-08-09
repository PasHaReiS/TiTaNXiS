import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import { WIDGETS_META } from "@/components/WidgetGrid";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "titanxis_widgets_v1";

export default function WidgetLibrary() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
    return [];
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)); } catch {}
  }, [enabled]);

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
        <p className="text-xs mb-4" style={{ color: "#F5F0E8", opacity: 0.7 }}>
          {t("wglib_intro")}
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {WIDGETS_META.map((w) => {
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
        </div>
      </div>
    </div>
  );
}
