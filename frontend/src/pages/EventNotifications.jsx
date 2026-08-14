import React from "react";
import Header from "@/components/Header";
import EventNotificationsPanel from "@/components/EventNotificationsPanel";
import { useTranslation } from "react-i18next";

/**
 * Dedicated Event Notifications page — reuses the panel component that used
 * to live inside User Management. Reachable via header dropdown between
 * "Dashboard" and "VIP Destek".
 */
export default function EventNotifications() {
  const { t } = useTranslation();
  return (
    <div data-testid="event-notifications-page">
      <Header title={t("nav_event_notifications") || "Etkinlik Bildirimleri"} />
      <div className="px-4">
        <EventNotificationsPanel />
      </div>
    </div>
  );
}
