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
import HomePage from "@/pages/HomePage";
import PointsList from "@/pages/PointsList";
import AddPoints from "@/pages/AddPoints";
import Members from "@/pages/Members";
import Events from "@/pages/Events";
import Login from "@/pages/Login";
import UserManagement from "@/pages/UserManagement";
import Profile from "@/pages/Profile";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl red-gold-gradient mx-auto mb-4 animate-pulse" />
        <p className="text-xs uppercase tracking-widest gold-text">...</p>
      </div>
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
          <Route path="/" element={<HomePage />} />
          <Route path="/siralama" element={<Leaderboard />} />
          <Route path="/komutanlar" element={<Commanders />} />
          <Route path="/puanlar" element={<RequireAuth><PointsList /></RequireAuth>} />
          <Route path="/puan-ekle" element={<RequireAuth><AddPoints /></RequireAuth>} />
          <Route path="/uyeler" element={<RequireAuth><Members /></RequireAuth>} />
          <Route path="/etkinlikler" element={<RequireAuth><Events /></RequireAuth>} />
          <Route path="/kullanicilar" element={<RequireAdmin><UserManagement /></RequireAdmin>} />
          <Route path="/profil" element={<RequireAuth><Profile /></RequireAuth>} />
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
          <AppShell />
          <Toaster theme="dark" position="top-center" richColors closeButton />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
