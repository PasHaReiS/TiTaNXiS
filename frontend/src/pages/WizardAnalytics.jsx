import React from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, Download, Upload, FileSpreadsheet, Languages, TrendingUp, Activity } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import Header from "@/components/Header";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v141 — Wizard funnel analytics admin panel.
// Reads /api/wizard-analytics/summary and renders a compact 4-step funnel
// with conversion percentages + a mini daily-opens sparkline for last 30d.
export default function WizardAnalytics() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  // v141 — Yeni filtre panelleri: tarih aralığı + user_id + kind. Boş bırakılınca
  // varsayılan davranış (7g + 30g) korunur.
  const [filters, setFilters] = React.useState({ since: "", until: "", user_id: "", kind: "" });
  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (filters.since) p.set("since", filters.since);
    if (filters.until) p.set("until", filters.until);
    if (filters.user_id) p.set("user_id", filters.user_id);
    if (filters.kind) p.set("kind", filters.kind);
    return p.toString() ? `?${p.toString()}` : "";
  }, [filters]);
  const [checkingAlerts, setCheckingAlerts] = React.useState(false);
  const [alertResult, setAlertResult] = React.useState(null);

  const { data, error, isLoading, mutate } = useSWR(isAdmin ? `/wizard-analytics/summary${qs}` : null, fetcher, { refreshInterval: 60000 });

  const runAlertCheck = async () => {
    setCheckingAlerts(true);
    setAlertResult(null);
    try {
      const res = await api.post("/wizard-analytics/check-alerts");
      setAlertResult(res.data);
    } catch (e) {
      setAlertResult({ error: e?.response?.data?.detail || e.message });
    } finally {
      setCheckingAlerts(false);
    }
  };

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

  const d = data || { last_7_days: {}, last_30_days: {}, by_kind_30d: {}, daily_opens_30d: [], top_users_30d: [], filtered: null, range: null };
  const isFiltered = !!d.filtered;

  return (
    <div className="min-h-screen" data-testid="wizard-analytics-page">
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("wa_title", { defaultValue: "Sihirbaz Analitiği" })}>
          <div className="flex items-center gap-2 opacity-60">
            <Activity className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">PC Excel Wizard</span>
          </div>
        </Header>

        {/* Filter panel */}
        <div
          className="rounded-2xl p-4 mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2"
          style={{
            background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase tracking-widest opacity-70 block mb-1" style={{ color: "#F5F0E8" }}>Başlangıç</label>
            <input
              type="date"
              value={filters.since ? filters.since.slice(0, 10) : ""}
              onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value ? `${e.target.value}T00:00:00Z` : "" }))}
              data-testid="wa-filter-since"
              className="w-full h-9 px-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.05)", color: "#F5F0E8", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] uppercase tracking-widest opacity-70 block mb-1" style={{ color: "#F5F0E8" }}>Bitiş</label>
            <input
              type="date"
              value={filters.until ? filters.until.slice(0, 10) : ""}
              onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value ? `${e.target.value}T23:59:59Z` : "" }))}
              data-testid="wa-filter-until"
              className="w-full h-9 px-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.05)", color: "#F5F0E8", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest opacity-70 block mb-1" style={{ color: "#F5F0E8" }}>Kullanıcı ID</label>
            <input
              type="text"
              placeholder="admin..."
              value={filters.user_id}
              onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
              data-testid="wa-filter-user"
              className="w-full h-9 px-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.05)", color: "#F5F0E8", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest opacity-70 block mb-1" style={{ color: "#F5F0E8" }}>Sekme</label>
            <select
              value={filters.kind}
              onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
              data-testid="wa-filter-kind"
              className="w-full h-9 px-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.05)", color: "#F5F0E8", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <option value="">Tümü</option>
              <option value="pre">SvS Pre</option>
              <option value="diger">Diğer</option>
            </select>
          </div>
          <div className="flex flex-col justify-end gap-1">
            <button
              onClick={() => setFilters({ since: "", until: "", user_id: "", kind: "" })}
              data-testid="wa-filter-reset"
              className="h-9 px-3 rounded-lg text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Sıfırla
            </button>
            <button
              onClick={runAlertCheck}
              disabled={checkingAlerts}
              data-testid="wa-check-alerts"
              className="h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1"
              style={{
                background: "linear-gradient(135deg,#DC2626,#EF4444)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
                opacity: checkingAlerts ? 0.6 : 1,
              }}
              title="Düşük dönüşüm için alarm testi"
            >
              🚨 Alarm Testi
            </button>
            <button
              onClick={() => {
                const p = new URLSearchParams();
                if (filters.since) p.set("since", filters.since);
                if (filters.until) p.set("until", filters.until);
                if (filters.user_id) p.set("user_id", filters.user_id);
                if (filters.kind) p.set("kind", filters.kind);
                const token = localStorage.getItem("ol_token");
                const url = `${process.env.REACT_APP_BACKEND_URL}/api/wizard-analytics/export.csv${p.toString() ? `?${p.toString()}` : ""}`;
                fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const dl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = dl;
                    a.download = `wizard_events_${new Date().toISOString().slice(0,10)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(dl);
                  });
              }}
              data-testid="wa-export-csv"
              className="h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1"
              style={{
                background: "linear-gradient(135deg,#059669,#10B981)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
              }}
              title="Filtrelenmiş olayları CSV olarak indir"
            >
              📥 CSV İndir
            </button>
          </div>
        </div>

        {alertResult && (
          <div
            className="rounded-lg mt-2 p-3 text-xs"
            style={{
              background: alertResult.alert_sent ? "rgba(239,68,68,0.1)" : alertResult.should_alert ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.08)",
              border: `1px solid ${alertResult.alert_sent ? "rgba(239,68,68,0.35)" : alertResult.should_alert ? "rgba(245,158,11,0.35)" : "rgba(16,185,129,0.3)"}`,
              color: "#F5F0E8",
            }}
            data-testid="wa-alert-result"
          >
            {alertResult.error && <>⚠️ {alertResult.error}</>}
            {!alertResult.error && (
              <>
                📊 30G: {alertResult.opens_30d} açılış, %{alertResult.conv_end_to_end_30d} tamamlandı
                {alertResult.alert_sent && <> · ✅ <strong>Admin'lere Web Push gönderildi</strong></>}
                {!alertResult.alert_sent && alertResult.should_alert && alertResult.cool_off && <> · ⏸️ 24s bekleme süresi aktif</>}
                {!alertResult.alert_sent && !alertResult.should_alert && <> · ✔️ Eşik altında değil (opens ≥ 5 & conv &lt; 40 gerekli)</>}
              </>
            )}
          </div>
        )}

        {isFiltered ? (
          <div className="mt-4">
            <FunnelCard
              title={`Filtre: ${d.range?.since?.slice(0, 10)} → ${d.range?.until?.slice(0, 10)}`}
              d={d.filtered}
            />
          </div>
        ) : (
          <>
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
                  {t("wa_daily", { defaultValue: "Günlük Dönüşüm (30G)" })}
                </h3>
                <ConversionTrend data={d.daily_conversion_30d || []} fallback={d.daily_opens_30d || []} />
              </div>
            </div>

            {(d.top_users_30d || []).length > 0 && (
              <div
                className="rounded-2xl p-5 mt-4"
                style={{
                  background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}
                data-testid="wa-top-users"
              >
                <h3 className="text-sm font-bold uppercase mb-3 tracking-widest" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
                  En Aktif 5 Kullanıcı (30G)
                </h3>
                <div className="space-y-2">
                  {d.top_users_30d.map((u, i) => (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-white/5"
                      onClick={() => setFilters((f) => ({ ...f, user_id: u.user_id }))}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: i === 0 ? "#F59E0B" : i === 1 ? "#A855F7" : "#6366F1", color: "#fff" }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 text-sm" style={{ color: "#F5F0E8" }}>{u.username}</div>
                      <div className="text-xs opacity-70 font-mono" style={{ color: "#F5F0E8" }}>{u.events} olay</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
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

// v141 — Günlük dönüşüm trend chart'ı. `daily_conversion_30d` boşsa
// fallback olarak `daily_opens_30d`'yi bar chart olarak çizer.
function ConversionTrend({ data, fallback }) {
  const rows = (data && data.length ? data : (fallback || []).map((r) => ({ ...r, success: 0, conv: 0 })));
  if (!rows.length) {
    return <div className="text-xs opacity-50 py-8 text-center">Henüz veri yok.</div>;
  }
  return (
    <div style={{ width: "100%", height: 160 }} data-testid="wa-conversion-trend">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" style={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
          <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "#1a0f0a",
              border: "1px solid rgba(245,158,11,0.4)",
              borderRadius: 8,
              fontSize: 12,
              color: "#F5F0E8",
            }}
            labelStyle={{ color: "#F59E0B" }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
          <Line type="monotone" dataKey="opens" name="Açılış" stroke="#A855F7" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="success" name="Başarı" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="conv" name="Dönüşüm %" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 4" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
