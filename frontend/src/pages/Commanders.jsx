import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, CATEGORIES, groupCategories } from "@/lib/api";
import { COMMANDERS } from "@/constants/testIds";
import Header from "@/components/Header";
import CanEdit from "@/components/CanEdit";
import { Plus, Pencil, Trash2, X, Shield, ChevronDown, ChevronRight, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function Commanders() {
  const { t } = useTranslation();
  const [selectedCat, setSelectedCat] = useState(CATEGORIES[1].key);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const sections = groupCategories();
  const [expanded, setExpanded] = useState(() => {
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
      <Header subtitle={t("commander_guide")} />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold uppercase red-text tracking-wider">{t("commanders_title")}</h2>
          <CanEdit>
            <button
              data-testid={COMMANDERS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> {t("new_short")}
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
                  <button
                    type="button"
                    onClick={() => setLightbox(c)}
                    data-testid={`commander-open-${c.id}`}
                    className="flex gap-3 w-full text-left"
                  >
                    {c.image_url ? (
                      <img src={resolveImageUrl(c.image_url)} alt={c.name} className="w-16 h-16 rounded-md object-cover border border-primary/30" />
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
                  </button>
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
                          if (!window.confirm(t("confirm_delete_generic", { name: c.name }))) return;
                          await api.delete(`/commanders/${c.id}`);
                          mutate((k) => typeof k === "string" && k.startsWith("/commanders"));
                          toast.success(t("deleted"));
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
                <div className="card-dark p-6 text-center text-muted-foreground text-xs">{t("no_commanders_in_category")}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <CommanderForm initial={editing} defaultCategory={selectedCat} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}
      {lightbox && <CommanderLightbox commander={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function CommanderLightbox({ commander, onClose }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 fade-in"
      onClick={onClose}
      data-testid="commander-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        data-testid="commander-lightbox-close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 border border-primary/50 hover:bg-primary/30 flex items-center justify-center z-10"
        aria-label={t("close")}
      >
        <X className="w-5 h-5 text-white" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md flex flex-col items-center max-h-[95vh] overflow-y-auto"
      >
        {commander.image_url ? (
          <img
            src={resolveImageUrl(commander.image_url)}
            alt={commander.name}
            className="max-w-full max-h-[60vh] rounded-lg object-contain shadow-2xl border-2 border-primary/40"
          />
        ) : (
          <div className="w-56 h-56 rounded-lg bg-black/60 border-2 border-primary/40 flex items-center justify-center">
            <Shield className="w-20 h-20 gold-text" />
          </div>
        )}

        <div className="w-full mt-4 text-center px-2">
          <h3 className="text-2xl font-bold uppercase gold-text tracking-wider mb-2" style={{ fontFamily: "Rajdhani" }}>
            {commander.name}
          </h3>
          {commander.description && (
            <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
              {commander.description}
            </p>
          )}
          {(commander.characters || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
              {commander.characters.map((ch) => (
                <span key={ch} className="text-xs px-2.5 py-1 rounded-full bg-red-500/20 red-text border border-red-500/40 font-semibold">
                  {ch}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Resolve /uploads/... to full backend URL for preview.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const resolveImageUrl = (u) => {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/uploads/")) return `${BACKEND_URL}/api${u}`;
  if (u.startsWith("/api/uploads/")) return `${BACKEND_URL}${u}`;
  return u;
};

function CommanderForm({ initial, defaultCategory, onClose }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || defaultCategory);
  const [imageUrl, setImageUrl] = useState(initial?.image_url || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [characters, setCharacters] = useState((initial?.characters || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("upload_invalid_type")); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error(t("upload_too_large")); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageUrl(res.data.url);
      toast.success(t("upload_done"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("name_required")); return; }
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
      toast.success(initial ? t("updated") : t("commander_added"));
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
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? t("edit_commander") : t("new_commander")}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("name_person")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("category")}</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white">
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.section} — {c.label}</option>)}
        </select>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("characters_comma")}</label>
        <input value={characters} onChange={(e) => setCharacters(e.target.value)}
          placeholder={t("characters_example")}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("image_url")}</label>
        <div className="flex items-start gap-2">
          {imageUrl && (
            <img
              src={resolveImageUrl(imageUrl)}
              alt="preview"
              className="w-14 h-14 rounded-md object-cover border border-primary/40 flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              data-testid="commander-image-preview"
            />
          )}
          <div className="flex-1 space-y-1.5">
            <input
              data-testid="commander-image-url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... or /api/uploads/..."
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
              data-testid="commander-image-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              data-testid="commander-image-upload-btn"
              className="chip w-full justify-center py-2"
            >
              {uploading ? (
                <>
                  <Upload className="w-3.5 h-3.5 animate-pulse" /> {t("uploading")}
                </>
              ) : (
                <>
                  <ImageIcon className="w-3.5 h-3.5" /> {t("upload_from_device")}
                </>
              )}
            </button>
          </div>
        </div>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">{t("description")}</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <button type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? t("saving") : initial ? t("update") : t("add_short")}
        </button>
      </form>
    </div>
  );
}
