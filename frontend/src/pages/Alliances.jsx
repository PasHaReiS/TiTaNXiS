import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Users, Pencil, Trash2, GitMerge } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Alliances() {
  const { data = [], isLoading } = useSWR("/alliances/stats", fetcher);
  const [renaming, setRenaming] = useState(null); // {name, newName}
  const [merging, setMerging] = useState(false);
  const [selected, setSelected] = useState([]);
  const [mergeTarget, setMergeTarget] = useState("");

  const toggle = (n) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  const doRename = async () => {
    if (!renaming?.newName?.trim()) return;
    try {
      const res = await api.post("/alliances/rename", { old_name: renaming.name, new_name: renaming.newName.trim() });
      toast.success(`${res.data.modified} üye güncellendi`);
      setRenaming(null);
      mutate("/alliances/stats");
      mutate("/alliances");
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };
  const doMerge = async () => {
    if (!mergeTarget || selected.length === 0) return;
    try {
      const res = await api.post("/alliances/merge", { source_names: selected, target_name: mergeTarget });
      toast.success(`${res.data.modified} üye '${mergeTarget}' ittifakına taşındı`);
      setMerging(false); setSelected([]); setMergeTarget("");
      mutate("/alliances/stats");
      mutate("/alliances");
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };
  const doDelete = async (name) => {
    if (!window.confirm(`'${name}' ittifakı silinsin mi? Üyelerin ittifak alanı boşaltılır.`)) return;
    try {
      const res = await api.post("/alliances/delete", { name });
      toast.success(`${res.data.cleared} üyenin ittifakı temizlendi`);
      mutate("/alliances/stats");
      mutate("/alliances");
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
    } catch (e) { toast.error(e?.response?.data?.detail || e.message); }
  };

  return (
    <div className="min-h-screen" data-testid="alliances-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title="İttifaklar" />
        <div className="card-red-gold p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase gold-text tracking-widest">Toplam {data.length} ittifak</div>
            {selected.length >= 2 && (
              <button
                data-testid="alliance-merge-open"
                onClick={() => { setMerging(true); setMergeTarget(selected[0]); }}
                className="btn-gold text-xs flex items-center gap-1.5"
              >
                <GitMerge className="w-3.5 h-3.5" /> {selected.length} ittifakı birleştir
              </button>
            )}
          </div>
          {isLoading && <div className="text-sm text-muted-foreground">Yükleniyor…</div>}
          <div className="flex flex-col gap-2">
            {data.map((a) => (
              <div
                key={a.name}
                data-testid={`alliance-row-${a.name}`}
                className="rounded-lg p-3 flex items-center justify-between gap-3"
                style={{ background: "rgba(20,12,10,0.6)", border: `1px solid ${selected.includes(a.name) ? "#F5A623" : "rgba(231,76,26,0.25)"}` }}
              >
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={selected.includes(a.name)} onChange={() => toggle(a.name)}
                    data-testid={`alliance-check-${a.name}`} />
                  <div className="flex flex-col min-w-0">
                    <div className="text-sm font-bold text-white">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <Users className="w-3 h-3" /> {a.member_count} üye · Güç: {Number(a.total_power || 0).toLocaleString("tr-TR")}
                    </div>
                  </div>
                </label>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button data-testid={`alliance-rename-${a.name}`}
                    onClick={() => setRenaming({ name: a.name, newName: a.name })}
                    className="chip text-[10px] flex items-center gap-1"><Pencil className="w-3 h-3" /> Yeniden Adlandır</button>
                  <button data-testid={`alliance-delete-${a.name}`}
                    onClick={() => doDelete(a.name)}
                    className="chip text-[10px] flex items-center gap-1" style={{ borderColor: "rgba(239,68,68,0.5)", color: "#f87171" }}>
                    <Trash2 className="w-3 h-3" /> Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {renaming && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setRenaming(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card-red-gold p-5 w-full max-w-sm">
            <h3 className="gold-text uppercase text-sm mb-3">'{renaming.name}' Yeniden Adlandır</h3>
            <input autoFocus value={renaming.newName}
              onChange={(e) => setRenaming({ ...renaming, newName: e.target.value })}
              data-testid="alliance-rename-input"
              className="w-full px-3 py-2 rounded bg-black/40 border border-amber-500/30 text-white text-sm" />
            <div className="flex gap-2 mt-3">
              <button className="chip text-xs flex-1" onClick={() => setRenaming(null)}>İptal</button>
              <button className="btn-gold text-xs flex-1" data-testid="alliance-rename-save" onClick={doRename}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {merging && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setMerging(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card-red-gold p-5 w-full max-w-sm">
            <h3 className="gold-text uppercase text-sm mb-3">{selected.length} İttifak Birleştir</h3>
            <p className="text-xs text-muted-foreground mb-2">Hedef ittifak seçin — diğer tüm seçili ittifakların üyeleri buna taşınacak:</p>
            <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}
              data-testid="alliance-merge-target"
              className="w-full px-3 py-2 rounded bg-black/40 border border-amber-500/30 text-white text-sm">
              {selected.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex gap-2 mt-3">
              <button className="chip text-xs flex-1" onClick={() => setMerging(false)}>İptal</button>
              <button className="btn-gold text-xs flex-1" data-testid="alliance-merge-confirm" onClick={doMerge}>Birleştir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
