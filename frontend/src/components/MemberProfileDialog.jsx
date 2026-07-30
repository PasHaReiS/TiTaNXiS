import React from "react";
import useSWR from "swr";
import { api, fmt } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Trophy, Calendar, TrendingUp } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function MemberProfileDialog({ memberId, open, onClose }) {
  const { data } = useSWR(memberId && open ? `/members/${memberId}/history` : null, fetcher);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="card-dark border-primary/30 max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            {data?.member && (
              <>
                <div className={`rank-badge rank-${data.member.rank}`}>{data.member.rank === "GOW" ? "" : data.member.rank}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold uppercase text-white truncate">{data.member.name}</div>
                  <div className="text-xs text-muted-foreground mono">ID: {data.member.member_id}</div>
                  {data.member.alliance_name && <div className="text-xs text-white/70 truncate">🛡 {data.member.alliance_name}</div>}
                </div>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {!data && <div className="p-4 text-center text-muted-foreground">Yükleniyor...</div>}

        {data && (
          <div className="px-4 pb-4">
            {data.member.title && (
              <div className="chip active mb-3">
                <Trophy className="w-3 h-3" />
                {data.member.title}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="stat-pill">
                <div className="stat-label">Toplam Puan</div>
                <div className="stat-value">{fmt(data.total)}</div>
              </div>
              <div className="stat-pill">
                <div className="stat-label">Etkinlik</div>
                <div className="stat-value">{data.event_count}</div>
              </div>
            </div>

            <div className="section-title">Puan Geçmişi</div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {data.points.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Henüz puan kaydı yok.</div>}
              {data.points.map((p) => (
                <div key={p.id} className="card-dark p-3 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{p.event_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(p.date).toLocaleDateString("tr-TR")}
                      {p.note && <span className="truncate">• {p.note}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="gold-text font-bold mono">+{fmt(p.points * (p.multiplier || 1))}</div>
                    <div className="text-[10px] text-muted-foreground">{p.multiplier}x</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
