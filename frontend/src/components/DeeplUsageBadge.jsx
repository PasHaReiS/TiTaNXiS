import React, { useEffect, useState, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { clearTranslationCache } from "@/lib/deeplTranslate";
import { toast } from "sonner";

// Admin-only icon button to bust the DeepL translation cache.
// Also polls DeepL usage in the background to fire a one-shot quota alarm.
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

  // Fire once-per-session alarm at 90%.
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
  const color = critical ? "#f87171" : warn ? "#F5A623" : "#C4B5FD";
  const borderColor = critical ? "#f87171" : warn ? "#F5A623" : "rgba(139,92,246,0.5)";

  const clearCache = (e) => {
    e.stopPropagation();
    if (!window.confirm("Tüm çeviri cache'i temizlensin mi? Bir sonraki dil seçiminde DeepL'e yeniden istek atılır.")) return;
    clearTranslationCache();
    // Force reload the current language bundle so UI re-hydrates from DeepL.
    const lang = i18nRef.language;
    i18nRef.changeLanguage("tr");
    setTimeout(() => i18nRef.changeLanguage(lang), 50);
    toast.success("Çeviri cache'i temizlendi. Dil değiştirdiğinde yenilenecek.");
  };

  return (
    <button
      type="button"
      onClick={clearCache}
      data-testid="deepl-clear-cache"
      title="Cache Temizle"
      aria-label="Cache Temizle"
      className="flex items-center justify-center h-8 w-8 rounded-full border flex-shrink-0 transition-opacity hover:opacity-80"
      style={{
        background: "rgba(26,26,26,0.9)",
        borderColor,
        color,
      }}
    >
      <RotateCcw className="w-3.5 h-3.5" />
    </button>
  );
}
