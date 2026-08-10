import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function AccessDenied() {
  const nav = useNavigate();
  return (
    <div
      className="min-h-[calc(100vh-120px)] flex items-center justify-center p-6"
      style={{ background: "#111111", color: "#fff" }}
      data-testid="access-denied-page"
    >
      <div
        className="max-w-md w-full text-center p-8 rounded-2xl"
        style={{
          background: "rgba(139,92,246,0.06)",
          border: "1px solid rgba(139,92,246,0.3)",
          boxShadow: "0 0 40px rgba(139,92,246,0.15)",
        }}
      >
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)" }}
        >
          <ShieldAlert className="w-8 h-8" style={{ color: "#EF4444" }} />
        </div>
        <h1
          className="text-2xl font-black mb-2"
          style={{ color: "#fff", fontFamily: "Cinzel, serif", letterSpacing: "0.04em" }}
        >
          🔒 Erişim Engellendi
        </h1>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: "#9CA3AF" }}>
          Bu sayfayı görüntülemek için yetkiniz bulunmuyor. Yalnızca yönetici ve editör
          rollerine sahip kullanıcılar bu bölüme erişebilir.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => nav(-1)}
            data-testid="access-denied-back"
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{ background: "#8B5CF6", color: "#fff", border: "1px solid #8B5CF6" }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Geri Dön
          </button>
          <button
            type="button"
            onClick={() => nav("/", { replace: true })}
            data-testid="access-denied-home"
            className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid #F59E0B" }}
          >
            Ana Sayfa
          </button>
        </div>
      </div>
    </div>
  );
}
