import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, fmt } from "@/lib/api";
import { ADD_POINTS } from "@/constants/testIds";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import { Search, ChevronDown, Users, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function AddPoints() {
  const { canEdit } = useAuth();
  const [memberQ, setMemberQ] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [showMemberList, setShowMemberList] = useState(false);
  const [eventId, setEventId] = useState("");
  const [points, setPoints] = useState("");
  const [multiplier, setMultiplier] = useState(1);
  const [customMult, setCustomMult] = useState("");
  const [note, setNote] = useState("");
  const [bulk, setBulk] = useState(false);
  const [bulkIds, setBulkIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const { data: members = [] } = useSWR("/members", fetcher);
  const { data: events = [] } = useSWR("/events?archived=false", fetcher);
  const { data: recentPoints = [] } = useSWR("/scores?limit=5", fetcher, { refreshInterval: 5000 });

  const filteredMembers = useMemo(() => {
    if (!memberQ) return members.slice(0, 30);
    const s = memberQ.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(s) || m.member_id.includes(memberQ)).slice(0, 50);
  }, [members, memberQ]);

  const finalMultiplier = customMult ? Number(customMult) : multiplier;

  const submit = async (e) => {
    e.preventDefault();
    if (!points || Number(points) <= 0) { toast.error("Geçerli puan gir"); return; }
    if (!eventId) { toast.error("Etkinlik seç"); return; }
    if (bulk && bulkIds.length === 0) { toast.error("En az bir üye seç"); return; }
    if (!bulk && !selectedMember) { toast.error("Üye seç"); return; }

    setSaving(true);
    try {
      if (bulk) {
        await api.post("/scores/bulk", {
          member_ids: bulkIds,
          event_id: eventId,
          points: Number(points),
          multiplier: finalMultiplier,
          note: note.trim() || null,
        });
        toast.success(`${bulkIds.length} üyeye puan eklendi`);
      } else {
        await api.post("/scores", {
          member_id: selectedMember.id,
          event_id: eventId,
          points: Number(points),
          multiplier: finalMultiplier,
          note: note.trim() || null,
        });
        toast.success(`${selectedMember.name} için ${fmt(Number(points) * finalMultiplier)} puan eklendi`);
      }
      setPoints(""); setNote(""); setSelectedMember(null); setMemberQ(""); setBulkIds([]);
      mutate((k) => typeof k === "string" && (k.startsWith("/scores") || k.startsWith("/points")));
      mutate("/stats"); mutate("/leaderboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSaving(false); }
  };

  if (!canEdit) {
    return (
      <div data-testid={ADD_POINTS.container}>
        <Header subtitle="Puan Ekle" />
        <div className="px-4">
          <div className="card-red-gold p-6 text-center fade-in">
            <Lock className="w-10 h-10 gold-text mx-auto mb-3" />
            <h3 className="text-lg font-bold uppercase red-text tracking-wider mb-2">Yetki Yok</h3>
            <p className="text-sm text-muted-foreground">
              Puan ekleme yetkisi için yönetici ile iletişime geçin.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid={ADD_POINTS.container}>
      <Header subtitle="Puan Ekle" />
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold uppercase red-text tracking-wider">Puan Ekle</h2>
          <button
            data-testid={ADD_POINTS.bulkToggle}
            onClick={() => { setBulk(!bulk); setBulkIds([]); setSelectedMember(null); }}
            className={`chip ${bulk ? "active" : ""}`}
          >
            <Users className="w-3 h-3" />
            {bulk ? "Toplu Mod" : "Tekli Mod"}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!bulk ? (
            <div>
              <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Üye</label>
              <div className="relative">
                <input
                  data-testid={ADD_POINTS.memberSelect}
                  value={selectedMember ? selectedMember.name : memberQ}
                  onFocus={() => setShowMemberList(true)}
                  onChange={(e) => { setSelectedMember(null); setMemberQ(e.target.value); setShowMemberList(true); }}
                  placeholder="Üye ara..."
                  className="w-full card-dark pl-9 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                />
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                {showMemberList && (
                  <div className="absolute top-full left-0 right-0 mt-1 card-dark max-h-64 overflow-y-auto z-20">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setSelectedMember(m); setShowMemberList(false); setMemberQ(""); }}
                        className="w-full flex items-center gap-2 p-2 hover:bg-primary/10 text-left"
                      >
                        <div className={`rank-badge rank-${m.rank}`} style={{ width: 30, height: 30, fontSize: 10 }}>{m.rank === "GOW" ? "" : m.rank}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white truncate">{m.name}</div>
                          <div className="text-[10px] text-muted-foreground mono">ID: {m.member_id}</div>
                        </div>
                      </button>
                    ))}
                    {filteredMembers.length === 0 && <div className="p-3 text-xs text-muted-foreground text-center">Bulunamadı</div>}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Üyeler ({bulkIds.length} seçili)</label>
              <div className="card-dark p-2 max-h-56 overflow-y-auto space-y-1">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-primary/5 cursor-pointer">
                    <input
                      data-testid={ADD_POINTS.bulkMember(m.id)}
                      type="checkbox"
                      checked={bulkIds.includes(m.id)}
                      onChange={(e) => setBulkIds(e.target.checked ? [...bulkIds, m.id] : bulkIds.filter((x) => x !== m.id))}
                      className="w-4 h-4 accent-red-500"
                    />
                    <div className={`rank-badge rank-${m.rank}`} style={{ width: 24, height: 24, fontSize: 9 }}>{m.rank === "GOW" ? "" : m.rank}</div>
                    <div className="text-sm text-white truncate flex-1">{m.name}</div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Etkinlik</label>
            <div className="relative">
              <select
                data-testid={ADD_POINTS.eventSelect}
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full card-dark px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-primary appearance-none"
              >
                <option value="">-- Seç --</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>🇹🇷 {e.name} ({e.multiplier}x)</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Puan</label>
            <input
              data-testid={ADD_POINTS.pointsInput}
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="Örn: 1500"
              className="w-full card-dark px-3 py-2.5 text-sm text-white mono focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Çarpan</label>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: "1x", val: 1, tid: ADD_POINTS.multiplier1x },
                { label: "1.5x", val: 1.5, tid: ADD_POINTS.multiplier15x },
                { label: "2x", val: 2, tid: ADD_POINTS.multiplier2x },
                { label: "3x", val: 3, tid: ADD_POINTS.multiplier3x },
              ].map((m) => (
                <button
                  key={m.label}
                  type="button"
                  data-testid={m.tid}
                  onClick={() => { setMultiplier(m.val); setCustomMult(""); }}
                  className={`chip ${!customMult && multiplier === m.val ? "active" : ""}`}
                >
                  {m.label}
                </button>
              ))}
              <input
                data-testid={ADD_POINTS.multiplierCustom}
                value={customMult}
                onChange={(e) => setCustomMult(e.target.value)}
                type="number"
                step="0.1"
                placeholder="Özel"
                className="chip w-20 text-center bg-transparent focus:outline-none"
                style={{ padding: "6px 8px" }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Sonuç: <span className="gold-text mono font-bold">{fmt(Number(points || 0) * finalMultiplier)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Not (opsiyonel)</label>
            <input
              data-testid={ADD_POINTS.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn: 1. gün"
              className="w-full card-dark px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
            />
          </div>

          <button
            data-testid={ADD_POINTS.submit}
            type="submit"
            disabled={saving}
            className="btn-gold w-full text-lg py-3"
          >
            {saving ? "Kaydediliyor..." : "PUANI EKLE"}
          </button>
        </form>

        <div className="section-title mt-8">Üye Puanlarını Filtrele ve Düzenle</div>
        <EditMemberPointsSection events={events} />

        <div className="section-title mt-8">Son 5 Kayıt</div>
        <div className="space-y-1.5">
          {recentPoints.slice(0, 5).map((p) => (
            <div key={p.id} className="card-dark p-3 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">
                  <span className="gold-text font-bold mono">+{fmt(p.points * (p.multiplier || 1))}</span>{" "}
                  {p.member_name}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {p.event_name} {p.note && `• ${p.note}`}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mono">{new Date(p.date).toLocaleDateString("tr-TR")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditMemberPointsSection({ events }) {
  const [q, setQ] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [editing, setEditing] = useState(null);
  const { data: members = [] } = useSWR("/members", fetcher);
  const { data: history } = useSWR(selectedMember ? `/members/${selectedMember.id}/history` : null, fetcher, { refreshInterval: 5000 });

  const filtered = useMemo(() => {
    if (!q) return [];
    const s = q.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(s) || (m.member_id || "").includes(q)).slice(0, 20);
  }, [members, q]);

  return (
    <div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          data-testid="edit-points-search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSelectedMember(null); }}
          placeholder="Üye ismi veya ID ara..."
          className="w-full card-dark pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {!selectedMember && q && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {filtered.map((m) => (
            <MemberSearchRow key={m.id} member={m} onSelect={() => setSelectedMember(m)} />
          ))}
          {filtered.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Eşleşme yok</div>}
        </div>
      )}

      {selectedMember && history && (
        <div className="mt-3 fade-in">
          <div className="card-red-gold p-3 flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white truncate">{history.member.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {history.member.alliance_name || "-"} • <span className="gold-text mono font-bold">{fmt(history.total)}</span> toplam
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedMember(null); setQ(""); }}
              className="w-7 h-7 rounded-md bg-secondary hover:bg-primary/20 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.points.length === 0 && <div className="card-dark p-3 text-xs text-center text-muted-foreground">Kayıt yok</div>}
            {history.points.map((p) => (
              <div key={p.id} className="card-dark p-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{p.event_name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    <span className="gold-text mono">+{fmt(p.points * (p.multiplier || 1))}</span> ({fmt(p.points)} × {p.multiplier}) {p.note && `• ${p.note}`}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`edit-point-${p.id}`}
                  onClick={() => setEditing(p)}
                  className="w-7 h-7 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center flex-shrink-0"
                  aria-label="Düzenle"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <EditPointDialog
          point={editing}
          events={events}
          onClose={() => setEditing(null)}
          onSaved={() => {
            mutate((k) => typeof k === "string" && (k.startsWith("/members/") || k.startsWith("/scores") || k.startsWith("/points")));
            mutate("/stats"); mutate("/leaderboard");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function MemberSearchRow({ member, onSelect }) {
  const { data: history } = useSWR(`/members/${member.id}/history`, fetcher);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`edit-points-member-${member.id}`}
      className="w-full card-dark p-2.5 flex items-center gap-2 row-hover text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white truncate">{member.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {member.alliance_name || "-"} • {member.rank}
          {member.member_id && ` • ID ${member.member_id}`}
        </div>
      </div>
      <div className="gold-text font-bold mono text-xs">{history ? fmt(history.total) : "..."}</div>
    </button>
  );
}

function EditPointDialog({ point, events, onClose, onSaved }) {
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
      toast.success("Puan güncellendi");
      onSaved();
    } catch (err) { toast.error(err?.response?.data?.detail || err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">Puanı Düzenle</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1">Etkinlik</label>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white">
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.multiplier}x)</option>)}
        </select>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Puan</label>
        <input data-testid="edit-point-points" type="number" value={pts} onChange={(e) => setPts(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Çarpan</label>
        <input type="number" step="0.1" value={mult} onChange={(e) => setMult(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Not</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button type="submit" data-testid="edit-point-save" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </form>
    </div>
  );
}
