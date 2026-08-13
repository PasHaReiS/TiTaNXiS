import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { History as HistoryIcon, Image as ImageIcon, User } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function OcrHistory() {
  const { data = [], isLoading } = useSWR("/ocr/history?limit=200", fetcher, { refreshInterval: 10000 });
  return (
    <div className="min-h-screen" data-testid="ocr-history-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title="OCR İçe Aktarım Geçmişi" />
        <div className="card-red-gold p-4 mt-4">
          <div className="text-xs uppercase gold-text tracking-widest mb-3 flex items-center gap-2">
            <HistoryIcon className="w-4 h-4" /> Son {data.length} işlem
          </div>
          {isLoading && <div className="text-sm text-muted-foreground">Yükleniyor…</div>}
          {!isLoading && data.length === 0 && (
            <div className="text-sm text-muted-foreground italic">Henüz OCR ithalatı kaydı yok.</div>
          )}
          <div className="flex flex-col gap-2">
            {data.map((r) => (
              <div
                key={r.id}
                className="rounded-lg p-3 flex items-center justify-between gap-3"
                style={{ background: "rgba(20,12,10,0.6)", border: "1px solid rgba(231,76,26,0.25)" }}
                data-testid={`ocr-hist-row-${r.id}`}
              >
                <div className="flex flex-col min-w-0">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    {r.mode === "members" ? "Üye Listesi" : r.mode === "event" ? "Etkinlik Puanı" : r.mode}
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {r.created_at ? new Date(r.created_at).toLocaleString("tr-TR") : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <User className="w-3 h-3" /> {r.actor || "—"}
                    {r.event_name && <span className="ml-2 gold-text">· {r.event_name}</span>}
                  </div>
                </div>
                <div className="text-right text-[11px] flex-shrink-0">
                  {r.created > 0 && (
                    <div><span className="text-green-400 font-bold">+{r.created}</span> yeni</div>
                  )}
                  {r.updated > 0 && (
                    <div><span className="text-amber-400 font-bold">{r.updated}</span> güncel</div>
                  )}
                  {r.errors > 0 && (
                    <div><span className="text-red-400 font-bold">{r.errors}</span> hata</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
