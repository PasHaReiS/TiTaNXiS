import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Crown, Swords, BookOpen, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Public landing page — `/tanitim` (v140.17 full rewrite).
 *
 * KESIN kurallar:
 *  - `100dvh + overflow:hidden` → mobil 390×844'te scroll YOK.
 *  - Tüm sayfa TEK bir `<a href=titanxis.com>` — herhangi bir noktaya
 *    tıklanınca app açılır (davet chip'in kopyala butonu hariç,
 *    stopPropagation ile korunuyor).
 *  - İçerik sadece: hero görsel (flex:1, object-fit:cover) → 3 minik
 *    özellik ikonu satırı (SIRALAMA / ETKİNLİKLER / LOJ HAKKINDA)
 *    → küçük "UYGULAMAYA GİR" metni.
 *  - Metin rengi: `#FF8C00` (amber-orange).
 *  - Footer / uzun paragraf / tekrar eden başlık YOK.
 *  - `LegalFooter.jsx` bu yolda gizli.
 */

const HERO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/389b9cb896e2412ca2fcd45b85b403cd_titanxis_tanitim.png";

const APP_URL = "https://titanxis.com";
const AMBER = "#FF8C00";

const FEATURES = [
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

  const copyInvite = async (e) => {
    // Chip'in kopyala butonu: sayfayı yönlendirmesin.
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
        height: "100vh",
        minHeight: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        background:
          "radial-gradient(1200px 600px at 50% -10%, rgba(255,140,0,0.14), transparent 60%), #0a0a0a",
        color: AMBER,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "12px 12px 14px",
        boxSizing: "border-box",
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      {/* Hero image — flex:1, object-fit:cover */}
      <div
        data-testid="tanitim-cta-btn"
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,140,0,0.35)",
          boxShadow:
            "0 0 40px rgba(255,140,0,0.22), 0 12px 28px rgba(0,0,0,0.55)",
          background: "#0f0f0f",
        }}
      >
        <img
          data-testid="tanitim-hero-image"
          src={HERO_URL}
          alt={t("tanitim_hero_alt", "TiTaNXiS Lonca Yönetim Uygulaması")}
          loading="eager"
          fetchpriority="high"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {/* Davet chip (?davet=…) — hero altında yer alır */}
      {invite && (
        <div
          data-testid="tanitim-invite-chip"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 10,
            flexShrink: 0,
          }}
        >
          <span style={{ opacity: 0.72, fontSize: 11, color: AMBER }}>
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
              background: "rgba(255,140,0,0.10)",
              border: `1px solid ${AMBER}`,
              color: AMBER,
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

      {/* 3 minik özellik ikonu satırı */}
      <div
        data-testid="tanitim-feature-row"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          gap: 8,
          marginTop: 12,
          flexShrink: 0,
        }}
      >
        {FEATURES.map(({ key, Icon, label }) => (
          <div
            key={key}
            data-testid={`tanitim-feature-${key}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon size={18} color={AMBER} strokeWidth={1.8} />
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.10em",
                fontWeight: 700,
                color: AMBER,
                fontFamily: "'Cinzel', serif",
              }}
            >
              {t(`tanitim_feature_${key}_title`, label)}
            </span>
          </div>
        ))}
      </div>

      {/* Küçük "UYGULAMAYA GİR" metni */}
      <div
        data-testid="tanitim-cta-label"
        style={{
          marginTop: 10,
          textAlign: "center",
          color: AMBER,
          fontSize: 11,
          letterSpacing: "0.32em",
          fontWeight: 800,
          fontFamily: "'Cinzel', serif",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {t("tanitim_cta", "UYGULAMAYA GİR")}
      </div>
    </a>
  );
}
