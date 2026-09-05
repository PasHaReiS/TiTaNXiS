import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import EventNotificationsPanel from "@/components/EventNotificationsPanel";
import PushPrefsCard from "@/components/PushPrefsCard";
import Announcements from "@/pages/Announcements";
import NotificationRouting from "@/pages/NotificationRouting";

/**
 * Notifications hub — consolidates the admin push tools:
 *   - Etkinlik Bildirim Panosu (scheduler-driven event reminders)
 *   - Duyuru Gönder Panosu (one-shot announcements w/ image + fan-out)
 *   - Yönlendirme (v136 — moved from radial menu into this tabbed hub)
 *
 * Tab state also mirrors to a `?tab=` query so deep links keep working from
 * the header dropdown, notification bell, and old bookmarks.
 */
export default function EventNotifications() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const initial =
    rawTab === "announcements" ? "announcements"
    : rawTab === "routing" ? "routing"
    : "events";
  const [tab, setTab] = useState(initial);

  const switchTab = (next) => {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const tabDef = [
    {
      key: "events",
      testid: "notif-tab-events",
      emoji: "🔔",
      labelKey: "notif_tab_events",
      fallback: "Etkinlik Bildirimleri",
      accent: "#f97316",
    },
    {
      key: "announcements",
      testid: "notif-tab-announcements",
      emoji: "📢",
      labelKey: "notif_tab_announcements",
      fallback: "Duyurular",
      accent: "#F5A623",
    },
    {
      key: "routing",
      testid: "notif-tab-routing",
      emoji: "🛰️",
      labelKey: "nav_notif_routing",
      fallback: "Yönlendirme",
      accent: "#A78BFA",
    },
  ];

  return (
    <div data-testid="notifications-hub-page">
      <Header title={t("nav_notifications_hub", "Bildirimler")} />
      <div className="px-3 sm:px-4 max-w-5xl mx-auto">
        <div
          className="flex mb-3 rounded-lg overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(15,8,20,0.85), rgba(10,5,15,0.95))",
            border: "1px solid rgba(120,53,15,0.35)",
          }}
          data-testid="notifications-hub-tabs"
        >
          {tabDef.map((tb, i) => {
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                data-testid={tb.testid}
                onClick={() => switchTab(tb.key)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 transition-all"
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                  background: active
                    ? `linear-gradient(180deg, ${tb.accent}47, ${tb.accent}72)`
                    : "rgba(20,15,25,0.65)",
                  color: active ? "#FFEDD5" : "#78716C",
                  borderRight: i < tabDef.length - 1 ? "1px solid rgba(120,53,15,0.35)" : "none",
                  boxShadow: active
                    ? `0 0 10px ${tb.accent}, inset 0 0 16px ${tb.accent}33`
                    : "none",
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 14, filter: active ? "none" : "grayscale(0.5)" }}>
                  {tb.emoji}
                </span>
                <span>{t(tb.labelKey, tb.fallback)}</span>
              </button>
            );
          })}
        </div>

        {tab === "events" && (
          <div className="space-y-3" data-testid="notif-tab-content-events">
            <PushPrefsCard />
            <EventNotificationsPanel />
          </div>
        )}
        {tab === "announcements" && (
          <div data-testid="notif-tab-content-announcements">
            <Announcements embedded />
          </div>
        )}
        {tab === "routing" && (
          <div data-testid="notif-tab-content-routing">
            <NotificationRouting embedded />
          </div>
        )}
      </div>
    </div>
  );
}
