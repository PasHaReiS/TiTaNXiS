import React from "react";
import Header from "@/components/Header";
import LiveDashboard from "@/components/LiveDashboard";
import { useTranslation } from "react-i18next";

export default function LiveDashboardPage() {
  const { t } = useTranslation();
  return (
    <div data-testid="live-dashboard-page">
      <Header title={t("live_dashboard")} />
      <div className="px-4">
        <LiveDashboard />
      </div>
    </div>
  );
}
