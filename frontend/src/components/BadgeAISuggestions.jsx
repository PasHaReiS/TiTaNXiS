import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles, Check, X, RefreshCw, Bot } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v142.3 — Per-member AI badge suggestion panel.
// Admin: "🔄 Yeni Öneri Al" (POST), her öneride ✅ Onayla / ❌ Reddet.
// Non-admin: read-only listeleme.
export default function BadgeAISuggestions({ memberId, memberName }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actingKey, setActingKey] = useState(null);
  const { data, error, mutate, isLoading } = useSWR(
    memberId ? `/members/${memberId}/badge-suggestions` : null,
    fetcher,
  );

  const items = data?.items || [];

  const regenerate = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      const res = await api.post(`/members/${memberId}/badge-suggestions`);
      const cnt = (res.data?.suggestions || []).length;
      toast.success(
        t("badgeai_generated", { defaultValue: `${cnt} yeni öneri üretildi 🤖`, count: cnt }),
      );
      mutate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (s) => {
    setActingKey(s.id);
    try {
      await api.post(`/members/${memberId}/badge-suggestions/${s.id}/approve`);
      toast.success(
        t("badgeai_approved", {
          defaultValue: `✅ "${s.badge_name}" rozeti verildi`,
          badge: s.badge_name,
        }),
      );
      mutate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setActingKey(null);
    }
  };

  const reject = async (s) => {
    setActingKey(s.id);
    try {
      await api.post(`/members/${memberId}/badge-suggestions/${s.id}/reject`);
      toast.info(
        t("badgeai_rejected", {
          defaultValue: `❌ "${s.badge_name}" reddedildi`,
          badge: s.badge_name,
        }),
      );
      mutate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setActingKey(null);
    }
  };

  return (
    <div
      data-testid={`badge-ai-panel-${memberId}`}
      className="rounded-lg p-3 mb-3"
      style={{
        background: "linear-gradient(180deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))",
        border: "1px solid rgba(139,92,246,0.35)",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div
          className="flex items-center gap-1.5 text-[10px] uppercase font-bold"
          style={{ color: "#A78BFA", letterSpacing: "0.14em" }}
        >
          <Bot className="w-3 h-3" />
          {t("badgeai_title", { defaultValue: "YZ Rozet Önerisi" })}
          {memberName && <span className="opacity-70">— {memberName}</span>}
        </div>
        {isAdmin && (
          <button
            type="button"
            data-testid={`badge-ai-regen-${memberId}`}
            onClick={regenerate}
            disabled={busy}
            className="text-[10px] uppercase font-bold px-2 py-1 rounded inline-flex items-center gap-1"
            style={{
              background: busy
                ? "rgba(139,92,246,0.15)"
                : "linear-gradient(135deg,#7C3AED,#A78BFA)",
              color: "#fff",
              opacity: busy ? 0.6 : 1,
              letterSpacing: "0.08em",
            }}
            title={t("badgeai_regen_hint", {
              defaultValue: "Üye istatistiklerini analiz et ve yeni öneri üret",
            })}
          >
            {busy ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {busy
              ? t("badgeai_analysing", { defaultValue: "Analiz ediliyor…" })
              : t("badgeai_regen_btn", { defaultValue: "Yeni Öneri" })}
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs" style={{ color: "#F87171" }}>
          {apiErr(error)}
        </div>
      )}

      {isLoading && (
        <div className="text-[10px] opacity-60 italic">
          {t("badgeai_loading", { defaultValue: "Öneriler yükleniyor…" })}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-[10px] opacity-60 italic" data-testid={`badge-ai-empty-${memberId}`}>
          {isAdmin
            ? t("badgeai_empty_admin", {
                defaultValue: "Henüz öneri yok. 'Yeni Öneri' butonuyla üret.",
              })
            : t("badgeai_empty", { defaultValue: "Henüz öneri yok." })}
        </div>
      )}

      <div className="grid gap-1.5">
        {items.map((s) => {
          const acting = actingKey === s.id;
          const confPct = Math.round((s.confidence || 0) * 100);
          return (
            <div
              key={s.id}
              data-testid={`badge-ai-suggestion-${s.id}`}
              className="rounded p-2 flex items-start gap-2"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-white truncate">{s.badge_name}</span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background:
                        confPct >= 80
                          ? "#059669"
                          : confPct >= 60
                          ? "#F59E0B"
                          : "#6B7280",
                      color: "#fff",
                    }}
                    title={t("badgeai_confidence", { defaultValue: "Güven" })}
                  >
                    %{confPct}
                  </span>
                </div>
                <div className="text-[11px] opacity-80" style={{ color: "#E5E7EB" }}>
                  {s.reason || "—"}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => approve(s)}
                    disabled={acting}
                    data-testid={`badge-ai-approve-${s.id}`}
                    className="w-7 h-7 rounded inline-flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg,#059669,#10B981)",
                      color: "#fff",
                      opacity: acting ? 0.5 : 1,
                    }}
                    title={t("badgeai_approve", { defaultValue: "Onayla" })}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => reject(s)}
                    disabled={acting}
                    data-testid={`badge-ai-reject-${s.id}`}
                    className="w-7 h-7 rounded inline-flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg,#B91C1C,#EF4444)",
                      color: "#fff",
                      opacity: acting ? 0.5 : 1,
                    }}
                    title={t("badgeai_reject", { defaultValue: "Reddet" })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
