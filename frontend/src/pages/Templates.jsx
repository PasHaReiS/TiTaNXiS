import React, { useMemo, useState, useEffect, useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import {
  Send, Plus, X, Loader2, Pencil, Trash2, MessageSquareText, Copy,
  CalendarDays, BellRing, Archive, ArchiveRestore, LayoutTemplate,
  Search as SearchIcon, Clock, FlaskConical,
} from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * useSlashFocus — global `/` klavye kısayolu bir input'a focus yapar.
 * Aktif alan bir input/textarea ise şortkat devre dışıdır.
 */
function useSlashFocus(ref) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/") return;
      const t = e.target;
      const tag = (t?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      const el = ref?.current;
      if (!el) return;
      e.preventDefault();
      el.focus();
      try { el.select(); } catch { /* noop */ }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/** useCtrlEnterSubmit — modal içindeyken Ctrl/Cmd+Enter ile form gönderir. */
function useCtrlEnterSubmit(formRef, active) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const f = formRef?.current;
        if (!f) return;
        e.preventDefault();
        if (typeof f.requestSubmit === "function") f.requestSubmit();
        else f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formRef, active]);
}

/**
 * Şablonlar hub — /sablonlar (v135.38).
 * Üç alt sekme (Telegram / Etkinlik / RSVP Hatırlatma) + her sekmede Aktif/Arşiv
 * toggle. Yeni şablon türleri eklenirken sadece TAB_DEFS'e satır eklenir.
 */
export default function Templates() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("telegram");

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">
          {t("tpl_access_denied", "Bu sayfa yalnızca yöneticilere açıktır.")}
        </p>
      </div>
    );
  }

  const TABS = [
    { key: "telegram", label: t("tpl_tab_telegram", "Telegram"), icon: MessageSquareText },
    { key: "event",    label: t("tpl_tab_event", "Etkinlik"),     icon: CalendarDays },
    { key: "rsvp",     label: t("tpl_tab_rsvp", "RSVP Hatırlatma"), icon: BellRing },
  ];

  return (
    <div data-testid="templates-page">
      <Header title={t("tpl_page_title", "Şablonlar")} />
      <div className="max-w-4xl mx-auto py-4 px-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <LayoutTemplate className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">
            {t("tpl_page_title", "Şablonlar")}
          </h1>
        </div>

        {/* Sekme çubuğu — yeni tür eklendiğinde otomatik çoğalır. */}
        <div className="flex items-center gap-1 flex-wrap" data-testid="tpl-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const on = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                data-testid={`tpl-tab-${tab.key}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all"
                style={{
                  background: on ? "linear-gradient(135deg, rgba(245,166,35,0.24), rgba(180,83,9,0.35))" : "rgba(30,20,15,0.55)",
                  color: on ? "#FFF7ED" : "#94A3B8",
                  border: `1px solid ${on ? "#F5A623" : "rgba(120,53,15,0.35)"}`,
                  boxShadow: on ? "0 0 12px rgba(245,166,35,0.35)" : "none",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "telegram" && <TelegramTemplatesSection />}
        {activeTab === "event"    && <EventTemplatesSection />}
        {activeTab === "rsvp"     && <RsvpTemplatesSection />}
      </div>
    </div>
  );
}

