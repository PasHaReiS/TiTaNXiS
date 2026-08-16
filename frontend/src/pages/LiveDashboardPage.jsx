import React from "react";
import Header from "@/components/Header";
import WidgetGrid from "@/components/WidgetGrid";
import BulkAdminActions from "@/components/BulkAdminActions";
import PushSubscribeCard from "@/components/PushSubscribeCard";
import PushPrefsCard from "@/components/PushPrefsCard";
import NotificationSetupWizard from "@/components/NotificationSetupWizard";
import { useTranslation } from "react-i18next";

/**
 * Panel (LiveDashboard) — simplified per user request. Broadcast + announcement
 * tooling now lives inside the Bildirimler hub (matching the menu label);
 * Panel is scoped to the user's own push subscription + prefs, the widget
 * board, and quick bulk admin actions.
 */
export default function LiveDashboardPage() {
  const { t } = useTranslation();
  return (
    <div data-testid="live-dashboard-page">
      <Header title={t("live_dashboard")} />
      <div className="px-4 space-y-3">
        <PushSubscribeCard />
        <PushPrefsCard />
        <WidgetGrid />
        <BulkAdminActions />
      </div>
      <NotificationSetupWizard />
    </div>
  );
}
