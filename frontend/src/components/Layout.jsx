import React from "react";
import BottomNav from "@/components/BottomNav";
import MusicButton from "@/components/MusicButton";
import PashaSignature from "@/components/PashaSignature";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen">
      {children}
      <MusicButton />
      <PashaSignature />
      <BottomNav />
    </div>
  );
}
