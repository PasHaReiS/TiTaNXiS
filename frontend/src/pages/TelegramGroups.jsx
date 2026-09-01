import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Save, MessageCircle, RefreshCw } from "lucide-react";

/**
 * Admin > Telegram Grupları — v140.25.
 * Bota kayıtlı her grup için 6 bildirim türü (Yeni Etkinlik, Etkinlik
 * Hatırlatma, Duyurular, Doğum Günü, Streak, Görev) tek tek toggle edilir
 * ve PATCH /api/telegram/groups/{id}/notifications ile kaydedilir.
 */

const NOTIF_KEYS = [
  { key: "yeni_etkinlik",      label_key: "notif_yeni_etkinlik",      label: "Yeni Etkinlik" },
  { key: "etkinlik_hatirlatma",label_key: "notif_etkinlik_hatirlatma",label: "Etkinlik Hatırlatma" },
  { key: "duyurular",          label_key: "notif_duyurular",          label: "Duyurular" },
  { key: "dogum_gunu",         label_key: "notif_dogum_gunu",         label: "Doğum Günü" },
  { key: "streak",             label_key: "notif_streak",             label: "Streak" },
  { key: "gorev",              label_key: "notif_gorev",              label: "Görev" },
];

export default function TelegramGroups() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // chat_id being saved
  // Local pending edits per chat_id
  const [pending, setPending] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/telegram/groups");
      setGroups(r.data || []);
      setPending({});
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const currentValue = (g, key) => {
    const p = pending[g.chat_id];
    if (p && key in p) return p[key];
    return g.notification_settings?.[key] ?? true;
  };

  const toggle = (g, key) => {
    setPending((prev) => ({
      ...prev,
      [g.chat_id]: {
        ...(prev[g.chat_id] || {}),
        [key]: !currentValue(g, key),
      },
    }));
  };

  const save = async (g) => {
    const patch = pending[g.chat_id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSaving(g.chat_id);
    try {
      const merged = { ...(g.notification_settings || {}), ...patch };
      await api.patch(`/telegram/groups/${g.chat_id}/notifications`, {
        notification_settings: merged,
      });
      toast.success(t("tg_groups_saved", "Ayarlar kaydedildi"));
      // Optimistic: patch → committed
      setGroups((prev) => prev.map((x) =>
        x.chat_id === g.chat_id ? { ...x, notification_settings: merged } : x
      ));
      setPending((prev) => { const nx = { ...prev }; delete nx[g.chat_id]; return nx; });
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6" data-testid="tg-groups-page">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-black uppercase tracking-widest flex items-center gap-2"
          style={{ color: "#F5A623", fontFamily: "Cinzel, serif" }}
          data-testid="tg-groups-title"
        >
          <MessageCircle size={22} />
          {t("tg_groups_title", "Telegram Grupları")}
        </h1>
        <button
          onClick={load}
          className="chip text-xs flex items-center gap-1"
          data-testid="tg-groups-refresh"
          disabled={loading}
          style={{ borderColor: "#94A3B8", color: "#94A3B8" }}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {t("tg_groups_refresh", "Yenile")}
        </button>
      </div>

      <p className="text-sm mb-4" style={{ color: "#94A3B8" }} data-testid="tg-groups-help">
        {t(
          "tg_groups_help",
          "Her grup için hangi bildirim türlerinin gönderileceğini seçin. Kapalı olanlar o gruba gönderilmez. Yeni Etkinlik bildirimleri her zaman test grubuna gider — buradaki ayar sadece hatırlatmalar, duyurular vb. için geçerlidir."
        )}
      </p>

      {loading ? (
        <div className="text-center py-10 opacity-70" style={{ color: "#94A3B8" }}>
          {t("loading", "Yükleniyor...")}
        </div>
      ) : groups.length === 0 ? (
        <div
          data-testid="tg-groups-empty"
          className="text-center py-10 rounded-xl"
          style={{
            color: "#94A3B8",
            background: "rgba(15,10,20,0.5)",
            border: "1px dashed rgba(148,163,184,0.35)",
          }}
        >
          {t("tg_groups_empty", "Bota henüz hiçbir grup eklenmemiş. Botu bir Telegram grubuna ekleyin, otomatik olarak burada listelenir.")}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const hasChanges = !!pending[g.chat_id] && Object.keys(pending[g.chat_id]).length > 0;
            return (
              <div
                key={g.chat_id}
                data-testid={`tg-group-${g.chat_id}`}
                className="rounded-xl p-4"
                style={{
                  background: "linear-gradient(180deg, rgba(245,166,35,0.08), rgba(15,10,20,0.65))",
                  border: "1px solid rgba(245,166,35,0.30)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate" style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}>
                      {g.title || t("tg_group_untitled", "İsimsiz Grup")}
                    </div>
                    <div className="text-[10px] font-mono opacity-60" style={{ color: "#94A3B8" }}>
                      chat_id: {g.chat_id}
                    </div>
                  </div>
                  <button
                    data-testid={`tg-group-save-${g.chat_id}`}
                    onClick={() => save(g)}
                    disabled={!hasChanges || saving === g.chat_id}
                    className="chip text-xs flex items-center gap-1 px-3 py-1.5"
                    style={{
                      borderColor: hasChanges ? "#F5A623" : "rgba(148,163,184,0.35)",
                      color: hasChanges ? "#F5A623" : "#94A3B8",
                      background: hasChanges ? "rgba(245,166,35,0.12)" : "transparent",
                      cursor: hasChanges ? "pointer" : "not-allowed",
                    }}
                  >
                    <Save size={12} />
                    {saving === g.chat_id
                      ? t("saving", "Kaydediliyor...")
                      : t("save", "Kaydet")}
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {NOTIF_KEYS.map(({ key, label_key, label }) => {
                    const on = currentValue(g, key);
                    return (
                      <label
                        key={key}
                        data-testid={`tg-group-${g.chat_id}-toggle-${key}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer select-none"
                        style={{
                          background: on ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.06)",
                          border: `1px solid ${on ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.25)"}`,
                          transition: "all 120ms ease-out",
                        }}
                      >
                        <span className="text-xs" style={{ color: "#F5F0E8" }}>
                          {t(label_key, label)}
                        </span>
                        <span
                          role="switch"
                          aria-checked={on}
                          onClick={() => toggle(g, key)}
                          style={{
                            width: 32,
                            height: 18,
                            borderRadius: 999,
                            background: on ? "#22C55E" : "#3f3f46",
                            position: "relative",
                            transition: "background 120ms",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: 2,
                              left: on ? 16 : 2,
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              background: "#fff",
                              transition: "left 120ms",
                            }}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
