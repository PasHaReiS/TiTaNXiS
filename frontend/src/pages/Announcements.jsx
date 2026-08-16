import React, { useState } from "react";
import useSWR from "swr";
import { Megaphone, Send, Trash2, Loader2, Radio, Users, MessageCircle, Bell, History, ChevronDown } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import ImageDropzone from "@/components/ImageDropzone";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Announcements page — admin creates a broadcast that fans out across
 * Web Push + Telegram Group + Telegram DMs (country-translated) + in-app
 * bell in a single action. Non-admin visitors just see the list of active
 * announcements below the create form (which is hidden for them).
 *
 * When `embedded` is true (rendered inside the /etkinlik-bildirimleri hub)
 * we skip the page-level max-width wrapper and title so the parent tab
 * layout owns the vertical rhythm.
 */
export default function Announcements({ embedded = false }) {
  const { isAdmin } = useAuth();
  // History drawer is collapsed by default so the admin sees the compose
  // form first; toggling reveals the list which is now more compact.
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data, mutate, isLoading } = useSWR("/announcements?limit=50", fetcher, { refreshInterval: 60000 });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  // Local file(s) uploaded via ImageDropzone. When set, its .url wins over
  // the manual URL field below so admins can either paste a link or pick
  // a file from their device — whichever is faster in the moment.
  const [imageFiles, setImageFiles] = useState([]);
  const [broadcast, setBroadcast] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const finalImageUrl = imageFiles[0]?.url || imageUrl.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { toast.error("Başlık ve içerik zorunlu"); return; }
    setSending(true);
    try {
      const r = await api.post("/announcements", { title, body, image_url: finalImageUrl || undefined, broadcast, urgent });
      toast.success(urgent ? "🚨 Acil duyuru dağıtıldı" : "Duyuru gönderildi");
      setLastResult(r.data.fanout || null);
      setTitle(""); setBody(""); setImageUrl(""); setImageFiles([]); setUrgent(false);
      mutate();
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Duyuruyu tamamen silmek istiyor musun? Geri alınamaz.")) return;
    try {
      await api.delete(`/announcements/${id}`);
      mutate();
      toast.success("Duyuru silindi");
    } catch (e) { toast.error(apiErr(e)); }
  };

  // Load an existing announcement back into the compose form so the admin
  // can tweak it and re-send. We do NOT auto-delete the source — the admin
  // can hit the 🗑️ button on the original row afterwards if they want.
  const copyToForm = (a) => {
    setTitle(a.title || "");
    setBody(a.body || "");
    setImageUrl(a.image_url || "");
    setImageFiles([]);
    setUrgent(!!a.urgent);
    setBroadcast(true);
    setHistoryOpen(false);
    toast.info("Forma yüklendi — düzenleyip yeni duyuru olarak gönder");
    // scroll form into view
    try {
      document.querySelector('[data-testid="announcement-form"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch { /* noop */ }
  };

  const items = data?.items || [];

  const Wrapper = ({ children }) =>
    embedded ? (
      <div className="space-y-4" data-testid="announcements-page">{children}</div>
    ) : (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6" data-testid="announcements-page">
        {children}
      </div>
    );

  return (
    <Wrapper>
      {!embedded && (
        <div className="flex items-center gap-2">
          <Megaphone className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">Duyurular</h1>
        </div>
      )}

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
          <div className="space-y-2">
            <div className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
              Görsel (opsiyonel)
            </div>
            <ImageDropzone
              purpose="misc"
              value={imageFiles}
              onChange={setImageFiles}
              max={1}
              compact
            />
            <div className="text-[10px] text-muted-foreground text-center">— veya —</div>
            <input
              data-testid="announcement-image-url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Resim URL'i (https://... .jpg / .png)"
              disabled={imageFiles.length > 0}
              className="w-full px-3 py-2 rounded bg-black/40 border border-border text-white text-xs disabled:opacity-40"
            />
            {finalImageUrl && imageFiles.length === 0 && (
              <img src={finalImageUrl} alt="preview"
                   data-testid="announcement-image-preview"
                   className="max-h-40 rounded border border-border object-contain mx-auto"
                   onError={(e) => { e.target.style.display = "none"; }} />
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)}
                   data-testid="announcement-broadcast" />
            <span>Tüm kanallara dağıt (Telegram Kanal + DM + Web Push + Uygulama)</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold" style={{ color: urgent ? "#F87171" : "#94A3B8" }}>
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)}
                   data-testid="announcement-urgent" />
            <span>🚨 ACİL — başlığa alarm ikonu ekle, kırmızı rozetle işaretle</span>
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

      {/* Gönderim geçmişi — default kapalı, tıklanarak açılan drawer.
          Uzun listeler compose formunun altında yer kaplamasın diye böyle
          tasarlandı. Her satırın Trash butonu her admin için görünür. */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(245,166,35,0.25)" }}>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase font-bold gold-text tracking-widest hover:bg-amber-500/5 transition-colors"
          style={{ background: "rgba(15,8,20,0.55)" }}
          data-testid="announcements-history-toggle"
          aria-expanded={historyOpen}
        >
          <span className="flex items-center gap-2">
            <History className="w-3.5 h-3.5" />
            <span>Gönderim Geçmişi</span>
            <span className="text-[10px] mono opacity-70">({items.length})</span>
          </span>
          <ChevronDown
            className="w-3.5 h-3.5 transition-transform"
            style={{ transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
        {historyOpen && (
      <div className="space-y-1.5 p-2" data-testid="announcements-list">
        {isLoading && <div className="text-center text-xs text-muted-foreground py-6">Yükleniyor…</div>}
        {!isLoading && items.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8" data-testid="announcements-empty">
            Henüz duyuru yok.
          </div>
        )}
        {items.map((a) => (
          <div key={a.id}
               className="card-red-gold p-2"
               style={{ opacity: a.active ? 1 : 0.5, borderColor: a.urgent ? "#EF4444" : undefined }}
               data-testid={`announcement-item-${a.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {a.urgent
                    ? <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: "#EF4444", color: "white" }} data-testid={`announcement-urgent-${a.id}`}>ACİL</span>
                    : <Megaphone className="w-3 h-3 gold-text flex-shrink-0" />}
                  <h3 className={`text-xs font-bold ${a.active ? (a.urgent ? "text-red-300" : "text-white") : "text-muted-foreground line-through"}`}>{a.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-2">{a.body}</p>
                {a.image_url && (
                  <img src={a.image_url} alt={a.title}
                       data-testid={`announcement-image-${a.id}`}
                       className="mt-1.5 max-h-32 rounded border border-border object-contain"
                       onError={(e) => { e.target.style.display = "none"; }} />
                )}
                <div className="text-[9px] text-muted-foreground mt-1 flex items-center gap-1.5">
                  <span>{a.created_by_username || "sistem"}</span>
                  <span>·</span>
                  <span>{new Date(a.created_at).toLocaleString("tr-TR")}</span>
                  {!a.active && <span className="px-1 rounded bg-red-500/20 text-red-300">arşiv</span>}
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => copyToForm(a)}
                          className="p-1 rounded hover:bg-blue-500/20 text-blue-400"
                          title="Bu duyuruyu forma yükle"
                          data-testid={`announcement-copy-${a.id}`}>
                    <span aria-hidden style={{ fontSize: 12 }}>✏️</span>
                  </button>
                  <button onClick={() => remove(a.id)}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400"
                          title="Duyuruyu tamamen sil"
                          data-testid={`announcement-delete-${a.id}`}>
                    <span aria-hidden style={{ fontSize: 12 }}>🗑️</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
        )}
      </div>
    </Wrapper>
  );
}
