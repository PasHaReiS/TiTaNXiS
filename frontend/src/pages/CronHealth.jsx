import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Clock, CheckCircle2, XCircle, AlertTriangle, Activity, PauseCircle } from "lucide-react";
import Header from "@/components/Header";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v141 — Cron sağlık dashboard'u. .emergent/crons.yml'daki tüm cron'ları
// listeler ve DB tarafında saklanan (opsiyonel) last_run_at + success/failure
// sayaçlarıyla birleştirir. 60s auto-refresh.
export default function CronHealth() {
  const { isAdmin } = useAuth();
  const { data, error, isLoading } = useSWR(isAdmin ? "/admin/cron-health" : null, fetcher, { refreshInterval: 60000 });

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <Header title="Cron Sağlık" />
        <div className="text-center opacity-60 mt-10">Bu sayfa sadece adminler içindir.</div>
      </div>
    );
  }
  if (isLoading) {
    return <div className="min-h-screen p-4"><Header title="Cron Sağlık" /><div className="text-center opacity-60 mt-10">Yükleniyor…</div></div>;
  }
  if (error) {
    return <div className="min-h-screen p-4"><Header title="Cron Sağlık" /><div className="text-center opacity-60 mt-10" style={{ color: "#F87171" }}>Hata: {error.message}</div></div>;
  }
  const rows = data?.crons || [];

  return (
    <div className="min-h-screen" data-testid="cron-health-page">
      <div className="max-w-6xl mx-auto p-4">
        <Header title="Cron Sağlık Dashboardu">
          <div className="flex items-center gap-2 opacity-60">
            <Activity className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">{rows.length} Cron • Son Kontrol: {(data?.checked_at || "").slice(11, 16)} UTC</span>
          </div>
        </Header>

        <div className="space-y-2 mt-4">
          {rows.map((c) => {
            const stale = c.minutes_since_last_run != null && c.minutes_since_last_run > 1440; // >24h
            const failing = (c.failure_count || 0) > (c.success_count || 0);
            const disabled = c.enabled === false;
            const badge = disabled ? { color: "#6B7280", icon: <PauseCircle className="w-4 h-4" />, label: "Kapalı" }
              : failing ? { color: "#EF4444", icon: <XCircle className="w-4 h-4" />, label: "Hatalı" }
              : stale ? { color: "#F59E0B", icon: <AlertTriangle className="w-4 h-4" />, label: "Bayat" }
              : { color: "#10B981", icon: <CheckCircle2 className="w-4 h-4" />, label: "Sağlıklı" };

            return (
              <div
                key={c.name}
                data-testid={`cron-row-${c.name}`}
                className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                style={{
                  background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
                  border: `1px solid ${badge.color}44`,
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.03em" }}>{c.name}</span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest"
                      style={{ background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44` }}
                    >
                      {badge.icon} {badge.label}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)" }}>{c.cron}</span>
                  </div>
                  {c.description && (
                    <div className="text-xs mt-1 opacity-70" style={{ color: "#F5F0E8" }}>{c.description}</div>
                  )}
                  <div className="text-[11px] mt-1 opacity-50 font-mono truncate" style={{ color: "#F5F0E8" }}>{c.method} {c.endpoint}</div>
                </div>

                <div className="flex items-center gap-4 text-xs" style={{ color: "#F5F0E8" }}>
                  <div className="flex flex-col items-end">
                    <span className="opacity-60 text-[10px] uppercase tracking-widest">Son</span>
                    <span className="font-mono" style={{ color: badge.color }}>
                      {c.minutes_since_last_run == null ? "—"
                        : c.minutes_since_last_run < 60 ? `${c.minutes_since_last_run}dk`
                        : c.minutes_since_last_run < 1440 ? `${Math.floor(c.minutes_since_last_run/60)}sa`
                        : `${Math.floor(c.minutes_since_last_run/1440)}gün`}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="opacity-60 text-[10px] uppercase tracking-widest">Başarı</span>
                    <span className="font-mono" style={{ color: "#10B981" }}>{c.success_count || 0}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="opacity-60 text-[10px] uppercase tracking-widest">Hata</span>
                    <span className="font-mono" style={{ color: "#EF4444" }}>{c.failure_count || 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
