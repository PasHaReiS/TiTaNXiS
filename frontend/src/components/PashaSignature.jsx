import React from "react";

const STYLE_ID = "pasha-signature-style";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pashaSignatureGlow {
      0% { filter: brightness(1) drop-shadow(0 0 2px #F5A623); }
      50% { filter: brightness(1.3) drop-shadow(0 0 8px #F5A623) drop-shadow(0 0 16px #E74C1A); }
      100% { filter: brightness(1) drop-shadow(0 0 2px #F5A623); }
    }
    .pasha-signature-wrap {
      width: 100%;
      display: flex;
      justify-content: flex-end;
      padding: 8px 8px 88px 8px;
      box-sizing: border-box;
    }
    .pasha-signature {
      width: 48px;
      height: auto;
      border-radius: 8px;
      background: transparent;
      border: 0;
      cursor: default;
      user-select: none;
      display: block;
      transition: filter 0.25s ease;
    }
    .pasha-signature:hover, .pasha-signature:active {
      animation: pashaSignatureGlow 0.8s ease-in-out infinite;
    }
    @media (max-width: 480px) {
      .pasha-signature { width: 40px; }
      .pasha-signature-wrap { padding-bottom: 84px; }
    }
  `;
  document.head.appendChild(style);
}

// Remove any previously injected Cinzel link that was added ONLY for the earlier text signature.
// (Cinzel is also loaded globally by other components, so we do NOT remove it here — safe no-op.)

const SIGNATURE_SRC =
  "https://static.prod-images.emergentagent.com/jobs/e2335aef-f0ff-495b-ab82-aa3a75b41e0e/images/20c4872864afd195267fb3bdc72d0d7cbc41c77fd51deb3653fc88bcfec69af2.jpeg";

export default function PashaSignature() {
  return (
    <div className="pasha-signature-wrap">
      <img
        src={SIGNATURE_SRC}
        alt="PasHa"
        className="pasha-signature"
        data-testid="pasha-signature"
      />
    </div>
  );
}
