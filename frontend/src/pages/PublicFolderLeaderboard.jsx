import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import useSWR from "swr";
import { Crown, Medal, Award, Users, Trophy, Calendar } from "lucide-react";
import { api } from "@/lib/api";

const fetcher = (url) => api.get(url).then((r) => r.data);

const fmt = (n) => Number(n || 0).toLocaleString("tr-TR");

/**
 * Public read-only aggregated leaderboard for a single archive folder.
 *
 * Combines every archived event inside the folder into one big ranking so
 * admins can share a season recap URL with the guild chat without exposing
 * any admin controls. Route:  /public/folder/:folderId
 */
export default function PublicFolderLeaderboard() {
  const { folderId } = useParams();
  const { data, error, isLoading } = useSWR(
    folderId ? `/public/folder/${encodeURIComponent(folderId)}` : null,
    fetcher,
    { refreshInterval: 30000 },
  );

  const folder = data?.folder;
  const events = data?.events || [];
  const rows = data?.leaderboard || [];
  const totalPoints = useMemo(() => rows.reduce((s, r) => s + Number(r.total_points || 0), 0), [rows]);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  const tint = folder?.color || "#F5A623";
  const icon = folder?.icon || "📁";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B0704" }}>
        <div className="text-sm" style={{ color: "#F5A623" }}>Yükleniyor…</div>
      </div>
    );
  }
  if (error || !folder) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0B0704" }}>
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🚫</div>
          <div className="text-lg font-bold mb-1" style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}>Klasör bulunamadı</div>
          <div className="text-xs text-muted-foreground">
            Bu bağlantı geçersiz olabilir veya klasör silinmiş olabilir.
          </div>
        </div>
      </div>
    );
  }

  const podiumHeights = [140, 170, 120]; // 2nd, 1st, 3rd
  const podiumIcons = [Medal, Crown, Award];
  const podiumColors = ["#C0C0C0", "#F5A623", "#CD7F32"];
  const podiumOrder = [1, 0, 2]; // display: 2nd left, 1st middle, 3rd right

  return (
    <div className="min-h-screen" data-testid="public-folder-page" style={{ background: "linear-gradient(180deg, #0B0704 0%, #1A0F08 100%)" }}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div
          className="rounded-xl p-4 mb-5"
          data-testid="public-folder-header"
          style={{
            background: `linear-gradient(160deg, ${tint}22 0%, rgba(20,12,10,0.85) 100%)`,
            border: `1px solid ${tint}55`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 40px ${tint}22`,
          }}
        >
          <div className="flex items-center gap-3">
            <div style={{ fontSize: 42 }}>{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest" style={{ color: tint, letterSpacing: "0.14em" }}>
                Sezon Özeti · Klasör Sıralaması
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold truncate"
                style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}
              >
                {folder.name}
              </h1>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div
              className="rounded-lg p-2 text-center"
              style={{ background: "rgba(20,12,10,0.6)", border: `1px solid ${tint}33` }}
            >
              <div className="text-[9px] uppercase tracking-widest opacity-70" style={{ color: tint }}>Etkinlik</div>
              <div className="text-lg font-bold mono" style={{ color: "#F5F0E8" }}>{events.length}</div>
            </div>
            <div
              className="rounded-lg p-2 text-center"
              style={{ background: "rgba(20,12,10,0.6)", border: `1px solid ${tint}33` }}
            >
              <div className="text-[9px] uppercase tracking-widest opacity-70" style={{ color: tint }}>Katılımcı</div>
              <div className="text-lg font-bold mono" style={{ color: "#F5F0E8" }}>{rows.length}</div>
            </div>
            <div
              className="rounded-lg p-2 text-center"
              style={{ background: "rgba(20,12,10,0.6)", border: `1px solid ${tint}33` }}
            >
              <div className="text-[9px] uppercase tracking-widest opacity-70" style={{ color: tint }}>Toplam Puan</div>
              <div className="text-lg font-bold mono" style={{ color: "#F5A623" }}>{fmt(totalPoints)}</div>
            </div>
          </div>
        </div>

        {/* Events strip */}
        {events.length > 0 && (
          <div className="mb-5" data-testid="public-folder-events">
            <div className="text-[10px] uppercase tracking-widest mb-2 font-bold" style={{ color: tint, letterSpacing: "0.12em" }}>
              <Calendar className="inline w-3 h-3 mr-1" /> İçindeki Etkinlikler
            </div>
            <div className="flex flex-wrap gap-1.5">
              {events.map((e) => (
                <div
                  key={e.id}
                  data-testid={`public-folder-event-${e.id}`}
                  className="chip text-[10px]"
                  style={{
                    padding: "4px 10px",
                    borderColor: `${tint}55`,
                    color: "#EAD8B0",
                    background: `${tint}12`,
                  }}
                >
                  {String(e.date || "").slice(0, 10)} · {e.name}
                  {e.compare_wins > 0 && <span className="ml-1" title={`${e.compare_wins} kez galip`}>👑</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Podium */}
        {podium.length > 0 && (
          <div className="mb-5" data-testid="public-folder-podium">
            <div className="text-[10px] uppercase tracking-widest mb-2 font-bold" style={{ color: tint, letterSpacing: "0.12em" }}>
              <Trophy className="inline w-3 h-3 mr-1" /> Podyum
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              {podiumOrder.map((idx) => {
                const r = podium[idx];
                if (!r) return <div key={idx} />;
                const Icon = podiumIcons[idx];
                const clr = podiumColors[idx];
                const h = podiumHeights[idx];
                return (
                  <div key={r.member_id} className="flex flex-col items-center" data-testid={`public-folder-podium-${idx + 1}`}>
                    <Icon className="w-6 h-6 mb-1" style={{ color: clr }} />
                    <div className="text-xs font-bold text-center truncate w-full" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }} title={r.name}>
                      {r.name || "-"}
                    </div>
                    <div className="text-[10px] mono opacity-80" style={{ color: clr }}>{fmt(r.total_points)}</div>
                    <div
                      className="w-full rounded-t-lg mt-1 flex items-start justify-center pt-2"
                      style={{
                        height: h,
                        background: `linear-gradient(180deg, ${clr}55 0%, ${clr}18 100%)`,
                        border: `1px solid ${clr}88`,
                        borderBottom: "none",
                      }}
                    >
                      <div
                        className="text-2xl font-bold"
                        style={{ color: clr, fontFamily: "Cinzel, serif", textShadow: "0 2px 4px rgba(0,0,0,0.7)" }}
                      >
                        #{idx + 1}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full ranking */}
        <div data-testid="public-folder-ranking">
          <div className="text-[10px] uppercase tracking-widest mb-2 font-bold" style={{ color: tint, letterSpacing: "0.12em" }}>
            <Users className="inline w-3 h-3 mr-1" /> Tam Sıralama
          </div>
          {rows.length === 0 ? (
            <div className="rounded-lg p-6 text-center text-sm text-muted-foreground" style={{ background: "rgba(20,12,10,0.6)" }}>
              Henüz puan yok
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {rest.map((r) => (
                <div
                  key={r.member_id}
                  data-testid={`public-folder-row-${r.member_id}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{
                    background: "rgba(20,12,10,0.6)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span className="mono text-[10px] w-8 text-right opacity-70" style={{ color: tint }}>#{r.rank}</span>
                  {r.alliance_name && (
                    <span
                      className="text-[9px] font-bold rounded-full"
                      style={{
                        background: "#E74C1A",
                        color: "#fff",
                        padding: "2px 7px",
                        letterSpacing: "0.05em",
                        fontFamily: "Cinzel, Rajdhani, serif",
                        border: "1px solid rgba(255,255,255,0.15)",
                      }}
                    >
                      {r.alliance_name}
                    </span>
                  )}
                  <span className="text-sm font-bold truncate flex-1" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }}>
                    {r.name}
                  </span>
                  <span className="text-[10px] mono opacity-60" style={{ color: "#94A3B8" }}>
                    {r.event_count} etkinlik
                  </span>
                  <span className="text-sm font-bold mono" style={{ color: "#F5A623" }}>
                    {fmt(r.total_points)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-[10px] opacity-50" style={{ color: "#94A3B8" }}>
          TiTaNXiS · Sezon Özeti · Sadece Görüntüleme
        </div>
      </div>
    </div>
  );
}
