import React from "react";
import BottomNav from "@/components/BottomNav";
import MusicButton from "@/components/MusicButton";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen">
      {children}
      <MusicButton />
      <PwaInstallPrompt />
      <BottomNav />
    </div>
  );
}
