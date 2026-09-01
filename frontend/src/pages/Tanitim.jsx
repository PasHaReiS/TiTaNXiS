import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Public landing page — `/tanitim` (v140.15).
 *
 * Minimal: sadece hero görseli (içine gömülü başlık, kartlar, "UYGULAMAYA
 * GİR" paneli, titanxis.com) tek büyük tıklanabilir CTA olarak render edilir.
 * Ayrıca metin blokları / özellik kartları / footer YOK.
 *
 * `?davet=CODE` → altın chip + CTA'ya param forward. Bu chip URL parametresi
 * geldiğinde görünür, aksi halde tamamen gizli (default akışta yer kaplamaz).
 * i18n `useTranslation()` üzerinden.
 *
 * `100dvh + overflow:hidden` → mobilde scroll yok. Global `LegalFooter`
 * `/tanitim` yolunda gizleniyor (`LegalFooter.jsx`).
 */

const HERO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/389b9cb896e2412ca2fcd45b85b403cd_titanxis_tanitim.png";

const APP_URL = "https://titanxis.com";

export default function Tanitim() {
  const { t } = useTranslation();
  const [sp] = useSearchParams();
  const [copied, setCopied] = React.useState(false);

  const invite = (sp.get("davet") || sp.get("invite") || "").trim();

  const ctaHref = useMemo(() => {
    if (!invite) return APP_URL;
    return `${APP_URL}/?davet=${encodeURIComponent(invite)}`;
  }, [invite]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      toast.success(t("tanitim_invite_copied", "Davet kodu kopyalandı"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("tanitim_invite_copy_failed", "Kopyalanamadı"));
    }
  };

  return (
    <div
      data-testid="tanitim-page"
      style={{
        height: "100vh",
        minHeight: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        background:
          "radial-gradient(1200px 600px at 50% -10%, rgba(255,176,32,0.10), transparent 60%), #0a0a0a",
        color: "#f5f5f4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Hero görseli — TÜM içerik + CTA tek tıklanabilir alan */}
        <a
          data-testid="tanitim-cta-btn"
          href={ctaHref}
          aria-label={t("tanitim_cta", "UYGULAMAYA GİR")}
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "stretch",
            textDecoration: "none",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(245,178,28,0.35)",
            boxShadow:
              "0 0 50px rgba(245,178,28,0.22), 0 14px 32px rgba(0,0,0,0.55)",
            background: "#0f0f0f",
            cursor: "pointer",
            transition: "transform 0.15s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 0 70px rgba(245,178,28,0.38), 0 20px 44px rgba(0,0,0,0.7)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 0 50px rgba(245,178,28,0.22), 0 14px 32px rgba(0,0,0,0.55)";
          }}
        >
          <img
            data-testid="tanitim-hero-image"
            src={HERO_URL}
            alt={t("tanitim_hero_alt", "TiTaNXiS Lonca Yönetim Uygulaması")}
            loading="eager"
            fetchpriority="high"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "100%",
              objectFit: "contain",
              display: "block",
              margin: "auto",
            }}
          />
        </a>

        {/* Invite chip — sadece ?davet= gelince */}
        {invite && (
          <div
            data-testid="tanitim-invite-chip"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <span style={{ opacity: 0.72, fontSize: 12 }}>
              {t("tanitim_invite_label", "Davet Kodun")}
            </span>
            <button
              data-testid="tanitim-invite-copy-btn"
              onClick={copyInvite}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 11px",
                borderRadius: 999,
                background: "rgba(245,178,28,0.10)",
                border: "1px solid rgba(245,178,28,0.45)",
                color: "#f5b21c",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {invite}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
