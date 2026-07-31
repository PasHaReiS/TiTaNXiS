import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { allianceBadgeStyle } from "@/lib/colors";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      data-testid="member-profile-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-sm p-4 fade-in relative"
        style={{ background: "linear-gradient(180deg, rgba(26,26,26,0.98), rgba(15,15,15,0.98))" }}
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
                  {m.note && (m.note_position || "inline") === "inline" && (
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

            {m.note && m.note_position === "bottom" && (
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
          </>
        )}
      </div>
    </div>
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
