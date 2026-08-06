import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const LOGO_VIDEO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/wingman/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/attachments/0e75a52fb2da4a63af76fa062364835d_1000073694.mp4";

export default function HomePage() {
  const nav = useNavigate();
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [ctaVisible, setCtaVisible] = useState(false);

  const revealCtas = () => {
    setTimeout(() => setCtaVisible(true), 1000);
  };

  return (
    <div className="home-hero" data-testid="home-hero">
      <div className="home-radial-bg" aria-hidden="true" />

      <div className="home-video-wrap" data-testid="home-video-wrap">
        <video
          ref={videoRef}
          src={LOGO_VIDEO_URL}
          autoPlay
          muted
          playsInline
          onEnded={revealCtas}
          onError={revealCtas}
          className="home-video"
          data-testid="home-logo-video"
        />
      </div>

      <div
        className={`home-cta-row ${ctaVisible ? "visible" : ""}`}
        data-testid="home-cta-row"
      >
        <button
          type="button"
          onClick={() => nav("/siralama")}
          data-testid="home-cta-siralama"
          className="home-cta home-cta-left"
        >
          {t("nav_leaderboard").toUpperCase()}
        </button>
        <button
          type="button"
          onClick={() => nav("/komutanlar")}
          data-testid="home-cta-loj-hakkinda"
          className="home-cta home-cta-right"
        >
          {t("nav_commanders").toUpperCase()}
        </button>
      </div>
    </div>
  );
}
