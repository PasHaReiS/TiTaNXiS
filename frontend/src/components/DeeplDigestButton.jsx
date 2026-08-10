import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { BarChart3, Download, X } from "lucide-react";

const RANGES = [1, 7, 30, 90];
const RANGE_KEY = "digest_days";
const readRange = () => {
  try {
    const v = parseInt(localStorage.getItem(RANGE_KEY) || "7", 10);
    return RANGES.includes(v) ? v : 7;
  } catch { return 7; }
};

// Convert a top_keys list into a CSV blob and trigger a browser download.
const downloadCsv = (topKeys, days) => {
  const header = "count,text";
  const rows = (topKeys || []).map((k) => {
    const safe = String(k.text || "").replace(/"/g, '""');
    return `${k.count},"${safe}"`;
  });
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deepl-top-keys-${days}d.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Admin-only. Chart button opens a portal modal showing DeepL usage for a
// user-picked range (1g / 7g / 30g / 90g). Top-Keys section has a CSV export.
export default function DeeplDigestButton() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(readRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [daySelected, setDaySelected] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);

  const pickRange = (d) => {
    setDays(d);
    setDaySelected(null);
    try { localStorage.setItem(RANGE_KEY, String(d)); } catch { /* ignore quota errors */ }
  };

  useEffect(() => {
    if (!daySelected) { setDayDetail(null); return; }
    let cancelled = false;
    api.get(`/translate/digest/day?date=${daySelected}`)
      .then((r) => { if (!cancelled) setDayDetail(r.data); })
      .catch(() => { if (!cancelled) setDayDetail({ error: true }); });
    return () => { cancelled = true; };
  }, [daySelected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/translate/digest?days=${days}`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setData({ error: true }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, days]);

  if (!isAdmin) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="deepl-digest-btn"
        title={t("deepl_digest_title")}
        aria-label={t("deepl_digest_title")}
        className="flex items-center justify-center h-8 w-8 rounded-full border flex-shrink-0 transition-opacity hover:opacity-80"
        style={{
          background: "rgba(26,26,26,0.9)",
          borderColor: "rgba(139,92,246,0.5)",
          color: "#C4B5FD",
        }}
      >
        <BarChart3 className="w-3.5 h-3.5" />
      </button>
      {open && createPortal(
        <div
          data-testid="deepl-digest-modal"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #1E1410 0%, #0F0806 100%)",
              border: "1px solid rgba(139,92,246,0.55)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(139,92,246,0.25)",
              maxHeight: "85vh",
            }}
          >
            <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: "rgba(139,92,246,0.3)" }}>
              <div className="min-w-0 flex-1 pr-3">
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "#C4B5FD" }}>DeepL</div>
                <div className="text-base font-bold" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
                  {t("deepl_digest_title")}
                </div>
              </div>
              <button
                data-testid="deepl-digest-close"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-white/10 transition"
                style={{ color: "#F5F0E8" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 pt-3 flex items-center gap-1.5" data-testid="digest-range-strip">
              {RANGES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickRange(d)}
                  data-testid={`digest-range-${d}`}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition"
                  style={{
                    background: days === d ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "rgba(20,12,10,0.6)",
                    color: days === d ? "#fff" : "#C4B5FD",
                    border: `1px solid ${days === d ? "rgba(139,92,246,0.85)" : "rgba(139,92,246,0.3)"}`,
                    letterSpacing: "0.10em",
                  }}
                >
                  {d}g
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4 text-sm">
              {loading && (<div className="text-center py-6 text-muted-foreground">{t("loading")}…</div>)}
              {data && !data.error && !loading && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg p-3" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("deepl_digest_chars")}</div>
                      <div className="text-lg font-bold mono" data-testid="digest-total-chars" style={{ color: "#C4B5FD" }}>
                        {(data.total_chars || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("deepl_digest_requests")}</div>
                      <div className="text-lg font-bold mono" data-testid="digest-total-requests" style={{ color: "#C4B5FD" }}>
                        {data.total_requests || 0}
                      </div>
                    </div>
                  </div>
                  {(data.daily || []).length > 0 && (() => {
                    const daily = data.daily || [];
                    const maxChars = Math.max(1, ...daily.map((d) => d.chars || 0));
                    // For 30/90-day views, label every 5th bar; for 7-day view label all bars.
                    const labelEvery = daily.length >= 30 ? 5 : 1;
                    return (
                      <div data-testid="digest-bar-chart">
                        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#8B5CF6", letterSpacing: "0.14em" }}>
                          {t("deepl_digest_daily")}
                        </div>
                        <div
                          className="flex items-end gap-[2px] rounded p-2"
                          style={{ height: 72, background: "rgba(20,12,10,0.55)", border: "1px solid rgba(139,92,246,0.2)" }}
                        >
                          {daily.map((d) => {
                            const h = Math.round(((d.chars || 0) / maxChars) * 56);
                            const active = daySelected === d.date;
                            return (
                              <button
                                key={d.date}
                                type="button"
                                onClick={() => setDaySelected(d.date)}
                                data-testid={`digest-bar-${d.date}`}
                                className="flex-1 rounded-t transition-all cursor-pointer"
                                title={`${d.date} · ${(d.chars || 0).toLocaleString()} char · ${d.requests || 0} req`}
                                style={{
                                  height: `${Math.max(2, h)}px`,
                                  background: (d.chars || 0) > 0
                                    ? (active
                                        ? "linear-gradient(180deg,#FDE68A,#F5A623)"
                                        : "linear-gradient(180deg,#C4B5FD,#8B5CF6)")
                                    : "rgba(139,92,246,0.12)",
                                  minWidth: 3,
                                  outline: active ? "1px solid #F5A623" : "none",
                                }}
                                aria-label={`${d.date} · ${d.chars} char`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex mt-1" data-testid="digest-bar-legend">
                          {daily.map((d, i) => {
                            const show = i % labelEvery === 0 || i === daily.length - 1;
                            const md = show ? d.date.slice(5) : "";
                            return (
                              <span
                                key={d.date}
                                className="flex-1 text-center text-[9px] mono opacity-70"
                                style={{ color: "#C4B5FD", minWidth: 3 }}
                              >
                                {md}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {daySelected && dayDetail && (
                    <div
                      data-testid="digest-day-detail"
                      className="rounded-lg p-3 space-y-2"
                      style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.4)" }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[9px] uppercase tracking-widest" style={{ color: "#F5A623", letterSpacing: "0.14em" }}>
                            {t("deepl_digest_day_detail")}
                          </div>
                          <div className="text-sm font-bold mono" style={{ color: "#F5F0E8" }}>{daySelected}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {(dayDetail.total_chars || 0).toLocaleString()} char · {dayDetail.total_requests || 0} req
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDaySelected(null)}
                          data-testid="digest-day-detail-close"
                          className="p-1 rounded hover:bg-white/10 transition"
                          style={{ color: "#F5A623" }}
                          aria-label={t("cancel")}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {(dayDetail.top_keys || []).length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">—</div>
                      ) : (
                        <div className="space-y-1" data-testid="digest-day-top-keys">
                          {dayDetail.top_keys.map((k, i) => (
                            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-xs" style={{ background: "rgba(20,12,10,0.5)" }}>
                              <span className="mono text-[10px] font-bold" style={{ color: "#F5A623", minWidth: 20 }}>×{k.count}</span>
                              <span className="truncate flex-1" style={{ color: "#F5F0E8" }} title={k.text}>{k.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#F5A623", letterSpacing: "0.14em" }}>
                      {t("deepl_digest_langs")} ({(data.langs || []).length})
                    </div>
                    {(data.langs || []).length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">—</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5" data-testid="digest-langs">
                        {data.langs.map((l) => (
                          <span key={l.code} className="chip" style={{ borderColor: "rgba(245,166,35,0.4)", color: "#F5A623" }}>
                            {l.code.toUpperCase()} · {l.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(data.sources || []).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#22C55E", letterSpacing: "0.14em" }}>
                        {t("deepl_digest_sources")}
                      </div>
                      <div className="flex flex-wrap gap-1.5" data-testid="digest-sources">
                        {data.sources.map((s) => (
                          <span key={s.code} className="chip" style={{ borderColor: "rgba(34,197,94,0.35)", color: "#22C55E" }}>
                            {s.code} · {s.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "#E74C1A", letterSpacing: "0.14em" }}>
                        {t("deepl_digest_top_keys")}
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadCsv(data.top_keys || [], days)}
                        disabled={!(data.top_keys && data.top_keys.length)}
                        data-testid="digest-csv-export"
                        className="text-[10px] uppercase font-bold px-2 py-1 rounded flex items-center gap-1"
                        style={{
                          background: "rgba(231,76,26,0.15)",
                          color: "#E74C1A",
                          border: "1px solid rgba(231,76,26,0.4)",
                          letterSpacing: "0.06em",
                          opacity: (data.top_keys && data.top_keys.length) ? 1 : 0.4,
                          cursor: (data.top_keys && data.top_keys.length) ? "pointer" : "not-allowed",
                        }}
                        title={t("deepl_digest_export_csv")}
                      >
                        <Download className="w-3 h-3" /> CSV
                      </button>
                    </div>
                    {(data.top_keys || []).length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">—</div>
                    ) : (
                      <div className="space-y-1" data-testid="digest-top-keys">
                        {data.top_keys.map((k, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-2 py-1.5 rounded"
                            style={{ background: "rgba(231,76,26,0.08)", border: "1px solid rgba(231,76,26,0.2)" }}
                          >
                            <span className="mono text-[10px] font-bold" style={{ color: "#E74C1A", minWidth: 24 }}>×{k.count}</span>
                            <span className="text-xs truncate flex-1" style={{ color: "#F5F0E8" }} title={k.text}>{k.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {data?.error && (<div className="text-center py-6 text-red-400 text-xs">{t("deepl_digest_error")}</div>)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
