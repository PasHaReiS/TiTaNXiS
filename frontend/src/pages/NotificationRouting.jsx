import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Bell, Save, TestTube } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const NOTIF_TYPES = [
  { key: "etkinlik_hatirlatma", label: "Etkinlik Hatırlatma", emoji: "⏰" },
  { key: "yeni_etkinlik", label: "Yeni Etkinlik", emoji: "🆕" },
  { key: "duyurular", label: "Duyuru", emoji: "📣" },
  { key: "dogum_gunu", label: "Doğum Günü", emoji: "🎂" },
  { key: "streak", label: "Streak", emoji: "🔥" },
  { key: "gorev", label: "Görev", emoji: "✅" },
];

export default function NotificationRouting() {
  const { t } = useTranslation();
  const { data, mutate, isLoading } = useSWR("/notification-routing", fetcher);
  const { data: groups = [] } = useSWR("/telegram/groups", fetcher);
  const [testMode, setTestMode] = useState(false);
  const [testUsername, setTestUsername] = useState("PasHaReisBen");
  const [routes, setRoutes] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setTestMode(!!data.test_mode);
      setTestUsername(data.test_username || "PasHaReisBen");
      const initRoutes = {};
      NOTIF_TYPES.forEach((tp) => {
        const r = (data.routes || {})[tp.key] || {};
        initRoutes[tp.key] = {
          group_chat_id: r.group_chat_id || "",
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
      await api.patch("/notification-routing", {
        test_mode: testMode,
        test_username: testUsername.trim() || "PasHaReisBen",
        routes,
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

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">{t("loading", "Yükleniyor…")}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6" data-testid="notification-routing-page">
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

      {/* Per-type routes */}
      <div className="space-y-3" data-testid="routing-types-section">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {t("routing_types_title", "Bildirim Türleri")}
        </h2>
        {NOTIF_TYPES.map((tp) => {
          const r = routes[tp.key] || { group_chat_id: "", dm_username: "" };
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                    {t("routing_group_label", "Telegram Grubu")}
                  </label>
                  <select
                    data-testid={`routing-group-${tp.key}`}
                    value={r.group_chat_id}
                    onChange={(e) => updateRoute(tp.key, "group_chat_id", e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">{t("routing_group_none", "— Grup yok —")}</option>
                    {groupList.map((g) => (
                      <option key={g.chat_id || g.id} value={String(g.chat_id || "")}>
                        {g.title || g.name || g.chat_id}
                      </option>
                    ))}
                  </select>
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
  const { data, mutate } = useSWR("/reminder-history?limit=20", fetcher);
  const items = data?.items || [];
  const channelBadge = (ch) => {
    if (!ch) return "—";
    if (ch.startsWith("push:")) return "🔔 Push";
    if (ch.startsWith("tg:")) return `📨 TG ${ch.slice(3)}`;
    if (ch === "test_dm") return "🧪 Test DM";
    return ch;
  };
  return (
    <div data-testid="reminder-history-section" className="rounded-lg p-4"
         style={{ background: "rgba(10,6,4,0.72)", border: "1px solid rgba(148,163,184,0.30)" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#C4B5FD" }}>
          🕘 {t("reminder_history_title", "Son 20 Hatırlatma")}
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
      {items.length === 0 ? (
        <div className="text-[10px] text-center py-3" style={{ color: "#94A3B8" }}>
          {t("reminder_history_empty", "Henüz fire edilmiş hatırlatma yok")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: "#94A3B8", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th className="py-1.5 px-2">{t("reminder_history_event", "Etkinlik")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_lead", "Lead")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_channel", "Kanal")}</th>
                <th className="py-1.5 px-2">{t("reminder_history_when", "Zaman")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i} data-testid={`reminder-history-row-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="py-1.5 px-2" style={{ color: "#F5F0E8" }}>{r.event_name}</td>
                  <td className="py-1.5 px-2" style={{ color: "#F5A623" }}>{r.minutes_before} dk</td>
                  <td className="py-1.5 px-2" style={{ color: "#86EFAC" }}>{channelBadge(r.channel)}</td>
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
