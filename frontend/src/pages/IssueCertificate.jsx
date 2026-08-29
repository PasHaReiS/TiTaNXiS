import React, { useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Award, Loader2, Send, ChevronRight, Trash2, Pencil, Search, X, Save } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Sertifika Verme — /admin/sertifika-ver (v135.35).
 * Admin bir etkinlik seçer, etkinliğe katılan (attendance rows) veya RSVP=yes
 * veren üyeleri otomatik listeler; ekran üzerinden tek tıkla bulk issue eder.
 * Tüm metinler `useTranslation()` fallback ile geçiyor.
 */
export default function IssueCertificate() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [eventId, setEventId] = useState("");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("amber");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const { data: events } = useSWR("/events?archived=false", fetcher);
  // v135.35 — Attendance participant list for the chosen event (member_ids
  // who actually attended). Falls back to RSVP=yes when attendance is empty
  // so admins can still bulk-issue for prep-heavy runs.
  const { data: att } = useSWR(
    eventId ? `/events/${eventId}/attendance` : null, fetcher,
  );
  const { data: rsvpList } = useSWR(
    eventId ? `/events/${eventId}/rsvp` : null, fetcher,
  );
  const participants = useMemo(() => {
    const attIds = (att?.items || att?.member_ids || []).map((x) => x.member_id || x);
    if (attIds.length > 0) return attIds;
    // RSVP yes fallback — user_ids linked to member_ids requires join;
    // shortest path is to expose whoever has an `attendee` or `member_id`
    // on the RSVP row. If absent, admins can still type-issue via curl.
    return (rsvpList?.items || []).filter((r) => r.status === "yes" && r.member_id).map((r) => r.member_id);
  }, [att, rsvpList]);
  const { data: allMembers } = useSWR("/members", fetcher);
  const memberById = useMemo(() => {
    const list = Array.isArray(allMembers) ? allMembers : (allMembers?.items || []);
    return Object.fromEntries(list.map((m) => [m.id, m.name]));
  }, [allMembers]);

  const toggleAll = () => {
    if (selected.size === participants.length) setSelected(new Set());
    else setSelected(new Set(participants));
  };
  const toggle = (mid) => {
    const next = new Set(selected);
    if (next.has(mid)) next.delete(mid); else next.add(mid);
    setSelected(next);
  };

  const issue = async () => {
    if (!eventId) { toast.error(t("cert_pick_event", "Etkinlik seç")); return; }
    if (!title.trim()) { toast.error(t("cert_title_required", "Başlık zorunlu")); return; }
    if (selected.size === 0) { toast.error(t("cert_pick_members", "En az bir üye seç")); return; }
    setBusy(true);
    try {
      const res = await api.post("/certificates/issue", {
        event_id: eventId, title: title.trim(),
        member_ids: [...selected], theme,
      });
      toast.success(t("cert_issued_toast",
        "{{count}} sertifika verildi", { count: res.data.count }));
      setSelected(new Set());
      setTitle("");
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">
    {t("cert_access_denied", "Bu sayfa yalnızca yöneticilere açıktır.")}
  </div>;

  const evList = Array.isArray(events) ? events : (events?.items || []);
  const THEMES = [
    { key: "amber", label: t("cert_theme_amber", "Kehribar (klasik)") },
    { key: "fire", label: t("cert_theme_fire", "Ateş") },
    { key: "onyx", label: t("cert_theme_onyx", "Oniks") },
    { key: "buz", label: t("cert_theme_buz", "Buz") },
    { key: "zumrut", label: t("cert_theme_zumrut", "Zümrüt") },
    { key: "bosluk", label: t("cert_theme_bosluk", "Boşluk") },
  ];

  return (
    <div data-testid="issue-cert-page">
      <Header title={t("cert_page_title", "Sertifika Ver")} />
      <div className="max-w-3xl mx-auto py-4 px-4 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">
            {t("cert_page_title", "Sertifika Ver")}
          </h1>
        </div>
        <div className="card-red-gold p-4 space-y-3">
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("cert_event_label", "Etkinlik")}
            </div>
            <select
              value={eventId} onChange={(e) => { setEventId(e.target.value); setSelected(new Set()); }}
              data-testid="cert-event-picker"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            >
              <option value="">{t("cert_event_placeholder", "Etkinlik seç…")}</option>
              {evList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {new Date(e.date).toLocaleDateString("tr-TR")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("cert_title_label", "Sertifika Başlığı")}
            </div>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t("cert_title_ph", "Örn: SvS Şampiyonu - Ağustos 2026")}
              data-testid="cert-title-input"
              maxLength={160}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
              {t("cert_theme_label", "Tema")}
            </div>
            <select
              value={theme} onChange={(e) => setTheme(e.target.value)}
              data-testid="cert-theme-picker"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
            >
              {THEMES.map((th) => <option key={th.key} value={th.key}>{th.label}</option>)}
            </select>
          </label>
        </div>

        {eventId && (
          <div className="card-red-gold p-4 space-y-2" data-testid="cert-participants">
            <div className="flex items-center gap-2">
              <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
                {t("cert_participants_label",
                  "Katılımcılar ({{count}})", { count: participants.length })}
              </div>
              <button onClick={toggleAll} className="chip text-[10px] ml-auto"
                      data-testid="cert-select-all">
                {selected.size === participants.length
                  ? t("cert_deselect_all", "Seçimi Kaldır")
                  : t("cert_select_all", "Hepsini Seç")}
              </button>
            </div>
            {participants.length === 0 && (
              <div className="text-sm text-muted-foreground italic text-center py-3">
                {t("cert_no_participants",
                  "Bu etkinlik için katılımcı bulunamadı (yoklama ya da RSVP=Evet yok).")}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-96 overflow-auto">
              {participants.map((mid) => (
                <label key={mid}
                       className="flex items-center gap-1 text-xs text-white px-2 py-1 rounded cursor-pointer"
                       style={{
                         background: selected.has(mid) ? "rgba(245,166,35,0.14)" : "rgba(255,255,255,0.03)",
                         border: `1px solid ${selected.has(mid) ? "rgba(245,166,35,0.45)" : "rgba(255,255,255,0.08)"}`,
                       }}
                       data-testid={`cert-participant-${mid}`}
                >
                  <input type="checkbox" checked={selected.has(mid)}
                         onChange={() => toggle(mid)} className="cursor-pointer" />
                  <span className="truncate">{memberById[mid] || mid.slice(0, 8)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={issue}
          disabled={busy || !eventId || !title.trim() || selected.size === 0}
          className="btn-gold w-full py-3 flex items-center justify-center gap-2 text-sm"
          data-testid="cert-issue-submit"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {busy
            ? t("cert_issuing", "Veriliyor…")
            : t("cert_issue_btn",
                "{{count}} kişiye sertifika ver", { count: selected.size })}
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* v135.37 — Verilen Sertifikalar Yönetim Listesi */}
        <IssuedCertificatesList themes={THEMES} />
      </div>
    </div>
  );
}

function IssuedCertificatesList({ themes }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // {id, title, theme}
  const listUrl = `/certificates?limit=200${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ""}`;
  const { data, mutate, isLoading } = useSWR(listUrl, fetcher, { refreshInterval: 30000 });
  const items = data?.items || [];

  const remove = async (id) => {
    if (!window.confirm(t("cert_delete_confirm", "Bu sertifikayı kalıcı olarak silmek istiyor musun?"))) return;
    try {
      await api.delete(`/certificates/${id}`);
      toast.success(t("cert_deleted", "Sertifika silindi"));
      mutate();
      globalMutate("/auth/me/certificates");
    } catch (e) { toast.error(apiErr(e)); }
  };
  const saveEdit = async () => {
    if (!editing?.id) return;
    try {
      await api.patch(`/certificates/${editing.id}`, {
        title: editing.title,
        theme: editing.theme,
      });
      toast.success(t("cert_updated", "Sertifika güncellendi"));
      setEditing(null);
      mutate();
      globalMutate("/auth/me/certificates");
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="card-red-gold p-4 space-y-3" data-testid="issued-certs-list">
      <div className="flex items-center gap-2">
        <Award className="w-4 h-4 gold-text" />
        <h2 className="text-sm font-bold uppercase gold-text tracking-widest">
          {t("issued_certs_title", "Verilen Sertifikalar")}
        </h2>
        <span className="chip text-[10px] ml-auto">{items.length}</span>
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("issued_certs_search_ph", "Üye / etkinlik / başlık ara…")}
          className="w-full pl-7 pr-2 py-1.5 rounded bg-black/40 border border-border text-white text-xs"
          data-testid="issued-certs-search"
        />
      </div>
      {isLoading && (
        <div className="text-center text-xs text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> {t("loading", "Yükleniyor")}…
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-4" data-testid="issued-certs-empty">
          {t("issued_certs_empty", "Henüz sertifika verilmedi.")}
        </div>
      )}
      <div className="space-y-1.5 max-h-96 overflow-auto">
        {items.map((c) => (
          <div key={c.id}
               className="rounded p-2 text-xs"
               style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.25)" }}
               data-testid={`issued-cert-row-${c.id}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold truncate" data-testid={`issued-cert-title-${c.id}`}>
                  🏆 {c.title}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {c.member_name || "—"} · {c.event_name || "—"}
                </div>
                <div className="text-[10px] mono text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{new Date(c.issued_at).toLocaleString("tr-TR")}</span>
                  <span className="chip text-[9px]" style={{ padding: "1px 5px" }}>{c.theme}</span>
                  {c.issued_by === "auto" && (
                    <span className="chip text-[9px]" style={{ padding: "1px 5px", color: "#93C5FD", borderColor: "rgba(59,130,246,0.55)" }}>
                      OTOMATİK
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing({ id: c.id, title: c.title, theme: c.theme || "amber" })}
                  className="p-1 rounded hover:bg-blue-500/20 text-blue-400"
                  title={t("edit", "Düzenle")}
                  data-testid={`issued-cert-edit-${c.id}`}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="p-1 rounded hover:bg-red-500/20 text-red-400"
                  title={t("delete", "Sil")}
                  data-testid={`issued-cert-delete-${c.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
             onClick={() => setEditing(null)}
             data-testid="issued-cert-edit-modal">
          <div onClick={(e) => e.stopPropagation()}
               className="card-red-gold w-full max-w-sm p-4 relative">
            <button type="button" onClick={() => setEditing(null)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold uppercase gold-text tracking-widest mb-3">
              {t("edit_certificate", "Sertifikayı Düzenle")}
            </h3>
            <label className="block mb-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                {t("cert_title_label", "Sertifika Başlığı")}
              </div>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                maxLength={160}
                data-testid="issued-cert-edit-title"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block mb-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                {t("cert_theme_label", "Tema")}
              </div>
              <select
                value={editing.theme}
                onChange={(e) => setEditing({ ...editing, theme: e.target.value })}
                data-testid="issued-cert-edit-theme"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white"
              >
                {themes.map((th) => <option key={th.key} value={th.key}>{th.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={saveEdit}
              className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-xs"
              data-testid="issued-cert-edit-save"
            >
              <Save className="w-3 h-3" /> {t("save", "Kaydet")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
