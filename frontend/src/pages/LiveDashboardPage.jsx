import React from "react";
import Header from "@/components/Header";
import WidgetGrid from "@/components/WidgetGrid";
import BulkAdminActions from "@/components/BulkAdminActions";
import PushSubscribeCard from "@/components/PushSubscribeCard";
import PushPrefsCard from "@/components/PushPrefsCard";
import PushBroadcastPanel from "@/components/PushBroadcastPanel";
import NotificationSetupWizard from "@/components/NotificationSetupWizard";
import { useTranslation } from "react-i18next";

export default function LiveDashboardPage() {
  const { t } = useTranslation();
  return (
    <div data-testid="live-dashboard-page">
      <Header title={t("live_dashboard")} />
      <div className="px-4">
        <PushSubscribeCard />
        <PushPrefsCard />
        <PushBroadcastPanel />
        <WidgetGrid />
        <BulkAdminActions />
      </div>
      <NotificationSetupWizard />
    </div>
  );
}
