import React from "react";
import "@/App.css";
import "@/lib/api"; // register axios interceptors
import "@/i18n"; // initialize i18n
import "@/firebase"; // initialize Firebase Analytics
import i18n from "@/i18n";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "sonner";
import { trackPageView } from "@/firebase";
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
import VipSupport from "@/pages/VipSupport";
import Dashboard from "@/pages/Dashboard";
import EventNotifications from "@/pages/EventNotifications";
import AccessDenied from "@/pages/AccessDenied";
import Members from "@/pages/Members";
import Events from "@/pages/Events";
import Announcements from "@/pages/Announcements";
import Login from "@/pages/Login";
import UserManagement from "@/pages/UserManagement";
import OcrHistory from "@/pages/OcrHistory";
import Alliances from "@/pages/Alliances";
import Profile from "@/pages/Profile";
import PushSoundListener from "@/components/PushSoundListener";
import MotionPage from "@/components/MotionPage";

function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0A0806" }}
      data-testid="loading-screen"
    >
      <video
        src={process.env.REACT_APP_LOADING_VIDEO_URL || "/brand/loading.mp4"}
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

function RequireAdminOrEditor({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const canView = user.role === "admin" || user.can_edit === true;
  if (!canView) return <AccessDenied />;
  return children;
}

function AppShell() {
  const { loading, user } = useAuth();
  const location = useLocation();
  React.useEffect(() => {
    trackPageView(location.pathname, document.title);
  }, [location.pathname]);
  // Hydrate UI language from the logged-in user's saved preferred_language so
  // the header switcher, i18n bundle, and backend DeepL DM auto-translate all
  // agree on the same code without the user having to re-select on every device.
  React.useEffect(() => {
    const pref = (user?.preferred_language || "").trim().toLowerCase();
    if (pref && pref !== i18n.language) {
      localStorage.setItem("ol_lang", pref);
      i18n.changeLanguage(pref).catch(() => {});
    }
  }, [user?.preferred_language]);
  if (loading) return <div className="app-shell"><LoadingScreen /></div>;
  return (
    <div className="app-shell">
      <Layout>
        <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<MotionPage><Leaderboard /></MotionPage>} />
          <Route path="/komutanlar" element={<MotionPage><Commanders /></MotionPage>} />
          <Route path="/puanlar" element={<RequireAuth><MotionPage><PointsList /></MotionPage></RequireAuth>} />
          <Route path="/puan-ekle" element={<RequireAuth><MotionPage><AddPoints /></MotionPage></RequireAuth>} />
          <Route path="/puanlar-hakkinda" element={<RequireAuth><MotionPage><PointsAbout /></MotionPage></RequireAuth>} />
          <Route path="/puan-hesaplama" element={<MotionPage><PointCalcPage /></MotionPage>} />
          <Route path="/uyeler" element={<RequireAuth><MotionPage><Members /></MotionPage></RequireAuth>} />
          <Route path="/etkinlikler" element={<RequireAuth><MotionPage><Events /></MotionPage></RequireAuth>} />
          <Route path="/duyurular" element={<MotionPage><Announcements /></MotionPage>} />
          <Route path="/kullanicilar" element={<RequireAdmin><MotionPage><UserManagement /></MotionPage></RequireAdmin>} />
          <Route path="/profil" element={<RequireAuth><MotionPage><Profile /></MotionPage></RequireAuth>} />
          <Route path="/gosterge-paneli" element={<RequireAuth><MotionPage><LiveDashboardPage /></MotionPage></RequireAuth>} />
          <Route path="/vip-destek" element={<MotionPage><VipSupport /></MotionPage>} />
          <Route path="/dashboard" element={<RequireAdminOrEditor><MotionPage><Dashboard /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/etkinlik-bildirimleri" element={<RequireAdminOrEditor><MotionPage><EventNotifications /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/ocr/history" element={<RequireAdminOrEditor><MotionPage><OcrHistory /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/ittifaklar" element={<RequireAdminOrEditor><MotionPage><Alliances /></MotionPage></RequireAdminOrEditor>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AnimatePresence>
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
