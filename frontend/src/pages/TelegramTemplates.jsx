import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import {
  Send, Plus, X, Loader2, Pencil, Trash2, MessageSquareText, Copy,
} from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Telegram Grup Mesaj Şablonları — /admin/telegram-sablonlar
 * v135.27 admin-only page. All static labels are routed through i18n
 * `useTranslation` with a Turkish fallback as the second arg so newly added
 * keys work today across all 29 languages while translation batches
 * populate them.
 */
export default function TelegramTemplates() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null); // template being edited (or null)
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sendingId, setSendingId] = useState(null);
  const swrKey = categoryFilter === "all"
    ? "/telegram-templates"
    : `/telegram-templates?category=${encodeURIComponent(categoryFilter)}`;
  const { data, mutate, isLoading } = useSWR(swrKey, fetcher, {
    refreshInterval: 60000,
  });
  const items = data?.items || [];

  // Category chip metadata — a single source of truth reused by the filter
  // bar, compose form, and each row's badge.
  const CATS = useMemo(() => ([
    { key: "savas_cagrisi",        label: t("tg_tpl_cat_war_call",      "Savaş Çağrısı"),      emoji: "⚔️", color: "#E74C1A" },
    { key: "etkinlik_hatirlatma",  label: t("tg_tpl_cat_event_reminder","Etkinlik Hatırlatma"), emoji: "⏰", color: "#F5A623" },
    { key: "duyuru",               label: t("tg_tpl_cat_announcement",  "Duyuru"),              emoji: "📢", color: "#A855F7" },
    { key: "diger",                label: t("tg_tpl_cat_other",         "Diğer"),               emoji: "💬", color: "#94A3B8" },
  ]), [t]);
  const catMeta = (k) => CATS.find((c) => c.key === k) || CATS[3];

  const sendTemplate = async (tpl) => {
    if (!window.confirm(t("tg_tpl_confirm_send",
      "Bu şablonu Telegram grubuna göndermek istiyor musun?"))) return;
    setSendingId(tpl.id);
    try {
      await api.post(`/telegram-templates/${tpl.id}/send`);
      toast.success(t("tg_tpl_sent_toast", "Şablon Telegram grubuna gönderildi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSendingId(null); }
  };

  const deleteTemplate = async (tpl) => {
    if (!window.confirm(t("tg_tpl_confirm_delete",
      "Bu şablonu silmek istiyor musun?"))) return;
    try {
      await api.delete(`/telegram-templates/${tpl.id}`);
      toast.success(t("tg_tpl_deleted_toast", "Şablon silindi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">
          {t("tg_tpl_access_denied",
            "Bu sayfa yalnızca yöneticilere açıktır.")}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="telegram-templates-page">
      <Header title={t("tg_tpl_page_title", "Telegram Şablonları")} />
      <div className="max-w-4xl mx-auto py-4 px-4 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <MessageSquareText className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">
            {t("tg_tpl_page_title", "Telegram Şablonları")}
          </h1>
          <button
            data-testid="tg-tpl-new-btn"
            onClick={() => { setEditing(null); setShowCompose(true); }}
            className="ml-auto btn-gold text-xs flex items-center gap-1.5 px-3 py-2"
          >
            <Plus className="w-3.5 h-3.5" /> {t("tg_tpl_new_btn", "Yeni Şablon")}
          </button>
        </div>

        {/* Category filter chips */}
        <div className="flex items-center gap-2 flex-wrap" data-testid="tg-tpl-filter-bar">
          <button
            type="button"
            data-testid="tg-tpl-filter-all"
            onClick={() => setCategoryFilter("all")}
            className="chip text-[11px]"
            style={categoryFilter === "all"
              ? { background: "rgba(245,166,35,0.20)", borderColor: "#F5A623", color: "#F5A623" }
              : undefined}
          >
            {t("tg_tpl_filter_all", "Tümü")} · {items.length}
          </button>
          {CATS.map((c) => (
            <button
              key={c.key}
              type="button"
              data-testid={`tg-tpl-filter-${c.key}`}
              onClick={() => setCategoryFilter(c.key)}
              className="chip text-[11px]"
              style={categoryFilter === c.key
                ? { background: `${c.color}22`, borderColor: c.color, color: c.color }
                : undefined}
            >
              <span aria-hidden>{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"
               data-testid="tg-tpl-loading">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("tg_tpl_loading", "Yükleniyor…")}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
               data-testid="tg-tpl-empty">
            {t("tg_tpl_empty",
              "Henüz şablon yok. Sık kullandığın Telegram mesajlarını buraya kaydet.")}
          </div>
        )}

        <div className="space-y-2">
          {items.map((tpl) => {
            const meta = catMeta(tpl.category);
            const busy = sendingId === tpl.id;
            return (
              <div
                key={tpl.id}
                className="card-red-gold p-3 space-y-2"
                data-testid={`tg-tpl-row-${tpl.id}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                    style={{ background: `${meta.color}22`, color: meta.color }}
                    data-testid={`tg-tpl-cat-${tpl.id}`}
                  >
                    <span aria-hidden>{meta.emoji}</span> {meta.label}
                  </span>
                  <div className="text-sm font-bold text-white truncate" title={tpl.name}>
                    {tpl.name}
                  </div>
                  <div className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {tpl.send_count
                      ? t("tg_tpl_sent_stat",
                          "{{count}} gönderim", { count: tpl.send_count })
                      : t("tg_tpl_never_sent", "Henüz gönderilmedi")}
                  </div>
                </div>
                <div
                  className="text-xs text-white whitespace-pre-wrap font-mono rounded p-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,166,35,0.14)" }}
                  data-testid={`tg-tpl-body-${tpl.id}`}
                >
                  {tpl.body}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => sendTemplate(tpl)}
                    disabled={busy}
                    className="btn-gold text-xs flex items-center gap-1.5 px-3 py-1.5"
                    data-testid={`tg-tpl-send-${tpl.id}`}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {busy ? t("tg_tpl_sending", "Gönderiliyor…") : t("tg_tpl_send_btn", "Telegram'a Gönder")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(tpl); setShowCompose(true); }}
                    className="chip text-[11px]"
                    data-testid={`tg-tpl-edit-${tpl.id}`}
                  >
                    <Pencil className="w-3 h-3" /> {t("tg_tpl_edit_btn", "Düzenle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(tpl.body || "").then(
                        () => toast.success(t("tg_tpl_copied_toast", "Kopyalandı")),
                        () => toast.error(t("tg_tpl_copy_failed", "Kopyalanamadı")),
                      );
                    }}
                    className="chip text-[11px]"
                    data-testid={`tg-tpl-copy-${tpl.id}`}
                  >
                    <Copy className="w-3 h-3" /> {t("tg_tpl_copy_btn", "Kopyala")}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(tpl)}
                    className="chip text-[11px] ml-auto"
                    style={{ borderColor: "#ef4444", color: "#FCA5A5" }}
                    data-testid={`tg-tpl-delete-${tpl.id}`}
                  >
                    <Trash2 className="w-3 h-3" /> {t("tg_tpl_delete_btn", "Sil")}
                  </button>
                </div>
                {tpl.last_sent_at && (
                  <div className="text-[10px] text-muted-foreground">
                    {t("tg_tpl_last_sent",
                      "Son gönderim: {{when}}",
                      { when: new Date(tpl.last_sent_at).toLocaleString("tr-TR") })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showCompose && (
        <TemplateComposer
          initial={editing}
          categories={CATS}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSaved={() => { mutate(); setShowCompose(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TemplateComposer({ initial, categories, onClose, onSaved }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [body, setBody] = useState(initial?.body || "");
  const [category, setCategory] = useState(initial?.category || "diger");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("tg_tpl_name_required", "Şablon adı zorunlu")); return;
    }
    if (!body.trim()) {
      toast.error(t("tg_tpl_body_required", "Mesaj içeriği zorunlu")); return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), body: body.trim(), category };
      if (initial) {
        await api.patch(`/telegram-templates/${initial.id}`, payload);
        toast.success(t("tg_tpl_updated_toast", "Şablon güncellendi"));
      } else {
        await api.post(`/telegram-templates`, payload);
        toast.success(t("tg_tpl_created_toast", "Şablon oluşturuldu"));
      }
      onSaved();
    } catch (e2) { toast.error(apiErr(e2)); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
      data-testid="tg-tpl-composer-modal"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-red-gold p-4 max-w-lg w-full space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
            {initial
              ? t("tg_tpl_composer_edit_title", "Şablonu Düzenle")
              : t("tg_tpl_composer_new_title", "Yeni Şablon")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-white"
            data-testid="tg-tpl-composer-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
            {t("tg_tpl_field_name", "Şablon Adı")}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("tg_tpl_field_name_ph", "Örn: Cumartesi Kale Savaşı")}
            data-testid="tg-tpl-composer-name"
            maxLength={120}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
            {t("tg_tpl_field_category", "Kategori")}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="tg-tpl-composer-category"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
            {t("tg_tpl_field_body", "Mesaj İçeriği (Markdown destekli)")}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("tg_tpl_field_body_ph",
              "⚔️ Kale Savaşı için toplanma vakti!\n\nSaat 21:00'da GOW ittifakında hazır ol Komutan.")}
            data-testid="tg-tpl-composer-body"
            rows={8}
            maxLength={4000}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white font-mono"
          />
          <div className="text-[10px] text-muted-foreground mt-1">
            {t("tg_tpl_field_body_count",
              "{{count}} / 4000 karakter",
              { count: body.length })}
          </div>
        </label>

        <button
          type="submit"
          disabled={saving}
          className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
          data-testid="tg-tpl-composer-submit"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />}
          {saving
            ? t("tg_tpl_saving", "Kaydediliyor…")
            : (initial
                ? t("tg_tpl_save_edit_btn", "Değişiklikleri Kaydet")
                : t("tg_tpl_save_new_btn", "Şablonu Oluştur"))}
        </button>
      </form>
    </div>
  );
}
