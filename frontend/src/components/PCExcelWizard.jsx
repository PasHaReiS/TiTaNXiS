import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { mutate as globalMutate } from "swr";
import { Download, Upload, Languages, CheckCircle2, X, ChevronRight, FileSpreadsheet, Loader2 } from "lucide-react";

// v141 — PC Excel İş Akışı Wizard. 3 adım: İndir → Düzenle → Yükle + DeepL.
// Analytics: her adım geçişi /api/wizard-analytics/event'e best-effort loglanır.
function _newSessionId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fallthrough */ }
  return `wz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function _track(event, kind, session_id, meta = {}) {
  try {
    await api.post("/wizard-analytics/event", { event, kind, session_id, meta });
  } catch (e) {
    // Best-effort telemetry — asla UI'yi engellemez.
  }
}

export default function PCExcelWizard({ kind, open, onClose }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1); // 1 = indir, 2 = düzenle, 3 = yükle
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState(null);
  const fileRef = useRef(null);
  // Yeni session — her wizard açılışı ayrı funnel bacağı.
  const sessionId = useMemo(() => (open ? _newSessionId() : null), [open, kind]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setDownloaded(false);
      setFile(null);
      setImportResult(null);
      setTranslated(null);
      _track("wizard_opened", kind, sessionId);
    }
  }, [open, kind, sessionId]);

  if (!open) return null;

  const download = async () => {
    setBusy(true);
    try {
      const token = localStorage.getItem("ol_token");
      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/point-calc/export?kind=${kind}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(/:/g, "");
      a.download = `puan_hesaplama_${kind}_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setStep(2);
      _track("step1_download", kind, sessionId);
      toast.success(t("pc_wizard_downloaded", { defaultValue: "Excel indirildi — sırada düzenleme adımı" }));
    } catch (e) {
      toast.error(`Excel: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    if (!file) return;
    setBusy(true);
    setImportResult(null);
    _track("step3_import", kind, sessionId, { size: file.size });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/point-calc/import?kind=${kind}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      globalMutate(`/point-calc?kind=${kind}`);
      _track("step3_import_success", kind, sessionId, { updated: res.data.updated, skipped: res.data.skipped });
      toast.success(t("pc_import_events_updated", { count: res.data.updated, defaultValue: `${res.data.updated} etkinlik güncellendi` }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  };

  const translateAll = async () => {
    setTranslating(true);
    _track("step3_translate", kind, sessionId);
    try {
      const res = await api.post(`/point-calc/translate-all?kind=${kind}`);
      setTranslated(res.data);
      toast.success(
        t("pc_wizard_translate_done", {
          defaultValue: `${res.data.days_processed} etkinlik · ${res.data.strings_translated} yeni çeviri`,
        })
      );
      globalMutate(`/point-calc?kind=${kind}`);
    } catch (e) {
      const detail = e?.response?.data?.detail || e.message;
      toast.error(`Çeviri: ${detail}`);
    } finally {
      setTranslating(false);
    }
  };

  const stepDone = (n) => n < step || (n === 3 && importResult);
  const stepNumBg = (n) =>
    n === step
      ? "linear-gradient(135deg,#F97316,#EF4444)"
      : stepDone(n)
      ? "linear-gradient(135deg,#059669,#10B981)"
      : "rgba(255,255,255,0.06)";
  const stepNumColor = (n) => (n === step || stepDone(n) ? "#fff" : "rgba(255,255,255,0.4)");

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999, background: "rgba(0,0,0,0.78)" }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      data-testid="pc-excel-wizard"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
          border: "1px solid rgba(245,158,11,0.35)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(245,158,11,0.15)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            background: "linear-gradient(90deg,rgba(245,158,11,0.12),rgba(245,158,11,0.02))",
            borderBottom: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#F59E0B,#EF4444)", boxShadow: "0 4px 14px rgba(245,158,11,0.4)" }}
            >
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3
                className="text-lg font-bold uppercase leading-none"
                style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", letterSpacing: "0.1em" }}
              >
                {t("pc_wizard_title", { defaultValue: "Excel İş Akışı" })}
              </h3>
              <div className="text-[11px] mt-1 uppercase tracking-wider" style={{ color: "rgba(245,158,11,0.7)" }}>
                {kind === "pre" ? t("pc_tab_pre", { defaultValue: "Pre" }) : t("pc_tab_other", { defaultValue: "Diğer" })}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="pc-wizard-close"
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress stepper */}
        <div className="flex items-center gap-1 px-6 pt-5">
          {[1, 2, 3].map((n, i) => (
            <React.Fragment key={n}>
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                  style={{
                    background: stepNumBg(n),
                    color: stepNumColor(n),
                    border: n === step ? "2px solid rgba(245,158,11,0.6)" : "2px solid transparent",
                    boxShadow: n === step ? "0 0 20px rgba(245,158,11,0.4)" : "none",
                  }}
                >
                  {stepDone(n) && n !== step ? <CheckCircle2 className="w-4 h-4" /> : n}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: n === step ? "#F5F0E8" : "rgba(255,255,255,0.4)" }}>
                    {n === 1 && t("pc_wizard_step1_label", { defaultValue: "İndir" })}
                    {n === 2 && t("pc_wizard_step2_label", { defaultValue: "Düzenle" })}
                    {n === 3 && t("pc_wizard_step3_label", { defaultValue: "Yükle" })}
                  </div>
                </div>
              </div>
              {i < 2 && (
                <ChevronRight className="w-4 h-4 opacity-30" style={{ color: "rgba(245,158,11,0.4)" }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-6 min-h-[280px]">
          {step === 1 && (
            <div className="text-center">
              <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)" }}>
                <Download className="w-10 h-10" style={{ color: "#10B981" }} />
              </div>
              <h4 className="text-xl font-bold mb-2" style={{ color: "#F5F0E8" }}>
                {t("pc_wizard_step1_title", { defaultValue: "Excel dosyasını indir" })}
              </h4>
              <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                {t("pc_wizard_step1_desc", {
                  defaultValue:
                    "Tüm günler, tablolar ve çeviriler tek bir .xlsx dosyasına aktarılır. LibreOffice / Excel'de düzenle, sonra 3. adımda geri yükle.",
                })}
              </p>
              <button
                onClick={download}
                disabled={busy}
                data-testid="pc-wizard-download"
                className="h-11 px-6 rounded-xl font-bold text-sm inline-flex items-center gap-2 transition-all"
                style={{
                  background: "linear-gradient(135deg,#059669,#10B981)",
                  color: "#fff",
                  boxShadow: "0 8px 24px rgba(16,185,129,0.3)",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t("pc_wizard_download_btn", { defaultValue: "Excel İndir" })}
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)" }}>
                <FileSpreadsheet className="w-10 h-10" style={{ color: "#F59E0B" }} />
              </div>
              <h4 className="text-xl font-bold mb-2 text-center" style={{ color: "#F5F0E8" }}>
                {t("pc_wizard_step2_title", { defaultValue: "Çevrim-dışı düzenle" })}
              </h4>
              <ul className="text-sm space-y-2 max-w-md mx-auto mb-6" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
                <li className="flex gap-2"><span style={{ color: "#F59E0B" }}>•</span> {t("pc_wizard_step2_bullet1", { defaultValue: "Her sekme bir gün (etkinlik); sekme adı değiştirilmemeli." })}</li>
                <li className="flex gap-2"><span style={{ color: "#F59E0B" }}>•</span> {t("pc_wizard_step2_bullet2", { defaultValue: "Tablo başlıkları, çarpanlar ve birim isimleri satırlara yayılmış — istediğin gibi düzenle." })}</li>
                <li className="flex gap-2"><span style={{ color: "#F59E0B" }}>•</span> {t("pc_wizard_step2_bullet3", { defaultValue: "`_Ceviriler` sekmesine dokunma — TR kaynak metinden Nano Banana / DeepL üretiyor." })}</li>
              </ul>
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="h-10 px-4 rounded-lg text-xs font-bold"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  ← {t("pc_wizard_back", { defaultValue: "Geri" })}
                </button>
                <button
                  onClick={() => { setStep(3); _track("step2_next", kind, sessionId); }}
                  data-testid="pc-wizard-next-3"
                  className="h-10 px-6 rounded-lg text-sm font-bold inline-flex items-center gap-2"
                  style={{ background: "linear-gradient(135deg,#F97316,#EF4444)", color: "#fff", boxShadow: "0 6px 18px rgba(239,68,68,0.3)" }}
                >
                  {t("pc_wizard_ready_upload", { defaultValue: "Hazır, yükle" })} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)" }}>
                <Upload className="w-10 h-10" style={{ color: "#EF4444" }} />
              </div>
              <h4 className="text-xl font-bold mb-4 text-center" style={{ color: "#F5F0E8" }}>
                {t("pc_wizard_step3_title", { defaultValue: "Düzenlenmiş dosyayı yükle" })}
              </h4>
              <div className="max-w-md mx-auto space-y-3">
                <label
                  className="block rounded-lg p-4 cursor-pointer text-center transition-all"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px dashed ${file ? "rgba(16,185,129,0.6)" : "rgba(255,255,255,0.15)"}`,
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const dropped = e.dataTransfer?.files?.[0];
                    if (dropped && dropped.name.toLowerCase().endsWith(".xlsx")) setFile(dropped);
                  }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    data-testid="pc-wizard-file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  {file ? (
                    <div style={{ color: "#10B981" }}>
                      <CheckCircle2 className="w-6 h-6 mx-auto mb-1" />
                      <div className="text-sm font-medium">{file.name}</div>
                      <div className="text-[11px] opacity-60 mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                  ) : (
                    <div style={{ color: "rgba(255,255,255,0.55)" }}>
                      <Upload className="w-6 h-6 mx-auto mb-1" />
                      <div className="text-sm">{t("pc_wizard_pick_file", { defaultValue: "Dosya seç veya buraya sürükle" })}</div>
                      <div className="text-[11px] opacity-60 mt-1">.xlsx</div>
                    </div>
                  )}
                </label>

                {importResult && (
                  <div
                    className="rounded-lg p-3 text-xs space-y-1"
                    style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", color: "#D1FAE5" }}
                    data-testid="pc-wizard-import-result"
                  >
                    <div>✅ <strong>{importResult.updated}</strong> {t("pc_wizard_updated", { defaultValue: "etkinlik güncellendi" })}</div>
                    {importResult.skipped > 0 && (
                      <div>⚠️ {importResult.skipped} {t("pc_wizard_skipped", { defaultValue: "eşleşmeyen sekme atlandı" })}</div>
                    )}
                    {(importResult.errors || []).slice(0, 3).map((er, i) => (
                      <div key={i} className="opacity-70">↳ {er}</div>
                    ))}
                  </div>
                )}

                {translated && (
                  <div
                    className="rounded-lg p-3 text-xs"
                    style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", color: "#E0E7FF" }}
                    data-testid="pc-wizard-translate-result"
                  >
                    🌍 <strong>{translated.days_processed}</strong> {t("pc_wizard_days", { defaultValue: "gün" })} ·{" "}
                    <strong>{translated.strings_translated}</strong> {t("pc_wizard_new_translations", { defaultValue: "yeni çeviri" })}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setStep(2)}
                    className="h-10 px-4 rounded-lg text-xs font-bold"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    ← {t("pc_wizard_back", { defaultValue: "Geri" })}
                  </button>
                  <button
                    onClick={importFile}
                    disabled={!file || busy}
                    data-testid="pc-wizard-import"
                    className="flex-1 h-10 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: !file || busy ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#F97316,#EF4444)",
                      color: !file || busy ? "rgba(255,255,255,0.4)" : "#fff",
                      boxShadow: !file || busy ? "none" : "0 6px 18px rgba(239,68,68,0.3)",
                    }}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {t("pc_wizard_import_btn", { defaultValue: "Yükle" })}
                  </button>
                  {importResult && (
                    <button
                      onClick={translateAll}
                      disabled={translating}
                      data-testid="pc-wizard-translate"
                      className="h-10 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                      style={{
                        background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
                        color: "#fff",
                        boxShadow: "0 6px 18px rgba(99,102,241,0.3)",
                        opacity: translating ? 0.6 : 1,
                      }}
                      title={t("pc_wizard_translate_tip", { defaultValue: "Tüm dillere çevir" })}
                    >
                      {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                      <span className="hidden sm:inline">{t("pc_wizard_translate_btn", { defaultValue: "Çevir" })}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
