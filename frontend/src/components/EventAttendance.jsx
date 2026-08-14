import React, { useMemo, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useTranslation } from "react-i18next";
import { Users, ChevronDown, ChevronUp, Search } from "lucide-react";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import CanEdit from "@/components/CanEdit";

const fetcher = (url) => api.get(url).then((r) => r.data);

/** Compact per-event attendance control.
 *
 *  Renders below the event card actions. Collapsed by default (just a
 *  "Katıldı: N/M" pill). When expanded, shows a searchable member grid where
 *  each chip toggles attendance for that member.
 */
export default function EventAttendance({ eventId, testIdPrefix = "event-att" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(null); // member_id currently toggling

  // Only fetch when expanded — keeps the events list light.
  const { data: allMembers = [] } = useSWR(open ? "/members" : null, fetcher);
  const { data: attendance, mutate: refreshAttendance } = useSWR(
    eventId ? `/events/${eventId}/attendance` : null,
    fetcher,
    { refreshInterval: 15000 },
  );

  const attendedSet = useMemo(
    () => new Set(attendance?.member_ids || []),
    [attendance],
  );

  const totalMembers = allMembers.length;
  const attendedCount = attendance?.count ?? 0;

  const filtered = useMemo(() => {
    const query = (q || "").trim().toLowerCase();
    // Default view: show only members marked attending. Typing a query
    // "unlocks" the full roster so admins can quickly toggle a missing name
    // without scrolling through everyone.
    let list = allMembers || [];
    if (query) {
      list = list.filter((m) => (m.name || "").toLowerCase().includes(query));
    } else {
      list = list.filter((m) => attendedSet.has(m.id));
    }
    // Attended first, then alphabetical.
    return [...list].sort((a, b) => {
      const aa = attendedSet.has(a.id) ? 0 : 1;
      const bb = attendedSet.has(b.id) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [allMembers, q, attendedSet]);

  const toggle = async (memberId) => {
    if (pending) return;
    setPending(memberId);
    // Optimistic update — flip locally, revalidate after server responds.
    const wasAttended = attendedSet.has(memberId);
    const nextIds = wasAttended
      ? (attendance?.member_ids || []).filter((x) => x !== memberId)
      : [...(attendance?.member_ids || []), memberId];
    refreshAttendance(
      { ...(attendance || { event_id: eventId }), count: nextIds.length, member_ids: nextIds },
      false,
    );
    try {
      await api.post(`/events/${eventId}/attendance/toggle`, { member_id: memberId });
      refreshAttendance(); // final sync
      // Also invalidate the affected member's compliance so their card badge updates.
      swrMutate(`/members/${memberId}/attendance-stats?days=30`);
    } catch (e) {
      toast.error(apiErr(e));
      refreshAttendance(); // undo optimistic on failure
    } finally {
      setPending(null);
    }
  };

  const pct = totalMembers > 0 ? Math.round((attendedCount / totalMembers) * 100) : 0;
  const barColor = pct >= 75 ? "#4ADE80" : pct >= 50 ? "#F5A623" : pct > 0 ? "#F87171" : "#4B5563";

  return (
    <div
      data-testid={`${testIdPrefix}-container`}
      className="mt-2 pt-2 border-t border-white/5"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testIdPrefix}-toggle`}
        className="w-full flex items-center gap-2 text-[11px] hover:bg-white/5 rounded px-2 py-1 transition"
      >
        <Users className="w-3.5 h-3.5" style={{ color: barColor }} />
        <span className="font-bold uppercase tracking-widest text-white/80">
          {t("attendance") || "Katılım"}
        </span>
        <span className="mono font-bold text-white" data-testid={`${testIdPrefix}-count`}>
          {attendedCount}/{totalMembers}
        </span>
        <div className="flex-1 h-1.5 rounded overflow-hidden" style={{ background: "#0f0f0f" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width 0.4s ease" }} />
        </div>
        <span className="mono text-[10px] text-white/70">{pct}%</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-white/60" /> : <ChevronDown className="w-3.5 h-3.5 text-white/60" />}
      </button>

      {open && (
        <div className="mt-2" data-testid={`${testIdPrefix}-panel`}>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search") || "Ara..."}
              data-testid={`${testIdPrefix}-search`}
              className="w-full rounded pl-7 pr-2 py-1.5 text-[11px]"
              style={{ background: "#1A1210", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F0E8" }}
            />
          </div>
          <CanEdit
            fallback={
              <div className="text-[10px] text-white/50 italic px-1 py-2">
                {t("attendance_readonly_hint") || "Katılım listesini yalnızca yetkili düzenleyebilir."}
              </div>
            }
          >
            <div
              className="flex flex-col gap-1 overflow-y-auto pr-1"
              style={{ maxHeight: 320 }}
              data-testid={`${testIdPrefix}-list`}
            >
              {filtered.slice(0, 500).map((m) => {
                const on = attendedSet.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    disabled={pending === m.id}
                    data-testid={`${testIdPrefix}-chip-${m.id}`}
                    className="w-full text-left text-xs px-2 py-1.5 rounded transition flex items-center gap-2"
                    style={{
                      background: on ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${on ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.08)"}`,
                      opacity: pending === m.id ? 0.5 : 1,
                    }}
                    title={m.name}
                  >
                    <span
                      className="flex items-center justify-center rounded flex-shrink-0"
                      style={{
                        width: 18, height: 18, fontSize: 11,
                        background: on ? "#4ADE80" : "transparent",
                        border: on ? "none" : "1px solid rgba(255,255,255,0.25)",
                        color: on ? "#0F0F0F" : "transparent",
                      }}
                    >
                      {on ? "✓" : "○"}
                    </span>
                    <span
                      className="rank-badge flex-shrink-0"
                      style={{ width: 22, height: 18, fontSize: 9, borderRadius: 4, fontWeight: 800 }}
                    >
                      {m.rank || "R1"}
                    </span>
                    <span className="flex-1 truncate font-semibold text-white" style={{ textTransform: "none" }}>
                      {m.name}
                    </span>
                    {m.alliance_name && (
                      <span className="text-[9px] uppercase tracking-widest opacity-60 truncate max-w-[80px]">
                        {m.alliance_name}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-[10px] text-white/50 italic px-2 py-2">
                  {t("no_records_dot") || "Kayıt yok."}
                </div>
              )}
            </div>
          </CanEdit>
        </div>
      )}
    </div>
  );
}
