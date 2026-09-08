import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FileText, Filter } from "lucide-react";
import Header from "@/components/Header";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v141 — Merkezi audit log admin sayfası.
export default function AuditLog() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [filters, setFilters] = useState({ since: "", until: "", action: "", actor: "" });
  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (filters.since) p.set("since", `${filters.since}T00:00:00Z`);
    if (filters.until) p.set("until", `${filters.until}T23:59:59Z`);
    if (filters.action) p.set("action", filters.action);
    if (filters.actor) p.set("actor", filters.actor);
    p.set("limit", "300");
    return p.toString();
  }, [filters]);
  const { data, error, isLoading } = useSWR(
    isAdmin ? `/admin/audit-log?${qs}` : null,
    fetcher,
    { refreshInterval: 30000 },
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <Header title={t("audit_title", { defaultValue: "Denetim Kaydı" })} />
        <div className="text-center opacity-60 mt-10">Bu sayfa sadece adminler içindir.</div>
      </div>
    );
  }

  const rows = data || [];

  return (
    <div className="min-h-screen" data-testid="audit-log-page">
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("audit_title", { defaultValue: "Denetim Kaydı" })}>
          <div className="flex items-center gap-2 opacity-60">
            <FileText className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest">{rows.length} kayıt</span>
          </div>
        </Header>

        {/* Filters */}
        <div
          className="rounded-2xl p-4 mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2"
          style={{
            background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          <Field label={t("audit_since", { defaultValue: "Başlangıç" })}>
            <input type="date" value={filters.since} onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))}
              data-testid="audit-since" className="w-full h-9 px-2 rounded-lg text-sm" style={inputStyle} />
          </Field>
          <Field label={t("audit_until", { defaultValue: "Bitiş" })}>
            <input type="date" value={filters.until} onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value }))}
              data-testid="audit-until" className="w-full h-9 px-2 rounded-lg text-sm" style={inputStyle} />
          </Field>
          <Field label={t("audit_action", { defaultValue: "İşlem" })}>
            <input type="text" placeholder="member, ocr, merge…" value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              data-testid="audit-action" className="w-full h-9 px-2 rounded-lg text-sm" style={inputStyle} />
          </Field>
          <Field label={t("audit_actor", { defaultValue: "Kullanıcı" })}>
            <input type="text" placeholder="admin" value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
              data-testid="audit-actor" className="w-full h-9 px-2 rounded-lg text-sm" style={inputStyle} />
          </Field>
          <div className="flex items-end">
            <button onClick={() => setFilters({ since: "", until: "", action: "", actor: "" })}
              data-testid="audit-reset" className="w-full h-9 rounded-lg text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
              {t("audit_reset", { defaultValue: "Sıfırla" })}
            </button>
          </div>
        </div>

        {isLoading && <div className="text-center opacity-60 mt-10">Yükleniyor…</div>}
        {error && <div className="text-center opacity-60 mt-10" style={{ color: "#F87171" }}>Hata: {error.message}</div>}

        <div className="rounded-xl overflow-hidden mt-4"
          style={{ background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <table className="w-full text-xs" data-testid="audit-table">
            <thead>
              <tr style={{ background: "rgba(245,158,11,0.08)", color: "#F5F0E8" }}>
                <th className="px-3 py-2 text-left uppercase tracking-widest font-bold">{t("audit_col_time", { defaultValue: "Zaman" })}</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest font-bold">{t("audit_col_action", { defaultValue: "İşlem" })}</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest font-bold">{t("audit_col_actor", { defaultValue: "Kim" })}</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest font-bold">{t("audit_col_target", { defaultValue: "Hedef" })}</th>
                <th className="px-3 py-2 text-left uppercase tracking-widest font-bold">{t("audit_col_detail", { defaultValue: "Detay" })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "#F5F0E8" }}>
                  <td className="px-3 py-2 font-mono opacity-70 whitespace-nowrap">{(r.ts || "").slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: actionColor(r.action) + "22", color: actionColor(r.action), border: `1px solid ${actionColor(r.action)}44` }}>{r.action}</span></td>
                  <td className="px-3 py-2 opacity-80">{r.actor}</td>
                  <td className="px-3 py-2 opacity-90">{r.target || "—"}</td>
                  <td className="px-3 py-2 opacity-60 truncate max-w-[300px]" title={r.detail}>{r.detail}</td>
                </tr>
              ))}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={5} className="text-center py-6 opacity-40">
                  {t("audit_empty", { defaultValue: "Kayıt yok." })}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inputStyle = { background: "rgba(255,255,255,0.05)", color: "#F5F0E8", border: "1px solid rgba(255,255,255,0.12)" };

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest opacity-70 block mb-1" style={{ color: "#F5F0E8" }}>{label}</label>
      {children}
    </div>
  );
}

function actionColor(a) {
  a = (a || "").toLowerCase();
  if (a.includes("delete") || a.includes("kick") || a.includes("ban")) return "#EF4444";
  if (a.includes("merge") || a.includes("undo")) return "#A855F7";
  if (a.includes("ocr")) return "#F59E0B";
  if (a.includes("member") || a.includes("update")) return "#6366F1";
  return "#10B981";
}
