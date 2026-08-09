import React, { useEffect, useState, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { clearTranslationCache } from "@/lib/deeplTranslate";
import { toast } from "sonner";

// Admin-only icon button to bust the DeepL translation cache.
// Also polls DeepL usage in the background to fire a one-shot quota alarm.
// A tiny colored dot in the corner reflects the current quota status
// (green / amber / red) so admins notice load without opening the tooltip.
export default function DeeplUsageBadge() {
  const { isAdmin } = useAuth();
  const { i18n: i18nRef } = useTranslation();
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

  useEffect(() => {
    if (!usage?.configured || alarmFired.current) return;
    if (pct >= 90) {
      alarmFired.current = true;
      toast.warning(
        `DeepL kotası %${Math.round(pct)} kullanıldı (${used.toLocaleString()}/${limit.toLocaleString()}). Yakında yüklemeyi düşünün.`,
        { duration: 8000 }
      );
    }
  }, [pct, usage?.configured, used, limit]);

  if (!isAdmin || !usage || !usage.configured) return null;
  if (usage.error) return null;

  const critical = pct >= 90;
  const warn = pct >= 70;
  const dotColor = critical ? "#f87171" : warn ? "#F5A623" : "#22C55E";
  const borderColor = critical ? "#f87171" : warn ? "#F5A623" : "rgba(139,92,246,0.5)";
  const iconColor = critical ? "#f87171" : warn ? "#F5A623" : "#C4B5FD";

  const clearCache = (e) => {
    e.stopPropagation();
    if (!window.confirm("Tüm çeviri cache'i temizlensin mi? Bir sonraki dil seçiminde DeepL'e yeniden istek atılır.")) return;
    clearTranslationCache();
    const lang = i18nRef.language;
    i18nRef.changeLanguage("tr");
    setTimeout(() => i18nRef.changeLanguage(lang), 50);
    toast.success("Çeviri cache'i temizlendi. Dil değiştirdiğinde yenilenecek.");
  };

  const tooltip = `Cache Temizle · DeepL %${Math.round(pct)} (${used.toLocaleString()}/${limit.toLocaleString()})`;

  return (
    <button
      type="button"
      onClick={clearCache}
      data-testid="deepl-clear-cache"
      title={tooltip}
      aria-label="Cache Temizle"
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
  );
}
