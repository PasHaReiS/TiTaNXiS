import React, { useEffect, useState, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { clearTranslationCache } from "@/lib/deeplTranslate";
import { toast } from "sonner";

// Admin-only icon button that:
//   1. Reveals live DeepL quota + plan (free/pro) via the corner dot + tooltip.
//   2. Fires a one-shot warning toast the moment usage crosses 90%.
//   3. Persists a `plan` pill and a `days-to-reset` counter on the tooltip so
//      admins can see how long until their Free-tier quota rolls over.
//   4. Clears the local translation cache when tapped.
export default function DeeplUsageBadge() {
  const { isAdmin } = useAuth();
  const { i18n: i18nRef, t } = useTranslation();
  const [usage, setUsage] = useState(null);
  const alarmFired = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const fetchUsage = () => {
      api.get("/translate/usage")
        .then((r) => { if (!cancelled) setUsage(r.data); })
        .catch(() => { if (!cancelled) setUsage({ configured: false }); });
    };
    fetchUsage();
    const id = setInterval(fetchUsage, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isAdmin]);

  const used = Number(usage?.character_count) || 0;
  const limit = Number(usage?.character_limit) || 0;
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const plan = usage?.plan || "free";
  const daysToReset = Number.isFinite(usage?.days_to_reset) ? usage.days_to_reset : null;

  useEffect(() => {
    if (!usage?.configured || alarmFired.current) return;
    if (pct >= 90) {
      alarmFired.current = true;
      toast.warning(t("deepl_quota_90", { pct: Math.round(pct), used: used.toLocaleString(), limit: limit.toLocaleString() }), { duration: 8000 });
    }
  }, [pct, usage?.configured, used, limit, t]);

  if (!isAdmin || !usage || !usage.configured) return null;
  if (usage.error) return null;

  const critical = pct >= 90;
  const warn = pct >= 70;
  const dotColor = critical ? "#f87171" : warn ? "#F5A623" : "#22C55E";
  const borderColor = critical ? "#f87171" : warn ? "#F5A623" : "rgba(139,92,246,0.5)";
  const iconColor = critical ? "#f87171" : warn ? "#F5A623" : "#C4B5FD";
  const planBg = plan === "pro" ? "linear-gradient(135deg,#F5A623,#E74C1A)" : "linear-gradient(135deg,#6366F1,#8B5CF6)";

  const clearCache = (e) => {
    e.stopPropagation();
    if (!window.confirm(t("deepl_clear_confirm"))) return;
    clearTranslationCache();
    const lang = i18nRef.language;
    i18nRef.changeLanguage("tr");
    setTimeout(() => i18nRef.changeLanguage(lang), 50);
    toast.success(t("deepl_cache_cleared"));
  };

  const resetLine = daysToReset != null ? ` · ${t("deepl_reset_in", { days: daysToReset })}` : "";
  const tooltip = `${t("deepl_cache_clear")} · DeepL ${plan.toUpperCase()} %${Math.round(pct)} (${used.toLocaleString()}/${limit.toLocaleString()})${resetLine}`;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0" data-testid="deepl-usage-wrap">
      <span
        data-testid="deepl-plan-pill"
        title={tooltip}
        className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
        style={{
          background: planBg,
          color: "#fff",
          letterSpacing: "0.10em",
          boxShadow: `0 0 8px ${plan === "pro" ? "rgba(245,166,35,0.35)" : "rgba(139,92,246,0.35)"}`,
        }}
      >
        {plan}
        {daysToReset != null && (
          <span className="ml-1 opacity-90 font-semibold" data-testid="deepl-reset-days">
            · {daysToReset}g
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={clearCache}
        data-testid="deepl-clear-cache"
        title={tooltip}
        aria-label={t("deepl_cache_clear")}
        className="relative flex items-center justify-center h-8 w-8 rounded-full border flex-shrink-0 transition-opacity hover:opacity-80"
        style={{
          background: "rgba(26,26,26,0.9)",
          borderColor,
          color: iconColor,
        }}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span
          data-testid="deepl-quota-dot"
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            top: 2,
            right: 2,
            width: 7,
            height: 7,
            background: dotColor,
            border: "1.5px solid rgba(15,10,10,0.95)",
            boxShadow: `0 0 4px ${dotColor}`,
          }}
        />
      </button>
    </div>
  );
}
