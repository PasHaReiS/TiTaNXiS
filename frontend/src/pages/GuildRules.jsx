import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import LegalFooter from "@/components/LegalFooter";
import { toast } from "sonner";
import { ScrollText, Pencil, X, Loader2, Save } from "lucide-react";

/**
 * Lonca Kuralları — /kurallar (v135.31).
 * Public read + admin edit. Markdown-lite (newline-preserved). Yeni üye
 * signup'ta bell rowu + toast ile bu sayfaya yönlendirilir.
 */
export default function GuildRules() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => {
    // Public endpoint — no auth needed. Use fetch to avoid attaching JWT.
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/guild/rules`)
      .then((r) => r.json())
      .then((j) => { setData(j); setDraft(j?.body || ""); })
      .catch(() => setData({ body: "", updated_at: null }));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/guild/rules", { body: draft });
      toast.success(t("rules_saved_toast", "Kurallar kaydedildi"));
      setEditing(false);
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="guild-rules-page">
      <Header title={t("rules_page_title", "Lonca Kuralları")} />
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <ScrollText className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">
            {t("rules_page_title", "Lonca Kuralları")}
          </h1>
          {isAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="ml-auto chip text-[11px]"
              data-testid="rules-edit-btn"
            >
              <Pencil className="w-3 h-3" /> {t("rules_edit_btn", "Düzenle")}
            </button>
          )}
        </div>

        {!data && (
          <div className="card-red-gold p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("rules_loading", "Yükleniyor…")}
          </div>
        )}

        {data && !editing && (
          <div className="card-red-gold p-5" data-testid="rules-body">
            {data.body && data.body.trim() ? (
              <div
                className="text-sm text-white whitespace-pre-wrap leading-relaxed"
                style={{ fontFamily: "Georgia, serif" }}
              >
                {data.body}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic text-center py-4" data-testid="rules-empty">
                {t("rules_empty",
                  "Henüz kural yayınlanmadı. Admin panelinden ilk versiyonu yazın.")}
              </div>
            )}
            {data.updated_at && (
              <div className="text-[10px] text-muted-foreground mt-3 font-mono">
                {t("rules_last_updated",
                  "Son güncelleme: {{when}}",
                  { when: new Date(data.updated_at).toLocaleString("tr-TR") })}
              </div>
            )}
          </div>
        )}

        {data && editing && (
          <div className="card-red-gold p-4 space-y-3" data-testid="rules-editor">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={18}
              placeholder={t("rules_editor_placeholder",
                "1. Ittifak sohbetinde saygılı ol.\n2. Etkinliklere RSVP ver.\n3. Yeni üyelere yardımcı ol.")}
              data-testid="rules-editor-textarea"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white leading-relaxed"
              style={{ fontFamily: "Georgia, serif" }}
              maxLength={20000}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[10px] text-muted-foreground font-mono">
                {t("rules_char_count", "{{count}} / 20000", { count: draft.length })}
              </div>
              <button
                onClick={save}
                disabled={saving}
                className="btn-gold text-sm px-4 py-2 ml-auto flex items-center gap-1.5"
                data-testid="rules-save-btn"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving
                  ? t("saving", "Kaydediliyor…")
                  : t("rules_save_btn", "Kaydet")}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(data.body || ""); }}
                className="chip text-xs"
                data-testid="rules-cancel-btn"
              >
                <X className="w-3 h-3" /> {t("rules_cancel_btn", "İptal")}
              </button>
            </div>
          </div>
        )}
      </div>
      <LegalFooter />
    </div>
  );
}
