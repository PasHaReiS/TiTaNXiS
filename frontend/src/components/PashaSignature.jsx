import React from "react";

// Dynamically load Cinzel font once
const CINZEL_LINK_ID = "cinzel-font-link";
if (typeof document !== "undefined" && !document.getElementById(CINZEL_LINK_ID)) {
  const link = document.createElement("link");
  link.id = CINZEL_LINK_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap";
  document.head.appendChild(link);
}

const STYLE_ID = "pasha-signature-style";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pashaFlameGlow {
      0% { text-shadow: 0 0 4px #F5A623, 0 0 8px #E74C1A; }
      50% { text-shadow: 0 0 12px #F5A623, 0 0 24px #E74C1A, 0 0 36px #DC2626; }
      100% { text-shadow: 0 0 4px #F5A623, 0 0 8px #E74C1A; }
    }
    .pasha-signature-wrap {
      width: 100%;
      display: flex;
      justify-content: flex-end;
      padding: 8px 8px 88px 8px;
      box-sizing: border-box;
    }
    .pasha-signature {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      background: #1A1210;
      border: 1px solid #E74C1A66;
      color: #F5A623;
      font-family: 'Cinzel', serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.06em;
      cursor: default;
      user-select: none;
      transition: border-color 0.25s ease, transform 0.25s ease;
      text-shadow: 0 0 4px #F5A623, 0 0 8px #E74C1A;
    }
    .pasha-signature:hover, .pasha-signature:active {
      animation: pashaFlameGlow 0.8s ease-in-out infinite;
      border-color: #E74C1A;
      transform: translateY(-1px);
    }
    .pasha-lion {
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 0 3px rgba(231, 76, 26, 0.6));
    }
    @media (max-width: 480px) {
      .pasha-signature { padding: 5px 10px; font-size: 12px; }
      .pasha-lion { width: 16px; height: 16px; }
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
        <span className="pasha-lion" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="pashaLionGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5A623" />
                <stop offset="100%" stopColor="#E74C1A" />
              </linearGradient>
            </defs>
            <path
              d="M12 2 L15 4 L18 3 L18 6 L21 7 L19 10 L22 12 L19 14 L21 17 L18 18 L18 21 L15 20 L12 22 L9 20 L6 21 L6 18 L3 17 L5 14 L2 12 L5 10 L3 7 L6 6 L6 3 L9 4 Z"
              fill="url(#pashaLionGrad2)"
              stroke="#8B3A08"
              strokeWidth="0.5"
            />
            <circle cx="12" cy="12" r="4.5" fill="#1A1210" stroke="#F5A623" strokeWidth="0.6" />
            <circle cx="10.4" cy="11.4" r="0.7" fill="#F5A623" />
            <circle cx="13.6" cy="11.4" r="0.7" fill="#F5A623" />
            <path d="M11.2 13.2 L12 14.2 L12.8 13.2 Z" fill="#E74C1A" />
          </svg>
        </span>
        <span>PasHa</span>
      </div>
    </div>
  );
}
