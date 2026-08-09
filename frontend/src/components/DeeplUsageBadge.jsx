import React, { useEffect, useState, useRef } from "react";
import { Languages, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { clearTranslationCache } from "@/lib/deeplTranslate";
import { toast } from "sonner";

// Small badge that fetches DeepL usage and shows remaining characters.
// Only rendered for admins; silent if key not configured.
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

  const remaining = Math.max(0, limit - used);
  const critical = pct >= 90;
  const warn = pct >= 70;
  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;

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
    <div
      data-testid="deepl-usage-badge"
      title={`DeepL ${usage.plan?.toUpperCase() || ""} • ${used.toLocaleString()} / ${limit.toLocaleString()} karakter`}
      className="flex items-center gap-1 h-8 px-2 rounded-full border flex-shrink-0"
      style={{
        background: "rgba(26,26,26,0.9)",
        borderColor: critical ? "#f87171" : warn ? "#F5A623" : "rgba(139,92,246,0.5)",
        color: critical ? "#f87171" : warn ? "#F5A623" : "#C4B5FD",
      }}
    >
      <Languages className="w-3.5 h-3.5" />
      <span className="text-[10px] font-bold tracking-wider">
        {fmt(remaining)}<span className="opacity-60">/{fmt(limit)}</span>
      </span>
      <button
        onClick={clearCache}
        data-testid="deepl-clear-cache"
        title="Çeviri cache'ini temizle (Yeniden Çevir)"
        className="ml-1 p-0.5 rounded hover:bg-white/10"
        style={{ color: "inherit", opacity: 0.75 }}
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
}
