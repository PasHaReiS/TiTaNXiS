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
import WizardAnalytics from "@/pages/WizardAnalytics";
import CronHealth from "@/pages/CronHealth";
import DuplicateMembers from "@/pages/DuplicateMembers";
import AuditLog from "@/pages/AuditLog";
import NotFound from "@/pages/NotFound";
import { UndoProvider } from "@/context/UndoContext";
import PublicFolderLeaderboard from "@/pages/PublicFolderLeaderboard";
import VipSupport from "@/pages/VipSupport";
import Dashboard from "@/pages/Dashboard";
import EventNotifications from "@/pages/EventNotifications";
import AccessDenied from "@/pages/AccessDenied";
import LockedPage from "@/pages/LockedPage";
import GuildChat from "@/pages/GuildChat";
import VoiceRooms from "@/pages/VoiceRooms";
import SesInvite from "@/pages/SesInvite";
import Members from "@/pages/Members";
import MemberHome from "@/pages/MemberHome";
import Events from "@/pages/Events";
import Announcements from "@/pages/Announcements";
import BadgeManagement from "@/pages/BadgeManagement";
import { BADGES_ENABLED } from "@/lib/features";
import TelegramTemplates from "@/pages/TelegramTemplates";
import Templates from "@/pages/Templates";
import MemberAddOcr from "@/pages/MemberAddOcr";
import PublicGuildProfile from "@/pages/PublicGuildProfile";
import AdminTodos from "@/pages/AdminTodos";
import GuildRules from "@/pages/GuildRules";
import IssueCertificate from "@/pages/IssueCertificate";
import VerifyCertificate from "@/pages/VerifyCertificate";
import Login from "@/pages/Login";
import UserManagement from "@/pages/UserManagement";
import OcrHistory from "@/pages/OcrHistory";
import Alliances from "@/pages/Alliances";
import Profile from "@/pages/Profile";
import Reports from "@/pages/Reports";
import Polls from "@/pages/Polls";
import Signup from "@/pages/Signup";
import SvSTracker from "@/pages/SvSTracker";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import AydinlatmaMetni from "@/pages/AydinlatmaMetni";
import Tanitim from "@/pages/Tanitim";
import TelegramGroups from "@/pages/TelegramGroups";
import NotificationRouting from "@/pages/NotificationRouting";
import PushAnalytics from "@/pages/PushAnalytics";
import PushSoundListener from "@/components/PushSoundListener";
import LegalFooter from "@/components/LegalFooter";
import MotionPage from "@/components/MotionPage";
import CanonicalTag from "@/components/CanonicalTag";

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
  const { user, loading, isGuest } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  // v136 — Ziyaretçi ise kilit ekranı göster, login'e yönlendirme yapma.
  if (!user && isGuest) return <LockedPage />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading, isGuest } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user && isGuest) return <LockedPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function RequireAdminOrEditor({ children }) {
  const { user, loading, isGuest } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user && isGuest) return <LockedPage />;
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
        <CanonicalTag />
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
          <Route path="/admin/duyurular" element={<RequireAdmin><MotionPage><Announcements /></MotionPage></RequireAdmin>} />
          {BADGES_ENABLED && <Route path="/rozetler" element={<RequireAdmin><MotionPage><BadgeManagement /></MotionPage></RequireAdmin>} />}
          {BADGES_ENABLED && <Route path="/admin/rozetler" element={<RequireAdmin><MotionPage><BadgeManagement /></MotionPage></RequireAdmin>} />}
          <Route path="/admin/telegram-sablonlar" element={<RequireAdmin><MotionPage><Templates /></MotionPage></RequireAdmin>} />
          <Route path="/admin/telegram-gruplari" element={<RequireAdmin><MotionPage><TelegramGroups /></MotionPage></RequireAdmin>} />
          <Route path="/admin/bildirim-yonlendirme" element={<RequireAdmin><MotionPage><NotificationRouting /></MotionPage></RequireAdmin>} />
          <Route path="/admin/push-analitik" element={<RequireAdmin><MotionPage><PushAnalytics /></MotionPage></RequireAdmin>} />
          <Route path="/admin/push-analytics" element={<RequireAdmin><MotionPage><PushAnalytics /></MotionPage></RequireAdmin>} />
          <Route path="/admin/wizard-analytics" element={<RequireAdmin><MotionPage><WizardAnalytics /></MotionPage></RequireAdmin>} />
          <Route path="/admin/cron-health" element={<RequireAdmin><MotionPage><CronHealth /></MotionPage></RequireAdmin>} />
          <Route path="/admin/duplicate-members" element={<RequireAdmin><MotionPage><DuplicateMembers /></MotionPage></RequireAdmin>} />
          <Route path="/admin/duplicate-uyeler" element={<RequireAdmin><MotionPage><DuplicateMembers /></MotionPage></RequireAdmin>} />
          <Route path="/admin/audit-log" element={<RequireAdmin><MotionPage><AuditLog /></MotionPage></RequireAdmin>} />
          <Route path="*" element={<NotFound />} />
          <Route path="/sablonlar" element={<RequireAdmin><MotionPage><Templates /></MotionPage></RequireAdmin>} />
          <Route path="/uye-ekle-ocr" element={<RequireAdmin><MotionPage><MemberAddOcr /></MotionPage></RequireAdmin>} />
          <Route path="/admin/gorevler" element={<RequireAdmin><MotionPage><AdminTodos /></MotionPage></RequireAdmin>} />
          <Route path="/admin/sertifika-ver" element={<RequireAdmin><MotionPage><IssueCertificate /></MotionPage></RequireAdmin>} />
          <Route path="/kurallar" element={<MotionPage><GuildRules /></MotionPage>} />
          <Route path="/sohbet" element={<RequireAuth><MotionPage><GuildChat /></MotionPage></RequireAuth>} />
          <Route path="/sesli-kanallar" element={<MotionPage><VoiceRooms /></MotionPage>} />
          <Route path="/ses/:roomName" element={<MotionPage><SesInvite /></MotionPage>} />
          <Route path="/admin/uyeler" element={<RequireAdmin><MotionPage><Members /></MotionPage></RequireAdmin>} />
          <Route path="/arsiv" element={<RequireAuth><MotionPage><Events /></MotionPage></RequireAuth>} />
          <Route path="/katilim" element={<RequireAdmin><MotionPage><Reports /></MotionPage></RequireAdmin>} />
          <Route path="/kullanicilar" element={<RequireAdmin><MotionPage><UserManagement /></MotionPage></RequireAdmin>} />
          <Route path="/profil" element={<RequireAuth><MotionPage><Profile /></MotionPage></RequireAuth>} />
          <Route path="/gosterge-paneli" element={<RequireAuth><MotionPage><LiveDashboardPage /></MotionPage></RequireAuth>} />
          <Route path="/vip-destek" element={<MotionPage><VipSupport /></MotionPage>} />
          <Route path="/dashboard" element={<RequireAdminOrEditor><MotionPage><Dashboard /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/etkinlik-bildirimleri" element={<RequireAdminOrEditor><MotionPage><EventNotifications /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/ocr/history" element={<RequireAdminOrEditor><MotionPage><OcrHistory /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/ittifaklar" element={<RequireAdminOrEditor><MotionPage><Alliances /></MotionPage></RequireAdminOrEditor>} />
          <Route path="/raporlar" element={<RequireAdmin><MotionPage><Reports /></MotionPage></RequireAdmin>} />
          <Route path="/anketler" element={<RequireAuth><MotionPage><Polls /></MotionPage></RequireAuth>} />
          <Route path="/kayit/:token" element={<MotionPage><Signup /></MotionPage>} />
          {/* v140.35 — Telegram /davet linki `/kayit?davet=CODE` — parametresiz
              versiyon Login sayfasına düşer, query string orada okunup
              register modal'ı ön-doldurulmuş şekilde açılır. */}
          <Route path="/kayit" element={<MotionPage><Login /></MotionPage>} />
          <Route path="/lonca" element={<MotionPage><PublicGuildProfile /></MotionPage>} />
          <Route path="/guild" element={<MotionPage><PublicGuildProfile /></MotionPage>} />
          <Route path="/svs" element={<RequireAuth><MotionPage><SvSTracker /></MotionPage></RequireAuth>} />
          <Route path="/anasayfa" element={<RequireAuth><MotionPage><MemberHome /></MotionPage></RequireAuth>} />
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
      <UndoProvider>
        <ThemeProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/public/puan-hesaplama/:id" element={<PublicPointCalcPage />} />
            <Route path="/public/folder/:folderId" element={<PublicFolderLeaderboard />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/aydinlatma-metni" element={<AydinlatmaMetni />} />
            <Route path="/tanitim" element={<Tanitim />} />
            <Route path="/sertifika/:token" element={<VerifyCertificate />} />
            <Route path="*" element={<AppShell />} />
          </Routes>
          <PushSoundListener />
          <LegalFooter />
          <Toaster theme="dark" position="top-center" richColors closeButton /></BrowserRouter>
        </ThemeProvider>
      </UndoProvider>
    </AuthProvider>
  );
}
