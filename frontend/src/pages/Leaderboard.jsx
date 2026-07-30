import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { api, fmt, RANKS } from "@/lib/api";
import { allianceBadgeStyle } from "@/lib/colors";
import { LEADERBOARD } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Users, Calendar, Star, TrendingUp, Download, Crown, Medal, Award } from "lucide-react";
import { toast } from "sonner";
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
  const { data: lb = [] } = useSWR(group ? `/leaderboard?group_name=${encodeURIComponent(group)}` : "/leaderboard", fetcher, { refreshInterval: 5000 });
  const { data: allMembers = [] } = useSWR("/members", fetcher, { refreshInterval: 15000 });

  const top3 = useMemo(() => lb.slice(0, 3), [lb]);

  // Frontend-only grouping — merge all members with their scores (0 if not in leaderboard)
  const groupedByAlliance = useMemo(() => {
    const pointsById = Object.fromEntries(lb.map((r) => [r.member_id, r]));
    // Build unified rows including zero-point members
    const rows = allMembers.map((m) => {
      const lbRow = pointsById[m.id];
      return {
        member_id: m.id,
        name: m.name,
        rank: m.rank,
        level: m.level,
        title: m.title,
        alliance_name: m.alliance_name,
        total_points: lbRow ? lbRow.total_points : 0,
        position: lbRow ? lbRow.position : null,
      };
    });
    // Normalize alliance keys
    const groups = {};
    rows.forEach((r) => {
      const raw = (r.alliance_name || "").trim();
      let key;
      if (raw.toLowerCase() === "gow") key = "GOW";
      else if (!raw) key = "Gruplandırılmamış";
      else key = raw;
      (groups[key] = groups[key] || []).push({ ...r, alliance_name: key });
    });
    // Sort members inside each group: points desc (zeroes fall to bottom naturally)
    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => b.total_points - a.total_points || a.name.localeCompare(b.name, "tr"))
    );
    // Sort group order: GOW → alfabetik (tr) → Gruplandırılmamış
    const orderKey = (name) => {
      if (name === "GOW") return [0, ""];
      if (name === "Gruplandırılmamış") return [2, ""];
      return [1, name.toLowerCase()];
    };
    return Object.keys(groups)
      .sort((a, b) => {
        const [ka, sa] = orderKey(a);
        const [kb, sb] = orderKey(b);
        if (ka !== kb) return ka - kb;
        return sa.localeCompare(sb, "tr");
      })
      .map((name) => ({
        name,
        members: groups[name],
        total_points: groups[name].reduce((s, m) => s + m.total_points, 0),
      }));
  }, [lb, allMembers]);

  const exportXlsx = async () => {
    try {
      const url = `${api.defaults.baseURL}/export/xlsx`;
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `detayli_rapor_${today}.xlsx`;
      a.click();
      toast.success("Detaylı rapor indirildi (Excel)");
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
          {groupedByAlliance.map((grp, gi) => (
            <React.Fragment key={grp.name}>
              {gi > 0 && <div className="divider-glow my-4" />}
              <div className="fade-in">
                <div
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg mb-2"
                  style={{
                    ...allianceBadgeStyle(grp.name),
                    color: "#fff",
                    border: "1px solid",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold uppercase tracking-wider text-base truncate">{grp.name}</span>
                    <span className="text-[11px] font-bold mono opacity-90 flex-shrink-0">({grp.members.length} üye)</span>
                  </div>
                  <span className="text-sm font-bold mono flex-shrink-0" data-testid={`alliance-total-${grp.name}`}>{fmt(grp.total_points)}</span>
                </div>
                <div className="space-y-1">
                  {grp.members.map((r, idx) => (
                    <button
                      key={r.member_id}
                      data-testid={LEADERBOARD.row(r.member_id)}
                      onClick={() => setProfileId(r.member_id)}
                      className="w-full card-dark p-3 flex items-center gap-3 row-hover text-left"
                    >
                      <div className="w-8 text-center">
                        <span className="text-xs font-bold text-muted-foreground mono">{idx + 1}.</span>
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
                        <div className={`${r.total_points > 0 ? "gold-text" : "text-muted-foreground"} font-bold mono text-sm`}>{fmt(r.total_points)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </React.Fragment>
          ))}
          {groupedByAlliance.length === 0 && (
            <div className="card-dark p-6 text-center text-muted-foreground text-sm">Henüz puan kaydı yok. "Puan Ekle" sekmesinden başlayın.</div>
          )}
        </div>

        <button
          data-testid={LEADERBOARD.exportButton}
          onClick={exportXlsx}
          className="btn-gold w-full flex items-center justify-center gap-2 mb-6"
        >
          <Download className="w-4 h-4" />
          Detaylı Rapor (Excel)
        </button>
      </div>

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}
