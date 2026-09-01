import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Crown, Swords, BookOpen, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Public landing page — `/tanitim` (v140.18).
 *
 * v140.18 değişikleri:
 *   - Alt "hayalet" satır (3 minik ikon + küçük UYGULAMAYA GİR letterspacing metni)
 *     tamamen silindi. Aşağıda tekrar eden bar kalmadı.
 *   - Fire palette: H1 & kart başlıkları `#FF8C00` (amber-orange), subtitle &
 *     kart açıklamaları `#FFF5DC` (cream white). Renkler artık React
 *     elementlerinde de uygulanıyor.
 * Diğer her şey (root `<a>` clickable wrapper, davet chip, `LegalFooter`'ın
 * `/tanitim`'de gizli olması, koyu tema + altın glow) v140.17'den korundu.
 */

const HERO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/389b9cb896e2412ca2fcd45b85b403cd_titanxis_tanitim.png";

const APP_URL = "https://titanxis.com";

// v140.18 palette — fire tones
const HEADING_COLOR = "#FF8C00"; // amber-orange
const BODY_COLOR = "#FFF5DC";    // cream white

const FEATURES = [
  {
    key: "leaderboard",
    Icon: Crown,
    title: "SIRALAMA",
    desc: "Loncanızın gücünü sıralamalarda gösterin.",
  },
  {
    key: "events",
    Icon: Swords,
    title: "ETKİNLİKLER",
    desc: "Etkinlikleri planlayın, katılımı artırın.",
  },
  {
    key: "guide",
    Icon: BookOpen,
    title: "LOJ HAKKINDA",
    desc: "Rehber, kahraman ve strateji.",
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

  const copyInvite = async (e) => {
    // Chip'in kopyala butonu: sayfa yönlendirmesin.
    e.preventDefault();
    e.stopPropagation();
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
    <a
      data-testid="tanitim-page"
      href={ctaHref}
      aria-label={t("tanitim_cta", "UYGULAMAYA GİR")}
      style={{
        minHeight: "100vh",
        display: "block",
        background:
          "radial-gradient(1400px 700px at 50% -10%, rgba(255,140,0,0.14), transparent 60%), #0a0a0a",
        color: BODY_COLOR,
        padding: "36px 20px 40px",
        boxSizing: "border-box",
        textDecoration: "none",
        cursor: "pointer",
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
          gap: 26,
        }}
      >
        {/* Hero image */}
        <div
          data-testid="tanitim-hero-wrapper"
          style={{
            width: "100%",
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(255,140,0,0.32)",
            boxShadow:
              "0 0 50px rgba(255,140,0,0.22), 0 16px 34px rgba(0,0,0,0.55)",
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

        {/* Ana başlık — #FF8C00 */}
        <h1
          data-testid="tanitim-title"
          style={{
            margin: 0,
            fontFamily: "'Cinzel', serif",
            fontSize: "clamp(26px, 6vw, 40px)",
            lineHeight: 1.15,
            textAlign: "center",
            fontWeight: 800,
            color: HEADING_COLOR,
            letterSpacing: "0.02em",
          }}
        >
          {t("tanitim_headline", "LONCANA KATIL, EFSANENİ YAZ")}
        </h1>

        {/* Alt başlık — #FFF5DC */}
        <p
          data-testid="tanitim-subtitle"
          style={{
            margin: 0,
            maxWidth: 560,
            fontSize: "clamp(13px, 3.2vw, 16px)",
            lineHeight: 1.55,
            textAlign: "center",
            color: BODY_COLOR,
          }}
        >
          {t(
            "tanitim_subtitle",
            "TiTaNXiS ile loncanu en üst seviyeye taşı. Yönetimi kolaylaştır, gücünü göster, efsaneni birlikte yazalım!"
          )}
        </p>

        {/* Davet chip (?davet=…) */}
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
            <span style={{ opacity: 0.72, fontSize: 13, color: BODY_COLOR }}>
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
                background: "rgba(255,140,0,0.10)",
                border: `1px solid ${HEADING_COLOR}`,
                color: HEADING_COLOR,
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

        {/* 3 özellik kartı — başlık #FF8C00, açıklama #FFF5DC */}
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
                gap: 10,
                padding: "20px 14px",
                borderRadius: 14,
                background:
                  "linear-gradient(180deg, rgba(255,140,0,0.08), rgba(15,10,20,0.65))",
                border: "1px solid rgba(255,140,0,0.28)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                minHeight: 148,
                textAlign: "center",
              }}
            >
              <Icon size={30} color={HEADING_COLOR} strokeWidth={1.6} />
              <span
                style={{
                  fontSize: 13,
                  letterSpacing: "0.16em",
                  fontWeight: 800,
                  color: HEADING_COLOR,
                  fontFamily: "'Cinzel', serif",
                }}
              >
                {t(`tanitim_feature_${key}_title`, title)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: BODY_COLOR,
                }}
              >
                {t(`tanitim_feature_${key}_desc`, desc)}
              </span>
            </div>
          ))}
        </div>

        {/* Amber CTA butonu */}
        <div
          data-testid="tanitim-cta-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 42px",
            borderRadius: 14,
            background:
              "linear-gradient(135deg, #ffb347 0%, #FF8C00 55%, #b8570a 100%)",
            color: "#150e00",
            fontWeight: 900,
            fontSize: "clamp(15px, 3.8vw, 18px)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily: "'Cinzel', serif",
            boxShadow:
              "0 12px 34px rgba(255,140,0,0.45), inset 0 1px 0 rgba(255,255,255,0.4)",
            marginTop: 4,
          }}
        >
          {t("tanitim_cta", "UYGULAMAYA GİR")}
        </div>
      </div>
    </a>
  );
}
