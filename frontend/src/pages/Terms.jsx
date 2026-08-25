import React from "react";
import { Link } from "react-router-dom";
import { ScrollText, ArrowLeft } from "lucide-react";

/**
 * v120 — Terms of Service (Kullanım Şartları).
 * Public route at /terms — dark stone theme to match /privacy. Same section
 * skeleton so users get a consistent legal-page rhythm across the app.
 */
export default function Terms() {
  return (
    <div
      className="min-h-screen w-full flex items-start justify-center py-10 px-4"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% -10%, rgba(231,76,26,0.10), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(76,29,149,0.12), transparent 60%), linear-gradient(180deg,#0A0604 0%,#120806 100%)",
        color: "#F5F0E8",
      }}
      data-testid="terms-page"
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
            <ScrollText className="w-5 h-5" style={{ color: "#0B0704" }} />
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
              data-testid="terms-title"
            >
              TiTaNXiS — Terms of Service
            </h1>
            <div
              className="text-[11px] mt-1 uppercase"
              style={{ color: "#D4730A", letterSpacing: "0.14em" }}
              data-testid="terms-updated"
            >
              Last updated: February 2026
            </div>
          </div>
        </div>

        <Section number="1" title="Acceptance of Terms">
          By creating an account or using TiTaNXiS ("the App"), you agree to be
          bound by these Terms of Service. If you do not agree, do not use the
          App.
        </Section>

        <Section number="2" title="Eligibility">
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 13 years old to use TiTaNXiS.</li>
            <li>
              You are responsible for keeping your account credentials
              confidential.
            </li>
            <li>
              One person = one account. Sharing accounts is not permitted.
            </li>
          </ul>
        </Section>

        <Section number="3" title="Acceptable Use">
          <ul className="list-disc pl-5 space-y-1">
            <li>Do not use the App for harassment, spam, or illegal activity.</li>
            <li>Do not attempt to reverse-engineer, scrape, or overload the service.</li>
            <li>Do not impersonate other players, alliances, or leadership.</li>
            <li>
              Content you submit (nicknames, notes, screenshots) must not
              violate copyright, laws, or third-party rights.
            </li>
          </ul>
        </Section>

        <Section number="4" title="User Content">
          You retain ownership of content you submit (nicknames, OCR
          screenshots, notes). By submitting content, you grant TiTaNXiS a
          non-exclusive, worldwide license to display it within the App to
          alliance members and administrators.
        </Section>

        <Section number="5" title="Account Suspension & Termination">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Administrators may suspend or terminate accounts that violate
              these Terms.
            </li>
            <li>
              You may delete your account at any time from your Profile page
              (KVKK "right to be forgotten").
            </li>
          </ul>
        </Section>

        <Section number="6" title="Disclaimer of Warranty">
          The App is provided <b>"as is"</b> without warranties of any kind.
          TiTaNXiS is a fan-made companion tool and is not affiliated with
          Lands of Jail or its publishers.
        </Section>

        <Section number="7" title="Limitation of Liability">
          To the maximum extent permitted by law, TiTaNXiS is not liable for
          any indirect, incidental, or consequential damages arising from your
          use of the App, including lost data, missed events, or in-game
          losses.
        </Section>

        <Section number="8" title="Changes to Terms">
          We may update these Terms from time to time. Continued use of the
          App after changes are posted constitutes acceptance of the updated
          Terms.
        </Section>

        <Section number="9" title="Contact">
          <div className="space-y-1">
            <div>
              Website:{" "}
              <a
                href="https://titanxis.com"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="terms-website-link"
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
              Privacy:{" "}
              <Link
                to="/privacy"
                data-testid="terms-privacy-link"
                style={{
                  color: "#F5A623",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(245,166,35,0.55)",
                }}
              >
                Privacy Policy
              </Link>
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
            data-testid="terms-back-home"
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
    <section className="mb-5" data-testid={`terms-section-${number}`}>
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
      <div
        className="text-sm leading-relaxed"
        style={{ color: "rgba(245,240,232,0.85)" }}
      >
        {children}
      </div>
    </section>
  );
}
