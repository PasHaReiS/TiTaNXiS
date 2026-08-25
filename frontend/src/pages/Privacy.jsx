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
              TiTaNXiS Bot — Privacy Policy
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

        <Section number="1" title="Data Collected">
          This bot stores only your Telegram user ID and preferred language.
          Personal messages are not stored or logged.
        </Section>

        <Section number="2" title="Data Usage">
          Data is used solely to send you notifications. It is never shared
          with third parties.
        </Section>

        <Section number="3" title="Data Retention">
          All your data is deleted when you stop using the bot.
        </Section>

        <Section number="4" title="Contact">
          For questions:{" "}
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
