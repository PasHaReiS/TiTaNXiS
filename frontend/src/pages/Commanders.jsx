import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, CATEGORIES, groupCategories } from "@/lib/api";
import { COMMANDERS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, X, Shield, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Commanders() {
  const [selectedCat, setSelectedCat] = useState(CATEGORIES[1].key);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const sections = groupCategories();
  const [expanded, setExpanded] = useState(() => {
    // Expand the section containing the initially selected category
    const initial = {};
    Object.entries(sections).forEach(([sec, cats]) => {
      initial[sec] = cats.some((c) => c.key === CATEGORIES[1].key);
    });
    return initial;
  });

  const { data: commanders = [] } = useSWR(`/commanders?category=${selectedCat}`, fetcher, { refreshInterval: 8000 });

  const toggleSection = (section) => setExpanded((e) => ({ ...e, [section]: !e[section] }));

  return (
    <div data-testid={COMMANDERS.container}>
      <Header subtitle="Komutan Rehberi" />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold uppercase red-text tracking-wider">Komutanlar</h2>
          <CanEdit>
            <button
              data-testid={COMMANDERS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> Yeni
            </button>
          </CanEdit>
        </div>

        <div className="grid grid-cols-[130px_1fr] gap-3">
          {/* Sidebar tree (accordion) */}
          <div className="card-dark p-2 max-h-[calc(100vh-260px)] overflow-y-auto">
            {Object.entries(sections).map(([section, cats]) => (
              <div key={section} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  data-testid={`section-toggle-${section}`}
                  className="w-full flex items-center justify-between tree-cat hover:text-white"
                  style={{ background: "transparent", border: 0, cursor: "pointer" }}
                >
                  <span>{section}</span>
                  {expanded[section] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {expanded[section] && cats.map((c) => (
                  <div
                    key={c.key}
                    data-testid={COMMANDERS.categoryItem(c.key)}
                    onClick={() => setSelectedCat(c.key)}
                    className={`tree-item ${selectedCat === c.key ? "active" : ""}`}
                  >
                    {c.label}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="min-w-0">
            <div className="text-[11px] uppercase gold-text font-bold tracking-widest mb-2">
              {CATEGORIES.find((c) => c.key === selectedCat)?.label}
            </div>
            <div className="space-y-2">
              {commanders.map((c) => (
                <div key={c.id} data-testid={COMMANDERS.card(c.id)} className="card-red-gold p-3 fade-in">
                  <div className="flex gap-3">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="w-16 h-16 rounded-md object-cover border border-primary/30" />
                    ) : (
                      <div className="w-16 h-16 rounded-md bg-black/40 border border-primary/30 flex items-center justify-center">
                        <Shield className="w-6 h-6 gold-text" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white truncate">{c.name}</div>
                      {c.description && <div className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{c.description}</div>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(c.characters || []).map((ch) => (
                          <span key={ch} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 red-text border border-red-500/30">
                            {ch}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <CanEdit>
                    <div className="flex justify-end gap-1 mt-2">
                      <button
                        onClick={() => { setEditing(c); setShowForm(true); }}
                        className="w-7 h-7 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`${c.name} silinsin mi?`)) return;
                          await api.delete(`/commanders/${c.id}`);
                          mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
                          toast.success("Silindi");
                        }}
                        className="w-7 h-7 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </CanEdit>
                </div>
              ))}
              {commanders.length === 0 && (
                <div className="card-dark p-6 text-center text-muted-foreground text-xs">Bu kategoride komutan yok.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <CommanderForm initial={editing} defaultCategory={selectedCat} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
    </div>
  );
}

function CommanderForm({ initial, defaultCategory, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || defaultCategory);
  const [imageUrl, setImageUrl] = useState(initial?.image_url || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [characters, setCharacters] = useState((initial?.characters || []).join(", "));
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("İsim gerekli"); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        category,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
        characters: characters.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (initial) await api.patch(`/commanders/${initial.id}`, body);
      else await api.post("/commanders", body);
      mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
      toast.success(initial ? "Güncellendi" : "Komutan eklendi");
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
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? "Komutanı Düzenle" : "Yeni Komutan"}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">İsim</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Kategori</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white">
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.section} — {c.label}</option>)}
        </select>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Karakterler (virgülle)</label>
        <input value={characters} onChange={(e) => setCharacters(e.target.value)}
          placeholder="Mai Shiranui, Terry Bogard"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Resim URL</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Açıklama</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : initial ? "Güncelle" : "Ekle"}
        </button>
      </form>
    </div>
  );
}
