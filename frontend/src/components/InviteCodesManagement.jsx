import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Plus, Copy, Trash2, Check, KeyRound } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * v140.34 — Davet Kodları (8-karakter alfanümerik). Admin kod üretir,
 * kullanıcı /api/auth/register üzerinden 1 kez tüketir.
 */
export default function InviteCodesManagement() {
  const { t } = useTranslation();
  const { data, mutate, isLoading } = useSWR("/invite-codes", fetcher);
  const items = (data && data.items) || [];
  const [busy, setBusy] = useState(false);
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [copied, setCopied] = useState(null);

  const generate = async () => {
    setBusy(true);
    try {
      await api.post("/invite-codes");
      toast.success(t("invite_code_created", "Yeni davet kodu oluşturuldu"));
      await mutate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };

  const generateBulk = async () => {
    setBulkBusy(true);
    try {
      const r = await api.post(`/invite-codes/bulk?count=${bulkCount}`);
      const n = r.data?.created || 0;
      toast.success(t("invite_code_bulk_created", "{{n}} davet kodu üretildi", { n }));
      await mutate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const remove = async (code) => {
    if (!window.confirm(t("invite_code_delete_confirm", "Bu davet kodunu silmek istediğine emin misin?"))) return;
    try {
      await api.delete(`/invite-codes/${encodeURIComponent(code)}`);
      toast.success(t("invite_code_deleted", "Davet kodu silindi"));
      await mutate();
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1200);
      toast.success(t("invite_code_copied", "Kod kopyalandı"));
    } catch {
      toast.error(t("invite_code_copy_failed", "Kopyalanamadı"));
    }
  };

  const pending = items.filter((i) => !i.used).length;
  const used = items.filter((i) => i.used).length;

  return (
    <div data-testid="invite-codes-panel" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>
            <KeyRound className="w-4 h-4" /> {t("invite_codes_title", "Davet Kodları")}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">
            {t("invite_codes_subtitle", "Her kod tek kullanımlıktır — kullanıcı kayıt olduğunda otomatik yakılır.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-widest flex items-center gap-2">
            <span className="chip text-[10px]" style={{ borderColor: "#22C55E", color: "#22C55E" }}>
              {t("invite_codes_pending", "Bekliyor")}: {pending}
            </span>
            <span className="chip text-[10px]" style={{ borderColor: "rgba(148,163,184,0.5)", color: "#94A3B8" }}>
              {t("invite_codes_used", "Kullanıldı")}: {used}
            </span>
          </div>
          <button
            data-testid="invite-code-create-btn"
            onClick={generate}
            disabled={busy}
            className="chip text-xs flex items-center gap-1.5"
            style={{
              borderColor: "#F5A623", color: "#0B0704",
              background: "linear-gradient(135deg, #F5A623, #E74C1A)",
              fontWeight: 800,
              opacity: busy ? 0.6 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            {busy ? t("invite_code_creating", "Üretiliyor…") : t("invite_code_create_btn", "Yeni Kod Üret")}
          </button>
          {/* v136 — Toplu üretim: 5/10/20 seçimi + tek buton */}
          <div
            className="flex items-center gap-1.5 rounded-lg px-2 py-1"
            style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(168,85,247,0.4)" }}
            data-testid="invite-code-bulk-controls"
          >
            <span className="text-[10px] uppercase font-bold" style={{ color: "#C4B5FD", letterSpacing: "0.08em" }}>
              {t("invite_code_bulk_label", "Toplu")}
            </span>
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBulkCount(n)}
                data-testid={`invite-code-bulk-count-${n}`}
                className="chip text-[10px]"
                style={
                  bulkCount === n
                    ? { background: "rgba(168,85,247,0.35)", color: "#EDE9FE", borderColor: "#A78BFA", fontWeight: 800 }
                    : {}
                }
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={generateBulk}
              disabled={bulkBusy}
              data-testid="invite-code-bulk-create-btn"
              className="chip text-[10px] flex items-center gap-1"
              style={{
                borderColor: "#A78BFA", color: "#0B0704",
                background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
                fontWeight: 800,
                opacity: bulkBusy ? 0.6 : 1,
                cursor: bulkBusy ? "not-allowed" : "pointer",
              }}
            >
              <Plus className="w-3 h-3" />
              {bulkBusy
                ? t("invite_code_bulk_creating", "Üretiliyor…")
                : t("invite_code_bulk_create_btn", "{{n}} Kod Üret", { n: bulkCount })}
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground text-center py-6">
          {t("loading", "Yükleniyor…")}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div
          data-testid="invite-codes-empty"
          className="text-center py-8 rounded-lg"
          style={{ background: "rgba(15,10,20,0.55)", border: "1px dashed rgba(245,166,35,0.35)" }}
        >
          <div className="text-xs text-muted-foreground mb-1">
            {t("invite_codes_empty", "Henüz davet kodu yok")}
          </div>
          <div className="text-[10px] text-muted-foreground opacity-70">
            {t("invite_codes_empty_hint", "\"Yeni Kod Üret\" butonuna bas → paylaşabileceğin 8 haneli bir kod oluşur.")}
          </div>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-2" data-testid="invite-codes-list">
          {items.map((it) => (
            <div
              key={it.code}
              data-testid={`invite-code-row-${it.code}`}
              className="rounded-lg p-3 flex items-center gap-3 flex-wrap"
              style={{
                background: "rgba(10,6,4,0.72)",
                border: `1px solid ${it.used ? "rgba(148,163,184,0.35)" : "rgba(245,166,35,0.5)"}`,
                opacity: it.used ? 0.75 : 1,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code
                    data-testid={`invite-code-value-${it.code}`}
                    className="font-mono font-bold text-base"
                    style={{
                      letterSpacing: "0.18em",
                      color: it.used ? "#94A3B8" : "#F5A623",
                      textDecoration: it.used ? "line-through" : "none",
                    }}
                  >
                    {it.code}
                  </code>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest"
                    style={{
                      background: it.used ? "rgba(148,163,184,0.20)" : "rgba(34,197,94,0.20)",
                      color: it.used ? "#94A3B8" : "#86EFAC",
                    }}
                  >
                    {it.used
                      ? t("invite_code_status_used", "Kullanıldı")
                      : t("invite_code_status_pending", "Bekliyor")}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {it.created_by_username && (
                    <span>
                      {t("invite_code_created_by", "Oluşturan")}:{" "}
                      <span className="gold-text">{it.created_by_username}</span>
                    </span>
                  )}
                  {it.created_at && (
                    <span>{new Date(it.created_at).toLocaleString("tr-TR")}</span>
                  )}
                  {it.used && it.used_by && (
                    <span>
                      {t("invite_code_used_by", "Kayıt olan")}:{" "}
                      <span style={{ color: "#86EFAC" }}>{it.used_by}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!it.used && (
                  <button
                    data-testid={`invite-code-copy-${it.code}`}
                    onClick={() => copyCode(it.code)}
                    className="chip text-[10px] flex items-center gap-1"
                    style={{ borderColor: "rgba(245,166,35,0.6)", color: "#F5A623" }}
                    title={t("invite_code_copy_title", "Kodu kopyala")}
                  >
                    {copied === it.code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === it.code
                      ? t("invite_code_copied_short", "Kopyalandı")
                      : t("invite_code_copy_btn", "Kopyala")}
                  </button>
                )}
                <button
                  data-testid={`invite-code-delete-${it.code}`}
                  onClick={() => remove(it.code)}
                  className="chip text-[10px] flex items-center gap-1"
                  style={{ borderColor: "rgba(239,68,68,0.6)", color: "#F87171" }}
                  title={t("invite_code_delete_title", "Kodu sil")}
                >
                  <Trash2 className="w-3 h-3" /> {t("delete", "Sil")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
