import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Users, Merge, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";

const fetcher = (url) => api.get(url).then((r) => r.data);

// v141 — Duplicate üye tespit + merge admin panel.
export default function DuplicateMembers() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [threshold, setThreshold] = useState(0.8);
  const [busyKey, setBusyKey] = useState(null);
  const { data, error, isLoading, mutate } = useSWR(
    isAdmin ? `/duplicates/members?threshold=${threshold}` : null,
    fetcher,
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <Header title={t("dupmembers_title", { defaultValue: "Duplicate Üyeler" })} />
        <div className="text-center opacity-60 mt-10">Bu sayfa sadece adminler içindir.</div>
      </div>
    );
  }

  const merge = async (primary_id, secondary_id, key) => {
    if (!window.confirm(t("dupmembers_confirm", { defaultValue: "İkincil üyenin puanları birincile aktarılacak ve ikincil silinecek. Emin misin?" }))) return;
    setBusyKey(key);
    try {
      const res = await api.post("/duplicates/merge", { primary_id, secondary_id });
      toast.success(t("dupmembers_merged", {
        defaultValue: `${res.data.merged} → ${res.data.primary}: ${res.data.points_moved} puan taşındı`,
      }));
      mutate();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setBusyKey(null);
    }
  };

  const pairs = data || [];

  return (
    <div className="min-h-screen" data-testid="duplicate-members-page">
      <div className="max-w-6xl mx-auto p-4">
        <Header title={t("dupmembers_title", { defaultValue: "Duplicate Üyeler" })}>
          <div className="flex items-center gap-3">
            <label className="text-xs opacity-70 uppercase tracking-widest" style={{ color: "#F5F0E8" }}>
              {t("dupmembers_threshold", { defaultValue: "Benzerlik" })} %{Math.round(threshold * 100)}
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
        </Header>

        {isLoading && <div className="text-center opacity-60 mt-10">Aranıyor…</div>}
        {error && <div className="text-center opacity-60 mt-10" style={{ color: "#F87171" }}>Hata: {error.message}</div>}
        {!isLoading && pairs.length === 0 && (
          <div className="text-center opacity-60 mt-10 flex flex-col items-center gap-3">
            <Users className="w-12 h-12 opacity-30" />
            {t("dupmembers_none", { defaultValue: "Bu benzerlik eşiğinde duplicate bulunamadı." })}
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
                      background: p.similarity > 0.95 ? "#EF4444" : p.similarity > 0.85 ? "#F59E0B" : "#6366F1",
                      color: "#fff",
                    }}
                  >
                    %{Math.round(p.similarity * 100)}
                  </div>
                  <div className="flex gap-1">
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

function MemberCard({ m }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="text-sm font-bold" style={{ color: "#F5F0E8" }}>{m.name}</div>
      <div className="text-xs opacity-60 mt-1" style={{ color: "#F5F0E8" }}>
        {m.alliance_name || "—"} · {m.country || "?"} · GG {(m.power || 0).toLocaleString("tr-TR")}
      </div>
    </div>
  );
}
