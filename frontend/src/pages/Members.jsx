import React, { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { api, RANKS } from "@/lib/api";
import { MEMBERS } from "@/constants/testIds";
import Header from "@/components/Header";
import MemberProfileDialog from "@/components/MemberProfileDialog";
import CanEdit from "@/components/CanEdit";
import { Search, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

const RANK_LABELS = {
  GOW: "GOW",
  R5: "R5",
  R4: "R4",
  R3: "R3",
  R2: "R2",
  R1: "R1",
};

export default function Members() {
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const { data: members = [] } = useSWR(`/members${q ? `?search=${encodeURIComponent(q)}` : ""}`, fetcher, {
    refreshInterval: 8000,
  });

  const grouped = useMemo(() => {
    const g = {};
    RANKS.forEach((r) => (g[r] = []));
    members.forEach((m) => {
      if (!g[m.rank]) g[m.rank] = [];
      g[m.rank].push(m);
    });
    return g;
  }, [members]);

  const totalCount = members.length;

  return (
    <div data-testid={MEMBERS.container}>
      <Header subtitle="Üye Yönetimi" />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold uppercase red-text tracking-wider">Üyeler</h2>
            <p className="text-xs text-muted-foreground">Toplam <span className="gold-text font-bold mono">{totalCount}</span> üye</p>
          </div>
          <CanEdit>
            <button
              data-testid={MEMBERS.addBtn}
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" /> Yeni
            </button>
          </CanEdit>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid={MEMBERS.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İsim veya ID ara..."
            className="w-full card-dark pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        {RANKS.map((rank) => grouped[rank] && grouped[rank].length > 0 && (
          <div key={rank} className="mb-4 fade-in">
            <div className={`rank-header rank-header-${rank}`}>
              <span>{RANK_LABELS[rank]}</span>
              <span className="mono">{grouped[rank].length}</span>
            </div>
            <div className="space-y-1.5">
              {grouped[rank].map((m) => (
                <div
                  key={m.id}
                  data-testid={MEMBERS.card(m.id)}
                  className="card-dark p-3 flex items-center gap-3 row-hover"
                >
                  <button onClick={() => setProfileId(m.id)} className={`rank-badge rank-${m.rank}`}>
                    {m.rank === "GOW" ? "" : m.rank}
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setProfileId(m.id)}>
                    <div className="font-bold text-white truncate">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground mono">ID: {m.member_id}</div>
                    {m.alliance_name && <div className="text-[10px] text-white/70 truncate">🛡 {m.alliance_name}</div>}
                    {m.title && <div className="text-[10px] gold-text font-semibold uppercase mt-0.5">{m.title}</div>}
                  </div>
                  <CanEdit>
                    <button
                      data-testid={MEMBERS.editBtn(m.id)}
                      onClick={() => { setEditing(m); setShowForm(true); }}
                      className="w-8 h-8 rounded-md bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center"
                      aria-label="Düzenle"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      data-testid={MEMBERS.deleteBtn(m.id)}
                      onClick={async () => {
                        if (!window.confirm(`${m.name} silinsin mi?`)) return;
                        await api.delete(`/members/${m.id}`);
                        mutate((k) => typeof k === "string" && k.startsWith("/members"));
                        mutate("/stats");
                        toast.success("Üye silindi");
                      }}
                      className="w-8 h-8 rounded-md bg-red-500/15 hover:bg-red-500/30 text-red-400 flex items-center justify-center"
                      aria-label="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </CanEdit>
                </div>
              ))}
            </div>
          </div>
        ))}

        {totalCount === 0 && (
          <div className="card-dark p-6 text-center text-muted-foreground">Kayıt bulunamadı.</div>
        )}
      </div>

      {showForm && (
        <MemberForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <MemberProfileDialog memberId={profileId} open={!!profileId} onClose={() => setProfileId(null)} />
    </div>
  );
}

function MemberForm({ initial, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [memberId, setMemberId] = useState(initial?.member_id || "");
  const [allianceName, setAllianceName] = useState(initial?.alliance_name || "");
  const [rank, setRank] = useState(initial?.rank || "GOW");
  const [title, setTitle] = useState(initial?.title || "");
  const [level, setLevel] = useState(initial?.level || 30);
  const [saving, setSaving] = useState(false);
  const { data: alliances = [] } = useSWR("/alliances", fetcher);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !memberId.trim()) {
      toast.error("İsim ve ID gerekli");
      return;
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), member_id: memberId.trim(), alliance_name: allianceName.trim() || null, rank, title: title.trim() || null, level: Number(level) || 1 };
      if (initial) {
        await api.patch(`/members/${initial.id}`, body);
        toast.success("Üye güncellendi");
      } else {
        await api.post("/members", body);
        toast.success("Üye eklendi");
      }
      mutate((k) => typeof k === "string" && k.startsWith("/members"));
      mutate("/stats");
      onClose();
    } catch (err) {
      toast.error("Hata: " + (err?.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        data-testid={MEMBERS.form}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 fade-in relative"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{initial ? "Üyeyi Düzenle" : "Yeni Üye"}</h3>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">İsim</label>
        <input data-testid={MEMBERS.formName} value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Oyun ID</label>
        <input data-testid={MEMBERS.formId} value={memberId} onChange={(e) => setMemberId(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">İttifak Adı</label>
        <input
          data-testid="member-form-alliance"
          value={allianceName}
          onChange={(e) => setAllianceName(e.target.value)}
          list="alliance-list"
          placeholder="Örn: SvS Loncası"
          autoComplete="off"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
        />
        <datalist id="alliance-list">
          {alliances.map((a) => (<option key={a} value={a} />))}
        </datalist>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Rütbe</label>
        <div data-testid={MEMBERS.formRank} className="flex gap-1.5 flex-wrap">
          {RANKS.map((r) => (
            <button key={r} type="button" onClick={() => setRank(r)} className={`chip ${rank === r ? "active" : ""}`}>{r}</button>
          ))}
        </div>

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Ünvan (opsiyonel)</label>
        <input data-testid={MEMBERS.formTitle} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Örn: Kral"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />

        <label className="block text-xs uppercase text-muted-foreground font-bold mb-1 mt-3">Seviye</label>
        <input type="number" value={level} onChange={(e) => setLevel(e.target.value)} min="1" max="99"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mono" />

        <button data-testid={MEMBERS.formSubmit} type="submit" disabled={saving} className="btn-gold w-full mt-5">
          {saving ? "Kaydediliyor..." : initial ? "Güncelle" : "Ekle"}
        </button>
      </form>
    </div>
  );
}
