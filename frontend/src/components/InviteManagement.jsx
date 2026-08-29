import React, { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Plus, X, Copy, ShieldOff, Trash2, Clock, Users, Link2, QrCode } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Invite Links (Faz 5) admin UI — nested under Yönetim > Davet Linkleri.
 * Admins can mint one-shot, N-use or unlimited invites with optional expiry.
 */
export default function InviteManagement() {
  const [showCompose, setShowCompose] = useState(false);
  // v135.25 — Persist QR color theme choice across sessions (per browser).
  // "light" = classic scannable black-on-white (max reader compat).
  // "branded" = amber-on-black TiTaNXiS onboarding style for polished
  // screenshots + Discord embeds. Cast to string BEFORE storing so
  // JSON.parse mismatches never touch the tree.
  const [qrTheme, setQrTheme] = useState(() => {
    try { return localStorage.getItem("ol_invite_qr_theme") || "light"; }
    catch { return "light"; }
  });
  const toggleTheme = () => {
    setQrTheme((prev) => {
      const next = prev === "branded" ? "light" : "branded";
      try { localStorage.setItem("ol_invite_qr_theme", next); } catch {}
      return next;
    });
  };
  const { data, mutate, isLoading } = useSWR("/invites", fetcher, { refreshInterval: 60000 });
  const items = data?.items || [];

  return (
    <div className="space-y-3" data-testid="invite-mgmt">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-widest gold-text font-bold">
          Davet Linkleri ({items.length})
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="chip text-[10px]"
            data-testid="invite-qr-theme-toggle"
            title={qrTheme === "branded"
              ? "Klasik siyah-beyaz QR'a geç"
              : "TiTaNXiS Amber tema (premium)"}
            style={qrTheme === "branded" ? {
              background: "linear-gradient(135deg,#0A0004,#1a0f08)",
              color: "#F5A623",
              border: "1px solid #F5A623",
              boxShadow: "inset 0 0 8px rgba(245,166,35,0.25)",
            } : undefined}
          >
            <QrCode className="w-3 h-3" />
            {qrTheme === "branded" ? "Amber QR" : "Klasik QR"}
          </button>
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
          <InviteRow key={inv.id} inv={inv} qrTheme={qrTheme} onChanged={() => mutate()} />
        ))}
      </div>
    </div>
  );
}

function InviteComposer({ onCreated }) {
  const { t } = useTranslation();
  const [maxUses, setMaxUses] = useState(1);
  const [unlimited, setUnlimited] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [role, setRole] = useState("user");
  const [canEdit, setCanEdit] = useState(false);
  const [note, setNote] = useState("");
  const [letterLang, setLetterLang] = useState("tr");
  const [saving, setSaving] = useState(false);
  // v135.32 — Load language list from backend so any addition/removal on
  // the server side is reflected without a frontend re-deploy.
  const { data: langsData } = useSWR("/invites/letter/languages", (u) =>
    api.get(u).then((r) => r.data));
  const langs = langsData?.items || [
    { code: "tr", label: "Türkçe" }, { code: "en", label: "English" },
  ];
  const submit = async (e) => {
    e.preventDefault();
    let expIso = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (isNaN(d.getTime())) { toast.error(t("invite_composer_invalid_date", "Geçersiz süre")); return; }
      if (d.getTime() <= Date.now()) { toast.error(t("invite_composer_future_date", "Süre gelecekte olmalı")); return; }
      expIso = d.toISOString();
    }
    setSaving(true);
    try {
      await api.post("/invites", {
        max_uses: unlimited ? null : Math.max(1, Number(maxUses) || 1),
        expires_at: expIso || undefined,
        role, default_can_edit: canEdit,
        note: note.trim() || undefined,
        letter_lang: letterLang,
      });
      toast.success(t("invite_composer_created_toast", "Davet linki oluşturuldu"));
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
          <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
            {t("invite_composer_role_label", "Rol")}
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-2 py-1 rounded bg-black/40 border border-border text-white text-xs"
            data-testid="invite-composer-role"
          >
            <option value="user">{t("invite_composer_role_user", "Üye")}</option>
            <option value="editor">{t("invite_composer_role_editor", "Editör")}</option>
            <option value="admin">{t("invite_composer_role_admin", "Yönetici")}</option>
          </select>
        </div>
        <label className="text-[10px] text-white flex items-center gap-1.5 mt-4">
          <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)}
                 data-testid="invite-composer-can-edit" />
          {t("invite_composer_can_edit", "Düzenleme yetkisi ver")}
        </label>
      </div>
      {/* v135.32 — Letter language picker. Populated from
          `/invites/letter/languages` so backend is the single source. */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
          {t("invite_composer_letter_lang_label", "Davet Mektubu Dili")}
        </label>
        <select
          value={letterLang}
          onChange={(e) => setLetterLang(e.target.value)}
          className="w-full px-2 py-1 rounded bg-black/40 border border-border text-white text-xs"
          data-testid="invite-composer-letter-lang"
        >
          {langs.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
      <button
        type="submit" disabled={saving}
        className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
        data-testid="invite-composer-submit"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {saving
          ? t("invite_composer_saving", "Oluşturuluyor…")
          : t("invite_composer_submit_btn", "Davet Linki Oluştur")}
      </button>
    </form>
  );
}

