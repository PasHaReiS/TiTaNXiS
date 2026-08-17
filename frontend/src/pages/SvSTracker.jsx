import React, { useState } from "react";
import useSWR from "swr";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Loader2, Plus, X, Trash2, Trophy, ShieldAlert, Swords } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/** SvS (Server vs Server) battle tracker. Admins log battles + members
 *  browse history. Wins/losses/draws summary sits at the top. */
export default function SvSTracker() {
  const { isAdmin } = useAuth();
  const { data, mutate, isLoading } = useSWR("/svs", fetcher, { refreshInterval: 30000 });
  const [showForm, setShowForm] = useState(false);
  const items = data?.items || [];
  const stats = data?.stats || { wins: 0, losses: 0, draws: 0, total: 0 };
  const winRate = stats.total ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div data-testid="svs-page">
      <Header title="SvS Takip" />
      <div className="px-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Toplam" value={stats.total} color="#F5A623" />
          <StatBox label="Galibiyet" value={stats.wins} color="#22C55E" />
          <StatBox label="Mağlubiyet" value={stats.losses} color="#EF4444" />
          <StatBox label="Kazanma %" value={`${winRate}%`} color="#93C5FD" />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-gold w-full flex items-center justify-center gap-2 text-sm py-2"
            data-testid="svs-compose-toggle"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "İptal" : "Yeni Savaş Kaydı"}
          </button>
        )}
        {showForm && isAdmin && (
          <SvSForm onSaved={() => { setShowForm(false); mutate(); }} />
        )}
        {isLoading && (
          <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
               data-testid="svs-loading">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Yükleniyor…
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
               data-testid="svs-empty">
            Henüz SvS kaydı yok.{isAdmin ? " Yeni bir savaş ekle." : ""}
          </div>
        )}
        <div className="space-y-2">
          {items.map((b) => <BattleRow key={b.id} b={b} isAdmin={isAdmin} onChanged={() => mutate()} />)}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="card-red-gold p-2 text-center"
         style={{ borderColor: `${color}44` }}>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function SvSForm({ onSaved, initial }) {
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [enemy, setEnemy] = useState(initial?.enemy_server || "");
  const [us, setUs] = useState(initial?.our_score || 0);
  const [en, setEn] = useState(initial?.enemy_score || 0);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!enemy.trim()) { toast.error("Rakip sunucu zorunlu"); return; }
    setSaving(true);
    try {
      const payload = {
        date, enemy_server: enemy.trim(),
        our_score: parseInt(us, 10) || 0,
        enemy_score: parseInt(en, 10) || 0,
        notes: notes.trim(),
        participants: initial?.participants || [],
      };
      if (initial?.id) await api.patch(`/svs/${initial.id}`, payload);
      else await api.post("/svs", payload);
      toast.success("Kaydedildi");
      onSaved?.();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="card-red-gold p-3 space-y-2" data-testid="svs-form">
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
               className="px-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
               data-testid="svs-form-date" required />
        <input type="text" value={enemy} onChange={(e) => setEnemy(e.target.value)}
               placeholder="Rakip sunucu (örn: #4123)"
               className="px-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
               data-testid="svs-form-enemy" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase font-bold text-muted-foreground">Bizim Skor</label>
          <input type="number" value={us} onChange={(e) => setUs(e.target.value)}
                 className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-white text-sm"
                 data-testid="svs-form-us" />
        </div>
        <div>
          <label className="text-[10px] uppercase font-bold text-muted-foreground">Rakip Skor</label>
          <input type="number" value={en} onChange={(e) => setEn(e.target.value)}
                 className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-white text-sm"
                 data-testid="svs-form-en" />
        </div>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Notlar (opsiyonel)" rows={2}
                className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs" />
      <button type="submit" disabled={saving}
              className="btn-gold w-full py-2 text-sm"
              data-testid="svs-form-submit">
        {saving ? "Kaydediliyor…" : (initial ? "Güncelle" : "Kaydet")}
      </button>
    </form>
  );
}

function BattleRow({ b, isAdmin, onChanged }) {
  const [editing, setEditing] = useState(false);
  const isWin = b.winner === "us";
  const isDraw = b.winner === "draw";
  const color = isWin ? "#22C55E" : isDraw ? "#F5A623" : "#EF4444";
  const label = isWin ? "GALİBİYET" : isDraw ? "BERABERE" : "MAĞLUBİYET";
  const Icon = isWin ? Trophy : isDraw ? Swords : ShieldAlert;
  const remove = async () => {
    if (!window.confirm("Kayıt silinsin mi?")) return;
    try { await api.delete(`/svs/${b.id}`); toast.success("Silindi"); onChanged?.(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  if (editing) return <SvSForm initial={b} onSaved={() => { setEditing(false); onChanged?.(); }} />;
  return (
    <div className="card-red-gold p-3 space-y-1" data-testid={`svs-row-${b.id}`}
         style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Icon className="w-4 h-4" style={{ color }} />
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: `${color}22`, color }}>
            {label}
          </span>
          <span className="text-xs text-white font-bold">vs {b.enemy_server}</span>
          <span className="text-[10px] text-muted-foreground">{b.date}</span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(true)} className="chip text-[10px]"
                    data-testid={`svs-edit-${b.id}`}>Düzenle</button>
            <button onClick={remove} className="chip text-[10px]"
                    style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
                    data-testid={`svs-delete-${b.id}`}>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <div className="text-2xl font-bold" style={{ color }}>{b.our_score}</div>
        <div className="text-sm text-muted-foreground">–</div>
        <div className="text-2xl font-bold text-white">{b.enemy_score}</div>
        {b.notes && <div className="text-[11px] text-muted-foreground italic ml-auto">{b.notes}</div>}
      </div>
    </div>
  );
}
