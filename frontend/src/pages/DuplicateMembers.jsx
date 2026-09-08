import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Users, Merge, EyeOff, Undo2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v142.2 — Duplicate üye tespit + merge + yoksay (ignore) admin panel.
// Sekmeler: "Aktif Çiftler" (fuzzy önerileri) ve "Yoksayılanlar" (undo destekli).
export default function DuplicateMembers() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("active"); // active | ignored
  const [threshold, setThreshold] = useState(0.8);
  const [busyKey, setBusyKey] = useState(null);

  const {
    data: activeData,
    error: activeError,
    isLoading: activeLoading,
    mutate: mutateActive,
  } = useSWR(
    isAdmin && tab === "active" ? `/duplicates/members?threshold=${threshold}` : null,
    fetcher,
  );

  const {
    data: ignoredData,
    error: ignoredError,
    isLoading: ignoredLoading,
    mutate: mutateIgnored,
  } = useSWR(isAdmin && tab === "ignored" ? `/duplicates/ignored` : null, fetcher);

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <Header title={t("dupmembers_title", { defaultValue: "Duplicate Üyeler" })} />
        <div className="text-center opacity-60 mt-10">Bu sayfa sadece adminler içindir.</div>
      </div>
    );
  }

  const merge = async (primary_id, secondary_id, key) => {
    if (
      !window.confirm(
        t("dupmembers_confirm", {
          defaultValue:
            "İkincil üyenin puanları birincile aktarılacak ve ikincil silinecek. Emin misin?",
        }),
      )
    )
      return;
    setBusyKey(key);
    try {
      const res = await api.post("/duplicates/merge", { primary_id, secondary_id });
      toast.success(
        t("dupmembers_merged", {
          defaultValue: `${res.data.merged} → ${res.data.primary}: ${res.data.points_moved} puan taşındı`,
        }),
      );
      mutateActive();
      mutateIgnored();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const ignore = async (id_a, id_b, key) => {
    setBusyKey(key);
    try {
      const res = await api.post("/duplicates/ignore", { id_a, id_b });
      if (res.data.already_ignored) {
        toast.info(t("dupmembers_already_ignored", { defaultValue: "Bu çift zaten yoksayılıyor" }));
      } else {
        toast.success(
          t("dupmembers_ignored", {
            defaultValue: "Yoksayıldı — 'Yoksayılanlar' sekmesinden geri alabilirsin",
          }),
        );
      }
      mutateActive();
      mutateIgnored();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const unignore = async (pair_key) => {
    setBusyKey(`u-${pair_key}`);
    try {
      await api.delete(`/duplicates/ignore/${encodeURIComponent(pair_key)}`);
      toast.success(
        t("dupmembers_unignored", {
          defaultValue: "Geri alındı — çift tekrar önerilerde görünebilir",
        }),
      );
      mutateActive();
      mutateIgnored();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const pairs = activeData || [];
  const ignoredList = ignoredData || [];

  return (
    <div className="min-h-screen" data-testid="duplicate-members-page">
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("dupmembers_title", { defaultValue: "Duplicate Üyeler" })}>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Tab switcher */}
            <div className="flex gap-1" data-testid="dup-tabs">
              <TabBtn
                active={tab === "active"}
                onClick={() => setTab("active")}
                testId="dup-tab-active"
                label={t("dupmembers_tab_active", { defaultValue: "Aktif Çiftler" })}
                badge={activeData ? pairs.length : null}
              />
              <TabBtn
                active={tab === "ignored"}
                onClick={() => setTab("ignored")}
                testId="dup-tab-ignored"
                label={t("dupmembers_tab_ignored", { defaultValue: "Yoksayılanlar" })}
                badge={ignoredData ? ignoredList.length : null}
              />
            </div>
            {tab === "active" && (
              <div className="flex items-center gap-2">
                <label
                  className="text-xs opacity-70 uppercase tracking-widest"
                  style={{ color: "#F5F0E8" }}
                >
                  {t("dupmembers_threshold", { defaultValue: "Benzerlik" })} %
                  {Math.round(threshold * 100)}
                </label>
                <input
                  type="range"
                  min="0.6"
                  max="1"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  data-testid="dup-threshold"
                  className="w-24"
                />
              </div>
            )}
          </div>
        </Header>

        {/* ACTIVE PAIRS TAB */}
        {tab === "active" && (
          <>
            {activeLoading && <div className="text-center opacity-60 mt-10">Aranıyor…</div>}
            {activeError && (
              <div className="text-center opacity-60 mt-10" style={{ color: "#F87171" }}>
                Hata: {activeError.message}
              </div>
            )}
            {!activeLoading && pairs.length === 0 && (
              <div className="text-center opacity-60 mt-10 flex flex-col items-center gap-3">
                <Users className="w-12 h-12 opacity-30" />
                {t("dupmembers_none", {
                  defaultValue: "Bu benzerlik eşiğinde duplicate bulunamadı.",
                })}
              </div>
            )}

            <div className="grid gap-2 mt-4">
              {pairs.map((p, i) => {
                const key = `${p.a.id}-${p.b.id}`;
                const busy = busyKey === key;
                return (
                  <div
                    key={key}
                    data-testid={`dup-pair-${i}`}
                    className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                    style={{
                      background: "linear-gradient(180deg,#1a0f0a 0%,#0e0805 100%)",
                      border: "1px solid rgba(245,158,11,0.25)",
                    }}
                  >
                    <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
                      <MemberCard m={p.a} />
                      <MemberCard m={p.b} />
                    </div>
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <div
                        className="px-2 py-1 rounded-full text-xs font-bold"
                        style={{
                          background:
                            p.similarity > 0.95
                              ? "#EF4444"
                              : p.similarity > 0.85
                              ? "#F59E0B"
                              : "#6366F1",
                          color: "#fff",
                        }}
                      >
                        %{Math.round(p.similarity * 100)}
                      </div>
                      <div className="flex gap-1 flex-wrap justify-center">
                        <button
                          onClick={() => merge(p.a.id, p.b.id, key)}
                          disabled={busy}
                          data-testid={`dup-merge-a-${i}`}
                          className="h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                          style={{
                            background: "linear-gradient(135deg,#059669,#10B981)",
                            color: "#fff",
                            opacity: busy ? 0.6 : 1,
                          }}
                          title={t("dupmembers_keep_a", { defaultValue: "İlkini tut" })}
                        >
                          <Merge className="w-3 h-3" /> ← A
                        </button>
                        <button
                          onClick={() => merge(p.b.id, p.a.id, key)}
                          disabled={busy}
                          data-testid={`dup-merge-b-${i}`}
                          className="h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                          style={{
                            background: "linear-gradient(135deg,#059669,#10B981)",
                            color: "#fff",
                            opacity: busy ? 0.6 : 1,
                          }}
                          title={t("dupmembers_keep_b", { defaultValue: "İkinciyi tut" })}
                        >
                          B → <Merge className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => ignore(p.a.id, p.b.id, key)}
                          disabled={busy}
                          data-testid={`dup-ignore-${i}`}
                          className="h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                          style={{
                            background: "linear-gradient(135deg,#4B5563,#6B7280)",
                            color: "#fff",
                            opacity: busy ? 0.6 : 1,
                          }}
                          title={t("dupmembers_ignore_hint", {
                            defaultValue:
                              "Bu çift duplicate değil — sonraki taramalarda gizle",
                          })}
                        >
                          <EyeOff className="w-3 h-3" />
                          {t("dupmembers_ignore_btn", { defaultValue: "Yoksay" })}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* IGNORED TAB */}
        {tab === "ignored" && (
          <>
            {ignoredLoading && <div className="text-center opacity-60 mt-10">Yükleniyor…</div>}
            {ignoredError && (
              <div className="text-center opacity-60 mt-10" style={{ color: "#F87171" }}>
                Hata: {ignoredError.message}
              </div>
            )}
            {!ignoredLoading && ignoredList.length === 0 && (
              <div className="text-center opacity-60 mt-10 flex flex-col items-center gap-3">
                <EyeOff className="w-12 h-12 opacity-30" />
                {t("dupmembers_ignored_none", {
                  defaultValue: "Henüz yoksayılan çift yok.",
                })}
              </div>
            )}

            <div className="grid gap-2 mt-4">
              {ignoredList.map((it) => {
                const busy = busyKey === `u-${it.pair_key}`;
                return (
                  <div
                    key={it.pair_key}
                    data-testid={`dup-ignored-${it.pair_key}`}
                    className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                    style={{
                      background: "linear-gradient(180deg,#0f1419 0%,#080c11 100%)",
                      border: "1px solid rgba(107,114,128,0.35)",
                    }}
                  >
                    <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
                      <MemberCard m={it.a} deleted={!it.a_exists} />
                      <MemberCard m={it.b} deleted={!it.b_exists} />
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0 min-w-[140px]">
                      <div
                        className="text-[10px] opacity-70 text-right"
                        style={{ color: "#F5F0E8" }}
                      >
                        <div>
                          {t("dupmembers_ignored_by", { defaultValue: "Yoksayan" })}:{" "}
                          <b>{it.ignored_by || "?"}</b>
                        </div>
                        <div>{formatDate(it.ignored_at)}</div>
                      </div>
                      <button
                        onClick={() => unignore(it.pair_key)}
                        disabled={busy}
                        data-testid={`dup-unignore-${it.pair_key}`}
                        className="h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                        style={{
                          background: "linear-gradient(135deg,#B45309,#F59E0B)",
                          color: "#fff",
                          opacity: busy ? 0.6 : 1,
                        }}
                        title={t("dupmembers_unignore_hint", {
                          defaultValue: "Yoksayma kaydını sil — tekrar önerilerde görünsün",
                        })}
                      >
                        <Undo2 className="w-3 h-3" />
                        {t("dupmembers_unignore_btn", { defaultValue: "Geri Al" })}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, badge, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="h-8 px-3 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
      style={{
        background: active
          ? "linear-gradient(135deg,#B45309,#F59E0B)"
          : "rgba(255,255,255,0.05)",
        color: active ? "#0D0D0D" : "#F5F0E8",
        border: active ? "1px solid rgba(245,158,11,0.6)" : "1px solid rgba(255,255,255,0.1)",
        fontFamily: "'Cinzel','Rajdhani',serif",
        letterSpacing: "0.08em",
      }}
    >
      {label}
      {typeof badge === "number" && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: active ? "rgba(0,0,0,0.25)" : "rgba(245,158,11,0.25)",
            color: active ? "#0D0D0D" : "#F5D06A",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function MemberCard({ m, deleted }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: deleted ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)",
        border: deleted
          ? "1px dashed rgba(239,68,68,0.4)"
          : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="text-sm font-bold flex items-center gap-2"
        style={{ color: deleted ? "#F87171" : "#F5F0E8" }}
      >
        {deleted && <Trash2 className="w-3 h-3" />}
        <span className={deleted ? "line-through" : ""}>{m?.name || "—"}</span>
      </div>
      {!deleted && (
        <div className="text-xs opacity-60 mt-1" style={{ color: "#F5F0E8" }}>
          {m?.alliance_name || "—"} · {m?.country || "?"} · GG{" "}
          {(m?.power || 0).toLocaleString("tr-TR")}
        </div>
      )}
      {deleted && (
        <div className="text-[10px] opacity-70 mt-1" style={{ color: "#F87171" }}>
          (üye silinmiş)
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
