import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, fmt } from "@/lib/api";
import { ADD_POINTS } from "@/constants/testIds";
import Header from "@/components/Header";
import { Search, ChevronDown, Users } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function AddPoints() {
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
                        <div className={`rank-badge rank-${m.rank}`} style={{ width: 30, height: 30, fontSize: 10 }}>{m.rank}</div>
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
                    <div className={`rank-badge rank-${m.rank}`} style={{ width: 24, height: 24, fontSize: 9 }}>{m.rank}</div>
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
