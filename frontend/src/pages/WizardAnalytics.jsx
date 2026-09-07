import React from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, Download, Upload, FileSpreadsheet, Languages, TrendingUp, Activity } from "lucide-react";
import Header from "@/components/Header";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v141 — Wizard funnel analytics admin panel.
// Reads /api/wizard-analytics/summary and renders a compact 4-step funnel
// with conversion percentages + a mini daily-opens sparkline for last 30d.
export default function WizardAnalytics() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { data, error, isLoading } = useSWR(isAdmin ? "/wizard-analytics/summary" : null, fetcher, { refreshInterval: 60000 });

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <Header title="Wizard Analytics" />
        <div className="text-center opacity-60 mt-10">Bu sayfa sadece adminler içindir.</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen p-4">
        <Header title={t("wa_title", { defaultValue: "Sihirbaz Analitiği" })} />
        <div className="text-center opacity-60 mt-10">Yükleniyor…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <Header title={t("wa_title", { defaultValue: "Sihirbaz Analitiği" })} />
        <div className="text-center opacity-60 mt-10" style={{ color: "#F87171" }}>Hata: {error.message}</div>
      </div>
    );
  }

  const d = data || { last_7_days: {}, last_30_days: {}, by_kind_30d: {}, daily_opens_30d: [] };

  return (
    <div className="min-h-screen" data-testid="wizard-analytics-page">
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("wa_title", { defaultValue: "Sihirbaz Analitiği" })}>
          <div className="flex items-center gap-2 opacity-60">
            <Activity className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">PC Excel Wizard</span>
          </div>
        </Header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <FunnelCard title={t("wa_last7", { defaultValue: "Son 7 Gün" })} d={d.last_7_days} />
          <FunnelCard title={t("wa_last30", { defaultValue: "Son 30 Gün" })} d={d.last_30_days} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div
            className="rounded-2xl p-5"
            style={{
              background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            <h3 className="text-sm font-bold uppercase mb-3 tracking-widest" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
              {t("wa_by_kind", { defaultValue: "Sekme Dağılımı (30G)" })}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <KindBar kind="pre" count={d.by_kind_30d?.pre || 0} total={(d.by_kind_30d?.pre || 0) + (d.by_kind_30d?.diger || 0)} />
              <KindBar kind="diger" count={d.by_kind_30d?.diger || 0} total={(d.by_kind_30d?.pre || 0) + (d.by_kind_30d?.diger || 0)} />
            </div>
          </div>

          <div
            className="rounded-2xl p-5"
            style={{
              background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            <h3 className="text-sm font-bold uppercase mb-3 tracking-widest flex items-center gap-2" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
              <TrendingUp className="w-4 h-4" style={{ color: "#10B981" }} />
              {t("wa_daily", { defaultValue: "Günlük Açılma (30G)" })}
            </h3>
            <Sparkline data={d.daily_opens_30d || []} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelCard({ title, d }) {
  const { t } = useTranslation();
  const steps = [
    { icon: <Sparkles className="w-3.5 h-3.5" />, label: t("wa_step_open", { defaultValue: "Sihirbaz Açıldı" }), value: d.opens || 0, color: "#A855F7" },
    { icon: <Download className="w-3.5 h-3.5" />, label: t("wa_step_download", { defaultValue: "Excel İndirildi" }), value: d.step1_download || 0, color: "#10B981" },
    { icon: <FileSpreadsheet className="w-3.5 h-3.5" />, label: t("wa_step_next", { defaultValue: "3. Adıma Geçildi" }), value: d.step2_next || 0, color: "#F59E0B" },
    { icon: <Upload className="w-3.5 h-3.5" />, label: t("wa_step_import", { defaultValue: "Yükle Denendi" }), value: d.step3_import || 0, color: "#EF4444" },
    { icon: <Upload className="w-3.5 h-3.5" />, label: t("wa_step_success", { defaultValue: "Yükleme Başarılı" }), value: d.step3_import_success || 0, color: "#059669" },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
        border: "1px solid rgba(245,158,11,0.25)",
      }}
    >
      <h3 className="text-sm font-bold uppercase mb-4 tracking-widest" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
        {title}
      </h3>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44` }}>
              {s.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs opacity-80" style={{ color: "#F5F0E8" }}>{s.label}</span>
                <span className="text-sm font-bold" style={{ color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(s.value / max) * 100}%`, background: s.color, boxShadow: `0 0 10px ${s.color}66` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <ConvChip label={t("wa_conv_e2e", { defaultValue: "Uçtan Uca" })} pct={d.conv_end_to_end || 0} tone="#10B981" testid="wa-conv-e2e" />
        <ConvChip label={t("wa_conv_dl_up", { defaultValue: "İndir→Yükle" })} pct={d.conv_download_to_upload || 0} tone="#F59E0B" />
        <ConvChip label={t("wa_conv_open_dl", { defaultValue: "Aç→İndir" })} pct={d.conv_open_to_download || 0} tone="#A855F7" />
        <ConvChip label={t("wa_conv_up_ok", { defaultValue: "Yükle→OK" })} pct={d.conv_upload_to_success || 0} tone="#059669" />
      </div>

      {d.step3_translate > 0 && (
        <div className="mt-3 text-xs flex items-center gap-2 opacity-70">
          <Languages className="w-3.5 h-3.5" />
          <span>{t("wa_translate_used", { count: d.step3_translate, defaultValue: `Çevir düğmesi ${d.step3_translate} kez kullanıldı` })}</span>
        </div>
      )}
    </div>
  );
}

function ConvChip({ label, pct, tone, testid }) {
  return (
    <div
      className="rounded-lg p-2 text-center"
      style={{ background: `${tone}11`, border: `1px solid ${tone}33` }}
      data-testid={testid}
    >
      <div className="text-lg font-bold" style={{ color: tone, fontVariantNumeric: "tabular-nums" }}>%{pct}</div>
      <div className="text-[10px] uppercase tracking-widest opacity-70" style={{ color: "#F5F0E8" }}>{label}</div>
    </div>
  );
}

function KindBar({ kind, count, total }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const color = kind === "pre" ? "#F59E0B" : "#A855F7";
  return (
    <div className="rounded-lg p-3" style={{ background: `${color}11`, border: `1px solid ${color}33` }}>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs uppercase tracking-widest opacity-80" style={{ color }}>{kind === "pre" ? "SvS Pre" : "Diğer"}</span>
        <span className="text-lg font-bold" style={{ color, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-[10px] mt-1 opacity-60" style={{ color: "#F5F0E8" }}>%{pct}</div>
    </div>
  );
}

function Sparkline({ data }) {
  if (!data.length) {
    return <div className="text-xs opacity-50 py-8 text-center">Henüz veri yok.</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.opens));
  const w = 100 / data.length;
  return (
    <div className="flex items-end gap-[2px] h-24">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-t transition-all hover:opacity-100"
          style={{
            height: `${(d.opens / max) * 100}%`,
            background: "linear-gradient(180deg,#10B981,#059669)",
            minHeight: 2,
            opacity: 0.75,
          }}
          title={`${d.date}: ${d.opens}`}
        />
      ))}
    </div>
  );
}
