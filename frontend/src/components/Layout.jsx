import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import MusicButton from "@/components/MusicButton";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen" style={{ paddingTop: 0 }}>
      <Breadcrumb />
      {children}
      <MusicButton />
      <PwaInstallPrompt />
    </div>
  );
}
