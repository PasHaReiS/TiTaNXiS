import React from "react";
import Header from "@/components/Header";
import BulkAdminActions from "@/components/BulkAdminActions";
import PushSubscribeCard from "@/components/PushSubscribeCard";
import NotificationSetupWizard from "@/components/NotificationSetupWizard";
import { useTranslation } from "react-i18next";

/**
 * Panel (LiveDashboard) — trimmed to the user's own push subscription +
 * bulk admin actions. Event notification preferences moved to Bildirimler >
 * Etkinlik Bildirimleri; widget board removed entirely per user request.
 */
export default function LiveDashboardPage() {
  const { t } = useTranslation();
  return (
    <div data-testid="live-dashboard-page">
      <Header title={t("live_dashboard")} />
      <div className="px-4 space-y-3">
        <PushSubscribeCard />
        <BulkAdminActions />
      </div>
      <NotificationSetupWizard />
    </div>
  );
}
