import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Sword, ArrowRight, Copy, Check } from "lucide-react";
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
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 50% -10%, rgba(255,176,32,0.10), transparent 60%), #0a0a0a",
        color: "#f5f5f4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 720 }}>
        {/* Brand row */}
        <div
          data-testid="tanitim-brand"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 22,
          }}
        >
          <Sword size={22} color="#f5b21c" />
          <span
            style={{
              letterSpacing: "0.35em",
              fontWeight: 700,
              fontSize: 12,
              color: "#f5b21c",
              textTransform: "uppercase",
            }}
          >
            TiTaNXiS
          </span>
        </div>

        {/* Hero image */}
        <div
          data-testid="tanitim-hero-wrapper"
          style={{
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(245,178,28,0.25)",
            boxShadow:
              "0 0 60px rgba(245,178,28,0.18), 0 20px 40px rgba(0,0,0,0.55)",
            background: "#0f0f0f",
          }}
        >
          <img
            data-testid="tanitim-hero-image"
            src={HERO_URL}
            alt={t("tanitim_hero_alt", "TiTaNXiS Lonca Yönetim Uygulaması")}
            loading="eager"
            fetchpriority="high"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>

        {/* Intro copy */}
        <h1
          data-testid="tanitim-title"
          style={{
            marginTop: 28,
            fontSize: "clamp(20px, 4.5vw, 28px)",
            lineHeight: 1.35,
            textAlign: "center",
            fontWeight: 800,
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
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ opacity: 0.75, fontSize: 14 }}>
              {t("tanitim_invite_label", "Davet Kodun")}
            </span>
            <button
              data-testid="tanitim-invite-copy-btn"
              onClick={copyInvite}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(245,178,28,0.10)",
                border: "1px solid rgba(245,178,28,0.45)",
                color: "#f5b21c",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {invite}
            </button>
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <a
            data-testid="tanitim-cta-btn"
            href={ctaHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 34px",
              borderRadius: 14,
              background:
                "linear-gradient(135deg, #ffd36b 0%, #f5b21c 55%, #b8760a 100%)",
              color: "#150e00",
              fontWeight: 900,
              fontSize: "clamp(15px, 3.6vw, 18px)",
              letterSpacing: "0.14em",
              textDecoration: "none",
              textTransform: "uppercase",
              boxShadow:
                "0 10px 30px rgba(245,178,28,0.45), inset 0 1px 0 rgba(255,255,255,0.4)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 14px 36px rgba(245,178,28,0.55), inset 0 1px 0 rgba(255,255,255,0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 10px 30px rgba(245,178,28,0.45), inset 0 1px 0 rgba(255,255,255,0.4)";
            }}
          >
            {t("tanitim_cta", "UYGULAMAYA GİR")}
            <ArrowRight size={20} />
          </a>
        </div>

        {/* Foot line */}
        <p
          data-testid="tanitim-footer"
          style={{
            marginTop: 28,
            textAlign: "center",
            fontSize: 13,
            opacity: 0.55,
          }}
        >
          {t("tanitim_footer", "🌐 titanxis.com")}
        </p>
      </div>
    </div>
  );
}
