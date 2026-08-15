import React, { useState } from "react";
import useSWR from "swr";
import { Megaphone, Send, Trash2, Loader2, Radio, Users, MessageCircle, Bell } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Announcements page — admin creates a broadcast that fans out across
 * Web Push + Telegram Group + Telegram DMs (country-translated) + in-app
 * bell in a single action. Non-admin visitors just see the list of active
 * announcements below the create form (which is hidden for them).
 */
export default function Announcements() {
  const { isAdmin } = useAuth();
  const { data, mutate, isLoading } = useSWR("/announcements?limit=50", fetcher, { refreshInterval: 60000 });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [broadcast, setBroadcast] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { toast.error("Başlık ve içerik zorunlu"); return; }
    setSending(true);
    try {
      const r = await api.post("/announcements", { title, body, broadcast });
      toast.success("Duyuru gönderildi");
      setLastResult(r.data.fanout || null);
      setTitle(""); setBody("");
      mutate();
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Duyuruyu arşivle?")) return;
    try {
      await api.delete(`/announcements/${id}`);
      mutate();
      toast.success("Arşivlendi");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const items = data?.items || [];

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6" data-testid="announcements-page">
      <div className="flex items-center gap-2">
        <Megaphone className="w-6 h-6 gold-text" />
        <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">Duyurular</h1>
      </div>

      {isAdmin && (
        <form onSubmit={submit} className="card-red-gold p-4 space-y-3" data-testid="announcement-form">
          <div className="flex items-center gap-2 text-xs uppercase font-bold gold-text">
            <Radio className="w-3.5 h-3.5" /> Yeni Duyuru
          </div>
          <input
            data-testid="announcement-title"
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Duyuru başlığı"
            className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-sm"
          />
          <textarea
            data-testid="announcement-body"
            value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Duyuru içeriği (Telegram + Web Push + In-App bell'e gider)"
            rows={4}
            className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-sm resize-y"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)}
                   data-testid="announcement-broadcast" />
            <span>Tüm kanallara dağıt (Telegram Kanal + DM + Web Push + Uygulama)</span>
          </label>
          <button type="submit" disabled={sending}
                  className="btn-gold px-4 py-2 flex items-center gap-2 text-sm justify-center"
                  data-testid="announcement-submit">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Gönderiliyor…" : "Duyur ve Kaydet"}
          </button>

          {lastResult && (
            <div className="text-[11px] p-2 rounded flex flex-wrap gap-2"
                 style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)", color: "#6EE7B7" }}
                 data-testid="announcement-fanout-summary">
              <span className="flex items-center gap-1"><Radio className="w-3 h-3" /> Kanal: {lastResult.telegram_channel_sent ? "✓" : "✗"}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> DM: {lastResult.telegram_dm_sent} ({lastResult.telegram_dm_translated} çevrildi)</span>
              <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> Push: {lastResult.push_sent}</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> App: {lastResult.app_notif_sent}</span>
              {Object.entries(lastResult.telegram_dm_langs || {}).map(([code, n]) => (
                <span key={code} className="px-1 rounded"
                      style={{ background: "rgba(59,130,246,0.20)", color: "#93C5FD" }}>{code}:{n}</span>
              ))}
            </div>
          )}
        </form>
      )}

      <div className="space-y-2" data-testid="announcements-list">
        {isLoading && <div className="text-center text-xs text-muted-foreground py-6">Yükleniyor…</div>}
        {!isLoading && items.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8" data-testid="announcements-empty">
            Henüz duyuru yok.
          </div>
        )}
        {items.map((a) => (
          <div key={a.id}
               className="card-red-gold p-3"
               style={{ opacity: a.active ? 1 : 0.5 }}
               data-testid={`announcement-item-${a.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-3.5 h-3.5 gold-text flex-shrink-0" />
                  <h3 className={`text-sm font-bold ${a.active ? "text-white" : "text-muted-foreground line-through"}`}>{a.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
                <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-2">
                  <span>{a.created_by_username || "sistem"}</span>
                  <span>·</span>
                  <span>{new Date(a.created_at).toLocaleString("tr-TR")}</span>
                  {!a.active && <span className="px-1 rounded bg-red-500/20 text-red-300">arşiv</span>}
                </div>
              </div>
              {isAdmin && a.active && (
                <button onClick={() => remove(a.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                        data-testid={`announcement-delete-${a.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
