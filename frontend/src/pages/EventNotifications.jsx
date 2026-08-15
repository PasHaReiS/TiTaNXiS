import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BellRing, Megaphone } from "lucide-react";
import Header from "@/components/Header";
import EventNotificationsPanel from "@/components/EventNotificationsPanel";
import Announcements from "@/pages/Announcements";

/**
 * Notifications hub — consolidates the two admin push tools that used to
 * live on separate routes:
 *   - Etkinlik Bildirim Panosu (scheduler-driven event reminders)
 *   - Duyuru Gönder Panosu (one-shot announcements w/ image + fan-out)
 *
 * Tab state also mirrors to a `?tab=` query so deep links keep working from
 * the header dropdown, notification bell, and old bookmarks.
 */
export default function EventNotifications() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") === "announcements" ? "announcements" : "events";
  const [tab, setTab] = useState(initial);

  const switchTab = (next) => {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  return (
    <div data-testid="notifications-hub-page">
      <Header title="Bildirimler" />
      <div className="px-3 sm:px-4 max-w-5xl mx-auto">
        <div
          className="flex mb-3 rounded-lg overflow-hidden"
          style={{
            background: "linear-gradient(180deg, rgba(15,8,20,0.85), rgba(10,5,15,0.95))",
            border: "1px solid rgba(120,53,15,0.35)",
          }}
          data-testid="notifications-hub-tabs"
        >
          <button
            data-testid="notif-tab-events"
            onClick={() => switchTab("events")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 transition-all"
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              background: tab === "events"
                ? "linear-gradient(180deg, rgba(249,115,22,0.28), rgba(180,83,9,0.45))"
                : "rgba(20,15,25,0.65)",
              color: tab === "events" ? "#FFEDD5" : "#78716C",
              borderRight: "1px solid rgba(120,53,15,0.35)",
              boxShadow: tab === "events"
                ? "0 0 10px #f97316, inset 0 0 16px rgba(249,115,22,0.20)"
                : "none",
            }}
          >
            <BellRing className="w-3.5 h-3.5" style={{ color: tab === "events" ? "#FCD34D" : "#78716C" }} />
            <span>Etkinlik Bildirimleri</span>
          </button>
          <button
            data-testid="notif-tab-announcements"
            onClick={() => switchTab("announcements")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 transition-all"
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              background: tab === "announcements"
                ? "linear-gradient(180deg, rgba(245,166,35,0.28), rgba(180,83,9,0.45))"
                : "rgba(20,15,25,0.65)",
              color: tab === "announcements" ? "#FFEDD5" : "#78716C",
              boxShadow: tab === "announcements"
                ? "0 0 10px #F5A623, inset 0 0 16px rgba(245,166,35,0.20)"
                : "none",
            }}
          >
            <Megaphone className="w-3.5 h-3.5" style={{ color: tab === "announcements" ? "#FCD34D" : "#78716C" }} />
            <span>Duyurular</span>
          </button>
        </div>

        {tab === "events" && (
          <div data-testid="notif-tab-content-events">
            <EventNotificationsPanel />
          </div>
        )}
        {tab === "announcements" && (
          <div data-testid="notif-tab-content-announcements">
            <Announcements embedded />
          </div>
        )}
      </div>
    </div>
  );
}
