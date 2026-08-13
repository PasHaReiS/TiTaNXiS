import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, apiErr } from "@/lib/api";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Users, Pencil, Trash2, GitMerge, Shield, GraduationCap, Plus } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const CATS = [
  { key: "main", label: "ANA İTTİFAKLAR", Icon: Shield, color: "#F5A623" },
  { key: "academy", label: "AKADEMİLER", Icon: GraduationCap, color: "#38BDF8" },
  { key: null, label: "SINIFLANDIRILMAMIŞ", Icon: Users, color: "#9ca3af" },
];

export default function Alliances() {
  const { data = [], isLoading } = useSWR("/alliances/stats", fetcher);
  const [renaming, setRenaming] = useState(null);
  const [merging, setMerging] = useState(false);
  const [selected, setSelected] = useState([]);
  const [mergeTarget, setMergeTarget] = useState("");
  const existingNames = useMemo(() => new Set(data.map((a) => a.name)), [data]);

  const grouped = useMemo(() => {
    const g = { main: [], academy: [], null: [] };
    data.forEach((a) => {
      const k = a.category === "main" || a.category === "academy" ? a.category : "null";
      g[k].push(a);
    });
    return g;
  }, [data]);

  const toggle = (n) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  const refresh = () => {
    mutate("/alliances/stats");
    mutate("/alliances");
    mutate((k) => typeof k === "string" && k.startsWith("/members"));
  };

  const doRename = async () => {
    const nn = (renaming?.newName || "").trim();
    if (!nn) return;
    if (nn !== renaming.name && existingNames.has(nn)) {
      toast.error(`'${nn}' ittifakı zaten var. Birleştirmek için Birleştir işlemini kullanın.`);
      return;
    }
    try {
      const res = await api.post("/alliances/rename", { old_name: renaming.name, new_name: nn });
      toast.success(`${res.data.modified} üye güncellendi`);
      setRenaming(null); refresh();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const doMerge = async () => {
    if (!mergeTarget || selected.length === 0) return;
    try {
      const res = await api.post("/alliances/merge", { source_names: selected, target_name: mergeTarget });
      toast.success(`${res.data.modified} üye '${mergeTarget}' ittifakına taşındı`);
      setMerging(false); setSelected([]); setMergeTarget(""); refresh();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const doDelete = async (name) => {
    if (!window.confirm(`'${name}' ittifakı silinsin mi? Üyelerin ittifak alanı boşaltılır.`)) return;
    try {
      const res = await api.post("/alliances/delete", { name });
      toast.success(`${res.data.cleared} üyenin ittifakı temizlendi`);
      refresh();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const setCategory = async (name, category) => {
    try {
      await api.post("/alliances/set-category", { name, category });
      toast.success(category ? `'${name}' → ${category === "main" ? "Ana" : "Akademi"}` : `'${name}' kategorisi kaldırıldı`);
      refresh();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const doCreate = async () => {
    const nn = (creating?.name || "").trim();
    if (!nn) return;
    if (existingNames.has(nn)) {
      toast.error(`'${nn}' ittifakı zaten var.`);
      return;
    }
    try {
      await api.post("/alliances/create", { name: nn, category: creating.category || null });
      toast.success(`'${nn}' ittifakı oluşturuldu`);
      setCreating(null); refresh();
    } catch (e) {
      const msg = e?.response?.status === 409
        ? (e.response.data?.detail || "Bu ittifak zaten var.")
        : apiErr(e);
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen" data-testid="alliances-page" style={{ paddingBottom: 80 }}>
      <div className="max-w-6xl mx-auto p-4">
        <Header title="İttifaklar" />
        <div className="card-red-gold p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase gold-text tracking-widest">Toplam {data.length} ittifak</div>
            <div className="flex items-center gap-2">
              <button
                data-testid="alliance-create-open"
                onClick={() => setCreating({ name: "", category: "main" })}
                className="btn-gold text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Yeni İttifak
              </button>
              {selected.length >= 2 && (
                <button data-testid="alliance-merge-open"
                  onClick={() => { setMerging(true); setMergeTarget(selected[0]); }}
                  className="chip text-xs flex items-center gap-1.5">
                  <GitMerge className="w-3.5 h-3.5" /> {selected.length} birleştir
                </button>
              )}
            </div>
          </div>
          {isLoading && <div className="text-sm text-muted-foreground">Yükleniyor…</div>}

          {CATS.map(({ key, label, Icon, color }) => {
            const rows = grouped[key === null ? "null" : key] || [];
            if (rows.length === 0) return null;
            return (
              <div key={String(key)} className="mb-4" data-testid={`alliance-cat-${key || "none"}`}>
                <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-widest" style={{ color, fontFamily: "Cinzel, serif", fontWeight: 700 }}>
                  <Icon className="w-3.5 h-3.5" /> {label} <span className="opacity-60">({rows.length})</span>
                </div>
                <div className="flex flex-col gap-2">
                  {rows.map((a) => (
                    <div key={a.name} data-testid={`alliance-row-${a.name}`}
                      className="rounded-lg p-3 flex items-center justify-between gap-3"
                      style={{ background: "rgba(20,12,10,0.6)", border: `1px solid ${selected.includes(a.name) ? "#F5A623" : "rgba(231,76,26,0.25)"}` }}>
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
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <button data-testid={`alliance-cat-main-${a.name}`}
                          onClick={() => setCategory(a.name, a.category === "main" ? null : "main")}
                          className="chip text-[10px] flex items-center gap-1"
                          style={a.category === "main" ? { background: "rgba(245,166,35,0.25)", borderColor: "#F5A623", color: "#F5A623" } : {}}>
                          <Shield className="w-3 h-3" /> Ana
                        </button>
                        <button data-testid={`alliance-cat-acad-${a.name}`}
                          onClick={() => setCategory(a.name, a.category === "academy" ? null : "academy")}
                          className="chip text-[10px] flex items-center gap-1"
                          style={a.category === "academy" ? { background: "rgba(56,189,248,0.25)", borderColor: "#38BDF8", color: "#38BDF8" } : {}}>
                          <GraduationCap className="w-3 h-3" /> Akademi
                        </button>
                        <button data-testid={`alliance-rename-${a.name}`}
                          onClick={() => setRenaming({ name: a.name, newName: a.name })}
                          className="chip text-[10px] flex items-center gap-1"><Pencil className="w-3 h-3" /> Ad</button>
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
            );
          })}
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
            {renaming.newName !== renaming.name && existingNames.has(renaming.newName) && (
              <div className="text-[11px] text-red-400 mt-2">⚠ Bu ad zaten var. Birleştirmek için Birleştir işlemini kullanın.</div>
            )}
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

      {creating && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setCreating(null)} data-testid="alliance-create-modal">
          <div onClick={(e) => e.stopPropagation()} className="card-red-gold p-5 w-full max-w-sm">
            <h3 className="gold-text uppercase text-sm mb-3">Yeni İttifak Ekle</h3>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">İttifak Adı</label>
            <input autoFocus value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              data-testid="alliance-create-name"
              placeholder="örn. GOW"
              className="w-full px-3 py-2 rounded bg-black/40 border border-amber-500/30 text-white text-sm mb-3" />
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Kategori</label>
            <div className="flex gap-2 mb-1">
              <button type="button" data-testid="alliance-create-cat-main"
                onClick={() => setCreating({ ...creating, category: "main" })}
                className="chip text-xs flex-1 flex items-center justify-center gap-1"
                style={creating.category === "main" ? { background: "rgba(245,166,35,0.25)", borderColor: "#F5A623", color: "#F5A623" } : {}}>
                <Shield className="w-3.5 h-3.5" /> Ana İttifak
              </button>
              <button type="button" data-testid="alliance-create-cat-acad"
                onClick={() => setCreating({ ...creating, category: "academy" })}
                className="chip text-xs flex-1 flex items-center justify-center gap-1"
                style={creating.category === "academy" ? { background: "rgba(56,189,248,0.25)", borderColor: "#38BDF8", color: "#38BDF8" } : {}}>
                <GraduationCap className="w-3.5 h-3.5" /> Akademi
              </button>
            </div>
            {existingNames.has((creating.name || "").trim()) && (creating.name || "").trim() && (
              <div className="text-[11px] text-red-400 mt-2">⚠ Bu ad zaten var.</div>
            )}
            <div className="flex gap-2 mt-4">
              <button className="chip text-xs flex-1" onClick={() => setCreating(null)}>İptal</button>
              <button className="btn-gold text-xs flex-1" data-testid="alliance-create-save" onClick={doCreate}>Oluştur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
