import React from "react";
import BottomNav from "@/components/BottomNav";
import SideNav from "@/components/SideNav";
import MusicButton from "@/components/MusicButton";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen">
      <SideNav />
      {children}
      <MusicButton />
      <BottomNav />
    </div>
  );
}
