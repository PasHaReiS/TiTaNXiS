import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { api, fmt, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { LEADERBOARD } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Users, Calendar, Star, TrendingUp, Download, Crown, Medal, Award } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Leaderboard() {
  const [filter, setFilter] = useState("active");
  const [group, setGroup] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const { data: stats } = useSWR("/stats", fetcher, { refreshInterval: 5000 });
  const { data: groups } = useSWR("/event-groups", fetcher, { refreshInterval: 10000 });
  const { data: lb } = useSWR(group ? `/leaderboard?group_name=${encodeURIComponent(group)}` : "/leaderboard", fetcher, { refreshInterval: 5000 });
  const { data: allMembers = [] } = useSWR("/members", fetcher, { refreshInterval: 15000 });

  const memberIndex = useMemo(() => Object.fromEntries(allMembers.map((m) => [m.id, m])), [allMembers]);

  const [top3, groupedByAlliance] = useMemo(() => {
    if (!lb) return [[], []];
    const rankOrder = { R5: 5, R4: 4, R3: 3, R2: 2, R1: 1 };
    // Attach alliance_name from members index
    const enriched = lb.map((r) => ({ ...r, alliance_name: memberIndex[r.member_id]?.alliance_name || "-" }));
    const top = enriched.slice(0, 3);
    const rest = enriched.slice(3);
    // Group by alliance
    const groups = {};
    rest.forEach((r) => {
      const a = r.alliance_name || "-";
      (groups[a] = groups[a] || []).push(r);
    });
    // Sort members inside each alliance by rank desc, then points desc
    Object.values(groups).forEach((arr) => arr.sort((a, b) => (rankOrder[b.rank] || 0) - (rankOrder[a.rank] || 0) || b.total_points - a.total_points));
    // Sort alliance groups: GOW first, others alpha
    const sortedAlliances = Object.keys(groups).sort((a, b) => (a === "GOW" ? -1 : b === "GOW" ? 1 : a.localeCompare(b, "tr")));
    return [top, sortedAlliances.map((name) => ({ name, members: groups[name] }))];
  }, [lb, memberIndex]);

  const exportCsv = async () => {
    try {
      const url = `${api.defaults.baseURL}/export/csv`;
      const a = document.createElement("a");
      a.href = url;
      a.download = "siralama.csv";
      a.click();
      toast.success("Detaylı rapor indirildi");
    } catch (e) {
      toast.error("Rapor oluşturulamadı");
    }
  };

  return (
    <div data-testid={LEADERBOARD.container}>
      <Header subtitle="Hoş Geldin, pasha" />

      <div className="px-4">
        <div className="section-title">Genel İstatistikler</div>
        <div className="grid grid-cols-2 gap-2 mb-4 fade-in">
          <div data-testid={LEADERBOARD.statsMember} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><Users className="w-3 h-3" /> Üye Sayısı</div>
            <div className="stat-value">{fmt(stats?.member_count)}</div>
          </div>
          <div data-testid={LEADERBOARD.statsEvent} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><Calendar className="w-3 h-3" /> Etkinlik</div>
            <div className="stat-value">{fmt(stats?.event_count)}</div>
          </div>
          <div data-testid={LEADERBOARD.statsTotal} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><Star className="w-3 h-3" /> Toplam Puan</div>
            <div className="stat-value">{fmt(stats?.total_points)}</div>
          </div>
          <div data-testid={LEADERBOARD.statsAvg} className="stat-pill">
            <div className="stat-label flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Etkinlik Ort.</div>
            <div className="stat-value">{fmt(stats?.event_avg)}</div>
          </div>
        </div>

        <div className="section-title">Etkinlik Filtresi</div>
        <div className="flex gap-2 mb-3">
          <button
            data-testid={LEADERBOARD.filterActive}
            onClick={() => setFilter("active")}
            className={`chip ${filter === "active" ? "active" : ""}`}
          >AKTİF</button>
          <button
            data-testid={LEADERBOARD.filterArchive}
            onClick={() => setFilter("archive")}
            className={`chip ${filter === "archive" ? "active" : ""}`}
          >ARŞİV</button>
        </div>

        {groups && groups.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <button className={`chip ${!group ? "active" : ""}`} onClick={() => setGroup(null)}>
              Tümü
            </button>
            {groups.map((g) => (
              <button
                key={g.name}
                onClick={() => setGroup(g.name === group ? null : g.name)}
                className={`chip ${group === g.name ? "active" : ""}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Podium */}
        <div className="section-title">Podyum</div>
        <div className="grid grid-cols-3 gap-2 mb-6 fade-in items-end">
          {top3[1] && (
            <div className="podium-item podium-2" style={{ minHeight: 130 }}>
              <div className="podium-medal" style={{ background: "linear-gradient(135deg,#c0c0c0,#8a8a8a)", color: "#0a0a0a" }}>
                <Medal className="w-4 h-4" />
              </div>
              <div className={`rank-badge rank-${top3[1].rank} mt-2`}>{top3[1].rank === "GOW" ? "" : top3[1].rank}</div>
              <div className="text-xs font-bold mt-2 text-white truncate w-full">{top3[1].name}</div>
              <div className="text-[10px] text-muted-foreground">Lv {top3[1].level}</div>
              <div className="gold-text font-bold text-xs mono mt-1">{fmt(top3[1].total_points)}</div>
            </div>
          )}
          {top3[0] && (
            <div className="podium-item podium-1" style={{ minHeight: 150 }}>
              <div className="podium-medal" style={{ background: "linear-gradient(135deg,#F5A623,#d68810)", color: "#0a0a0a" }}>
                <Crown className="w-4 h-4" />
              </div>
              <div className={`rank-badge rank-${top3[0].rank} mt-2`}>{top3[0].rank === "GOW" ? "" : top3[0].rank}</div>
              <div className="text-sm font-bold mt-2 text-white truncate w-full">{top3[0].name}</div>
              <div className="text-[10px] text-muted-foreground">Lv {top3[0].level}</div>
              <div className="gold-text font-bold text-sm mono mt-1">{fmt(top3[0].total_points)}</div>
            </div>
          )}
          {top3[2] && (
            <div className="podium-item podium-3" style={{ minHeight: 130 }}>
              <div className="podium-medal" style={{ background: "linear-gradient(135deg,#cd7f32,#8b4513)", color: "#fff" }}>
                <Award className="w-4 h-4" />
              </div>
              <div className={`rank-badge rank-${top3[2].rank} mt-2`}>{top3[2].rank === "GOW" ? "" : top3[2].rank}</div>
              <div className="text-xs font-bold mt-2 text-white truncate w-full">{top3[2].name}</div>
              <div className="text-[10px] text-muted-foreground">Lv {top3[2].level}</div>
              <div className="gold-text font-bold text-xs mono mt-1">{fmt(top3[2].total_points)}</div>
            </div>
          )}
        </div>

        <div className="section-title">Tam Sıralama</div>
        <div className="space-y-4 mb-4">
          {groupedByAlliance.map((grp) => (
            <div key={grp.name} className="fade-in">
              <div
                className="flex items-center justify-between px-3 py-2 rounded-lg mb-2"
                style={{
                  ...allianceBadgeStyle(grp.name),
                  color: "#fff",
                  border: "1px solid",
                }}
              >
                <span className="font-bold uppercase tracking-wider text-sm">{grp.name}</span>
                <span className="text-[11px] font-bold mono opacity-90">{grp.members.length} üye</span>
              </div>
              <div className="space-y-1">
                {grp.members.map((r) => (
                  <button
                    key={r.member_id}
                    data-testid={LEADERBOARD.row(r.member_id)}
                    onClick={() => setProfileId(r.member_id)}
                    className="w-full card-dark p-3 flex items-center gap-3 row-hover text-left"
                  >
                    <div className="w-8 text-center">
                      <span className="text-xs font-bold text-muted-foreground mono">#{r.position}</span>
                    </div>
                    <div
                      className="rank-badge"
                      style={{ ...allianceBadgeStyle(r.alliance_name), width: 36, height: 36, fontSize: 11 }}
                      title={r.alliance_name}
                    >
                      {r.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white truncate">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
                        {r.title || r.alliance_name || "Üye"} • Lv {r.level}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="gold-text font-bold mono text-sm">{fmt(r.total_points)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groupedByAlliance.length === 0 && (
            <div className="card-dark p-6 text-center text-muted-foreground text-sm">Henüz puan kaydı yok. "Puan Ekle" sekmesinden başlayın.</div>
          )}
        </div>

        <button
          data-testid={LEADERBOARD.exportButton}
          onClick={exportCsv}
          className="btn-gold w-full flex items-center justify-center gap-2 mb-6"
        >
          <Download className="w-4 h-4" />
          Detaylı Rapor (CSV)
        </button>
      </div>

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
