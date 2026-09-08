import React from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Flame } from "lucide-react";

// v141 — TiTaNXiS temalı 500. Lav çatlağı + amber tema.
export default function ServerError() {
  const { t } = useTranslation();
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      data-testid="server-error-page"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(239,68,68,0.15) 0%, #0a0403 55%, #050101 100%)",
      }}
    >
      <div className="max-w-lg text-center">
        <div
          className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-6 relative"
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.4)",
            boxShadow: "0 0 40px rgba(239,68,68,0.4)",
          }}
        >
          <Flame className="w-12 h-12 animate-pulse" style={{ color: "#EF4444" }} strokeWidth={1.5} />
        </div>
        <div
          className="text-7xl font-bold mb-2"
          style={{
            fontFamily: "Cinzel, serif",
            background: "linear-gradient(180deg,#EF4444,#7C2D12)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.1em",
          }}
        >
          500
        </div>
        <h1
          className="text-2xl font-bold uppercase tracking-widest mb-3"
          style={{ color: "#F5F0E8", fontFamily: "Cinzel, serif" }}
        >
          {t("err_500_title", { defaultValue: "Sunucu Hatası" })}
        </h1>
        <p className="text-sm mb-8 opacity-70 max-w-sm mx-auto leading-relaxed" style={{ color: "#F5F0E8" }}>
          {t("err_500_desc", { defaultValue: "Cephede geçici bir çatlak var. Ekibimiz alarm aldı, birkaç saniyeye toparlanacak." })}
        </p>
        <button
          onClick={() => window.location.reload()}
          data-testid="err-500-reload-btn"
          className="inline-flex items-center gap-2 h-11 px-6 rounded-lg font-bold uppercase tracking-widest text-sm"
          style={{
            background: "linear-gradient(135deg,#DC2626,#EF4444)",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(239,68,68,0.45)",
            fontFamily: "Cinzel, serif",
          }}
        >
          <RefreshCw className="w-4 h-4" />
          {t("err_500_reload_btn", { defaultValue: "Yenile" })}
        </button>
      </div>
    </div>
  );
}
