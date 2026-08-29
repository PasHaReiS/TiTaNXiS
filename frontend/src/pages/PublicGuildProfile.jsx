import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Users, Calendar, Sparkles, ChevronRight, ShieldCheck, Loader2 } from "lucide-react";
import LegalFooter from "@/components/LegalFooter";

/**
 * Public Guild Profile — /lonca (also aliased at /guild).
 * v135.28 — Visible without login so recruits landing from Discord or
 * screenshots can see who we are before opening an account. Static labels
 * are routed through `useTranslation()` with Turkish fallback strings.
 */
export default function PublicGuildProfile() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    // Use fetch (not the axios `api` helper) so we don't send the JWT — this
    // stays a true public endpoint even when the visitor was logged in.
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/guild/public`;
    fetch(url).then((r) => r.json())
      .then((j) => setData(j))
      .catch((e) => setErr(e?.message || "network error"));
  }, []);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
           style={{ background: "#0A0806" }} data-testid="guild-public-error">
        <div className="card-red-gold p-6 max-w-md w-full text-center text-sm text-white">
          {t("guild_public_error",
             "Lonca bilgisi şu an yüklenemiyor. Bir dakika sonra tekrar dene.")}
          <div className="text-[10px] text-muted-foreground mt-2 font-mono">{err}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: "#0A0806" }} data-testid="guild-public-loading">
        <Loader2 className="w-6 h-6 animate-spin gold-text" />
      </div>
    );
  }

  const inviteHref = data.invite_token ? `/kayit/${data.invite_token}` : null;

  return (
    <div className="min-h-screen relative" style={{ background: "#0A0806" }}
         data-testid="guild-public-page">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Hero — logo + name + tagline */}
        <div className="card-red-gold p-6 flex items-center gap-4 flex-wrap"
             data-testid="guild-public-hero">
          <img
            src={data.logo_url}
            alt={data.guild_name}
            className="w-24 h-24 rounded-lg object-cover"
            style={{ boxShadow: "0 0 24px rgba(245,166,35,0.35)",
                     border: "1px solid rgba(245,166,35,0.55)" }}
            data-testid="guild-public-logo"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("guild_public_hero_kicker", "Lonca Profili")}
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold gold-text tracking-wide"
              data-testid="guild-public-name"
            >
              {data.guild_name}
            </h1>
            {data.tagline && (
              <div className="text-sm text-white italic mt-1" data-testid="guild-public-tagline">
                "{data.tagline}"
              </div>
            )}
          </div>
        </div>

        {/* Stats — üye sayısı + aktif etkinlik */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card-red-gold p-4" data-testid="guild-public-members-card">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 gold-text" />
              <span className="text-[10px] uppercase tracking-widest gold-text">
                {t("guild_public_members_label", "Üye Sayısı")}
              </span>
            </div>
            <div className="text-3xl font-bold text-white mt-1 font-mono"
                 data-testid="guild-public-member-count">
              {data.member_count.toLocaleString("tr-TR")}
            </div>
          </div>
          <div className="card-red-gold p-4" data-testid="guild-public-events-card">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 gold-text" />
              <span className="text-[10px] uppercase tracking-widest gold-text">
                {t("guild_public_active_events_label", "Aktif Etkinlik")}
              </span>
            </div>
            <div className="text-3xl font-bold text-white mt-1 font-mono"
                 data-testid="guild-public-event-count">
              {data.active_events_count}
            </div>
          </div>
        </div>

        {/* Son / yaklaşan etkinlikler */}
        <div className="card-red-gold p-4 space-y-2"
             data-testid="guild-public-events-list">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 gold-text" />
            <div className="text-[11px] uppercase tracking-widest gold-text font-bold">
              {t("guild_public_recent_events", "Yaklaşan Etkinlikler")}
            </div>
          </div>
          {(!data.recent_events || data.recent_events.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t("guild_public_events_empty",
                 "Şu an yayınlanan etkinlik yok — yakında yeni takvim!")}
            </div>
          )}
          {(data.recent_events || []).map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-3 rounded p-2"
              style={{ background: "rgba(245,166,35,0.05)",
                       border: "1px solid rgba(245,166,35,0.20)" }}
              data-testid={`guild-public-event-${ev.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-bold truncate">{ev.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {new Date(ev.date).toLocaleString("tr-TR", {
                    dateStyle: "medium", timeStyle: "short",
                  })}
                  {ev.group_name && ` · ${ev.group_name}`}
                  {ev.multiplier && ev.multiplier !== 1 && ` · ×${ev.multiplier}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA — davet / katıl */}
        <div className="card-red-gold p-4 flex items-center gap-3 flex-wrap"
             data-testid="guild-public-cta">
          <ShieldCheck className="w-5 h-5 gold-text" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-bold">
              {t("guild_public_cta_title", "Aramıza katılmak ister misin?")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("guild_public_cta_body",
                 "TiTaNXiS güçlü bir gaming loncası. Davet linkin varsa hemen kaydol, yoksa admin ile iletişime geç.")}
            </div>
          </div>
          {inviteHref ? (
            <button
              type="button"
              onClick={() => nav(inviteHref)}
              className="btn-gold text-sm flex items-center gap-1.5 px-3 py-2"
              data-testid="guild-public-invite-btn"
            >
              {t("guild_public_invite_btn", "Davet ile Kaydol")}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => nav("/vip-destek")}
              className="btn-outline text-sm flex items-center gap-1.5 px-3 py-2"
              data-testid="guild-public-contact-btn"
            >
              {t("guild_public_contact_btn", "İletişime Geç")}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
