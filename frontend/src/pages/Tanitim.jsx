import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Sword, Crown, Swords, BookOpen, Globe, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Public landing page — `/tanitim` (v140.14 full rebuild).
 *
 * Yapı (yukarıdan aşağıya):
 *   1) Hero görseli (üst)
 *   2) Ana başlık: "LONCANA KATIL, EFSANENİ YAZ"
 *   3) Alt başlık / açıklama
 *   4) 3 özellik kartı (SIRALAMA, ETKİNLİKLER, LOJ HAKKINDA — ikon + başlık + kısa açıklama)
 *   5) Büyük amber "UYGULAMAYA GİR" CTA → https://titanxis.com
 *   6) Globe ikonu + "titanxis.com" satırı
 *   7) Global `LegalFooter` (App.js root'ta zaten mount)
 *
 * `?davet=CODE` → altın chip görünür, CTA link'e `?davet=...` forward edilir.
 * i18n: tüm metinler `useTranslation()` üzerinden.
 */

const HERO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/389b9cb896e2412ca2fcd45b85b403cd_titanxis_tanitim.png";

const APP_URL = "https://titanxis.com";

const FEATURES = [
  {
    key: "leaderboard",
    Icon: Crown,
    title: "SIRALAMA",
    desc: "Loncanızın gücünü sıralamalarda gösterin. En iyiler arasında yerinizi alın!",
  },
  {
    key: "events",
    Icon: Swords,
    title: "ETKİNLİKLER",
    desc: "Etkinlikleri planlayın, katılımı artırın ve loncanızı zaferlere taşıyın.",
  },
  {
    key: "guide",
    Icon: BookOpen,
    title: "LOJ HAKKINDA",
    desc: "Rehber, kahraman bilgileri ve lonca stratejileri.",
  },
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
        minHeight: "100vh",
        background:
          "radial-gradient(1400px 700px at 50% -10%, rgba(255,176,32,0.14), transparent 60%), #0a0a0a",
        color: "#f5f5f4",
        // 30px altta global LegalFooter var — içerik onun üstüne binmemek için 46px padding
        padding: "36px 20px 66px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
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
          <Sword size={20} color="#f5b21c" />
          <span
            style={{
              letterSpacing: "0.45em",
              fontWeight: 800,
              fontSize: 13,
              color: "#f5b21c",
              textTransform: "uppercase",
              fontFamily: "'Cinzel', serif",
            }}
          >
            TiTaNXiS
          </span>
        </div>

        {/* 1) Hero image */}
        <div
          data-testid="tanitim-hero-wrapper"
          style={{
            width: "100%",
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(245,178,28,0.32)",
            boxShadow:
              "0 0 50px rgba(245,178,28,0.22), 0 16px 34px rgba(0,0,0,0.55)",
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

        {/* 2) Ana başlık */}
        <h1
          data-testid="tanitim-title"
          style={{
            margin: 0,
            fontFamily: "'Cinzel', serif",
            fontSize: "clamp(28px, 6vw, 44px)",
            lineHeight: 1.15,
            textAlign: "center",
            fontWeight: 800,
            background:
              "linear-gradient(180deg, #ffd680 0%, #f5b21c 55%, #b8760a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "0.02em",
          }}
        >
          {t("tanitim_headline", "LONCANA KATIL, EFSANENİ YAZ")}
        </h1>

        {/* 3) Alt başlık / açıklama */}
        <p
          data-testid="tanitim-subtitle"
          style={{
            margin: 0,
            maxWidth: 560,
            fontSize: "clamp(13px, 3.2vw, 16px)",
            lineHeight: 1.55,
            textAlign: "center",
            opacity: 0.82,
          }}
        >
          {t(
            "tanitim_subtitle",
            "TiTaNXiS ile loncanu en üst seviyeye taşı. Yönetimi kolaylaştır, gücünü göster, efsaneni birlikte yazalım!"
          )}
        </p>

        {/* Invite chip (?davet=…) — hero altına, kartların üstüne yerleştir */}
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
            <span style={{ opacity: 0.72, fontSize: 13 }}>
              {t("tanitim_invite_label", "Davet Kodun")}
            </span>
            <button
              data-testid="tanitim-invite-copy-btn"
              onClick={copyInvite}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
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
                fontSize: 13,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {invite}
            </button>
          </div>
        )}

        {/* 4) 3 özellik kartı */}
        <div
          data-testid="tanitim-feature-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            width: "100%",
          }}
        >
          {FEATURES.map(({ key, Icon, title, desc }) => (
            <div
              key={key}
              data-testid={`tanitim-feature-${key}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 12,
                padding: "22px 16px",
                borderRadius: 14,
                background:
                  "linear-gradient(180deg, rgba(245,178,28,0.08), rgba(15,10,20,0.65))",
                border: "1px solid rgba(245,178,28,0.28)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                minHeight: 168,
                textAlign: "center",
              }}
            >
              <Icon size={34} color="#f5b21c" strokeWidth={1.6} />
              <span
                style={{
                  fontSize: 13,
                  letterSpacing: "0.16em",
                  fontWeight: 800,
                  color: "#f5f0e8",
                  fontFamily: "'Cinzel', serif",
                }}
              >
                {t(`tanitim_feature_${key}_title`, title)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  opacity: 0.78,
                  color: "#f5f5f4",
                }}
              >
                {t(`tanitim_feature_${key}_desc`, desc)}
              </span>
            </div>
          ))}
        </div>

        {/* 5) CTA */}
        <a
          data-testid="tanitim-cta-btn"
          href={ctaHref}
          aria-label={t("tanitim_cta", "UYGULAMAYA GİR")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "18px 46px",
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
            marginTop: 4,
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

        {/* 6) Globe + titanxis.com */}
        <div
          data-testid="tanitim-domain"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: 0.72,
          }}
        >
          <Globe size={18} color="#f5b21c" strokeWidth={1.8} />
          <a
            href={APP_URL}
            style={{
              color: "#f5b21c",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13,
              letterSpacing: "0.06em",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            titanxis.com
          </a>
        </div>
      </div>
    </div>
  );
}
