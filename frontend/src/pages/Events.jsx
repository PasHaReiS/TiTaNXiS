import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { EVENTS } from "@/constants/testIds";
import Header from "@/components/Header";
import { Plus, Pencil, Trash2, Archive, X, Calendar } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Events() {
  const [tab, setTab] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: events = [] } = useSWR(`/events?archived=${tab === "archive"}`, fetcher, { refreshInterval: 6000 });

  const activeCount = useSWR("/events?archived=false", fetcher).data?.length || 0;
  const archivedCount = useSWR("/events?archived=true", fetcher).data?.length || 0;

  const grouped = useMemo(() => {
    const g = {};
    events.forEach((e) => {
      if (!g[e.group_name]) g[e.group_name] = [];
      g[e.group_name].push(e);
    });
    return g;
  }, [events]);

  const archiveGroup = async (group) => {
    if (!window.confirm(`${group} grubu arşivlensin mi?`)) return;
    await api.post(`/events/archive-group?group_name=${encodeURIComponent(group)}`);
    mutate((k) => typeof k === "string" && k.startsWith("/events"));
    mutate("/stats");
    toast.success("Grup arşivlendi");
  };

  return (
    <div data-testid={EVENTS.container}>
      <Header subtitle="Etkinlik Yönetimi" />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold uppercase red-text tracking-wider">Etkinlikler</h2>
            <p className="text-xs text-muted-foreground"><span className="gold-text font-bold mono">{activeCount}</span> aktif</p>
          </div>
          <button
            data-testid={EVENTS.addBtn}
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="btn-gold flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-4 h-4" /> Yeni
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            data-testid={EVENTS.tabActive}
            onClick={() => setTab("active")}
            className={`chip ${tab === "active" ? "active" : ""}`}
          >AKTİF ({activeCount})</button>
          <button
            data-testid={EVENTS.tabArchived}
            onClick={() => setTab("archive")}
            className={`chip ${tab === "archive" ? "active" : ""}`}
          >ARŞİV ({archivedCount})</button>
        </div>

        {Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="tr-flag" />
                <h3 className="text-sm font-bold uppercase gold-text tracking-wider">{group}</h3>
                <span className="chip">{list.length}</span>
              </div>
              {tab === "active" && (
                <button onClick={() => archiveGroup(group)} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-red-500/15 red-text border border-red-500/30 hover:bg-red-500/25">
                  Grubu Arşivle
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {list.map((e) => (
                <div key={e.id} data-testid={EVENTS.card(e.id)} className="card-dark p-3 flex items-center gap-3 row-hover">
                  <div className="tr-flag" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate">{e.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      Çarpan: <span className="gold-text mono">{e.multiplier}x</span> • {new Date(e.date).toLocaleDateString("tr-TR")} • {e.subtitle}
                    </div>
                  </div>
                  {!e.archived && (
                    <button
                      data-testid={EVENTS.archiveBtn(e.id)}
                      onClick={async () => {
                        await api.patch(`/events/${e.id}`, { archived: true });
                        mutate((k) => typeof k === "string" && k.startsWith("/events"));
                        toast.success("Arşivlendi");
                      }}
                      className="w-8 h-8 rounded-md bg-yellow-500/15 hover:bg-yellow-500/30 gold-text flex items-center justify-center"
                      aria-label="Arşivle"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    data-testid={EVENTS.editBtn(e.id)}
                    onClick={() => { setEditing(e); setShowForm(true); }}
                    className="w-8 h-8 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    data-testid={EVENTS.deleteBtn(e.id)}
                    onClick={async () => {
                      if (!window.confirm(`${e.name} silinsin mi?`)) return;
                      await api.delete(`/events/${e.id}`);
                      mutate((k) => typeof k === "string" && k.startsWith("/events"));
                      mutate("/stats");
                      toast.success("Etkinlik silindi");
                    }}
                    className="w-8 h-8 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">Etkinlik bulunmuyor.</div>
        )}
      </div>

      {showForm && (
        <EventForm initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
    </div>
  );
}

function EventForm({ initial, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [multiplier, setMultiplier] = useState(initial?.multiplier || 1);
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [groupName, setGroupName] = useState(initial?.group_name || "SvS vs 10007");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Ad gerekli"); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), date: new Date(date).toISOString(), multiplier: Number(multiplier), subtitle: subtitle.trim() || null, group_name: groupName };
      if (initial) await api.patch(`/events/${initial.id}`, body);
      else await api.post("/events", body);
      mutate((k) => typeof k === "string" && k.startsWith("/events"));
      mutate("/stats");
      toast.success(initial ? "Güncellendi" : "Etkinlik eklendi");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card-red-gold w-full max-w-md p-5 fade-in relative">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? "Etkinliği Düzenle" : "Yeni Etkinlik"}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Ad</label>
        <input data-testid={EVENTS.formName} value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Tarih</label>
        <input data-testid={EVENTS.formDate} type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Çarpan</label>
        <input data-testid={EVENTS.formMultiplier} type="number" step="0.5" value={multiplier} onChange={(e) => setMultiplier(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Alt Başlık</label>
        <input data-testid={EVENTS.formSubtitle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Örn: 1. Gün Lütfen Katılın"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Grup</label>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button data-testid={EVENTS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : initial ? "Güncelle" : "Ekle"}
        </button>
      </form>
    </div>
  );
}
