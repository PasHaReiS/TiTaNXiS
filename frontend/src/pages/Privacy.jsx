import React from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";

/**
 * Privacy Policy page for the TiTaNXiS Telegram bot.
 * Public route (no auth) — reachable at /privacy so the bot's BotFather profile
 * can link here. Dark stone theme, sober and legally clean.
 */
export default function Privacy() {
  return (
    <div
      className="min-h-screen w-full flex items-start justify-center py-10 px-4"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% -10%, rgba(231,76,26,0.10), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(76,29,149,0.12), transparent 60%), linear-gradient(180deg,#0A0604 0%,#120806 100%)",
        color: "#F5F0E8",
      }}
      data-testid="privacy-page"
    >
      <article
        className="w-full max-w-2xl rounded-2xl relative"
        style={{
          background:
            "linear-gradient(180deg, rgba(26,18,16,0.92), rgba(14,10,8,0.92))",
          border: "1px solid rgba(245,166,35,0.35)",
          boxShadow:
            "0 8px 40px rgba(0,0,0,0.7), inset 0 0 24px rgba(231,76,26,0.06)",
          padding: "32px 28px",
        }}
      >
        <div
          className="flex items-center gap-3 mb-6 pb-4"
          style={{ borderBottom: "1px solid rgba(245,166,35,0.28)" }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background:
                "radial-gradient(circle at 30% 28%, #FFD787 0%, #F5A623 32%, #B45309 68%, #4A1B08 100%)",
              boxShadow: "0 0 18px rgba(245,166,35,0.55)",
              border: "1.5px solid rgba(245,166,35,0.8)",
            }}
          >
            <Shield className="w-5 h-5" style={{ color: "#0B0704" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1
              className="font-bold uppercase text-lg sm:text-xl"
              style={{
                fontFamily: "Cinzel, serif",
                letterSpacing: "0.16em",
                color: "#F5A623",
                textShadow: "0 0 10px rgba(245,166,35,0.35)",
              }}
              data-testid="privacy-title"
            >
              TiTaNXiS — Privacy Policy
            </h1>
            <div
              className="text-[11px] mt-1 uppercase"
              style={{ color: "#D4730A", letterSpacing: "0.14em" }}
              data-testid="privacy-updated"
            >
              Last updated: August 2026
            </div>
          </div>
        </div>

        <Section number="1" title="Information We Collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Account information:</b> nickname/username you provide</li>
            <li><b>Usage data:</b> pages visited, features used within the app</li>
            <li><b>Device information:</b> device type, OS version, language preference</li>
            <li><b>Telegram user ID</b> (only if you connect Telegram notifications)</li>
          </ul>
        </Section>

        <Section number="2" title="How We Use Your Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide and improve the app experience</li>
            <li>To send event and score notifications (only if opted in)</li>
            <li>To display content in your preferred language (29 languages supported via DeepL)</li>
            <li>We do <b>NOT</b> sell your data to third parties</li>
          </ul>
        </Section>

        <Section number="3" title="Third-Party Services">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>DeepL API:</b> used for translation (your language preference is shared)</li>
            <li><b>Telegram:</b> used for optional notifications (your Telegram ID is stored only if you opt in)</li>
            <li><b>Google Play:</b> subject to Google's privacy policy</li>
          </ul>
        </Section>

        <Section number="4" title="Data Storage & Security">
          <ul className="list-disc pl-5 space-y-1">
            <li>Data is stored securely on our servers</li>
            <li>You can delete your account and all associated data at any time via the app settings</li>
          </ul>
        </Section>

        <Section number="5" title="Children's Privacy">
          This app is not directed at children under 13.
        </Section>

        <Section number="6" title="Changes to This Policy">
          We may update this policy. Changes will be posted on this page.
        </Section>

        <Section number="7" title="Contact">
          <div className="space-y-1">
            <div>
              Email: support via{" "}
              <a
                href="https://titanxis.com"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="privacy-contact-link"
                style={{
                  color: "#F5A623",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(245,166,35,0.55)",
                }}
              >
                titanxis.com
              </a>
            </div>
            <div>
              Website:{" "}
              <a
                href="https://titanxis.com"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="privacy-website-link"
                style={{
                  color: "#F5A623",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(245,166,35,0.55)",
                }}
              >
                titanxis.com
              </a>
            </div>
          </div>
        </Section>

        <div
          className="mt-8 pt-4 flex items-center justify-between text-[11px]"
          style={{
            borderTop: "1px solid rgba(245,166,35,0.22)",
            color: "rgba(245,240,232,0.55)",
            letterSpacing: "0.08em",
          }}
        >
          <Link
            to="/"
            data-testid="privacy-back-home"
            className="flex items-center gap-1 uppercase font-bold"
            style={{ color: "#F5A623" }}
          >
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <span>© TiTaNXiS</span>
        </div>
      </article>
    </div>
  );
}

function Section({ number, title, children }) {
  return (
    <section className="mb-5" data-testid={`privacy-section-${number}`}>
      <h2
        className="mb-1.5 font-bold uppercase text-sm"
        style={{
          fontFamily: "Cinzel, serif",
          letterSpacing: "0.12em",
          color: "#F5A623",
        }}
      >
        {number}. {title}
      </h2>
      <p
        className="text-sm leading-relaxed"
        style={{ color: "rgba(245,240,232,0.85)" }}
      >
        {children}
      </p>
    </section>
  );
}
