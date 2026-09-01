import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Sword, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Public landing page — `/tanitim`.
 *
 * - No auth required (mounted outside AppShell).
 * - Dark theme (#0a0a0a) matching TiTaNXiS gold/amber accent.
 * - Displays the QR-free promo hero image + short TR intro + big amber CTA
 *   that sends the visitor to `https://titanxis.com` (i.e. the app root).
 * - Supports `?davet=CODE` query param → renders a copyable invite chip and
 *   forwards the code to the landing URL so signup can pre-fill it.
 * - Every visible string routes through `useTranslation()` for i18n.
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
    // Forward invite code to signup entry (also works if user is redirected
    // to `/` — the query survives on titanxis.com).
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
        padding: "12px 12px",
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
          gap: 10,
        }}
      >
        {/* Brand row */}
        <div
          data-testid="tanitim-brand"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <Sword size={16} color="#f5b21c" />
          <span
            style={{
              letterSpacing: "0.3em",
              fontWeight: 700,
              fontSize: 10,
              color: "#f5b21c",
              textTransform: "uppercase",
            }}
          >
            TiTaNXiS
          </span>
        </div>

        {/* Hero image — v140.10: TÜM görsel tek CTA. Görselin içine gömülü
            "UYGULAMAYA GİR" paneli zaten var; tıklayınca titanxis.com'a gider. */}
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
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(245,178,28,0.35)",
            boxShadow:
              "0 0 40px rgba(245,178,28,0.22), 0 12px 28px rgba(0,0,0,0.55)",
            background: "#0f0f0f",
            cursor: "pointer",
            transition: "transform 0.15s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 0 60px rgba(245,178,28,0.35), 0 18px 40px rgba(0,0,0,0.7)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 0 40px rgba(245,178,28,0.22), 0 12px 28px rgba(0,0,0,0.55)";
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

        {/* Intro copy — kompakt tek satır */}
        <h1
          data-testid="tanitim-title"
          style={{
            margin: 0,
            fontSize: "clamp(11px, 2.6vw, 14px)",
            lineHeight: 1.3,
            textAlign: "center",
            fontWeight: 700,
            flexShrink: 0,
            opacity: 0.9,
          }}
        >
          {t(
            "tanitim_intro",
            "⚔️ TiTaNXiS Lonca Yönetim Uygulaması — Loncanu yönet, etkinliklerini takip et, sıralamanda yerini al!"
          )}
        </h1>

        {/* Invite chip (only when ?davet= present) */}
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
            <span style={{ opacity: 0.7, fontSize: 11 }}>
              {t("tanitim_invite_label", "Davet Kodun")}
            </span>
            <button
              data-testid="tanitim-invite-copy-btn"
              onClick={copyInvite}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(245,178,28,0.10)",
                border: "1px solid rgba(245,178,28,0.45)",
                color: "#f5b21c",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {invite}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
