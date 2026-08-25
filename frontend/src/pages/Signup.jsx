import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { apiErr } from "@/lib/api";
import { toast } from "sonner";
import { Shield, UserPlus, User, Lock, Loader2, Clock, Users } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Signup via invite token — public route at `/kayit/:token`.
 * Fetches invite preview, gates the form on the invite status, then calls
 * `/api/invites/consume` and adopts the returned JWT into AuthContext.
 */
export default function Signup() {
  const { token } = useParams();
  const { adoptSession, user } = useAuth();
  const nav = useNavigate();
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // v119 — KVKK consent checkboxes. Both default UNCHECKED as required by
  // KVKK "açık rıza" doctrine (explicit consent must be opt-in, never
  // pre-ticked). Neither field is validated as required — they are shown
  // for transparency and captured for audit, matching Aydınlatma /
  // Açık Rıza distinction.
  const [ackNotice, setAckNotice] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  // v121 — Terms of Service acknowledgment (REQUIRED to submit). Separate
  // from the two KVKK checkboxes above so the user reads them one by one.
  const [ackTerms, setAckTerms] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/invites/preview/${encodeURIComponent(token)}`)
      .then((r) => { if (!cancelled) setPreview(r.data); })
      .catch((e) => { if (!cancelled) setPreviewErr(apiErr(e)); });
    return () => { cancelled = true; };
  }, [token]);

  if (user) {
    // Already logged in — invites are for new members; redirect home.
    setTimeout(() => nav("/", { replace: true }), 0);
    return null;
  }

  const status = preview?.status;
  const statusChip = {
    active: { bg: "rgba(34,197,94,0.2)", color: "#86EFAC", label: "AKTİF" },
    full: { bg: "rgba(239,68,68,0.2)", color: "#FCA5A5", label: "DOLU" },
    expired: { bg: "rgba(239,68,68,0.2)", color: "#FCA5A5", label: "SÜRESİ DOLDU" },
    disabled: { bg: "rgba(120,113,108,0.2)", color: "#D6D3D1", label: "İPTAL EDİLDİ" },
  }[status] || null;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || password.length < 6) {
      toast.error("Kullanıcı adı ve en az 6 karakter şifre zorunlu");
      return;
    }
    if (!ackTerms) {
      toast.error("Devam etmek için Kullanım Şartları'nı kabul etmelisin");
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/invites/consume`, {
        token,
        username: username.trim().toLowerCase(),
        password,
        // v121 — persist Terms acceptance timestamp for KVKK audit trail.
        // ackNotice + emailOptIn stay client-side (informational per KVKK).
        terms_accepted_at: new Date().toISOString(),
      });
      adoptSession(data.token, data.user);
      toast.success(`Hoşgeldin ${data.user.username}!`);
      nav("/dashboard", { replace: true });
    } catch (err) {
      toast.error(apiErr(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" data-testid="signup-page">
      <div className="w-full max-w-sm fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl red-gold-gradient flex items-center justify-center mb-3 shadow-lg">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold uppercase tracking-widest">
            <span className="red-text">Davet</span> <span className="gold-text">Kayıt</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">
            TiTaNXiS Loncası'na katıl
          </p>
        </div>

        {previewErr && (
          <div className="card-red-gold p-4 text-center" data-testid="signup-invite-error">
            <div className="text-red-300 text-sm mb-2">{previewErr}</div>
            <Link to="/login" className="text-[10px] gold-text uppercase tracking-widest">
              Girişe dön
            </Link>
          </div>
        )}

        {preview && (
          <div className="card-red-gold p-5 space-y-4" data-testid="signup-invite-card">
            {/* Invite info */}
            <div className="rounded p-2 space-y-1"
                 style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(120,53,15,0.35)" }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest gold-text font-bold">Davet Detayı</span>
                {statusChip && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: statusChip.bg, color: statusChip.color }}
                        data-testid={`signup-status-${status}`}>
                    {statusChip.label}
                  </span>
                )}
              </div>
              {preview.note && (
                <div className="text-xs text-white italic">"{preview.note}"</div>
              )}
              <div className="text-[10px] text-muted-foreground flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><Users className="w-2.5 h-2.5" />
                  {preview.uses}{preview.max_uses ? ` / ${preview.max_uses}` : " / ∞"} kullanım
                </span>
                {preview.expires_at && (
                  <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />
                    {new Date(preview.expires_at).toLocaleString("tr-TR")}
                  </span>
                )}
                {preview.created_by_username && (
                  <span>by <span className="gold-text">{preview.created_by_username}</span></span>
                )}
              </div>
            </div>

            {status === "active" ? (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Kullanıcı Adı</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      data-testid="signup-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      minLength={3} maxLength={32} required
                      placeholder="3-32 karakter"
                      className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Şifre</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      data-testid="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6} required
                      placeholder="En az 6 karakter"
                      className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                {/* v119 — KVKK consent block. Small font, dark theme, both
                    opt-in checkboxes default OFF. Aydınlatma is informational;
                    e-posta rızası is separate açık rıza per KVKK. */}
                <div
                  data-testid="signup-kvkk-block"
                  className="space-y-2 rounded-md px-2.5 py-2"
                  style={{
                    background: "rgba(10,6,4,0.55)",
                    border: "1px dashed rgba(245,166,35,0.28)",
                  }}
                >
                  <label
                    className="flex items-start gap-2 cursor-pointer"
                    data-testid="signup-kvkk-notice-label"
                  >
                    <input
                      type="checkbox"
                      data-testid="signup-kvkk-notice"
                      checked={ackNotice}
                      onChange={(e) => setAckNotice(e.target.checked)}
                      className="mt-0.5 flex-shrink-0 accent-amber-500"
                      style={{ width: 12, height: 12 }}
                    />
                    <span className="text-[10px] leading-snug" style={{ color: "#D6C9A6" }}>
                      <Link
                        to="/privacy"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline"
                        style={{ color: "#F5A623" }}
                      >
                        Aydınlatma Metni
                      </Link>
                      'ni okudum ve anladım.{" "}
                      <span style={{ color: "rgba(214,201,166,0.55)" }}>(Bilgilendirme)</span>
                    </span>
                  </label>
                  <label
                    className="flex items-start gap-2 cursor-pointer"
                    data-testid="signup-kvkk-email-optin-label"
                  >
                    <input
                      type="checkbox"
                      data-testid="signup-kvkk-email-optin"
                      checked={emailOptIn}
                      onChange={(e) => setEmailOptIn(e.target.checked)}
                      className="mt-0.5 flex-shrink-0 accent-amber-500"
                      style={{ width: 12, height: 12 }}
                    />
                    <span className="text-[10px] leading-snug" style={{ color: "#D6C9A6" }}>
                      Tarafıma oyun ve etkinlik güncellemeleriyle ilgili e-posta gönderilmesine onay veriyorum.{" "}
                      <span style={{ color: "rgba(214,201,166,0.55)" }}>(Açık Rıza · İsteğe bağlı)</span>
                    </span>
                  </label>
                  {/* v121 — Terms of Service acceptance (REQUIRED). Rendered
                      distinctly (amber accent + solid border) so users see
                      it's a gate, not an optional flag. */}
                  <label
                    className="flex items-start gap-2 cursor-pointer pt-2"
                    style={{ borderTop: "1px solid rgba(245,166,35,0.20)" }}
                    data-testid="signup-terms-ack-label"
                  >
                    <input
                      type="checkbox"
                      data-testid="signup-terms-ack"
                      checked={ackTerms}
                      onChange={(e) => setAckTerms(e.target.checked)}
                      className="mt-0.5 flex-shrink-0 accent-amber-500"
                      style={{ width: 12, height: 12 }}
                      required
                    />
                    <span className="text-[10px] leading-snug" style={{ color: "#EAD8B0" }}>
                      <Link
                        to="/terms"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline"
                        style={{ color: "#F5A623" }}
                      >
                        Kullanım Şartları
                      </Link>
                      'nı okudum ve kabul ediyorum.{" "}
                      <span style={{ color: "#F87171", fontWeight: 700 }}>(Zorunlu)</span>
                    </span>
                  </label>
                </div>
                <button
                  data-testid="signup-submit"
                  type="submit"
                  disabled={busy || !ackTerms}
                  className="btn-gold w-full flex items-center justify-center gap-2 py-3"
                  style={(busy || !ackTerms) ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                  title={!ackTerms ? "Devam etmek için Kullanım Şartları'nı kabul et" : undefined}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {busy ? "Kayıt yapılıyor…" : "Katıl"}
                </button>
              </form>
            ) : (
              <div className="text-center text-xs text-muted-foreground">
                Bu davet linki artık geçerli değil. Lütfen bir yöneticiden yeni bir davet iste.
              </div>
            )}

            <Link to="/login" className="block text-center text-[10px] text-muted-foreground hover:gold-text uppercase tracking-widest">
              Zaten bir hesabın var mı? Giriş yap
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
