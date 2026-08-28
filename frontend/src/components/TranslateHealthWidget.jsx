import React from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Languages, Zap, AlertTriangle, Database } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * v135.15 — Çeviri Sağlığı widget'ı. Admin panelinde canlı DeepL durumu:
 *   • configured / plan (free vs pro)
 *   • cache size + doluluk çubuğu
 *   • eksik çevirileri sayacı (event + folder)
 *   • son 24 saatteki DeepL çağrı sayısı ve toplam karakter
 *   • aylık kota kullanımı (%)
 * Backend: GET /api/translate/health (admin). SWR 60sn'de bir yenilenir.
 */
export default function TranslateHealthWidget() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useSWR("/translate/health", fetcher, {
    refreshInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="card-red-gold p-4 text-xs text-muted-foreground" data-testid="translate-health-loading">
        {t("loading", "Yükleniyor…")}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="card-red-gold p-4 text-xs text-red-400" data-testid="translate-health-error">
        {t("translate_health_error", "Çeviri sağlığı okunamadı")}
      </div>
    );
  }

  const cacheFill = data.cache_max > 0 ? Math.round((100 * data.cache_size) / data.cache_max) : 0;
  const usage = data.usage_last_24h || {};
  const quotaPct = data.quota?.percent || 0;
  const missing = (data.events_missing || 0) + (data.folders_missing || 0);
  const missingBad = missing > 0;
  const quotaBad = quotaPct > 80;

  return (
    <div className="card-red-gold p-4 space-y-3" data-testid="translate-health-widget">
      <div className="flex items-center gap-2">
        <Languages className="w-5 h-5 gold-text" />
        <h3 className="text-sm font-bold uppercase gold-text tracking-widest">
          {t("translate_health_title", "Çeviri Sağlığı")}
        </h3>
        <span
          className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
          style={{
            background: data.configured ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
            color: data.configured ? "#22C55E" : "#EF4444",
            border: `1px solid ${data.configured ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
          }}
          data-testid="translate-health-status"
        >
          {data.configured ? `DeepL ${data.plan}` : t("not_configured", "Ayarlı Değil")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={<AlertTriangle className="w-3 h-3" />}
          label={t("translate_health_missing", "Eksik Çeviri")}
          value={missing}
          color={missingBad ? "#EF4444" : "#22C55E"}
          testId="translate-health-missing"
        />
        <Stat
          icon={<Database className="w-3 h-3" />}
          label={t("translate_health_cache", "Cache")}
          value={`${data.cache_size}/${data.cache_max}`}
          sub={`%${cacheFill}`}
          color="#6366F1"
          testId="translate-health-cache"
        />
        <Stat
          icon={<Zap className="w-3 h-3" />}
          label={t("translate_health_24h", "Son 24 Saat")}
          value={`${usage.calls || 0} çağrı`}
          sub={`${(usage.chars || 0).toLocaleString()} chr`}
          color="#F5A623"
          testId="translate-health-24h"
        />
        <Stat
          icon={<Languages className="w-3 h-3" />}
          label={t("translate_health_quota", "Aylık Kota")}
          value={data.quota ? `%${quotaPct}` : "—"}
          sub={data.quota ? `${(data.quota.character_count || 0).toLocaleString()}` : t("not_available", "Yok")}
          color={quotaBad ? "#EF4444" : "#22C55E"}
          testId="translate-health-quota"
        />
      </div>

      {missing > 0 && (
        <button
          onClick={async () => {
            const { toast } = await import("sonner");
            try {
              toast.info(t("translate_health_backfilling", "Backfill başlatıldı..."));
              const r = await api.post("/events/backfill-translations");
              toast.success(t("translate_health_backfilled", "Doldurulan: {{n}}", {
                n: (r.data?.filled_name || 0) + (r.data?.filled_group || 0) + (r.data?.filled_folder || 0),
              }));
            } catch (e) {
              toast.error(String(e?.response?.data?.detail || e.message));
            }
          }}
          data-testid="translate-health-backfill-btn"
          className="w-full text-[11px] font-bold uppercase tracking-wider py-1.5 rounded"
          style={{
            background: "linear-gradient(135deg,#F5A623,#E74C1A)",
            color: "#1a1108",
          }}
        >
          {t("translate_health_backfill", "Eksikleri Doldur")} · {missing}
        </button>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub, color, testId }) {
  return (
    <div
      className="rounded p-2 flex flex-col gap-0.5"
      style={{ background: `${color}18`, border: `1px solid ${color}44` }}
      data-testid={testId}
    >
      <div className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider" style={{ color }}>
        {icon} {label}
      </div>
      <div className="text-base font-bold" style={{ color, fontFamily: "monospace" }}>{value}</div>
      {sub && <div className="text-[9px] opacity-70" style={{ color }}>{sub}</div>}
    </div>
  );
}
