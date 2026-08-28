import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { X, Save, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin-only hidden note modal for a member.
 * GET  /api/members/{id}/admin-note    → { admin_note }
 * PUT  /api/members/{id}/admin-note    → { note }
 * Only admins can see this — regular members never see the button or the
 * note itself.
 */
export default function AdminNoteModal({ member, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/members/${member.id}/admin-note`);
        if (!cancelled) setNote(r.data?.admin_note || "");
      } catch (e) { toast.error(apiErr(e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/members/${member.id}/admin-note`, { note: note.trim() || null });
      toast.success("Gizli not kaydedildi");
      onSaved?.(note.trim());
      onClose();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold w-full max-w-md p-5 relative"
        data-testid="admin-note-modal"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-5 h-5" style={{ color: "#F59E0B" }} />
          <h3 className="text-lg font-bold uppercase gold-text">Gizli Admin Notu</h3>
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          <b className="text-white">{member.name}</b> için sadece adminlerin görebileceği not.
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin gold-text" />
          </div>
        ) : (
          <>
            <textarea
              data-testid="admin-note-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Örn: Katılım problemi, iletişim tercihi, vb."
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white resize-y mb-3"
            />
            <div className="text-[10px] text-muted-foreground text-right mb-3">
              {note.length}/2000
            </div>
            <button
              type="submit"
              disabled={saving}
              data-testid="admin-note-save"
              className="btn-primary w-full py-2 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Kaydet
            </button>
          </>
        )}
      </form>
    </div>
  );
}
