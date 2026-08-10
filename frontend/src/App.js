import React from "react";
import "@/App.css";
import "@/lib/api"; // register axios interceptors
import "@/i18n"; // initialize i18n
import i18n from "@/i18n";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Leaderboard from "@/pages/Leaderboard";
import Commanders from "@/pages/Commanders";
import LiveDashboardPage from "@/pages/LiveDashboardPage";
import PointsList from "@/pages/PointsList";
import AddPoints from "@/pages/AddPoints";
import PointsAbout from "@/pages/PointsAbout";
import PointCalcPage from "@/pages/PointCalcPage";
import PublicPointCalcPage from "@/pages/PublicPointCalcPage";
import WidgetLibrary from "@/pages/WidgetLibrary";
import VipSupport from "@/pages/VipSupport";
import Members from "@/pages/Members";
import Events from "@/pages/Events";
import Login from "@/pages/Login";
import UserManagement from "@/pages/UserManagement";
import Profile from "@/pages/Profile";
import PushSoundListener from "@/components/PushSoundListener";

function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0A0806" }}
      data-testid="loading-screen"
    >
      <video
        src="https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/f650420e34f040c39be51cc046655cc0_1000074064.mp4"
        autoPlay
        muted
        loop
        playsInline
        data-testid="loading-video"
        style={{
          maxWidth: "min(480px, 90vw)",
          width: "100%",
          height: "auto",
          borderRadius: 12,
          filter: "drop-shadow(0 0 40px rgba(155,89,182,0.45)) drop-shadow(0 0 80px rgba(255,107,0,0.25))",
        }}
      />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function AppShell() {
  const { loading } = useAuth();
  if (loading) return <div className="app-shell"><LoadingScreen /></div>;
  return (
    <div className="app-shell">
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Leaderboard />} />
          <Route path="/komutanlar" element={<Commanders />} />
          <Route path="/puanlar" element={<RequireAuth><PointsList /></RequireAuth>} />
          <Route path="/puan-ekle" element={<RequireAuth><AddPoints /></RequireAuth>} />
          <Route path="/puanlar-hakkinda" element={<RequireAuth><PointsAbout /></RequireAuth>} />
          <Route path="/puan-hesaplama" element={<PointCalcPage />} />
          <Route path="/uyeler" element={<RequireAuth><Members /></RequireAuth>} />
          <Route path="/etkinlikler" element={<RequireAuth><Events /></RequireAuth>} />
          <Route path="/kullanicilar" element={<RequireAdmin><UserManagement /></RequireAdmin>} />
          <Route path="/profil" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/gosterge-paneli" element={<RequireAuth><LiveDashboardPage /></RequireAuth>} />
          <Route path="/widget-kitapligi" element={<RequireAuth><WidgetLibrary /></RequireAuth>} />
          <Route path="/vip-destek" element={<VipSupport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </div>
  );
}

export default function App() {
  React.useEffect(() => {
    const apply = (lng) => {
      const dir = lng === "ar" ? "rtl" : "ltr";
      document.documentElement.setAttribute("dir", dir);
      document.documentElement.setAttribute("lang", lng);
    };
    apply(i18n.language);
    i18n.on("languageChanged", apply);
    return () => i18n.off("languageChanged", apply);
  }, []);
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/public/puan-hesaplama/:id" element={<PublicPointCalcPage />} />
            <Route path="*" element={<AppShell />} />
          </Routes>
          <PushSoundListener />
          <Toaster theme="dark" position="top-center" richColors closeButton /></BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
