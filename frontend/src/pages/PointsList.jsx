import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { api, fmt } from "@/lib/api";
import { POINTS } from "@/constants/testIds";
import Header from "@/components/Header";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function PointsList() {
  const [q, setQ] = useState("");
  const { data: points = [] } = useSWR("/points?limit=2000", fetcher, { refreshInterval: 5000 });

  const filtered = useMemo(() => {
    if (!q) return points;
    const s = q.toLowerCase();
    return points.filter((p) =>
      (p.member_name || "").toLowerCase().includes(s) ||
      (p.event_name || "").toLowerCase().includes(s) ||
      (p.note || "").toLowerCase().includes(s)
    );
  }, [points, q]);

  return (
    <div data-testid={POINTS.container}>
      <Header subtitle="Tüm Puan Kayıtları" />
      <div className="px-4">
        <h2 className="text-xl font-bold uppercase red-text tracking-wider">Puan Listesi</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Görüntülenen: <span className="gold-text font-bold mono">{filtered.length}</span> / {points.length}
        </p>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid={POINTS.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Üye, etkinlik veya not ara..."
            className="w-full card-dark pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="space-y-1.5">
          {filtered.map((p) => (
            <div key={p.id} data-testid={POINTS.row(p.id)} className="card-dark p-3 row-hover">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white text-sm truncate">{p.member_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.event_name} {p.note && <span className="text-white/70">• {p.note}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 mono">
                    {new Date(p.date).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="gold-text font-bold mono text-sm">+{fmt(p.points * (p.multiplier || 1))}</div>
                  <div className="text-[10px] text-muted-foreground">Puan: {fmt(p.points)} × {p.multiplier || 1}</div>
                </div>
                <button
                  onClick={async () => {
                    if (!window.confirm("Kayıt silinsin mi?")) return;
                    await api.delete(`/points/${p.id}`);
                    globalMutate((k) => typeof k === "string" && k.startsWith("/points"));
                    globalMutate("/stats");
                    globalMutate("/leaderboard");
                    toast.success("Silindi");
                  }}
                  className="w-7 h-7 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                  aria-label="Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="card-dark p-6 text-center text-muted-foreground">Kayıt bulunamadı.</div>}
        </div>
      </div>
    </div>
  );
}
