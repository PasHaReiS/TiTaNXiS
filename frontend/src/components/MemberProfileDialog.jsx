import React, { useMemo } from "react";
import useSWR from "swr";
import { api, fmt } from "@/lib/api";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { allianceBadgeStyle } from "@/lib/colors";
import ReactDOM from "react-dom";

const fetcher = (url) => api.get(url).then((r) => r.data);

// Format an F/T pair as "F8 - T11" — falls back to '-' when both are missing.
const formatFT = (f, tVal) => {
  const hasF = f !== null && f !== undefined && String(f).trim() !== "";
  const hasT = tVal !== null && tVal !== undefined && String(tVal).trim() !== "";
  if (!hasF && !hasT) return "-";
  const fPart = hasF ? `F${f}` : "F—";
  const tPart = hasT ? `T${tVal}` : "T—";
  return `${fPart} - ${tPart}`;
};

const formatCastle = (val) => {
  if (val === null || val === undefined || String(val).trim() === "") return "-";
  return `F${val}`;
};

export default function MemberProfileDialog({ memberId, open, onClose }) {
  const { t } = useTranslation();
  const { data: allianceColors = {} } = useSWR(open ? "/alliance-colors" : null, fetcher);
  const { data: m } = useSWR(memberId && open ? `/members/${memberId}` : null, fetcher);
  const { data: history } = useSWR(memberId && open ? `/members/${memberId}/history` : null, fetcher);
  const { data: allEvents = [] } = useSWR(open ? "/events?archived=false" : null, fetcher);
  const { data: archivedEvents = [] } = useSWR(open ? "/events?archived=true" : null, fetcher);

  const eventDateMap = useMemo(() => {
    const map = {};
    [...allEvents, ...archivedEvents].forEach((e) => { map[e.id] = e.date; });
    return map;
  }, [allEvents, archivedEvents]);

  const grouped = useMemo(() => {
    const list = history?.points || [];
    const groups = {};
    list.forEach((p) => {
      const key = p.event_name || t("event");
      if (!groups[key]) groups[key] = { rows: [], total: 0, eventDate: null };
      const mult = Number(p.multiplier || 1);
      const effective = Number(p.points || 0) * mult;
      groups[key].rows.push({ ...p, effective, mult });
      groups[key].total += effective;
      const evDate = eventDateMap[p.event_id] || p.date;
      if (evDate && (!groups[key].eventDate || evDate < groups[key].eventDate)) {
        groups[key].eventDate = evDate;
      }
    });
    // Ascending by event date (oldest first, newest last)
    return Object.entries(groups).sort((a, b) => {
      const da = a[1].eventDate ? new Date(a[1].eventDate).getTime() : 0;
      const db = b[1].eventDate ? new Date(b[1].eventDate).getTime() : 0;
      return da - db;
    });
  }, [history, t, eventDateMap]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center p-4"
      style={{ zIndex: 999999 }}
      onClick={onClose}
      data-testid="member-profile-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-4 fade-in relative flex flex-col"
        style={{ background: "linear-gradient(180deg, rgba(26,26,26,0.98), rgba(15,15,15,0.98))", maxHeight: "85vh" }}
        data-testid="member-profile-dialog"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          data-testid="member-profile-close"
          onClick={onClose}
          className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/40 hover:bg-black/70 text-muted-foreground hover:text-white flex items-center justify-center z-10"
          aria-label={t("close")}
        >
          <X className="w-4 h-4" />
        </button>

        {!m && <div className="p-3 text-center text-muted-foreground text-sm">{t("loading")}</div>}

        {m && (
          <>
            {/* Header: rank badge + name + ID */}
            <div className="flex items-center gap-3 mb-3 pr-8">
              <div
                className={`rank-badge rank-${m.rank}`}
                style={{ width: 42, height: 42, fontSize: 13, borderRadius: 8, fontWeight: 800 }}
              >
                {m.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="font-bold text-white text-base truncate leading-tight"
                    data-testid="profile-member-name"
                    title={m.name}
                  >
                    {m.name}
                  </span>
                  {m.note && m.note.trim() !== "" && (m.note_position || "inline") === "inline" && (
                    <span
                      className="text-xs truncate leading-tight"
                      style={{ color: "#DC2626", fontWeight: 700 }}
                      title={m.note}
                      data-testid="profile-inline-note"
                    >
                      {m.note}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mono truncate">
                  ID: <span className="gold-text">{m.member_id || "-"}</span>
                </div>
              </div>
            </div>

            {/* Alliance badge (case-preserved) */}
            {m.alliance_name && (
              <div className="mb-3">
                <span
                  className="inline-block text-[10px] font-bold rounded px-2 py-1 tracking-wider"
                  style={{ ...allianceBadgeStyle(m.alliance_name, allianceColors), border: "1px solid" }}
                >
                  {m.alliance_name}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="h-px my-3" style={{ background: "linear-gradient(90deg, transparent, rgba(245,166,35,0.4), transparent)" }} />

            {/* Stats */}
            <div className="space-y-2">
              <StatRow label={t("castle_level")} value={formatCastle(m.castle_level)} accent />
              <StatRow label={t("tetikci")} value={formatFT(m.tetikci_f, m.tetikci_t)} />
              <StatRow label={t("kalkanli")} value={formatFT(m.kalkanli_f, m.kalkanli_t)} />
              <StatRow label={t("bombaci")} value={formatFT(m.bombaci_f, m.bombaci_t)} />
            </div>

            {m.note && m.note.trim() !== "" && m.note_position === "bottom" && (
              <>
                <div className="h-px my-3" style={{ background: "linear-gradient(90deg, transparent, rgba(220,38,38,0.4), transparent)" }} />
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: m.note_color || "#DC2626", fontWeight: 700, fontStyle: "italic" }}
                  data-testid="profile-bottom-note"
                >
                  {m.note}
                </div>
              </>
            )}

            {/* Points detail — total + per-event grouping */}
            <div className="mt-4 rounded-lg p-3" style={{ background: "linear-gradient(135deg, rgba(231,76,26,0.12), rgba(212,115,10,0.08))", border: "1px solid rgba(231,76,26,0.35)" }}>
              <div className="text-[10px] uppercase tracking-widest font-bold gold-text mb-1">{t("total_points")}</div>
              <div className="text-2xl font-black mono" data-testid="profile-total-points" style={{ color: "#E74C1A", fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(history?.total || 0)}
              </div>
            </div>

            <div className="mt-3 overflow-y-auto pr-1" data-testid="profile-event-detail" style={{ maxHeight: "40vh" }}>
              <div className="text-[10px] uppercase tracking-widest font-bold gold-text mb-2">{t("event_detail") || "Etkinlik Detayı"}</div>
              {grouped.length === 0 && (
                <div className="text-xs text-muted-foreground p-2">{t("no_records_dot")}</div>
              )}
              {grouped.map(([evName, g]) => (
                <div
                  key={evName}
                  className="mb-1.5 flex items-center gap-2"
                  data-testid={`profile-event-${evName}`}
                  style={{
                    padding: "6px 10px",
                    background: "rgba(26,26,46,0.55)",
                    border: "1px solid rgba(245,166,35,0.2)",
                    borderRadius: 6,
                  }}
                >
                  <span
                    className="text-xs font-bold uppercase tracking-wider truncate"
                    style={{ color: "#F5A623", fontFamily: "Cinzel, serif", flexShrink: 1, minWidth: 0 }}
                    title={evName}
                  >
                    {evName}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      minWidth: 12,
                      borderBottom: "1px dotted rgba(245,166,35,0.35)",
                      alignSelf: "flex-end",
                      marginBottom: 6,
                    }}
                  />
                  <span
                    className="mono font-bold whitespace-nowrap"
                    data-testid={`profile-event-total-${evName}`}
                    style={{ color: "#E74C1A", fontSize: 12 }}
                  >
                    +{fmt(g.total)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={`text-xs font-semibold uppercase tracking-wider ${accent ? "gold-text" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span
        className="mono font-bold text-white text-sm"
        data-testid={`profile-stat-${String(label).toLowerCase().replace(/\s+/g, "-")}`}
      >
        {value}
      </span>
    </div>
  );
}
