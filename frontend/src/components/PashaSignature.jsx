import React from "react";

const STYLE_ID = "pasha-signature-style";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pashaFireFlicker {
      0%, 100% {
        text-shadow: 0 0 4px #F5A623, 0 0 11px #F5A623, 0 0 19px #E74C1A, 0 0 40px #E74C1A, 0 0 80px #DC2626;
      }
      25% {
        text-shadow: 0 0 4px #F5A623, 0 0 10px #F5A623, 0 0 22px #E74C1A, 0 0 45px #E74C1A, 0 0 60px #DC2626;
      }
      50% {
        text-shadow: 0 0 7px #F5A623, 0 0 14px #F5A623, 0 0 25px #E74C1A, 0 0 50px #E74C1A, 0 0 90px #DC2626;
      }
      75% {
        text-shadow: 0 0 4px #F5A623, 0 0 9px #F5A623, 0 0 17px #E74C1A, 0 0 35px #E74C1A, 0 0 70px #DC2626;
      }
    }
    @keyframes pashaAxeGlow {
      0%, 100% { filter: drop-shadow(0 0 3px #F5A623) drop-shadow(0 0 10px #E74C1A); }
      50% { filter: drop-shadow(0 0 6px #F5A623) drop-shadow(0 0 18px #E74C1A) drop-shadow(0 0 26px #DC2626); }
    }
    .pasha-signature-wrap {
      width: 100%;
      display: flex;
      justify-content: flex-end;
      padding: 12px 12px 88px 12px;
      box-sizing: border-box;
    }
    .pasha-signature {
      display: inline-flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-radius: 8px;
      background: #0D0907;
      border: 1px solid #E74C1A;
      box-shadow: 0 0 14px rgba(231, 76, 26, 0.35);
      cursor: default;
      user-select: none;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }
    .pasha-signature:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 24px rgba(231, 76, 26, 0.6);
    }
    .pasha-axe {
      width: 30px;
      height: 30px;
      display: block;
      animation: pashaAxeGlow 2s ease-in-out infinite;
    }
    .pasha-signature-text {
      font-family: 'Cinzel', serif;
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 0.1em;
      color: #F5A623;
      line-height: 1;
      animation: pashaFireFlicker 2.4s ease-in-out infinite;
    }
    .pasha-signature:hover .pasha-signature-text { animation-duration: 0.7s; color: #FFD57A; }
    .pasha-signature:hover .pasha-axe { animation-duration: 0.7s; }
    @media (max-width: 480px) {
      .pasha-signature { padding: 6px 12px; gap: 8px; }
      .pasha-signature-text { font-size: 16px; }
      .pasha-axe { width: 26px; height: 26px; }
      .pasha-signature-wrap { padding-bottom: 84px; }
    }
  `;
  document.head.appendChild(style);
}

export default function PashaSignature() {
  return (
    <div className="pasha-signature-wrap">
      <div
        className="pasha-signature"
        data-testid="pasha-signature"
        role="img"
        aria-label="PasHa"
        title="PasHa"
      >
        {/* Inline viking axe — wooden handle + steel blade */}
        <svg
          className="pasha-axe"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="pashaBladeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E8ECEF" />
              <stop offset="55%" stopColor="#9DA5AD" />
              <stop offset="100%" stopColor="#4A5058" />
            </linearGradient>
            <linearGradient id="pashaHandleGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4B2C15" />
              <stop offset="50%" stopColor="#7A4A22" />
              <stop offset="100%" stopColor="#3E220E" />
            </linearGradient>
            <linearGradient id="pashaWrapGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2A1408" />
              <stop offset="100%" stopColor="#0B0704" />
            </linearGradient>
          </defs>

          {/* Wooden handle (diagonal) */}
          <path
            d="M50 6 L58 14 L20 52 L12 44 Z"
            fill="url(#pashaHandleGrad)"
            stroke="#2A1608"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Handle grip wrap (dark leather bands near bottom) */}
          <rect x="10" y="45" width="12" height="4" transform="rotate(-45 16 47)" fill="url(#pashaWrapGrad)" />
          <rect x="12" y="49" width="10" height="3" transform="rotate(-45 17 50)" fill="url(#pashaWrapGrad)" />

          {/* Axe head — wide bearded blade */}
          <path
            d="M28 8
               C 34 6, 44 4, 54 8
               C 58 14, 60 22, 58 30
               C 52 30, 46 30, 40 27
               C 34 24, 30 20, 26 16
               Z"
            fill="url(#pashaBladeGrad)"
            stroke="#1F2429"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Blade edge highlight */}
          <path
            d="M30 10 C 38 8, 48 8, 54 12"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.55"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          {/* Blade rune / rivet */}
          <circle cx="42" cy="18" r="1.6" fill="#3A3F45" stroke="#1F2429" strokeWidth="0.6" />
          <circle cx="48" cy="22" r="1.2" fill="#3A3F45" stroke="#1F2429" strokeWidth="0.6" />

          {/* Handle pommel cap (bottom-left tip) */}
          <circle cx="11" cy="50" r="3" fill="#2A1608" stroke="#7A4A22" strokeWidth="0.9" />
        </svg>

        <span className="pasha-signature-text">PasHa</span>
      </div>
    </div>
  );
}
