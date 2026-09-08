import React, { useState, useMemo, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { api, fmt } from "@/lib/api";
import { POINTS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { useUndo } from "@/context/UndoContext";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import { Search, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
// v63 — Alliance chip with academy overlay support (GoW/GOw automatically
// paint themselves in academy sky-blue palette).
import { allianceBadgeStyle } from "@/lib/colors";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function PointsList({ hideHeader = false }) {
  const { t } = useTranslation();
  const { showUndo } = useUndo();
  const [rawQ, setRawQ] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const { data: points = [] } = useSWR("/scores?limit=2000", fetcher, { refreshInterval: 5000 });
  const { data: events = [] } = useSWR("/events?archived=false", fetcher);
  // v63 — Members fetched to enrich each score with the current alliance
  // (case-sensitive: GOW / GoW / GOw each stay distinct).
  const { data: members = [] } = useSWR("/members", fetcher, { refreshInterval: 30000 });
  const { data: allianceColors = {} } = useSWR("/alliance-colors", fetcher, { refreshInterval: 30000 });
  const allianceByMid = useMemo(() => {
    const m = {};
    (members || []).forEach((mm) => { if (mm?.id) m[mm.id] = (mm.alliance_name || "").trim(); });
    return m;
  }, [members]);

  useEffect(() => {
    const h = setTimeout(() => setQ(rawQ), 300);
    return () => clearTimeout(h);
  }, [rawQ]);

  const filtered = useMemo(() => {
    if (!q) return points;
    const s = q.toLowerCase();
    return points.filter((p) =>
      (p.member_name || "").toLowerCase().includes(s) ||
      (p.member_game_id || "").toLowerCase().includes(s) ||
      (p.event_name || "").toLowerCase().includes(s) ||
      (p.note || "").toLowerCase().includes(s)
    );
  }, [points, q]);

  return (
    <div data-testid={POINTS.container}>
      {!hideHeader && <Header title={t("point_list_title")} />}
      <div className="px-4">
        <p className="text-xs text-muted-foreground mb-3">
          {t("points_shown")} <span className="gold-text font-bold mono">{filtered.length}</span> / {points.length}
        </p>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid={POINTS.search}
            value={rawQ}
            onChange={(e) => setRawQ(e.target.value)}
            placeholder={t("search_by_name_or_id") || "İsim veya ID ile ara..."}
            className="w-full card-dark pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            style={{ background: "#1A1210", border: "1px solid rgba(231,76,26,0.35)" }}
          />
        </div>

        <div className="space-y-1.5">
          {filtered.map((p) => (
            <div
              key={p.id}
              data-testid={POINTS.row(p.id)}
              onClick={() => p.member_id && setProfileId(p.member_id)}
              className="card-dark p-3 row-hover cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                {/* v63 — İttifak sütunu SOLA eklendi: case-sensitive metin (GOW/GoW/GOw).
                    Renk `allianceBadgeStyle` üzerinden geliyor — academy varyantları
                    otomatik olarak mavi-cam gradient alır. */}
                {(() => {
                  const al = allianceByMid[p.member_id] || "";
                  if (!al) return null;
                  return (
                    <div
                      data-testid={`pointslist-alliance-${p.id}`}
                      className="text-[10px] font-bold rounded-md flex items-center justify-center flex-shrink-0"
                      style={{
                        ...allianceBadgeStyle(al, allianceColors),
                        minWidth: 48,
                        padding: "4px 7px",
                        letterSpacing: "0.06em",
                        textTransform: "none",
                        border: "1px solid",
                        fontFamily: "Cinzel, Rajdhani, serif",
                        alignSelf: "center",
                      }}
                      title={al}
                    >
                      {al}
                    </div>
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white text-sm truncate normal-case" style={{ textTransform: "none" }}>{p.member_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.event_name} {p.note && <span className="text-white/70">• {p.note}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 mono">
                    {new Date(p.date).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="gold-text font-bold mono text-sm">+{fmt(p.points * (p.multiplier || 1))}</div>
                  <div className="text-[10px] text-muted-foreground">{t("points_x_multiplier", { p: fmt(p.points), m: p.multiplier || 1 })}</div>
                </div>
                <CanEdit>
                  <button
                    data-testid={`edit-scorelist-${p.id}`}
                    onClick={(e) => { e.stopPropagation(); setEditing(p); }}
                    className="w-7 h-7 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                    aria-label={t("edit")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </CanEdit>
                <CanEdit>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!window.confirm(t("confirm_delete_record"))) return;
                      const snapshot = { ...p };
                      await api.delete(`/scores/${p.id}`);
                      globalMutate((k) => typeof k === "string" && (k.startsWith("/scores") || k.startsWith("/points")));
                      globalMutate("/stats");
                      globalMutate("/leaderboard");
                      toast.success(t("deleted"));
                      showUndo({
                        message: t("point_deleted_undo", { defaultValue: `${snapshot.points} puan silindi` }),
                        onUndo: async () => {
                          await api.post("/scores", {
                            member_id: snapshot.member_id,
                            event_id: snapshot.event_id,
                            points: snapshot.points,
                            multiplier: snapshot.multiplier || 1.0,
                            note: snapshot.note,
                          });
                          globalMutate((k) => typeof k === "string" && (k.startsWith("/scores") || k.startsWith("/points")));
                          globalMutate("/stats");
                          globalMutate("/leaderboard");
                        },
                      });
                    }}
                    className="w-7 h-7 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                    aria-label={t("delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </CanEdit>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="card-dark p-6 text-center text-muted-foreground">{t("no_records_dot")}</div>}
        </div>
      </div>

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />

      {editing && (
        <EditScoreDialog
          point={editing}
          events={events}
          onClose={() => setEditing(null)}
          onSaved={() => {
            globalMutate((k) => typeof k === "string" && (k.startsWith("/scores") || k.startsWith("/points") || k.startsWith("/members/")));
            globalMutate("/stats");
            globalMutate("/leaderboard");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditScoreDialog({ point, events, onClose, onSaved }) {
  const { t } = useTranslation();
  const [pts, setPts] = useState(String(point.points));
  const [mult, setMult] = useState(String(point.multiplier || 1));
  const [eventId, setEventId] = useState(point.event_id);
  const [note, setNote] = useState(point.note || "");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/scores/${point.id}`, {
        points: Number(pts),
        multiplier: Number(mult),
        event_id: eventId,
        note: note.trim() || null,
      });
      toast.success(t("points_updated"));
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative" data-testid="scorelist-edit-dialog">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        <h3 className="text-lg font-bold uppercase gold-text mb-1">{t("edit_points_title")}</h3>
        <p className="text-xs text-muted-foreground mb-4">{point.member_name}</p>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">{t("event")}</label>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white">
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.multiplier}x)</option>)}
        </select>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("points")}</label>
        <input data-testid="scorelist-edit-points" type="number" value={pts} onChange={(e) => setPts(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("multiplier")}</label>
        <input type="number" step="0.1" value={mult} onChange={(e) => setMult(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("note")}</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button type="submit" data-testid="scorelist-edit-save" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : t("save")}
        </button>
      </form>
    </div>
  );
}