/* --------------------------- Telegram Section --------------------------- */
function TelegramTemplatesSection() {
  const { t } = useTranslation();
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showArchive, setShowArchive] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  useSlashFocus(searchRef);

  const CATS = useMemo(() => ([
    { key: "savas_cagrisi",        label: t("tg_tpl_cat_war_call", "Savaş Çağrısı"),       emoji: "⚔️", color: "#E74C1A" },
    { key: "etkinlik_hatirlatma",  label: t("tg_tpl_cat_event_reminder", "Etkinlik Hatırlatma"), emoji: "⏰", color: "#F5A623" },
    { key: "duyuru",               label: t("tg_tpl_cat_announcement", "Duyuru"),          emoji: "📢", color: "#A855F7" },
    { key: "diger",                label: t("tg_tpl_cat_other", "Diğer"),                  emoji: "💬", color: "#94A3B8" },
  ]), [t]);
  const catMeta = (k) => CATS.find((c) => c.key === k) || CATS[3];

  const params = new URLSearchParams();
  if (showArchive) params.set("archived", "true");
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  const swrKey = `/telegram-templates${params.toString() ? "?" + params.toString() : ""}`;
  const { data, mutate, isLoading } = useSWR(swrKey, fetcher, { refreshInterval: 60000 });
  const rawItems = data?.items || [];
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawItems;
    return rawItems.filter((i) =>
      (i.name || "").toLowerCase().includes(q) || (i.body || "").toLowerCase().includes(q));
  }, [rawItems, search]);

  const sendTemplate = async (tpl) => {
    if (!window.confirm(t("tg_tpl_confirm_send", "Bu şablonu Telegram grubuna göndermek istiyor musun?"))) return;
    setSendingId(tpl.id);
    try {
      await api.post(`/telegram-templates/${tpl.id}/send`);
      toast.success(t("tg_tpl_sent_toast", "Şablon Telegram grubuna gönderildi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); } finally { setSendingId(null); }
  };
  const archive = async (tpl, on) => {
    try {
      await api.patch(`/telegram-templates/${tpl.id}`, { archived: on });
      toast.success(on ? t("tpl_archived_toast", "Arşive taşındı") : t("tpl_restored_toast", "Geri getirildi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async (tpl) => {
    if (!window.confirm(t("tpl_confirm_delete", "Bu şablonu kalıcı olarak silmek istiyor musun?"))) return;
    try {
      await api.delete(`/telegram-templates/${tpl.id}`);
      toast.success(t("tpl_deleted_toast", "Şablon silindi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="space-y-4" data-testid="tpl-section-telegram">
      <div className="flex items-center gap-2 flex-wrap">
        <ArchiveToggle showArchive={showArchive} setShowArchive={setShowArchive} />
        <TemplateSearchInput inputRef={searchRef} value={search} onChange={setSearch}
                             testid="tg-tpl-search"
                             placeholder={t("tpl_search_ph", "Şablonda ara… ( / kısayolu )")} />
        <button
          type="button"
          data-testid="tg-tpl-new-btn"
          onClick={() => { setEditing(null); setShowCompose(true); }}
          className="ml-auto btn-gold text-xs flex items-center gap-1.5 px-3 py-2"
        >
          <Plus className="w-3.5 h-3.5" /> {t("tpl_new_btn", "Yeni Şablon")}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="tg-tpl-filter-bar">
        <button type="button" onClick={() => setCategoryFilter("all")} className="chip text-[11px]"
                data-testid="tg-tpl-filter-all"
                style={categoryFilter === "all" ? { background: "rgba(245,166,35,0.20)", borderColor: "#F5A623", color: "#F5A623" } : undefined}>
          {t("tpl_filter_all", "Tümü")} · {items.length}
        </button>
        {CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => setCategoryFilter(c.key)}
                  data-testid={`tg-tpl-filter-${c.key}`}
                  className="chip text-[11px]"
                  style={categoryFilter === c.key ? { background: `${c.color}22`, borderColor: c.color, color: c.color } : undefined}>
            <span aria-hidden>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>

      <SectionList
        isLoading={isLoading}
        items={items}
        emptyKey="tg_tpl_empty"
        emptyFallback="Henüz şablon yok."
        rowKey="tg"
        renderRow={(tpl) => {
          const meta = catMeta(tpl.category);
          const busy = sendingId === tpl.id;
          return (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${meta.color}22`, color: meta.color }}>
                  <span aria-hidden>{meta.emoji}</span> {meta.label}
                </span>
                <div className="text-sm font-bold text-white truncate" title={tpl.name}>{tpl.name}</div>
                <div className="ml-auto text-[10px] text-muted-foreground font-mono">
                  {tpl.send_count ? t("tg_tpl_sent_stat", "{{count}} gönderim", { count: tpl.send_count }) : t("tg_tpl_never_sent", "Henüz gönderilmedi")}
                </div>
              </div>
              <div className="text-xs text-white whitespace-pre-wrap font-mono rounded p-2"
                   style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,166,35,0.14)" }}>
                {tpl.body}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!showArchive && (
                  <button type="button" onClick={() => sendTemplate(tpl)} disabled={busy}
                          className="btn-gold text-xs flex items-center gap-1.5 px-3 py-1.5"
                          data-testid={`tg-tpl-send-${tpl.id}`}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {busy ? t("tpl_sending", "Gönderiliyor…") : t("tg_tpl_send_btn", "Telegram'a Gönder")}
                  </button>
                )}
                <button type="button" onClick={() => { setEditing(tpl); setShowCompose(true); }}
                        className="chip text-[11px]" data-testid={`tg-tpl-edit-${tpl.id}`}>
                  <Pencil className="w-3 h-3" /> {t("tpl_edit_btn", "Düzenle")}
                </button>
                <button type="button"
                        onClick={() => { navigator.clipboard.writeText(tpl.body || ""); toast.success(t("tg_tpl_copied_toast", "Kopyalandı")); }}
                        className="chip text-[11px]" data-testid={`tg-tpl-copy-${tpl.id}`}>
                  <Copy className="w-3 h-3" /> {t("tpl_copy_btn", "Kopyala")}
                </button>
                {showArchive ? (
                  <button type="button" onClick={() => archive(tpl, false)}
                          className="chip text-[11px]" style={{ borderColor: "#22C55E", color: "#86EFAC" }}
                          data-testid={`tg-tpl-restore-${tpl.id}`}>
                    <ArchiveRestore className="w-3 h-3" /> {t("tpl_restore_btn", "Geri Getir")}
                  </button>
                ) : (
                  <button type="button" onClick={() => archive(tpl, true)}
                          className="chip text-[11px]" data-testid={`tg-tpl-archive-${tpl.id}`}>
                    <Archive className="w-3 h-3" /> {t("tpl_archive_btn", "Arşivle")}
                  </button>
                )}
                <button type="button" onClick={() => remove(tpl)}
                        className="chip text-[11px] ml-auto"
                        style={{ borderColor: "#ef4444", color: "#FCA5A5" }}
                        data-testid={`tg-tpl-delete-${tpl.id}`}>
                  <Trash2 className="w-3 h-3" /> {t("tpl_delete_btn", "Sil")}
                </button>
              </div>
            </>
          );
        }}
      />

      {showCompose && (
        <TelegramComposer
          initial={editing}
          categories={CATS}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSaved={() => { mutate(); setShowCompose(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ---------------------------- Event Section ---------------------------- */
function EventTemplatesSection() {
  const { t } = useTranslation();
  const [showArchive, setShowArchive] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  useSlashFocus(searchRef);
  const swrKey = `/event-templates${showArchive ? "?archived=true" : ""}`;
  const { data, mutate, isLoading } = useSWR(swrKey, fetcher, { refreshInterval: 60000 });
  const rawItems = data?.items || [];
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawItems;
    return rawItems.filter((i) =>
      (i.template_name || "").toLowerCase().includes(q) ||
      (i.name || "").toLowerCase().includes(q));
  }, [rawItems, search]);

  const archive = async (tpl, on) => {
    try {
      await api.patch(`/event-templates/${tpl.id}`, { archived: on });
      toast.success(on ? t("tpl_archived_toast", "Arşive taşındı") : t("tpl_restored_toast", "Geri getirildi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async (tpl) => {
    if (!window.confirm(t("tpl_confirm_delete", "Bu şablonu kalıcı olarak silmek istiyor musun?"))) return;
    try {
      await api.delete(`/event-templates/${tpl.id}`);
      toast.success(t("tpl_deleted_toast", "Şablon silindi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="space-y-4" data-testid="tpl-section-event">
      <div className="flex items-center gap-2 flex-wrap">
        <ArchiveToggle showArchive={showArchive} setShowArchive={setShowArchive} />
        <TemplateSearchInput inputRef={searchRef} value={search} onChange={setSearch}
                             testid="ev-tpl-search"
                             placeholder={t("tpl_search_ph", "Şablonda ara… ( / kısayolu )")} />
        <button type="button"
                data-testid="ev-tpl-new-btn"
                onClick={() => { setEditing(null); setShowCompose(true); }}
                className="ml-auto btn-gold text-xs flex items-center gap-1.5 px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> {t("tpl_new_btn", "Yeni Şablon")}
        </button>
      </div>

      <SectionList
        isLoading={isLoading}
        items={items}
        emptyKey="ev_tpl_empty"
        emptyFallback="Etkinlik şablonu yok. /etkinlikler > Yeni Etkinlik formunda 'Şablon Olarak Kaydet' ile de oluşturabilirsin."
        rowKey="ev"
        renderRow={(tpl) => (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-bold text-white truncate" title={tpl.template_name}>
                📋 {tpl.template_name}
              </div>
              <span className="chip text-[10px]">×{tpl.multiplier || 1}</span>
              {tpl.group_name && <span className="chip text-[10px]" style={{ borderColor: "rgba(245,166,35,0.55)", color: "#F5A623" }}>{tpl.group_name}</span>}
            </div>
            <div className="text-[11px] text-muted-foreground grid grid-cols-2 gap-1">
              <div>{t("ev_tpl_event_name", "Etkinlik adı")}: <span className="text-white">{tpl.name}</span></div>
              {tpl.subtitle && <div className="col-span-2">{t("ev_tpl_subtitle", "Alt başlık")}: <span className="text-white">{tpl.subtitle}</span></div>}
              <div>⏰ {tpl.reminder_enabled ? t("ev_tpl_reminder_on", "Hatırlatma açık") : t("ev_tpl_reminder_off", "Hatırlatma kapalı")}</div>
              <div>👥 {tpl.attendance_enabled ? t("ev_tpl_attendance_on", "Katılım açık") : t("ev_tpl_attendance_off", "Katılım kapalı")}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => { setEditing(tpl); setShowCompose(true); }}
                      className="chip text-[11px]" data-testid={`ev-tpl-edit-${tpl.id}`}>
                <Pencil className="w-3 h-3" /> {t("tpl_edit_btn", "Düzenle")}
              </button>
              {showArchive ? (
                <button type="button" onClick={() => archive(tpl, false)}
                        className="chip text-[11px]" style={{ borderColor: "#22C55E", color: "#86EFAC" }}
                        data-testid={`ev-tpl-restore-${tpl.id}`}>
                  <ArchiveRestore className="w-3 h-3" /> {t("tpl_restore_btn", "Geri Getir")}
                </button>
              ) : (
                <button type="button" onClick={() => archive(tpl, true)}
                        className="chip text-[11px]" data-testid={`ev-tpl-archive-${tpl.id}`}>
                  <Archive className="w-3 h-3" /> {t("tpl_archive_btn", "Arşivle")}
                </button>
              )}
              <button type="button" onClick={() => remove(tpl)}
                      className="chip text-[11px] ml-auto"
                      style={{ borderColor: "#ef4444", color: "#FCA5A5" }}
                      data-testid={`ev-tpl-delete-${tpl.id}`}>
                <Trash2 className="w-3 h-3" /> {t("tpl_delete_btn", "Sil")}
              </button>
            </div>
          </>
        )}
      />

      {showCompose && (
        <EventComposer
          initial={editing}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSaved={() => { mutate(); setShowCompose(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ----------------------------- RSVP Section ----------------------------- */
function RsvpTemplatesSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [showArchive, setShowArchive] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sendTpl, setSendTpl] = useState(null);
  const [scheduleTpl, setScheduleTpl] = useState(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  useSlashFocus(searchRef);
  const swrKey = `/rsvp-templates${showArchive ? "?archived=true" : ""}`;
  const { data, mutate, isLoading } = useSWR(swrKey, fetcher, { refreshInterval: 60000 });
  const rawItems = data?.items || [];
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawItems;
    return rawItems.filter((i) =>
      (i.name || "").toLowerCase().includes(q) || (i.body || "").toLowerCase().includes(q));
  }, [rawItems, search]);

  const archive = async (tpl, on) => {
    try {
      await api.patch(`/rsvp-templates/${tpl.id}`, { archived: on });
      toast.success(on ? t("tpl_archived_toast", "Arşive taşındı") : t("tpl_restored_toast", "Geri getirildi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async (tpl) => {
    if (!window.confirm(t("tpl_confirm_delete", "Bu şablonu kalıcı olarak silmek istiyor musun?"))) return;
    try {
      await api.delete(`/rsvp-templates/${tpl.id}`);
      toast.success(t("tpl_deleted_toast", "Şablon silindi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const testSend = async (tpl) => {
    try {
      const r = await api.post(`/rsvp-templates/${tpl.id}/test-send`, {});
      const d = r.data || {};
      const hint = d.has_push_subscription || d.has_telegram_chat
        ? t("rsvp_tpl_test_ok", "Test gönderildi ({{recipient}}): push {{p}} / telegram {{g}}",
            { recipient: d.recipient, p: d.push_sent, g: d.telegram_sent })
        : t("rsvp_tpl_test_no_channels", "Kullanıcının push aboneliği veya Telegram bağlantısı yok — bildirim ulaşmayacak.");
      if (d.has_push_subscription || d.has_telegram_chat) toast.success(hint);
      else toast.warning(hint);
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="space-y-4" data-testid="tpl-section-rsvp">
      <div className="flex items-center gap-2 flex-wrap">
        <ArchiveToggle showArchive={showArchive} setShowArchive={setShowArchive} />
        <TemplateSearchInput inputRef={searchRef} value={search} onChange={setSearch}
                             testid="rsvp-tpl-search"
                             placeholder={t("tpl_search_ph", "Şablonda ara… ( / kısayolu )")} />
        <button type="button"
                data-testid="rsvp-tpl-new-btn"
                onClick={() => { setEditing(null); setShowCompose(true); }}
                className="ml-auto btn-gold text-xs flex items-center gap-1.5 px-3 py-2">
          <Plus className="w-3.5 h-3.5" /> {t("tpl_new_btn", "Yeni Şablon")}
        </button>
      </div>

      <div className="text-xs rounded p-3" data-testid="rsvp-tpl-hint"
           style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.45)", color: "#BAE6FD" }}>
        {t("rsvp_tpl_hint",
          "RSVP vermemiş üyelere gönderilir. Kanallar: Web Push + Telegram DM. Etkinlik seçince tam olarak katılım onayı vermeyen üyelere ulaşırsın.")}
      </div>

      <SectionList
        isLoading={isLoading}
        items={items}
        emptyKey="rsvp_tpl_empty"
        emptyFallback="Henüz RSVP hatırlatma şablonu yok."
        rowKey="rsvp"
        renderRow={(tpl) => (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <BellRing className="w-3.5 h-3.5" style={{ color: "#38BDF8" }} />
              <div className="text-sm font-bold text-white truncate" title={tpl.name}>{tpl.name}</div>
              <div className="ml-auto text-[10px] text-muted-foreground font-mono">
                {tpl.send_count ? t("tpl_send_count", "{{count}} gönderim", { count: tpl.send_count }) : t("tpl_never_sent", "Henüz gönderilmedi")}
              </div>
            </div>
            <div className="text-xs text-white whitespace-pre-wrap font-mono rounded p-2"
                 style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(56,189,248,0.20)" }}>
              {tpl.body}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              {(tpl.channels || []).map((c) => (
                <span key={c} className="chip text-[10px]" style={{ padding: "1px 6px" }}>
                  {c === "push" ? "🔔 Push" : "✈️ Telegram"}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!showArchive && (
                <>
                  <button type="button" onClick={() => setSendTpl(tpl)}
                          className="btn-gold text-xs flex items-center gap-1.5 px-3 py-1.5"
                          data-testid={`rsvp-tpl-send-${tpl.id}`}>
                    <Send className="w-3.5 h-3.5" /> {t("rsvp_tpl_send_btn", "Katılmayanlara Gönder")}
                  </button>
                  <button type="button" onClick={() => setScheduleTpl(tpl)}
                          className="chip text-[11px]" style={{ borderColor: "#38BDF8", color: "#7DD3FC" }}
                          data-testid={`rsvp-tpl-schedule-${tpl.id}`}>
                    <Clock className="w-3 h-3" /> {t("rsvp_tpl_schedule_btn", "Zamanla")}
                  </button>
                  <button type="button" onClick={() => testSend(tpl)}
                          className="chip text-[11px]" style={{ borderColor: "#A855F7", color: "#D8B4FE" }}
                          data-testid={`rsvp-tpl-test-send-${tpl.id}`}>
                    <FlaskConical className="w-3 h-3" /> {t("rsvp_tpl_test_btn", "Test Gönder")}
                  </button>
                </>
              )}
              <button type="button" onClick={() => { setEditing(tpl); setShowCompose(true); }}
                      className="chip text-[11px]" data-testid={`rsvp-tpl-edit-${tpl.id}`}>
                <Pencil className="w-3 h-3" /> {t("tpl_edit_btn", "Düzenle")}
              </button>
              {showArchive ? (
                <button type="button" onClick={() => archive(tpl, false)}
                        className="chip text-[11px]" style={{ borderColor: "#22C55E", color: "#86EFAC" }}
                        data-testid={`rsvp-tpl-restore-${tpl.id}`}>
                  <ArchiveRestore className="w-3 h-3" /> {t("tpl_restore_btn", "Geri Getir")}
                </button>
              ) : (
                <button type="button" onClick={() => archive(tpl, true)}
                        className="chip text-[11px]" data-testid={`rsvp-tpl-archive-${tpl.id}`}>
                  <Archive className="w-3 h-3" /> {t("tpl_archive_btn", "Arşivle")}
                </button>
              )}
              <button type="button" onClick={() => remove(tpl)}
                      className="chip text-[11px] ml-auto"
                      style={{ borderColor: "#ef4444", color: "#FCA5A5" }}
                      data-testid={`rsvp-tpl-delete-${tpl.id}`}>
                <Trash2 className="w-3 h-3" /> {t("tpl_delete_btn", "Sil")}
              </button>
            </div>
          </>
        )}
      />

      {showCompose && (
        <RsvpComposer
          initial={editing}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSaved={() => { mutate(); setShowCompose(false); setEditing(null); }}
        />
      )}
      {sendTpl && (
        <RsvpSendModal
          tpl={sendTpl}
          onClose={() => setSendTpl(null)}
          onSent={() => { setSendTpl(null); mutate(); }}
        />
      )}
      {scheduleTpl && (
        <RsvpScheduleModal
          tpl={scheduleTpl}
          onClose={() => setScheduleTpl(null)}
          onSaved={() => { setScheduleTpl(null); }}
        />
      )}
      {!showArchive && <RsvpSchedulesList />}
    </div>
  );
}

/* ------------------- RSVP Schedules List (in RSVP tab) ------------------- */
function RsvpSchedulesList() {
  const { t } = useTranslation();
  const { data, mutate } = useSWR("/rsvp-schedules?include_sent=true", fetcher, { refreshInterval: 60000 });
  const items = data?.items || [];
  const remove = async (sid) => {
    if (!window.confirm(t("rsvp_sch_confirm_delete", "Bu zamanlamayı iptal etmek istiyor musun?"))) return;
    try {
      await api.delete(`/rsvp-schedules/${sid}`);
      toast.success(t("rsvp_sch_deleted_toast", "Zamanlama silindi"));
      mutate();
    } catch (e) { toast.error(apiErr(e)); }
  };
  if (!items.length) return null;
  return (
    <div className="mt-4 space-y-2" data-testid="rsvp-schedules-list">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" style={{ color: "#38BDF8" }} />
        <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#7DD3FC" }}>
          {t("rsvp_sch_title", "Zamanlanmış Hatırlatmalar")}
        </h3>
        <span className="chip text-[10px] ml-auto">{items.length}</span>
      </div>
      {items.map((s) => (
        <div key={s.id} className="rounded p-2 flex items-center gap-2 flex-wrap"
             style={{ background: s.sent ? "rgba(148,163,184,0.08)" : "rgba(56,189,248,0.08)",
                      border: `1px solid ${s.sent ? "rgba(148,163,184,0.35)" : "rgba(56,189,248,0.40)"}` }}
             data-testid={`rsvp-schedule-row-${s.id}`}>
          <div className="text-xs text-white flex-1 min-w-0">
            <div className="font-bold truncate">
              🔔 {s.template_name || "?"} · 📅 {s.event_name || "?"}
            </div>
            <div className="text-[10px] mono text-muted-foreground">
              T-{s.minutes_before}dk · {t("rsvp_sch_send_at", "Gönderim")}: {new Date(s.send_at).toLocaleString("tr-TR")}
              {s.include_maybe && <> · <span style={{ color: "#F5A623" }}>{t("rsvp_sch_include_maybe", "Belki dahil")}</span></>}
            </div>
          </div>
          {s.sent ? (
            <span className="chip text-[10px]" style={{ borderColor: "#22C55E", color: "#86EFAC" }}>
              ✓ {t("rsvp_sch_sent_badge", "Gönderildi")} ({s.target_count || 0})
            </span>
          ) : (
            <span className="chip text-[10px]" style={{ borderColor: "#38BDF8", color: "#7DD3FC" }}>
              ⏰ {t("rsvp_sch_pending_badge", "Bekliyor")}
            </span>
          )}
          <button type="button" onClick={() => remove(s.id)}
                  className="chip text-[11px]" style={{ borderColor: "#ef4444", color: "#FCA5A5" }}
                  data-testid={`rsvp-schedule-delete-${s.id}`}>
            <Trash2 className="w-3 h-3" /> {t("tpl_delete_btn", "Sil")}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------- RSVP Schedule Modal ---------------------- */
function RsvpScheduleModal({ tpl, onClose, onSaved }) {
  const { t } = useTranslation();
  const { data: eventsData, isLoading: eventsLoading } = useSWR("/events?archived=false", fetcher);
  const events = Array.isArray(eventsData) ? eventsData : (eventsData?.items || []);
  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.date && new Date(e.date).getTime() > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events]);

  const [eventId, setEventId] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [includeMaybe, setIncludeMaybe] = useState(false);
  const [saving, setSaving] = useState(false);

  const MINUTES_OPTIONS = [
    { v: 15,   label: t("rsvp_sch_min_15",   "15 dakika önce") },
    { v: 30,   label: t("rsvp_sch_min_30",   "30 dakika önce") },
    { v: 60,   label: t("rsvp_sch_min_60",   "1 saat önce") },
    { v: 120,  label: t("rsvp_sch_min_120",  "2 saat önce") },
    { v: 180,  label: t("rsvp_sch_min_180",  "3 saat önce") },
    { v: 360,  label: t("rsvp_sch_min_360",  "6 saat önce") },
    { v: 720,  label: t("rsvp_sch_min_720",  "12 saat önce") },
    { v: 1440, label: t("rsvp_sch_min_1440", "1 gün önce") },
  ];

  const save = async () => {
    if (!eventId) { toast.error(t("rsvp_tpl_pick_event", "Etkinlik seç")); return; }
    setSaving(true);
    try {
      await api.post("/rsvp-schedules", {
        template_id: tpl.id, event_id: eventId,
        minutes_before: Number(minutes), include_maybe: includeMaybe,
      });
      toast.success(t("rsvp_sch_saved_toast", "Zamanlama kaydedildi"));
      // v135.39.1 — Liste anında tazelensin (60s refreshInterval'i beklemesin).
      globalMutate("/rsvp-schedules?include_sent=true");
      onSaved();
    } catch (e) { toast.error(apiErr(e)); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={t("rsvp_sch_modal_title", "Hatırlatmayı Zamanla")}
                onClose={onClose} testid="rsvp-tpl-schedule-modal">
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {t("rsvp_sch_modal_hint", "Şablon: {{name}} — seçilen etkinlikten belirtilen süre önce otomatik gönderilir.", { name: tpl.name })}
        </div>
        <Field label={t("rsvp_tpl_send_event", "Etkinlik")}>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}
                  disabled={eventsLoading}
                  data-testid="rsvp-schedule-event-picker"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white disabled:opacity-60">
            <option value="">{eventsLoading ? t("tpl_loading", "Yükleniyor…") : t("rsvp_tpl_send_event_ph", "Etkinlik seç…")}</option>
            {upcoming.map((e) => (
              <option key={e.id} value={e.id}>{`${e.name} — ${new Date(e.date).toLocaleString("tr-TR")}`}</option>
            ))}
          </select>
        </Field>
        <Field label={t("rsvp_sch_minutes", "Ne kadar önce?")}>
          <select value={minutes} onChange={(e) => setMinutes(e.target.value)}
                  data-testid="rsvp-schedule-minutes"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white">
            {MINUTES_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-xs text-white">
          <input type="checkbox" checked={includeMaybe} onChange={(e) => setIncludeMaybe(e.target.checked)}
                 data-testid="rsvp-schedule-include-maybe" />
          {t("rsvp_tpl_include_maybe", "'Belki' diyenleri de RSVP vermemiş say")}
        </label>
        <button type="button" onClick={save} disabled={saving || !eventId}
                data-testid="rsvp-schedule-save"
                className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
          {saving ? t("tpl_sending", "Gönderiliyor…") : t("rsvp_sch_save_btn", "Zamanla")}
        </button>
      </div>
    </ModalShell>
  );
}

/* --------------------------- Shared UI atoms --------------------------- */
function TemplateSearchInput({ inputRef, value, onChange, placeholder, testid }) {
  return (
    <div className="relative flex-1 min-w-[160px] max-w-md">
      <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        className="w-full pl-7 pr-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
      />
    </div>
  );
}

function ArchiveToggle({ showArchive, setShowArchive }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded overflow-hidden" data-testid="tpl-archive-toggle"
         style={{ border: "1px solid rgba(245,166,35,0.35)" }}>
      <button type="button" onClick={() => setShowArchive(false)}
              data-testid="tpl-tab-active"
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{
                background: !showArchive ? "rgba(245,166,35,0.20)" : "transparent",
                color: !showArchive ? "#F5A623" : "#94A3B8",
              }}>
        {t("tpl_view_active", "Aktif")}
      </button>
      <button type="button" onClick={() => setShowArchive(true)}
              data-testid="tpl-tab-archive"
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1"
              style={{
                background: showArchive ? "rgba(148,163,184,0.15)" : "transparent",
                color: showArchive ? "#E2E8F0" : "#94A3B8",
              }}>
        <Archive className="w-3 h-3" /> {t("tpl_view_archive", "Arşiv")}
      </button>
    </div>
  );
}

function SectionList({ isLoading, items, emptyKey, emptyFallback, renderRow, rowKey }) {
  const { t } = useTranslation();
  if (isLoading) return (
    <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> {t("tpl_loading", "Yükleniyor…")}
    </div>
  );
  if (!items.length) return (
    <div className="card-red-gold p-6 text-center text-sm text-muted-foreground"
         data-testid={`${rowKey}-tpl-empty`}>
      {t(emptyKey, emptyFallback)}
    </div>
  );
  return (
    <div className="space-y-2">
      {items.map((tpl) => (
        <div key={tpl.id} className="card-red-gold p-3 space-y-2"
             data-testid={`${rowKey}-tpl-row-${tpl.id}`}>
          {renderRow(tpl)}
        </div>
      ))}
    </div>
  );
}

/* -------------------------- Telegram Composer -------------------------- */
function TelegramComposer({ initial, categories, onClose, onSaved }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [body, setBody] = useState(initial?.body || "");
  const [category, setCategory] = useState(initial?.category || "diger");
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  useCtrlEnterSubmit(formRef, true);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("tpl_name_required", "Şablon adı zorunlu")); return; }
    if (!body.trim()) { toast.error(t("tpl_body_required", "Mesaj içeriği zorunlu")); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), body: body.trim(), category };
      if (initial) {
        await api.patch(`/telegram-templates/${initial.id}`, payload);
        toast.success(t("tpl_updated_toast", "Şablon güncellendi"));
      } else {
        await api.post(`/telegram-templates`, payload);
        toast.success(t("tpl_created_toast", "Şablon oluşturuldu"));
      }
      onSaved();
    } catch (e2) { toast.error(apiErr(e2)); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={initial ? t("tpl_composer_edit", "Şablonu Düzenle") : t("tpl_composer_new", "Yeni Şablon")}
                onClose={onClose} testid="tg-tpl-composer-modal">
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <Field label={t("tpl_field_name", "Şablon Adı")}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
                 placeholder={t("tg_tpl_field_name_ph", "Örn: Cumartesi Kale Savaşı")}
                 data-testid="tg-tpl-composer-name"
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </Field>
        <Field label={t("tg_tpl_field_category", "Kategori")}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
                  data-testid="tg-tpl-composer-category"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white">
            {categories.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
          </select>
        </Field>
        <Field label={t("tg_tpl_field_body", "Mesaj İçeriği (Markdown destekli)")}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000}
                    data-testid="tg-tpl-composer-body"
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white font-mono" />
        </Field>
        <SubmitBtn saving={saving} testid="tg-tpl-composer-submit"
                   label={initial ? t("tpl_save_edit", "Değişiklikleri Kaydet") : t("tpl_save_new", "Şablonu Oluştur")} />
      </form>
    </ModalShell>
  );
}

/* ---------------------------- Event Composer ---------------------------- */
function EventComposer({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [tn, setTn] = useState(initial?.template_name || "");
  const [name, setName] = useState(initial?.name || "");
  const [group, setGroup] = useState(initial?.group_name || "SvS vs 10007");
  const [mult, setMult] = useState(initial?.multiplier || 1);
  const [subtitle, setSubtitle] = useState(initial?.subtitle || "");
  const [banner, setBanner] = useState(initial?.banner_url || "");
  const [reminder, setReminder] = useState(initial?.reminder_enabled !== false);
  const [attendance, setAttendance] = useState(initial?.attendance_enabled !== false);
  const [hiddenLb, setHiddenLb] = useState(!!initial?.hidden_from_leaderboard);
  const [showBreakdown, setShowBreakdown] = useState(initial?.show_breakdown !== false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  useCtrlEnterSubmit(formRef, true);

  const submit = async (e) => {
    e.preventDefault();
    if (!tn.trim()) { toast.error(t("tpl_name_required", "Şablon adı zorunlu")); return; }
    if (!name.trim()) { toast.error(t("ev_tpl_event_name_required", "Etkinlik adı zorunlu")); return; }
    setSaving(true);
    try {
      const payload = {
        template_name: tn.trim(),
        name: name.trim(),
        group_name: group.trim() || "SvS vs 10007",
        multiplier: Number(mult) || 1,
        subtitle: subtitle.trim() || null,
        banner_url: banner.trim() || null,
        reminder_enabled: reminder,
        attendance_enabled: attendance,
        hidden_from_leaderboard: hiddenLb,
        show_breakdown: showBreakdown,
      };
      if (initial) {
        await api.patch(`/event-templates/${initial.id}`, payload);
        toast.success(t("tpl_updated_toast", "Şablon güncellendi"));
      } else {
        await api.post(`/event-templates`, payload);
        toast.success(t("tpl_created_toast", "Şablon oluşturuldu"));
      }
      onSaved();
    } catch (e2) { toast.error(apiErr(e2)); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={initial ? t("tpl_composer_edit", "Şablonu Düzenle") : t("tpl_composer_new", "Yeni Şablon")}
                onClose={onClose} testid="ev-tpl-composer-modal">
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <Field label={t("tpl_field_name", "Şablon Adı")}>
          <input value={tn} onChange={(e) => setTn(e.target.value)} maxLength={120}
                 data-testid="ev-tpl-composer-tname"
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </Field>
        <Field label={t("ev_tpl_event_name", "Etkinlik adı")}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={140}
                 data-testid="ev-tpl-composer-name"
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("ev_tpl_group", "Grup")}>
            <input value={group} onChange={(e) => setGroup(e.target.value)}
                   data-testid="ev-tpl-composer-group"
                   className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </Field>
          <Field label={t("ev_tpl_multiplier", "Çarpan")}>
            <input type="number" step="0.1" min="0" value={mult} onChange={(e) => setMult(e.target.value)}
                   data-testid="ev-tpl-composer-mult"
                   className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
          </Field>
        </div>
        <Field label={t("ev_tpl_subtitle", "Alt başlık")}>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200}
                 data-testid="ev-tpl-composer-subtitle"
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </Field>
        <Field label={t("ev_tpl_banner", "Banner URL")}>
          <input value={banner} onChange={(e) => setBanner(e.target.value)}
                 data-testid="ev-tpl-composer-banner"
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </Field>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} /> {t("ev_tpl_reminder", "Hatırlatma")}</label>
          <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={attendance} onChange={(e) => setAttendance(e.target.checked)} /> {t("ev_tpl_attendance", "Katılım")}</label>
          <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={showBreakdown} onChange={(e) => setShowBreakdown(e.target.checked)} /> {t("ev_tpl_breakdown", "Puan Detayı")}</label>
          <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={hiddenLb} onChange={(e) => setHiddenLb(e.target.checked)} /> {t("ev_tpl_hidden_lb", "Sıralamada gizle")}</label>
        </div>
        <SubmitBtn saving={saving} testid="ev-tpl-composer-submit"
                   label={initial ? t("tpl_save_edit", "Değişiklikleri Kaydet") : t("tpl_save_new", "Şablonu Oluştur")} />
      </form>
    </ModalShell>
  );
}

/* ----------------------------- RSVP Composer ----------------------------- */
function RsvpComposer({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [body, setBody] = useState(initial?.body || "");
  const initCh = initial?.channels || ["push", "telegram_dm"];
  const [chPush, setChPush] = useState(initCh.includes("push"));
  const [chTg,   setChTg]   = useState(initCh.includes("telegram_dm"));
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  useCtrlEnterSubmit(formRef, true);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("tpl_name_required", "Şablon adı zorunlu")); return; }
    if (!body.trim()) { toast.error(t("tpl_body_required", "Mesaj içeriği zorunlu")); return; }
    if (!chPush && !chTg) { toast.error(t("rsvp_tpl_channel_required", "En az bir kanal seçilmeli")); return; }
    setSaving(true);
    try {
      const channels = [];
      if (chPush) channels.push("push");
      if (chTg) channels.push("telegram_dm");
      const payload = { name: name.trim(), body: body.trim(), channels };
      if (initial) {
        await api.patch(`/rsvp-templates/${initial.id}`, payload);
        toast.success(t("tpl_updated_toast", "Şablon güncellendi"));
      } else {
        await api.post(`/rsvp-templates`, payload);
        toast.success(t("tpl_created_toast", "Şablon oluşturuldu"));
      }
      onSaved();
    } catch (e2) { toast.error(apiErr(e2)); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={initial ? t("tpl_composer_edit", "Şablonu Düzenle") : t("tpl_composer_new", "Yeni Şablon")}
                onClose={onClose} testid="rsvp-tpl-composer-modal">
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <Field label={t("tpl_field_name", "Şablon Adı")}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
                 data-testid="rsvp-tpl-composer-name"
                 placeholder={t("rsvp_tpl_name_ph", "Örn: 1 saat kaldı hatırlatması")}
                 className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white" />
        </Field>
        <Field label={t("tpl_field_body", "Mesaj İçeriği")}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={4000}
                    data-testid="rsvp-tpl-composer-body"
                    placeholder={t("rsvp_tpl_body_ph", "⏰ Bugün saat 21:00'da SvS başlıyor! Katılım durumunu güncelle Komutan.")}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white font-mono" />
        </Field>
        <Field label={t("rsvp_tpl_channels", "Kanallar")}>
          <div className="flex gap-3 text-xs text-white">
            <label className="flex items-center gap-2"><input type="checkbox" checked={chPush} onChange={(e) => setChPush(e.target.checked)} data-testid="rsvp-tpl-composer-ch-push" /> 🔔 Push</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={chTg} onChange={(e) => setChTg(e.target.checked)} data-testid="rsvp-tpl-composer-ch-tg" /> ✈️ Telegram DM</label>
          </div>
        </Field>
        <SubmitBtn saving={saving} testid="rsvp-tpl-composer-submit"
                   label={initial ? t("tpl_save_edit", "Değişiklikleri Kaydet") : t("tpl_save_new", "Şablonu Oluştur")} />
      </form>
    </ModalShell>
  );
}

/* ---------------------- RSVP Send Modal (event pick) ---------------------- */
function RsvpSendModal({ tpl, onClose, onSent }) {
  const { t } = useTranslation();
  const { data: eventsData, isLoading: eventsLoading } = useSWR("/events?archived=false", fetcher);
  const events = Array.isArray(eventsData) ? eventsData : (eventsData?.items || []);
  const [eventId, setEventId] = useState("");
  const [includeMaybe, setIncludeMaybe] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!eventId) { toast.error(t("rsvp_tpl_pick_event", "Etkinlik seç")); return; }
    setSending(true);
    try {
      const r = await api.post(`/rsvp-templates/${tpl.id}/send`, {
        event_id: eventId, include_maybe: includeMaybe,
      });
      toast.success(t("rsvp_tpl_sent_toast",
        "{{target}} üyeye gönderildi (Push {{push}} / Telegram {{tg}})",
        { target: r.data.target_count, push: r.data.push_sent, tg: r.data.telegram_sent }));
      onSent();
    } catch (e) { toast.error(apiErr(e)); } finally { setSending(false); }
  };

  return (
    <ModalShell title={t("rsvp_tpl_send_title", "Katılmayanlara Gönder")}
                onClose={onClose} testid="rsvp-tpl-send-modal">
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {t("rsvp_tpl_send_hint", "Şablon: {{name}} — RSVP vermemiş üyelere iletilir.", { name: tpl.name })}
        </div>
        <Field label={t("rsvp_tpl_send_event", "Etkinlik")}>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}
                  disabled={eventsLoading}
                  data-testid="rsvp-tpl-send-event-picker"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white disabled:opacity-60">
            <option value="">{eventsLoading ? t("tpl_loading", "Yükleniyor…") : t("rsvp_tpl_send_event_ph", "Etkinlik seç…")}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{`${e.name} — ${new Date(e.date).toLocaleString("tr-TR")}`}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-xs text-white">
          <input type="checkbox" checked={includeMaybe} onChange={(e) => setIncludeMaybe(e.target.checked)}
                 data-testid="rsvp-tpl-send-include-maybe" />
          {t("rsvp_tpl_include_maybe", "'Belki' diyenleri de RSVP vermemiş say")}
        </label>
        <button type="button" onClick={send} disabled={sending || !eventId}
                data-testid="rsvp-tpl-send-submit"
                className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm disabled:opacity-40">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? t("tpl_sending", "Gönderiliyor…") : t("rsvp_tpl_send_now", "Şimdi Gönder")}
        </button>
      </div>
    </ModalShell>
  );
}

/* --------------------------- Shared UI atoms --------------------------- */
function ModalShell({ title, onClose, children, testid }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.85)" }}
         onClick={onClose}
         data-testid={testid}>
      <div onClick={(e) => e.stopPropagation()}
           className="card-red-gold p-4 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase font-bold tracking-widest gold-text">{title}</div>
          <button type="button" onClick={onClose}
                  className="text-muted-foreground hover:text-white"
                  data-testid={`${testid}-close`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">{label}</div>
      {children}
    </label>
  );
}

function SubmitBtn({ saving, label, testid }) {
  return (
    <button type="submit" disabled={saving} data-testid={testid}
            className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm">
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      {saving ? "Kaydediliyor…" : label}
    </button>
  );
}
