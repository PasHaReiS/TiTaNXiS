import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Bell, Save, TestTube, Plus, Trash2, Send, RefreshCw } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const NOTIF_TYPES = [
  { key: "etkinlik_hatirlatma", label: "Etkinlik Hatırlatma", emoji: "⏰" },
  { key: "yeni_etkinlik", label: "Yeni Etkinlik", emoji: "🆕" },
  { key: "duyurular", label: "Duyuru", emoji: "📣" },
  { key: "dogum_gunu", label: "Doğum Günü", emoji: "🎂" },
  { key: "streak", label: "Streak", emoji: "🔥" },
  { key: "gorev", label: "Görev", emoji: "✅" },
];

export default function NotificationRouting({ embedded = false }) {
  const { t } = useTranslation();
  const { data, mutate, isLoading } = useSWR("/notification-routing", fetcher);
  const { data: groups = [], mutate: refetchGroups } = useSWR("/telegram/groups", fetcher);
  const [testMode, setTestMode] = useState(false);
  const [testUsername, setTestUsername] = useState("PasHaReisBen");
  const [routes, setRoutes] = useState({});
  const [saving, setSaving] = useState(false);
  // v136 — Manuel grup ekleme
  const [newGroupChatId, setNewGroupChatId] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [testingGroup, setTestingGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);

  useEffect(() => {
    if (data) {
      setTestMode(!!data.test_mode);
      setTestUsername(data.test_username || "PasHaReisBen");
      const initRoutes = {};
      NOTIF_TYPES.forEach((tp) => {
        const r = (data.routes || {})[tp.key] || {};
        // v136 — Multi-group. Backend `group_chat_ids: []` yeni; legacy
        // `group_chat_id` string'i ilk grupta absorb ediliyor.
        const ids = Array.isArray(r.group_chat_ids) && r.group_chat_ids.length
          ? r.group_chat_ids.map(String)
          : (r.group_chat_id ? [String(r.group_chat_id)] : []);
        initRoutes[tp.key] = {
          group_chat_ids: ids,
          dm_username: r.dm_username || "",
        };
      });
      setRoutes(initRoutes);
    }
  }, [data]);

  const groupList = Array.isArray(groups) ? groups : (groups?.items || []);

  const save = async () => {
    setSaving(true);
    try {
      // v136 — Backend'e hem yeni `group_chat_ids` hem legacy `group_chat_id`
      // gönderiyoruz (server ikisini de kabul ediyor).
      const payloadRoutes = {};
      Object.entries(routes).forEach(([k, v]) => {
        const ids = (v.group_chat_ids || []).map(String);
        payloadRoutes[k] = {
          group_chat_ids: ids,
          group_chat_id: ids[0] || "",
          dm_username: v.dm_username || "",
        };
      });
      await api.patch("/notification-routing", {
        test_mode: testMode,
        test_username: testUsername.trim() || "PasHaReisBen",
        routes: payloadRoutes,
      });
      toast.success(t("routing_saved", "Yönlendirme ayarları kaydedildi"));
      await mutate();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const updateRoute = (typeKey, field, value) => {
    setRoutes((prev) => ({
      ...prev,
      [typeKey]: { ...(prev[typeKey] || {}), [field]: value },
    }));
  };

  // v136 — Multi-select grup toggler (aynı gruba dup ekleme yok).
  const toggleRouteGroup = (typeKey, chatId) => {
    setRoutes((prev) => {
      const cur = prev[typeKey] || { group_chat_ids: [], dm_username: "" };
      const ids = Array.isArray(cur.group_chat_ids) ? [...cur.group_chat_ids] : [];
      const idx = ids.indexOf(chatId);
      if (idx === -1) ids.push(chatId);
      else ids.splice(idx, 1);
      return { ...prev, [typeKey]: { ...cur, group_chat_ids: ids } };
    });
  };

  // v136 — Grup satırındaki 6 bildirim türü switch'i için toggle.
  const toggleGroupNotif = async (group, notifKey) => {
    const cid = String(group.chat_id || group.id || "");
    const cur = { ...(group.notification_settings || {}) };
    const next = { ...cur, [notifKey]: !(cur[notifKey] ?? true) };
    try {
      await api.patch(`/telegram/groups/${encodeURIComponent(cid)}/notifications`, {
        notification_settings: next,
      });
      await refetchGroups();
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  // v136 — Manuel grup ekleme handler'ları
  const addGroup = async () => {
    const cid = newGroupChatId.trim();
    const title = newGroupTitle.trim();
    if (!cid) {
      toast.error(t("routing_group_chat_id_required", "Chat ID boş olamaz"));
      return;
    }
    if (!/^-?\d+$/.test(cid)) {
      toast.error(t("routing_group_chat_id_invalid", "Chat ID sadece rakam (başında '-' olabilir) olmalı"));
      return;
    }
    setAddingGroup(true);
    try {
      const r = await api.post("/telegram/groups", { chat_id: cid, title: title || undefined });
      toast.success(
        r.data?.created
          ? t("routing_group_created", "Grup eklendi")
          : t("routing_group_updated", "Grup güncellendi")
      );
      setNewGroupChatId("");
      setNewGroupTitle("");
      await refetchGroups();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setAddingGroup(false);
    }
  };

  const testGroup = async (chat_id) => {
    setTestingGroup(chat_id);
    try {
      const r = await api.post(`/telegram/groups/${chat_id}/test`, {});
      if (r.data?.ok) {
        toast.success(t("routing_group_test_ok", "Test mesajı gönderildi: {{cid}}", { cid: chat_id }));
      } else {
        toast.error(t("routing_group_test_fail", "Test mesajı gönderilemedi"));
      }
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setTestingGroup(null);
    }
  };

  const deleteGroup = async (chat_id, title) => {
    if (!window.confirm(t("routing_group_delete_confirm", "\"{{name}}\" grubunu bildirim listesinden kaldırmak istiyor musun? (Bot tekrar keşfederse otomatik geri gelir)", { name: title || chat_id }))) {
      return;
    }
    setDeletingGroup(chat_id);
    try {
      await api.delete(`/telegram/groups/${encodeURIComponent(chat_id)}`);
      toast.success(t("routing_group_deleted", "Grup kaldırıldı"));
      // Bu grup şu an route'lardan birinde seçili ise temizle
      setRoutes((prev) => {
        const nx = {};
        Object.entries(prev).forEach(([k, v]) => {
          nx[k] = { ...v };
          if (String(nx[k].group_chat_id) === String(chat_id)) {
            nx[k].group_chat_id = "";
          }
        });
        return nx;
      });
      await refetchGroups();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setDeletingGroup(null);
    }
  };

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">{t("loading", "Yükleniyor…")}</div>;
  }

  return (
    <div className={embedded ? "space-y-6" : "max-w-3xl mx-auto p-4 space-y-6"} data-testid="notification-routing-page">
      {!embedded && (
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6" style={{ color: "#F5A623" }} />
          <div>
            <h1 className="text-2xl font-bold gold-text" style={{ fontFamily: "Cinzel, serif" }}>
              {t("routing_title", "Bildirim Yönlendirme")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("routing_subtitle", "Her bildirim türünün hangi Telegram grubuna ve/veya DM'e gideceğini yönet.")}
            </p>
          </div>
        </div>
      )}

      {/* Test Mode */}
      <div
        data-testid="routing-test-mode-section"
        className="rounded-lg p-4"
        style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.35)" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TestTube className="w-4 h-4" style={{ color: "#F5A623" }} />
            <span className="text-sm font-bold" style={{ color: "#F5A623" }}>
              {t("routing_test_mode", "Test Modu")}
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="routing-test-mode-toggle"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="cursor-pointer"
            />
            <span className="text-xs font-bold" style={{ color: testMode ? "#F87171" : "#94A3B8" }}>
              {testMode ? "AÇIK" : "KAPALI"}
            </span>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {t("routing_test_username_label", "Test DM Kullanıcı Adı")}:
          </span>
          <input
            data-testid="routing-test-username-input"
            value={testUsername}
            onChange={(e) => setTestUsername(e.target.value)}
            className="bg-black/40 border border-amber-500/40 rounded px-2 py-1 text-xs text-white"
            placeholder="PasHaReisBen"
            disabled={!testMode}
          />
        </div>
        <p className="text-[10px] mt-2" style={{ color: testMode ? "#FCA5A5" : "#94A3B8" }}>
          {testMode
            ? t("routing_test_on", `🧪 Test Modu: Sadece @${testUsername} DM alacak, diğer kanallar devre dışı.`, { name: testUsername })
            : t("routing_test_off", "✅ Normal akış: Aşağıdaki yönlendirme kurallarına göre bildirim gider.")}
        </p>
      </div>

      {/* v136 — Manuel Grup Ekleme + Grup Listesi */}
      <div
        data-testid="routing-groups-section"
        className="rounded-lg p-4"
        style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.35)" }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" style={{ color: "#A78BFA" }} />
            <span className="text-sm font-bold" style={{ color: "#C4B5FD" }}>
              {t("routing_groups_title", "Telegram Grupları")}
            </span>
            <span className="chip text-[10px]" style={{ borderColor: "rgba(168,85,247,0.55)", color: "#DDD6FE" }}>
              {groupList.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetchGroups()}
            className="chip text-[10px] flex items-center gap-1"
            data-testid="routing-groups-refresh"
            title={t("refresh", "Yenile")}
          >
            <RefreshCw className="w-3 h-3" /> {t("refresh", "Yenile")}
          </button>
        </div>

        <p className="text-[10px] mb-3" style={{ color: "#94A3B8" }}>
          {t(
            "routing_groups_help",
            "Bot otomatik olarak eklendiği grupları burada listeler. Bot henüz gruba eklenmediyse bile grup Chat ID'sini manuel ekleyip hemen yönlendirmelerde kullanabilirsin."
          )}
        </p>

        {/* Manuel ekleme formu */}
        <div
          className="rounded p-3 mb-3 flex flex-col sm:flex-row gap-2"
          style={{ background: "rgba(15,10,20,0.55)", border: "1px dashed rgba(168,85,247,0.45)" }}
          data-testid="routing-group-add-form"
        >
          <input
            data-testid="routing-group-add-chat-id"
            value={newGroupChatId}
            onChange={(e) => setNewGroupChatId(e.target.value)}
            placeholder={t("routing_group_add_chat_id_placeholder", "Chat ID (örn: -1001234567890)")}
            className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono"
          />
          <input
            data-testid="routing-group-add-title"
            value={newGroupTitle}
            onChange={(e) => setNewGroupTitle(e.target.value)}
            placeholder={t("routing_group_add_title_placeholder", "Grup adı (opsiyonel)")}
            className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          />
          <button
            type="button"
            onClick={addGroup}
            disabled={addingGroup || !newGroupChatId.trim()}
            data-testid="routing-group-add-btn"
            className="chip text-[11px] flex items-center gap-1"
            style={{
              background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
              color: "#0B0704",
              borderColor: "#A78BFA",
              fontWeight: 800,
              opacity: addingGroup || !newGroupChatId.trim() ? 0.5 : 1,
              cursor: addingGroup || !newGroupChatId.trim() ? "not-allowed" : "pointer",
            }}
          >
            <Plus className="w-3 h-3" />
            {addingGroup ? t("adding", "Ekleniyor…") : t("routing_group_add_btn", "Grup Ekle")}
          </button>
        </div>

        {/* Mevcut grup listesi */}
        {groupList.length === 0 ? (
          <div
            className="text-center text-[11px] py-3 rounded"
            style={{ background: "rgba(15,10,20,0.4)", border: "1px dashed rgba(148,163,184,0.25)", color: "#94A3B8" }}
            data-testid="routing-groups-empty"
          >
            {t("routing_groups_empty", "Henüz grup yok. Botu Telegram grubuna ekle veya yukarıdan manuel Chat ID gir.")}
          </div>
        ) : (
          <div className="space-y-1.5" data-testid="routing-groups-list">
            {groupList.map((g) => {
              const cid = String(g.chat_id || g.id || "");
              const isManual = !!g.manual;
              return (
                <div
                  key={cid}
                  data-testid={`routing-group-row-${cid}`}
                  className="rounded p-2 flex items-center gap-2 flex-wrap"
                  style={{
                    background: isManual ? "rgba(168,85,247,0.10)" : "rgba(148,163,184,0.08)",
                    border: `1px solid ${isManual ? "rgba(168,85,247,0.4)" : "rgba(148,163,184,0.28)"}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold truncate" style={{ color: "#F5F0E8" }}>
                      {g.title || t("routing_group_untitled", "İsimsiz Grup")}
                    </div>
                    <div className="text-[9px] font-mono" style={{ color: "#94A3B8" }}>
                      chat_id: {cid}
                      {isManual && (
                        <span
                          className="ml-2 px-1.5 py-0.5 rounded uppercase font-bold"
                          style={{ background: "rgba(168,85,247,0.22)", color: "#DDD6FE", fontFamily: "sans-serif" }}
                        >
                          {t("routing_group_manual_badge", "Manuel")}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => testGroup(cid)}
                    disabled={testingGroup === cid}
                    className="chip text-[10px] flex items-center gap-1"
                    data-testid={`routing-group-test-${cid}`}
                    title={t("routing_group_test_title", "Bu gruba test mesajı gönder")}
                    style={{ borderColor: "#38BDF8", color: "#38BDF8", opacity: testingGroup === cid ? 0.5 : 1 }}
                  >
                    <Send className="w-3 h-3" />
                    {testingGroup === cid ? t("sending", "Gönderiliyor…") : t("routing_group_test_btn", "Test")}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteGroup(cid, g.title)}
                    disabled={deletingGroup === cid}
                    className="chip text-[10px] flex items-center gap-1"
                    data-testid={`routing-group-delete-${cid}`}
                    title={t("routing_group_delete_title", "Grubu kaldır")}
                    style={{ borderColor: "#EF4444", color: "#F87171", opacity: deletingGroup === cid ? 0.5 : 1 }}
                  >
                    <Trash2 className="w-3 h-3" />
                    {deletingGroup === cid ? t("deleting", "Kaldırılıyor…") : t("delete", "Sil")}
                  </button>
                  {/* v136 — Bu gruba giden 6 bildirim türünün aç/kapat switch'leri */}
                  <div className="w-full flex flex-wrap gap-1.5 mt-1" data-testid={`routing-group-notifs-${cid}`}>
                    {NOTIF_TYPES.map((tp) => {
                      const on = (g.notification_settings || {})[tp.key] ?? true;
                      return (
                        <button
                          key={tp.key}
                          type="button"
                          onClick={() => toggleGroupNotif(g, tp.key)}
                          data-testid={`routing-group-notif-toggle-${cid}-${tp.key}`}
                          className="chip text-[9px] flex items-center gap-1"
                          title={t(`routing_type_${tp.key}`, tp.label)}
                          style={{
                            background: on ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.06)",
                            borderColor: on ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.35)",
                            color: on ? "#86EFAC" : "#94A3B8",
                            opacity: on ? 1 : 0.7,
                          }}
                        >
                          <span>{tp.emoji}</span>
                          <span>{on ? "✓" : "✕"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-type routes */}
      <div className="space-y-3" data-testid="routing-types-section">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {t("routing_types_title", "Bildirim Türleri")}
        </h2>
        {NOTIF_TYPES.map((tp) => {
          const r = routes[tp.key] || { group_chat_ids: [], dm_username: "" };
          const selectedIds = Array.isArray(r.group_chat_ids) ? r.group_chat_ids : [];
          return (
            <div
              key={tp.key}
              data-testid={`routing-type-${tp.key}`}
              className="rounded-lg p-3"
              style={{ background: "rgba(10,6,4,0.72)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="text-sm font-bold mb-2 flex items-center gap-2">
                <span>{tp.emoji}</span>
                <span style={{ color: "#F5F0E8" }}>{t(`routing_type_${tp.key}`, tp.label)}</span>
                {selectedIds.length > 0 && (
                  <span className="chip text-[9px]" style={{ borderColor: "rgba(168,85,247,0.55)", color: "#DDD6FE" }}>
                    {t("routing_selected_groups", "{{n}} grup seçili", { n: selectedIds.length })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                    {t("routing_groups_multi_label", "Telegram Grupları (birden fazla seçilebilir)")}
                  </label>
                  {groupList.length === 0 ? (
                    <div className="text-[10px] italic" style={{ color: "#94A3B8" }}>
                      {t("routing_groups_none_available", "Henüz grup yok — yukarıdan ekle")}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5" data-testid={`routing-groups-select-${tp.key}`}>
                      {groupList.map((g) => {
                        const cid = String(g.chat_id || g.id || "");
                        const active = selectedIds.includes(cid);
                        return (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => toggleRouteGroup(tp.key, cid)}
                            data-testid={`routing-group-toggle-${tp.key}-${cid}`}
                            className="chip text-[10px] flex items-center gap-1"
                            style={
                              active
                                ? {
                                    background: "linear-gradient(135deg,#A78BFA,#7C3AED)",
                                    color: "#0B0704",
                                    borderColor: "#A78BFA",
                                    fontWeight: 800,
                                  }
                                : { borderColor: "rgba(148,163,184,0.4)", color: "#CBD5E1" }
                            }
                            title={`chat_id: ${cid}`}
                          >
                            {active ? "✓" : "+"} {g.title || g.name || cid}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                    {t("routing_dm_label", "DM (Telegram Kullanıcı Adı)")}
                  </label>
                  <input
                    data-testid={`routing-dm-${tp.key}`}
                    value={r.dm_username}
                    onChange={(e) => updateRoute(tp.key, "dm_username", e.target.value)}
                    placeholder="ornek: PasHaReisBen"
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <button
          data-testid="routing-save-btn"
          onClick={save}
          disabled={saving}
          className="chip flex items-center gap-2 font-bold text-sm"
          style={{
            background: "linear-gradient(135deg, #F5A623, #E74C1A)",
            color: "#0B0704",
            border: "none",
            padding: "10px 20px",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Save className="w-4 h-4" />
          {saving ? t("saving", "Kaydediliyor…") : t("save", "Kaydet")}
        </button>
      </div>

      {/* v140.51 — Reminder History (QA visibility) */}
      <ReminderHistorySection />
    </div>
  );
}


function ReminderHistorySection() {
  const { t } = useTranslation();
  const [notifType, setNotifType] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const params = new URLSearchParams();
  params.set("limit", "50");
  if (notifType) params.set("notif_type", notifType);
  if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
  if (dateTo) params.set("date_to", new Date(dateTo).toISOString());
  const { data, mutate } = useSWR(`/reminder-history?${params.toString()}`, fetcher);
  const items = data?.items || [];
  const channelBadge = (ch) => {
    if (!ch) return "—";
    if (ch.startsWith("push:")) return "🔔 Push";
    if (ch.startsWith("tg:")) return `📨 TG ${ch.slice(3)}`;
    if (ch === "test_dm") return "🧪 Test DM";
    if (ch.startsWith("dm:")) return `💬 DM ${ch.slice(3)}`;
    return ch;
  };
  const typeLabel = (nt) => ({
    etkinlik_hatirlatma: "⏰ Hatırlatma",
    yeni_etkinlik: "🆕 Yeni Etkinlik",
    duyurular: "📣 Duyuru",
    dogum_gunu: "🎂 Doğum Günü",
    streak: "🔥 Streak",
    gorev: "✅ Görev",
  })[nt] || nt || "—";
  return (
    <div data-testid="reminder-history-section" className="rounded-lg p-4"
         style={{ background: "rgba(10,6,4,0.72)", border: "1px solid rgba(148,163,184,0.30)" }}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#C4B5FD" }}>
          🕘 {t("reminder_history_title", "Hatırlatma Geçmişi")}
        </h2>
        <button
          data-testid="reminder-history-refresh"
          onClick={() => mutate()}
          className="chip text-[10px]"
          style={{ borderColor: "rgba(148,163,184,0.5)", color: "#E5E7EB" }}
        >
          {t("refresh", "Yenile")}
        </button>
      </div>
      {/* v140.53 — Filtreler */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <select
          data-testid="reminder-history-filter-type"
          value={notifType}
          onChange={(e) => setNotifType(e.target.value)}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
        >
          <option value="">{t("reminder_history_filter_all", "Tüm türler")}</option>
          <option value="etkinlik_hatirlatma">⏰ {t("routing_type_etkinlik_hatirlatma", "Etkinlik Hatırlatma")}</option>
          <option value="yeni_etkinlik">🆕 {t("routing_type_yeni_etkinlik", "Yeni Etkinlik")}</option>
          <option value="duyurular">📣 {t("routing_type_duyurular", "Duyuru")}</option>
          <option value="dogum_gunu">🎂 {t("routing_type_dogum_gunu", "Doğum Günü")}</option>
          <option value="streak">🔥 {t("routing_type_streak", "Streak")}</option>
          <option value="gorev">✅ {t("routing_type_gorev", "Görev")}</option>
        </select>
        <input
          type="datetime-local"
          data-testid="reminder-history-filter-from"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder={t("reminder_history_filter_from", "Başlangıç")}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
        />
        <input
          type="datetime-local"
          data-testid="reminder-history-filter-to"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder={t("reminder_history_filter_to", "Bitiş")}
          className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white"
        />
      </div>
      {items.length === 0 ? (
        <div className="text-[10px] text-center py-3" style={{ color: "#94A3B8" }}>
          {t("reminder_history_empty", "Henüz fire edilmiş hatırlatma yok")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: "#94A3B8", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th className="py-1.5 px-2">{t("reminder_history_type", "Tür")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_event", "Etkinlik")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_channel", "Hedef")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_status", "Durum")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_when", "Zaman")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i} data-testid={`reminder-history-row-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="py-1.5 px-2" style={{ color: "#F5A623" }}>{typeLabel(r.notif_type)}</td>
                  <td className="py-1.5 px-2" style={{ color: "#F5F0E8" }}>
                    {r.event_name}
                    {r.minutes_before ? <span className="ml-2 opacity-70">({r.minutes_before} dk)</span> : null}
                  </td>
                  <td className="py-1.5 px-2" style={{ color: "#86EFAC" }}>{channelBadge(r.channel)}</td>
                  <td className="py-1.5 px-2">
                    {r.success === true ? <span style={{ color: "#22C55E" }}>✓ {t("reminder_history_ok", "Başarılı")}</span>
                      : r.success === false ? <span style={{ color: "#F87171" }}>✗ {t("reminder_history_fail", "Başarısız")}</span>
                      : <span style={{ color: "#94A3B8" }}>—</span>}
                  </td>
                  <td className="py-1.5 px-2" style={{ color: "#94A3B8" }}>
                    {r.sent_at ? new Date(r.sent_at).toLocaleString("tr-TR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
