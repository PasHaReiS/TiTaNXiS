import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ShieldCheck, ShieldAlert, Loader2, Award, ExternalLink } from "lucide-react";

/**
 * VerifyCertificate — public, no-auth page rendered at `/sertifika/:token`.
 * Displays a stamp (valid / invalid) and the certificate metadata so a
 * third party (recruiter, alliance partner) can prove authenticity by
 * scanning the QR on the certificate PNG.
 */
export default function VerifyCertificate() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, cert: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/certificates/verify/${encodeURIComponent(token)}`);
        if (!cancelled) setState({ loading: false, cert: r.data, error: null });
      } catch (e) {
        if (!cancelled) setState({ loading: false, cert: null, error: e?.response?.data?.detail || "Sertifika bulunamadı" });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const cert = state.cert;
  const backend = process.env.REACT_APP_BACKEND_URL;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
         style={{ background: "radial-gradient(ellipse at top, #180810 0%, #05020a 60%, #000000 100%)" }}
         data-testid="verify-certificate-page">
      <div className="w-full max-w-lg card-red-gold p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-6 h-6 gold-text" />
          <h1 className="text-lg font-bold uppercase tracking-widest gold-text">
            Sertifika Doğrulama
          </h1>
        </div>

        {state.loading && (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Doğrulanıyor…</span>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="text-center py-8 space-y-3" data-testid="verify-invalid">
            <ShieldAlert className="w-12 h-12 mx-auto text-red-400" />
            <div className="text-lg font-bold text-red-300 uppercase tracking-wide">Geçersiz</div>
            <p className="text-sm text-muted-foreground">{state.error}</p>
            <div className="text-[10px] mono text-muted-foreground">Token: {token}</div>
          </div>
        )}

        {!state.loading && cert && (
          <>
            <div className="flex flex-col items-center gap-2 py-4" data-testid="verify-valid">
              <ShieldCheck className="w-12 h-12" style={{ color: "#34D399" }} />
              <div className="text-lg font-bold uppercase tracking-widest" style={{ color: "#34D399" }}>
                Doğrulandı
              </div>
              <div className="text-[11px] text-muted-foreground">
                Bu sertifika TiTaNXiS Loncası tarafından verilmiştir.
              </div>
            </div>

            <div className="rounded p-4 space-y-2"
                 style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.35)" }}>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Sertifika</div>
                <div className="text-base font-bold text-white" data-testid="verify-cert-title">{cert.title}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Alan</div>
                  <div className="text-white font-bold" data-testid="verify-cert-member">{cert.member_name || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Etkinlik</div>
                  <div className="text-white" data-testid="verify-cert-event">{cert.event_name || "—"}</div>
                </div>
                {cert.event_date && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Etkinlik Tarihi</div>
                    <div className="text-white mono text-[11px]">{new Date(cert.event_date).toLocaleDateString("tr-TR")}</div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-widest">Verilme</div>
                  <div className="text-white mono text-[11px]" data-testid="verify-cert-issued">{new Date(cert.issued_at).toLocaleString("tr-TR")}</div>
                </div>
              </div>
              <div className="pt-2 flex items-center gap-2">
                <a
                  href={`${backend}/api/certificates/${cert.id}/image.png`}
                  target="_blank" rel="noreferrer"
                  className="chip text-[11px] flex items-center gap-1"
                  data-testid="verify-cert-image-link"
                >
                  <ExternalLink className="w-3 h-3" /> Sertifika Görselini Aç
                </a>
              </div>
            </div>

            <div className="text-center text-[10px] text-muted-foreground pt-2">
              <Link to="/lonca" className="hover:underline">TiTaNXiS Loncası</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