function InviteRow({ inv, qrTheme = "light", onChanged }) {
  const url = `${window.location.origin}/kayit/${inv.token}`;
  const [qrOpen, setQrOpen] = useState(false);
  // v135.25 — Amber-on-black premium palette for onboarding screenshots.
  // Level "H" (~30% error correction) keeps the QR readable even with the
  // ink swap + centered logo overlay.
  const branded = qrTheme === "branded";
  const qrBg = branded ? "#0A0004" : "#FFFFFF";
  const qrFg = branded ? "#F5A623" : "#0A0004";
  const btnBgClass = branded
    ? "bg-[#0A0004] hover:ring-2 hover:ring-amber-400"
    : "bg-white hover:ring-2 hover:ring-amber-400";
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
      <div className="flex items-start gap-2">
        {/* Inline 68px QR — instantly scannable from Discord posts and printed
            guides without an extra modal. Click to expand for high-res share. */}
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className={`flex-shrink-0 rounded p-1 transition ${btnBgClass}`}
          title="Büyüt / paylaş"
          data-testid={`invite-qr-${inv.id}`}
        >
          <QRCodeSVG
            value={url}
            size={68}
            bgColor={qrBg}
            fgColor={qrFg}
            level="H"
            imageSettings={{
              src: "/icons/pwa-192.png",
              height: 14,
              width: 14,
              excavate: true,
            }}
          />
        </button>
        <div className="flex-1 min-w-0 space-y-1">
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
          {/* v135.31 — Auto-generated invite letter. Collapsed by default;
              opens to reveal a copy-friendly Markdown block + Telegram push. */}
          {inv.letter_body && (
            <InviteLetterSection inv={inv} />
          )}
        </div>
      </div>
      {qrOpen && (
        <QrExpandModal url={url} note={inv.note} branded={branded}
                       onClose={() => setQrOpen(false)} />
      )}
    </div>
  );
}

