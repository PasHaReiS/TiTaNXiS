import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import { toast } from "sonner";
import { Award, Loader2, Send, ChevronRight } from "lucide-react";

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
      </div>
    </div>
  );
}
