import React from "react";
import useSWR from "swr";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Shield, ArrowLeft, Scale, ScrollText } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const ICON_MAP = {
  privacy: Shield,
  terms: ScrollText,
  aydinlatma: Scale,
};

/**
 * v124 — Unified legal page renderer. Fetches translated content from
 * `/api/legal/{doc}?lang=xx` (backend uses DeepL + mongo cache) so all
 * three legal pages (privacy / terms / aydinlatma) render in the user's
 * language without hardcoding 29 versions in the frontend.
 */
export default function LegalPage({ doc }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || "tr").split("-")[0].toLowerCase();
  const { data, isLoading } = useSWR(`/legal/${doc}?lang=${lang}`, fetcher, {
    revalidateOnFocus: false,
  });
  const Icon = ICON_MAP[doc] || Shield;

  return (
    <div
      className="min-h-screen w-full flex items-start justify-center py-10 px-4"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% -10%, rgba(231,76,26,0.10), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(76,29,149,0.12), transparent 60%), linear-gradient(180deg,#0A0604 0%,#120806 100%)",
        color: "#F5F0E8",
      }}
      data-testid={`legal-page-${doc}`}
    >
      <article
        className="w-full max-w-2xl rounded-2xl relative"
        style={{
          background: "linear-gradient(180deg, rgba(26,18,16,0.92), rgba(14,10,8,0.92))",
          border: "1px solid rgba(245,166,35,0.35)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7), inset 0 0 24px rgba(231,76,26,0.06)",
          padding: "32px 28px",
        }}
      >
        <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: "1px solid rgba(245,166,35,0.28)" }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 30% 28%, #FFD787 0%, #F5A623 32%, #B45309 68%, #4A1B08 100%)",
              boxShadow: "0 0 18px rgba(245,166,35,0.55)",
              border: "1.5px solid rgba(245,166,35,0.8)",
            }}
          >
            <Icon className="w-5 h-5" style={{ color: "#0B0704" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1
              className="font-bold uppercase text-lg sm:text-xl"
              style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.16em", color: "#F5A623", textShadow: "0 0 10px rgba(245,166,35,0.35)" }}
              data-testid={`legal-title-${doc}`}
            >
              {data?.title || "…"}
            </h1>
            <div className="text-[11px] mt-1 uppercase" style={{ color: "#D4730A", letterSpacing: "0.14em" }} data-testid={`legal-updated-${doc}`}>
              {data?.updated ? `Last updated: ${data.updated}` : ""} · {lang.toUpperCase()}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="py-10 text-center text-sm text-muted-foreground" data-testid={`legal-loading-${doc}`}>
            Yükleniyor…
          </div>
        )}

        {data?.sections?.map((s, i) => (
          <section className="mb-5" key={i} data-testid={`legal-section-${doc}-${i}`}>
            <h2 className="mb-1.5 font-bold uppercase text-sm" style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.12em", color: "#F5A623" }}>
              {s.heading}
            </h2>
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "rgba(245,240,232,0.85)" }}>
              {s.body}
            </div>
          </section>
        ))}

        <div
          className="mt-8 pt-4 flex items-center justify-between text-[11px]"
          style={{ borderTop: "1px solid rgba(245,166,35,0.22)", color: "rgba(245,240,232,0.55)", letterSpacing: "0.08em" }}
        >
          <Link to="/" data-testid={`legal-back-home-${doc}`} className="flex items-center gap-1 uppercase font-bold" style={{ color: "#F5A623" }}>
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <span>© TiTaNXiS</span>
        </div>
      </article>
    </div>
  );
}