function InviteLetterSection({ inv }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [regen, setRegen] = useState(false);
  const [lang, setLang] = useState(inv.letter_lang || "tr");
  const [body, setBody] = useState(inv.letter_body || "");
  const { data: langsData } = useSWR("/invites/letter/languages", (u) =>
    api.get(u).then((r) => r.data));
  const langs = langsData?.items || [
    { code: "tr", label: "Türkçe" }, { code: "en", label: "English" },
  ];
  const copyLetter = () => {
    navigator.clipboard.writeText(body || "").then(
      () => toast.success(t("invite_letter_copied", "Davet mektubu kopyalandı")),
      () => toast.error(t("invite_letter_copy_failed", "Kopyalanamadı")),
    );
  };
  const sendTg = async () => {
    if (!window.confirm(t("invite_letter_confirm_send",
      "Davet mektubunu Telegram grubuna göndermek istiyor musun?"))) return;
    setSending(true);
    try {
      await api.post(`/invites/${inv.id}/send-letter-telegram`);
      toast.success(t("invite_letter_sent", "Davet mektubu Telegram grubuna gönderildi"));
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSending(false); }
  };
  const regenerate = async (newLang) => {
    setRegen(true);
    try {
      const r = await api.post(`/invites/${inv.id}/letter/regenerate?lang=${newLang}`);
      setLang(r.data.letter_lang);
      setBody(r.data.letter_body);
      toast.success(t("invite_letter_lang_switched", "Mektup dili değiştirildi"));
    } catch (e) { toast.error(apiErr(e)); }
    finally { setRegen(false); }
  };
  return (
    <div className="mt-1" data-testid={`invite-letter-${inv.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="chip text-[10px]"
        data-testid={`invite-letter-toggle-${inv.id}`}
      >
        ✉️ {open
          ? t("invite_letter_hide", "Mektubu Gizle")
          : t("invite_letter_show", "Davet Mektubu")}
        <span className="ml-1 text-[9px] opacity-75">[{lang.toUpperCase()}]</span>
      </button>
      {open && (
        <div
          className="mt-1 rounded p-2 text-[11px] text-white whitespace-pre-wrap leading-relaxed"
          style={{
            background: "rgba(245,166,35,0.06)",
            border: "1px solid rgba(245,166,35,0.25)",
            fontFamily: "Georgia, serif",
          }}
          data-testid={`invite-letter-body-${inv.id}`}
        >
          {body}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <select
              value={lang}
              onChange={(e) => regenerate(e.target.value)}
              disabled={regen}
              className="chip text-[10px] px-2 py-1"
              data-testid={`invite-letter-lang-${inv.id}`}
              title={t("invite_letter_lang_title", "Mektup dilini değiştir")}
            >
              {langs.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <button
              onClick={copyLetter}
              className="chip text-[10px]"
              data-testid={`invite-letter-copy-${inv.id}`}
            >
              <Copy className="w-3 h-3" /> {t("invite_letter_copy_btn", "Mektubu Kopyala")}
            </button>
            <button
              onClick={sendTg}
              disabled={sending}
              className="btn-gold text-[10px] flex items-center gap-1.5 px-2 py-1"
              data-testid={`invite-letter-send-${inv.id}`}
            >
              {sending
                ? t("sending", "Gönderiliyor…")
                : t("invite_letter_send_btn", "Telegram'a Gönder")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QrExpandModal({ url, note, branded = false, onClose }) {
  // v135.25 — Match the download PNG to the on-screen theme so admins
  // can screenshot AND download the exact premium look they see.
  const qrBg = branded ? "#0A0004" : "#FFFFFF";
  const qrFg = branded ? "#F5A623" : "#0A0004";
  const downloadPng = () => {
    // Convert the on-screen SVG to a PNG blob and trigger a download —
    // handy for Discord embeds or printed onboarding sheets.
    const svg = document.getElementById("invite-qr-large");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      const ctx = c.getContext("2d");
      ctx.fillStyle = qrBg;
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      c.toBlob((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = branded
          ? "titanxis-davet-qr-amber.png"
          : "titanxis-davet-qr.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      }, "image/png");
    };
    img.src = "data:image/svg+xml;base64," + svg64;
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.85)" }}
         onClick={onClose}
         data-testid="invite-qr-modal">
      <div className="card-red-gold p-4 max-w-sm w-full space-y-3"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase font-bold tracking-widest gold-text">
            Davet QR Kodu
          </div>
          <button onClick={onClose}
                  className="text-muted-foreground hover:text-white"
                  data-testid="invite-qr-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {note && (
          <div className="text-xs text-white italic text-center">"{note}"</div>
        )}
        <div className="flex justify-center p-3 rounded"
             style={{ background: qrBg,
                      boxShadow: branded ? "inset 0 0 24px rgba(245,166,35,0.20)" : "none" }}>
          <QRCodeSVG
            id="invite-qr-large"
            value={url}
            size={256}
            bgColor={qrBg}
            fgColor={qrFg}
            level="H"
            imageSettings={{
              src: "/icons/pwa-192.png",
              height: 48,
              width: 48,
              excavate: true,
            }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground text-center break-all font-mono">
          {url}
        </div>
        <button
          type="button"
          onClick={downloadPng}
          className="btn-gold w-full py-2 flex items-center justify-center gap-2 text-sm"
          data-testid="invite-qr-download"
        >
          <QrCode className="w-4 h-4" /> PNG olarak indir
        </button>
      </div>
    </div>
  );
}
