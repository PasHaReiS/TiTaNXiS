import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Sword, Crown, Swords, BookOpen, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Public landing page — `/tanitim` (v140.12).
 *
 * v140.12 — Native rebuild: promo görsel + gömülü metinleri kaldırıp yerine
 * temiz React layout kondu. Kart açıklamaları, uzun intro satırı ve footer
 * yok. Sadece:
 *   - TiTaNXiS marka rozeti
 *   - 3 ikon kartı (SIRALAMA, ETKİNLİKLER, LOJ HAKKINDA — açıklama yok)
 *   - Amber "UYGULAMAYA GİR" butonu
 * Tümü tek mobil ekrana sığar (`100dvh + overflow:hidden`).
 *
 * `?davet=CODE` desteklenir → küçük altın chip + CTA'ya param forward.
 */

const APP_URL = "https://titanxis.com";

const FEATURE_KEYS = [
  { key: "leaderboard", Icon: Crown,    label: "SIRALAMA" },
  { key: "events",      Icon: Swords,   label: "ETKİNLİKLER" },
  { key: "guide",       Icon: BookOpen, label: "LOJ HAKKINDA" },
];

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
          "radial-gradient(1200px 700px at 50% -10%, rgba(255,176,32,0.14), transparent 60%), #0a0a0a",
        color: "#f5f5f4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 44,
        }}
      >
        {/* Brand */}
        <div
          data-testid="tanitim-brand"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <Sword size={22} color="#f5b21c" />
          <span
            style={{
              letterSpacing: "0.45em",
              fontWeight: 800,
              fontSize: 15,
              color: "#f5b21c",
              textTransform: "uppercase",
              fontFamily: "'Cinzel', serif",
            }}
          >
            TiTaNXiS
          </span>
        </div>

        {/* Feature cards — icon + title only */}
        <div
          data-testid="tanitim-feature-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            width: "100%",
          }}
        >
          {FEATURE_KEYS.map(({ key, Icon, label }) => (
            <div
              key={key}
              data-testid={`tanitim-feature-${key}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "22px 10px",
                borderRadius: 14,
                background:
                  "linear-gradient(180deg, rgba(245,178,28,0.08), rgba(15,10,20,0.65))",
                border: "1px solid rgba(245,178,28,0.30)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
              }}
            >
              <Icon size={30} color="#f5b21c" strokeWidth={1.6} />
              <span
                style={{
                  fontSize: "clamp(10px, 2.6vw, 12px)",
                  letterSpacing: "0.14em",
                  fontWeight: 800,
                  color: "#f5f0e8",
                  fontFamily: "'Cinzel', serif",
                  textAlign: "center",
                }}
              >
                {t(`tanitim_feature_${key}`, label)}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a
          data-testid="tanitim-cta-btn"
          href={ctaHref}
          aria-label={t("tanitim_cta", "UYGULAMAYA GİR")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: "18px 42px",
            borderRadius: 14,
            background:
              "linear-gradient(135deg, #ffd36b 0%, #f5b21c 55%, #b8760a 100%)",
            color: "#150e00",
            fontWeight: 900,
            fontSize: "clamp(15px, 3.8vw, 18px)",
            letterSpacing: "0.18em",
            textDecoration: "none",
            textTransform: "uppercase",
            fontFamily: "'Cinzel', serif",
            boxShadow:
              "0 12px 34px rgba(245,178,28,0.45), inset 0 1px 0 rgba(255,255,255,0.4)",
            transition: "transform 0.15s ease, box-shadow 0.2s ease",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 16px 40px rgba(245,178,28,0.60), inset 0 1px 0 rgba(255,255,255,0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 12px 34px rgba(245,178,28,0.45), inset 0 1px 0 rgba(255,255,255,0.4)";
          }}
        >
          {t("tanitim_cta", "UYGULAMAYA GİR")}
        </a>

        {/* Invite chip (?davet=…) */}
        {invite && (
          <div
            data-testid="tanitim-invite-chip"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
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
                gap: 7,
                padding: "7px 12px",
                borderRadius: 999,
                background: "rgba(245,178,28,0.10)",
                border: "1px solid rgba(245,178,28,0.45)",
                color: "#f5b21c",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontWeight: 700,
                letterSpacing: "0.07em",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {invite}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
