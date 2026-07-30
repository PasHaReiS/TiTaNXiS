import React from "react";
import BottomNav from "@/components/BottomNav";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen">
      {children}
      <BottomNav />
    </div>
  );
}
