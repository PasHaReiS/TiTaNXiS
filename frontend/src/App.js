import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/context/ThemeContext";
import Layout from "@/components/Layout";
import Leaderboard from "@/pages/Leaderboard";
import Commanders from "@/pages/Commanders";
import PointsList from "@/pages/PointsList";
import AddPoints from "@/pages/AddPoints";
import Members from "@/pages/Members";
import Events from "@/pages/Events";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Layout>
            <Routes>
              <Route path="/" element={<Leaderboard />} />
              <Route path="/komutanlar" element={<Commanders />} />
              <Route path="/puanlar" element={<PointsList />} />
              <Route path="/puan-ekle" element={<AddPoints />} />
              <Route path="/uyeler" element={<Members />} />
              <Route path="/etkinlikler" element={<Events />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </div>
        <Toaster theme="dark" position="top-center" richColors closeButton />
      </BrowserRouter>
    </ThemeProvider>
  );
}
