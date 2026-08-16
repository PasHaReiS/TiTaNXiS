import React, { useState } from "react";
import useSWR from "swr";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus, X, Copy, ShieldOff, Trash2, Clock, Users, Link2 } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Invite Links (Faz 5) admin UI — nested under Yönetim > Davet Linkleri.
 * Admins can mint one-shot, N-use or unlimited invites with optional expiry.
 */
export default function InviteManagement() {
  const [showCompose, setShowCompose] = useState(false);
  const { data, mutate, isLoading } = useSWR("/invites", fetcher, { refreshInterval: 60000 });
  const items = data?.items || [];

  return (
    <div className="space-y-3" data-testid="invite-mgmt">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-widest gold-text font-bold">
          Davet Linkleri ({items.length})
        </div>
        <button
          type="button"
          onClick={() => setShowCompose((v) => !v)}
          className="chip text-[10px]"
          data-testid="invite-compose-toggle"
        >
          {showCompose ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showCompose ? "İptal" : "Yeni Davet"}
        </button>
      </div>

      {showCompose && <InviteComposer onCreated={() => { setShowCompose(false); mutate(); }} />}

      {isLoading && (
        <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
             data-testid="invite-loading">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
             data-testid="invite-empty">
          Henüz davet linki yok. Yeni oluştur ve komutanlara paylaş.
        </div>
      )}
      <div className="space-y-2">
        {items.map((inv) => (
          <InviteRow key={inv.id} inv={inv} onChanged={() => mutate()} />
        ))}
      </div>
    </div>
  );
}

function InviteComposer({ onCreated }) {
  const [maxUses, setMaxUses] = useState(1);
  const [unlimited, setUnlimited] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [role, setRole] = useState("user");
  const [canEdit, setCanEdit] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    let expIso = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (isNaN(d.getTime())) { toast.error("Geçersiz süre"); return; }
      if (d.getTime() <= Date.now()) { toast.error("Süre gelecekte olmalı"); return; }
      expIso = d.toISOString();
    }
    setSaving(true);
    try {
      await api.post("/invites", {
        max_uses: unlimited ? null : Math.max(1, Number(maxUses) || 1),
        expires_at: expIso || undefined,
        role, default_can_edit: canEdit,
        note: note.trim() || undefined,
      });
      toast.success("Davet linki oluşturuldu");
      onCreated?.();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit}
          className="card-red-gold p-3 space-y-2"
          data-testid="invite-composer">
      <input
        type="text" value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Not (opsiyonel) — Örn: SvS Ekim ekibi"
        className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
        data-testid="invite-composer-note"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Kullanım</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min="1"
              value={maxUses}
              disabled={unlimited}
              onChange={(e) => setMaxUses(e.target.value)}
              className="w-20 px-2 py-1 rounded bg-black/40 border border-border text-white text-xs disabled:opacity-40"
              data-testid="invite-composer-max-uses"
            />
            <label className="text-[10px] text-white flex items-center gap-1">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)}
                     data-testid="invite-composer-unlimited" />
              Sınırsız
            </label>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Süre</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full px-2 py-1 rounded bg-black/40 border border-border text-white text-xs"
            data-testid="invite-composer-expires-at"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 items-center">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-2 py-1 rounded bg-black/40 border border-border text-white text-xs"
            data-testid="invite-composer-role"
          >
            <option value="user">Üye</option>
            <option value="editor">Editör</option>
            <option value="admin">Yönetici</option>
          </select>
        </div>
        <label className="text-[10px] text-white flex items-center gap-1.5 mt-4">
          <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)}
                 data-testid="invite-composer-can-edit" />
          Düzenleme yetkisi ver
        </label>
      </div>
      <button
        type="submit" disabled={saving}
        className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
        data-testid="invite-composer-submit"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {saving ? "Oluşturuluyor…" : "Davet Linki Oluştur"}
      </button>
    </form>
  );
}

function InviteRow({ inv, onChanged }) {
  const url = `${window.location.origin}/kayit/${inv.token}`;
  const statusChip = {
    active: { bg: "rgba(34,197,94,0.2)", color: "#86EFAC", label: "AKTİF" },
    full: { bg: "rgba(239,68,68,0.2)", color: "#FCA5A5", label: "DOLU" },
    expired: { bg: "rgba(239,68,68,0.2)", color: "#FCA5A5", label: "SÜRESİ DOLDU" },
    disabled: { bg: "rgba(120,113,108,0.2)", color: "#D6D3D1", label: "İPTAL" },
  }[inv.status] || { bg: "rgba(120,113,108,0.2)", color: "#D6D3D1", label: inv.status?.toUpperCase() };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Link kopyalandı"); }
    catch { toast.error("Kopyalanamadı"); }
  };
  const disable = async () => {
    if (!window.confirm("Davet linkini iptal etmek istediğine emin misin?")) return;
    try { await api.patch(`/invites/${inv.id}/disable`); toast.success("İptal edildi"); onChanged?.(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async () => {
    if (!window.confirm("Davet linkini kalıcı olarak sil? Bu işlem geri alınamaz.")) return;
    try { await api.delete(`/invites/${inv.id}`); toast.success("Silindi"); onChanged?.(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="card-red-gold p-2 space-y-1.5"
         style={{ opacity: inv.status === "active" ? 1 : 0.65 }}
         data-testid={`invite-row-${inv.id}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: statusChip.bg, color: statusChip.color }}
              data-testid={`invite-status-${inv.id}`}>
          {statusChip.label}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(245,166,35,0.2)", color: "#F5A623" }}>
          {inv.role?.toUpperCase() || "USER"}
        </span>
        {inv.default_can_edit && (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}>
            EDIT
          </span>
        )}
        {inv.note && <span className="text-xs text-white italic truncate">"{inv.note}"</span>}
        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <Users className="w-2.5 h-2.5" />
            {inv.uses}{inv.max_uses ? `/${inv.max_uses}` : "/∞"}
          </span>
          {inv.expires_at && (
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {new Date(inv.expires_at).toLocaleString("tr-TR")}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={url}
          readOnly
          className="flex-1 min-w-0 px-2 py-1 rounded bg-black/60 border border-border text-[10px] text-white font-mono"
          data-testid={`invite-url-${inv.id}`}
          onClick={(e) => e.target.select()}
        />
        <button onClick={copy}
                className="chip text-[10px] flex-shrink-0"
                data-testid={`invite-copy-${inv.id}`}>
          <Copy className="w-3 h-3" /> Kopyala
        </button>
        {inv.status === "active" && (
          <button onClick={disable}
                  className="chip text-[10px] flex-shrink-0"
                  style={{ borderColor: "rgba(239,68,68,0.4)", color: "#FCA5A5" }}
                  data-testid={`invite-disable-${inv.id}`}>
            <ShieldOff className="w-3 h-3" /> İptal
          </button>
        )}
        <button onClick={remove}
                className="chip text-[10px] flex-shrink-0"
                style={{ borderColor: "rgba(239,68,68,0.5)", color: "#FCA5A5" }}
                data-testid={`invite-delete-${inv.id}`}>
          <Trash2 className="w-3 h-3" /> Sil
        </button>
      </div>
      <div className="text-[9px] text-muted-foreground">
        {inv.created_by_username || "sistem"} · {new Date(inv.created_at).toLocaleString("tr-TR")}
      </div>
    </div>
  );
}
