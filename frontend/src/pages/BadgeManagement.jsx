import React, { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useTranslation } from "react-i18next";
import { api, apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import ImageDropzone from "@/components/ImageDropzone";
import { Award, Plus, Trash2, UserPlus, X, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * Rozet Yönetimi — /admin/rozetler (admin-only via App.js RequireAdmin).
 * All static labels routed through i18n `t()` — the app supports 29 languages
 * and each key falls back to Turkish text via the second arg.
 */
export default function BadgeManagement() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const { data: badgesData, mutate: mutateBadges } = useSWR("/badges", fetcher);
  const { data: membersData } = useSWR("/members", fetcher);
  const badges = badgesData?.items || [];
  const members = Array.isArray(membersData) ? membersData : (membersData?.items || []);

  const del = async (bid) => {
    if (!window.confirm(t("badges_confirm_delete", "Bu özel rozeti silmek istiyor musun?"))) return;
    try {
      await api.delete(`/badges/${bid}`);
      mutateBadges();
      toast.success(t("badges_deleted_toast", "Rozet silindi"));
    } catch (e) { toast.error(apiErr(e)); }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">{t("badges_access_denied", "Bu sayfa yalnızca yöneticilere açıktır.")}</p>
      </div>
    );
  }

  return (
    <div data-testid="badges-page">
      <Header title={t("badges_page_title", "Rozetler")} />
      <div className="max-w-5xl mx-auto py-4 px-4 space-y-6">
        <div className="flex items-center gap-2">
          <Award className="w-6 h-6 gold-text" />
          <h1 className="text-2xl font-bold uppercase gold-text tracking-widest">{t("badges_page_title", "Rozetler")}</h1>
          <div className="ml-auto flex gap-2">
            <button
              data-testid="badge-assign-btn"
              onClick={() => setShowAssign(true)}
              className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2"
            >
              <UserPlus className="w-3.5 h-3.5" /> {t("badges_assign_btn", "Üyeye Ata")}
            </button>
            <button
              data-testid="badge-create-btn"
              onClick={() => setShowCreate(true)}
              className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2"
            >
              <Plus className="w-3.5 h-3.5" /> {t("badges_create_btn", "Özel Rozet Ekle")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="badges-grid">
          {badges.map((b) => (
            <div
              key={b.id}
              data-testid={`badge-card-${b.id}`}
              className="card-red-gold p-3 flex flex-col items-center text-center gap-1 relative"
              style={{ borderColor: b.color || "#F5A623" }}
            >
              {b.icon_url ? (
                <img src={b.icon_url} alt={b.name} className="w-12 h-12 object-contain rounded" />
              ) : (
                <div className="text-3xl" aria-hidden>{b.icon}</div>
              )}
              <div className="text-xs font-bold gold-text uppercase truncate max-w-full">{b.name}</div>
              {b.description && (
                <div className="text-[9px] text-muted-foreground line-clamp-2">{b.description}</div>
              )}
              {b.is_preset ? (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 uppercase tracking-wider">{t("badges_preset_label", "Hazır")}</span>
              ) : (
                <button
                  data-testid={`badge-delete-${b.id}`}
                  onClick={() => del(b.id)}
                  className="absolute top-1 right-1 text-red-400 hover:text-red-300 p-1 rounded"
                  aria-label={t("badges_remove_aria", "Kaldır")}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {badges.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground text-center py-8">
              {t("badges_empty", "Rozet yok. \"Özel Rozet Ekle\" ile başlayın.")}
            </div>
          )}
        </div>

        <MemberBadgesTable members={members} badges={badges} t={t} />
      </div>

      {showCreate && <CreateBadgeModal t={t} onClose={() => { setShowCreate(false); mutateBadges(); }} />}
      {showAssign && <AssignBadgeModal t={t} members={members} badges={badges} onClose={() => setShowAssign(false)} />}
    </div>
  );
}

function CreateBadgeModal({ t, onClose }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏅");
  const [iconFiles, setIconFiles] = useState([]);
  const [iconUrl, setIconUrl] = useState("");
  const [color, setColor] = useState("#F5A623");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const finalIconUrl = iconFiles[0]?.url || iconUrl.trim();

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("badges_form_name_required", "İsim zorunlu")); return; }
    if (!icon && !finalIconUrl) { toast.error(t("badges_form_icon_required", "Emoji veya görsel gerekli")); return; }
    setSaving(true);
    try {
      await api.post("/badges", {
        name: name.trim(),
        icon: icon.trim() || null,
        icon_url: finalIconUrl || null,
        color,
        description: description.trim() || null,
      });
      toast.success(t("badges_form_created_toast", "Rozet oluşturuldu"));
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
        data-testid="badge-create-form"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{t("badges_create_title", "Özel Rozet")}</h3>
        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_form_name", "İsim")} *</label>
        <input
          data-testid="badge-form-name"
          value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mb-3"
        />
        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_form_icon", "Emoji (kısayol)")}</label>
        <input
          data-testid="badge-form-icon"
          value={icon} onChange={(e) => setIcon(e.target.value)}
          maxLength={4}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-lg text-white mb-3"
        />
        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_form_image", "Görsel (opsiyonel)")}</label>
        <ImageDropzone purpose="misc" value={iconFiles} onChange={setIconFiles} max={1} compact />
        <div className="text-[10px] text-muted-foreground text-center my-1">{t("badges_form_or_url", "— veya URL —")}</div>
        <input
          data-testid="badge-form-icon-url"
          value={iconUrl} onChange={(e) => setIconUrl(e.target.value)}
          placeholder="https://..."
          disabled={iconFiles.length > 0}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-white mb-3 disabled:opacity-40"
        />
        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_form_color", "Renk")}</label>
        <input
          data-testid="badge-form-color"
          type="color" value={color} onChange={(e) => setColor(e.target.value)}
          className="w-full h-9 bg-background border border-border rounded-md mb-3"
        />
        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_form_description", "Açıklama")}</label>
        <textarea
          data-testid="badge-form-description"
          value={description} onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-white mb-4"
        />
        <button
          type="submit"
          disabled={saving}
          data-testid="badge-form-submit"
          className="btn-primary w-full py-2 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t("badges_form_submit", "Oluştur")}
        </button>
      </form>
    </div>
  );
}

function AssignBadgeModal({ t, members, badges, onClose }) {
  const [q, setQ] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = members.filter((m) =>
    !q || m.name?.toLowerCase().includes(q.toLowerCase()) || m.member_id?.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 30);

  const save = async (e) => {
    e.preventDefault();
    if (!selectedMember || !selectedBadgeId) { toast.error(t("badges_assign_need_selection", "Üye ve rozet seç")); return; }
    setSaving(true);
    try {
      await api.post(`/members/${selectedMember.id}/badges`, { badge_id: selectedBadgeId });
      toast.success(t("badges_assign_awarded_toast", "{{name}} rozeti aldı", { name: selectedMember.name }));
      globalMutate((k) => typeof k === "string" && k.startsWith("/members"));
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
        data-testid="badge-assign-form"
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold uppercase gold-text mb-4">{t("badges_assign_title", "Rozet Ata")}</h3>

        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_assign_search", "Üye Ara")}</label>
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2 top-3 text-muted-foreground" />
          <input
            data-testid="badge-assign-search"
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("badges_assign_search_placeholder", "İsim veya ID...")}
            className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-2 text-sm text-white"
          />
        </div>
        <div className="max-h-40 overflow-y-auto border border-border rounded-md mb-3 bg-black/30">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`badge-assign-member-${m.id}`}
              onClick={() => setSelectedMember(m)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-amber-500/10 ${selectedMember?.id === m.id ? "bg-amber-500/25 text-amber-200" : "text-white"}`}
            >
              {m.name} {m.alliance_name && <span className="opacity-60">[{m.alliance_name}]</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="text-xs text-muted-foreground p-3 text-center">{t("badges_assign_no_members", "Üye yok")}</div>}
        </div>

        <label className="block text-xs uppercase font-bold text-muted-foreground mb-1">{t("badges_assign_badge_label", "Rozet")}</label>
        <select
          data-testid="badge-assign-select"
          value={selectedBadgeId} onChange={(e) => setSelectedBadgeId(e.target.value)}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-white mb-4"
        >
          <option value="">{t("badges_assign_placeholder", "— Seç —")}</option>
          {badges.map((b) => (
            <option key={b.id} value={b.id}>{b.icon || "🏅"} {b.name}</option>
          ))}
        </select>

        <button
          type="submit"
          disabled={saving || !selectedMember || !selectedBadgeId}
          data-testid="badge-assign-submit"
          className="btn-primary w-full py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {t("badges_assign_submit", "Ata")}
        </button>
      </form>
    </div>
  );
}

function MemberBadgesTable({ t, members, badges }) {
  const [q, setQ] = useState("");
  const [openMember, setOpenMember] = useState(null);
  const badgeMap = badges.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});

  const filtered = members.filter((m) =>
    !q || m.name?.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 50);

  return (
    <div className="card-red-gold p-4" data-testid="member-badges-table">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-sm font-bold gold-text uppercase tracking-wider">{t("badges_members_title", "Üye Rozetleri")}</div>
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <input
            data-testid="member-badges-search"
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("badges_members_search", "Üye ara...")}
            className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-white"
          />
        </div>
      </div>
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {filtered.map((m) => (
          <MemberBadgesRow key={m.id} t={t} member={m} badgeMap={badgeMap} onOpen={() => setOpenMember(m)} isOpen={openMember?.id === m.id} />
        ))}
      </div>
    </div>
  );
}

function MemberBadgesRow({ t, member, badgeMap, onOpen, isOpen }) {
  const { data, mutate: refresh } = useSWR(isOpen ? `/members/${member.id}/badges` : null, fetcher);
  const items = data?.items || [];

  const remove = async (bid) => {
    try {
      await api.delete(`/members/${member.id}/badges/${bid}`);
      refresh();
      toast.success(t("badges_removed_toast", "Rozet kaldırıldı"));
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="border border-border rounded bg-black/20 overflow-hidden">
      <button
        onClick={onOpen}
        data-testid={`member-badges-row-${member.id}`}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-amber-500/10"
      >
        <span className="text-white font-semibold flex-1">{member.name}</span>
        {member.alliance_name && <span className="opacity-60 text-[10px]">[{member.alliance_name}]</span>}
      </button>
      {isOpen && (
        <div className="px-3 py-2 border-t border-border bg-black/40" data-testid={`member-badges-panel-${member.id}`}>
          {items.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">{t("badges_no_badges", "Rozet yok.")}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {items.map((r) => {
                const b = badgeMap[r.badge_id] || r.badge || {};
                return (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: `${b.color || "#F5A623"}22`,
                      color: b.color || "#F5A623",
                      border: `1px solid ${b.color || "#F5A623"}88`,
                    }}
                    title={b.description || b.name}
                  >
                    {b.icon_url
                      ? <img src={b.icon_url} alt={b.name} className="w-3 h-3 object-contain" />
                      : <span>{b.icon}</span>
                    }
                    <span>{b.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(r.badge_id); }}
                      className="ml-1 text-red-400 hover:text-red-300"
                      aria-label={t("badges_remove_aria", "Kaldır")}
                    >×</button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
