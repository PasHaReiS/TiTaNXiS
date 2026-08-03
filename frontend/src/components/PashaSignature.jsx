import React from "react";
import { Swords } from "lucide-react";

const STYLE_ID = "pasha-signature-style";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pashaFireFlicker {
      0%, 100% {
        text-shadow: 0 0 4px #F5A623, 0 0 11px #F5A623, 0 0 19px #E74C1A, 0 0 40px #E74C1A, 0 0 80px #DC2626;
        filter: brightness(1);
      }
      25% {
        text-shadow: 0 0 4px #F5A623, 0 0 10px #F5A623, 0 0 22px #E74C1A, 0 0 45px #E74C1A, 0 0 60px #DC2626;
        filter: brightness(1.1);
      }
      50% {
        text-shadow: 0 0 7px #F5A623, 0 0 14px #F5A623, 0 0 25px #E74C1A, 0 0 50px #E74C1A, 0 0 90px #DC2626;
        filter: brightness(1.2);
      }
      75% {
        text-shadow: 0 0 4px #F5A623, 0 0 9px #F5A623, 0 0 17px #E74C1A, 0 0 35px #E74C1A, 0 0 70px #DC2626;
        filter: brightness(1.05);
      }
    }
    @keyframes pashaFireIconFlicker {
      0%, 100% { filter: drop-shadow(0 0 4px #F5A623) drop-shadow(0 0 12px #E74C1A); }
      50% { filter: drop-shadow(0 0 8px #F5A623) drop-shadow(0 0 20px #E74C1A) drop-shadow(0 0 30px #DC2626); }
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
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 20px;
      border-radius: 12px;
      background: #0D0907;
      border: 1px solid #E74C1A;
      box-shadow: 0 0 15px rgba(231, 76, 26, 0.3);
      cursor: default;
      user-select: none;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }
    .pasha-signature:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 25px rgba(231, 76, 26, 0.55);
    }
    .pasha-signature-icon {
      color: #F5A623;
      animation: pashaFireIconFlicker 2s ease-in-out infinite;
    }
    .pasha-signature-text {
      font-family: 'Cinzel', serif;
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 0.1em;
      color: #F5A623;
      animation: pashaFireFlicker 2.2s ease-in-out infinite;
      line-height: 1;
    }
    .pasha-signature:hover .pasha-signature-text {
      animation-duration: 0.6s;
      color: #FFD57A;
    }
    .pasha-signature:hover .pasha-signature-icon {
      animation-duration: 0.6s;
    }
    @media (max-width: 480px) {
      .pasha-signature { padding: 10px 16px; gap: 3px; }
      .pasha-signature-text { font-size: 16px; }
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
        <Swords className="pasha-signature-icon w-6 h-6" strokeWidth={2.2} />
        <span className="pasha-signature-text">PasHa</span>
      </div>
    </div>
  );
}
