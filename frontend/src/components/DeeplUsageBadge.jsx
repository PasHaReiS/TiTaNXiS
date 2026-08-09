import React, { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Small badge that fetches DeepL usage and shows remaining characters.
// Only rendered for admins; silent if key not configured.
export default function DeeplUsageBadge() {
  const { isAdmin } = useAuth();
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api.get("/translate/usage")
      .then((r) => { if (!cancelled) setUsage(r.data); })
      .catch(() => { if (!cancelled) setUsage({ configured: false }); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin || !usage || !usage.configured) return null;
  if (usage.error) return null;

  const used = Number(usage.character_count) || 0;
  const limit = Number(usage.character_limit) || 0;
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const critical = pct >= 90;
  const warn = pct >= 70;

  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;

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
    </div>
  );
}
