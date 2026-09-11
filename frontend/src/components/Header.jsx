import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { BADGES_ENABLED } from "@/lib/features";
import { Sun, Moon, LogIn, LogOut, User as UserIcon, Shield, Settings, Download, KeyRound, Activity, Sparkles, LayoutGrid, LifeBuoy, LayoutDashboard, History, BellRing, Megaphone, ChevronDown, ChevronRight, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LogoVideoModal from "@/components/LogoVideoModal";
import NotificationBell from "@/components/NotificationBell";
import Breadcrumb from "@/components/Breadcrumb";
import { LEADERBOARD } from "@/constants/testIds";
import { api } from "@/lib/api";
import { toast } from "sonner";

const BRAND_LOGO_URL = "/brand/titanxis-logo.jpg";

function MenuItem({ icon: Icon, emoji, label, onClick, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-primary/15 text-left transition-colors"
      style={{ fontFamily: "Cinzel, Rajdhani, serif", letterSpacing: "0.06em" }}
    >
      {emoji ? (
        <span
          aria-hidden="true"
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 14, height: 14, fontSize: 13, lineHeight: 1 }}
        >
          {emoji}
        </span>
      ) : Icon ? (
        <Icon className="w-3.5 h-3.5 gold-text flex-shrink-0" />
      ) : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function Header({ title, children }) {
  const { theme, toggle } = useTheme();
  const { user, isAdmin, canEdit, isGuest, logout } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const [logoVideoOpen, setLogoVideoOpen] = useState(false);
  const [yonetimOpen, setYonetimOpen] = useState(false);
  const menuRef = useRef(null);
  const { canInstall: canInstallPwa, install: installPwa } = usePwaInstall();

  // Reset "Yönetim" accordion when the main dropdown is closed so re-opening
  // the profile menu always starts clean/collapsed.
  useEffect(() => {
    if (!menuOpen) setYonetimOpen(false);
  }, [menuOpen]);

  const downloadXlsx = () => {
    try {
      const url = `${api.defaults.baseURL}/export/xlsx`;
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `detayli_rapor_${today}.xlsx`;
      a.click();
      toast.success(t("report_downloaded"));
    } catch (e) {
      toast.error(t("report_failed"));
    }
    setMenuOpen(false);
  };

  const goto = (path) => { nav(path); setMenuOpen(false); };

  // Portal target: `#titanxis-header-slot` (a `flexShrink:0` direct child of
  // `.app-shell`, mounted by <Layout/>). Rendering the whole header block
  // there makes it a real flex child — no `position: sticky` involved, so no
  // mobile-Safari sticky/transform quirks can shift it out of view.
  const [headerSlot, setHeaderSlot] = useState(null);
  useEffect(() => {
    const el = document.getElementById("titanxis-header-slot");
    if (el) setHeaderSlot(el);
  }, []);

  const headerContent = (
    <div data-testid="header-sticky-slot">
      {/* Row 1 — Top bar: logo + notification + theme + language + profile */}
      <div
        data-testid="header-top-bar"
        className="pb-1"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingLeft: "max(16px, env(safe-area-inset-left))",
          paddingRight: "max(16px, env(safe-area-inset-right))",
        }}
      >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div
            className="relative flex-shrink-0"
            data-testid="header-logo-wrap"
            style={{ width: "100%", maxWidth: "min(78vw, 480px)", lineHeight: 0 }}
          >
            <img
              src={BRAND_LOGO_URL}
              alt="TiTaNXiS Game Guide"
              data-testid="header-brand-logo"
              onClick={() => setLogoVideoOpen(true)}
              className="header-brand-logo cursor-pointer"
              style={{
                height: "auto",
                maxHeight: 112,
                width: "100%",
                objectFit: "contain",
                objectPosition: "left center",
                borderRadius: 8,
                filter:
                  "drop-shadow(0 0 8px rgba(147,51,234,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
              }}
            />
            {user && (
              <span
                data-testid="header-role-insignia"
                title={isAdmin ? t("admin") : canEdit ? t("can_edit_badge") : t("view_only")}
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -6,
                  padding: "2px 8px",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  lineHeight: 1.2,
                  fontFamily: "'Cinzel', 'Rajdhani', serif",
                  color: isAdmin ? "#0D0D0D" : "#F5E7A8",
                  background: isAdmin
                    ? "linear-gradient(180deg, #F5D06A 0%, #D4AF37 50%, #A87B1A 100%)"
                    : canEdit
                    ? "linear-gradient(180deg, #34D399 0%, #059669 100%)"
                    : "linear-gradient(180deg, #6B7280 0%, #374151 100%)",
                  border: "1px solid rgba(255,230,170,0.85)",
                  borderRadius: 999,
                  boxShadow:
                    "0 0 10px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
                  textShadow: isAdmin
                    ? "0 1px 0 rgba(255,255,255,0.35)"
                    : "0 1px 0 rgba(0,0,0,0.55)",
                  zIndex: 3,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {isAdmin
                  ? t("admin").toUpperCase()
                  : canEdit
                  ? t("can_edit_badge").toUpperCase()
                  : t("view_only").toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <NotificationBell />

        <button
          data-testid={LEADERBOARD.themeToggle}
          onClick={toggle}
          className="w-8 h-8 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors flex-shrink-0"
          aria-label={t("choose_language")}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5 gold-text" /> : <Moon className="w-3.5 h-3.5 red-text" />}
        </button>

        <LanguageSwitcher />

        {user ? (
          <div ref={menuRef} className="relative">
            <button
              data-testid="header-profile"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1 px-1.5 h-8 rounded-full border border-border hover:border-primary transition-colors flex-shrink-0"
              title={user.username}
              aria-expanded={menuOpen}
            >
              {isAdmin ? <Shield className="w-3 h-3 gold-text" /> : <UserIcon className="w-3 h-3 text-white" />}
              <span className="text-[10px] font-bold uppercase truncate max-w-[52px]">{user.username}</span>
            </button>

            {menuOpen && ReactDOM.createPortal(
              <>
                <div
                  data-testid="header-profile-overlay"
                  onClick={() => setMenuOpen(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 999998, background: "transparent" }}
                />
                <div
                  data-testid="header-profile-dropdown"
                  style={{
                    position: "fixed",
                    top: "60px",
                    right: "8px",
                    zIndex: 999999,
                    minWidth: 220,
                    background: "#1E1410",
                    border: "1px solid #E74C1A",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.95)",
                    borderRadius: 8,
                    overflow: "visible",
                  }}
                >
                  {/* v142.7 — PWA install button (top of menu, only if supported & not installed) */}
                  {canInstallPwa && (
                    <button
                      type="button"
                      data-testid="dropdown-install-pwa"
                      onClick={async () => {
                        const res = await installPwa();
                        if (res?.outcome === "accepted") setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(59,130,246,0.12))",
                        borderBottom: "1px solid rgba(139,92,246,0.35)",
                        color: "#F5F0E8",
                        fontFamily: "Rajdhani, sans-serif",
                        fontWeight: 700,
                      }}
                    >
                      <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: "#A78BFA" }} />
                      <span className="flex-1">
                        {t("pwa_install_menu_label", "Uygulamayı Yükle")}
                      </span>
                      <span className="text-base flex-shrink-0" aria-hidden>📲</span>
                    </button>
                  )}

                  {/* v136 — Menü yeniden yapılandırması:
                      • Kullanıcı öğeleri kök seviyede (Türkçe alfabetik).
                      • Admin/editor öğeleri "Yönetim" accordion altında.
                      • "Üye Ekle — OCR" tamamen gizlendi.
                      • "Çıkış Yap" ayırıcının altında sabit. */}

                  {/* Root-level user items (all logged-in users) */}
                  <MenuItem
                    emoji="🗳️"
                    label={t("dropdown_polls", "Anketler")}
                    onClick={() => goto("/anketler")}
                    testId="dropdown-polls"
                  />
                  <MenuItem
                    emoji="📜"
                    label={t("nav_guild_rules", "Lonca Kuralları")}
                    onClick={() => goto("/kurallar")}
                    testId="dropdown-guild-rules"
                  />
                  <MenuItem
                    emoji="🙂"
                    label={t("my_profile")}
                    onClick={() => goto("/profil")}
                    testId="dropdown-profile"
                  />
                  <MenuItem
                    emoji="⚔️"
                    label={t("dropdown_svs", "SvS Takip")}
                    onClick={() => goto("/svs")}
                    testId="dropdown-svs"
                  />
                  <MenuItem
                    emoji="🎟️"
                    label={t("nav_vip_support") || "VIP Destek"}
                    onClick={() => goto("/vip-destek")}
                    testId="dropdown-vip-support"
                  />

                  {/* Management accordion — visible only to admins/editors */}
                  {(isAdmin || canEdit) && (
                    <>
                      <div style={{ height: 1, background: "rgba(231,76,26,0.3)", margin: "4px 0" }} />
                      <button
                        type="button"
                        data-testid="dropdown-yonetim-toggle"
                        aria-expanded={yonetimOpen}
                        onClick={() => setYonetimOpen((v) => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-primary/15"
                        style={{
                          fontFamily: "Cinzel, Rajdhani, serif",
                          letterSpacing: "0.08em",
                          color: "#F5D06A",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        {yonetimOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 gold-text flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 gold-text flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate">
                          {t("nav_management_group", "Yönetim")}
                        </span>
                        <Shield className="w-3 h-3 gold-text opacity-70 flex-shrink-0" />
                      </button>
                      {yonetimOpen && (
                        <div
                          data-testid="dropdown-yonetim-panel"
                          style={{
                            background: "rgba(0,0,0,0.35)",
                            borderTop: "1px solid rgba(231,76,26,0.2)",
                            borderBottom: "1px solid rgba(231,76,26,0.2)",
                            paddingLeft: 10,
                          }}
                        >
                          {/* v142.1 — Türkçe alfabetik sıra:
                              A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z
                              Sıra: Audit Log → Bildirim Yönlendirme → Bildirimler →
                              Detaylı Rapor → Duplicate Üyeler → Duyurular → Görevler →
                              Kullanıcı Yönetimi → Puanlar Hakkında → Rozet Yönetimi →
                              Sertifika Ver → Şablonlar */}
                          {isAdmin && (
                            <MenuItem
                              emoji="📋"
                              label={t("nav_audit_log", { defaultValue: "Audit Log" })}
                              onClick={() => goto("/admin/audit-log")}
                              testId="dropdown-audit-log"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="🔔"
                              label={t("nav_notification_routing", { defaultValue: "Bildirim Yönlendirme" })}
                              onClick={() => goto("/admin/bildirim-yonlendirme")}
                              testId="dropdown-notification-routing"
                            />
                          )}
                          {canEdit && (
                            <MenuItem
                              emoji="🔔"
                              label={t("nav_notifications_hub") || "Bildirimler"}
                              onClick={() => goto("/etkinlik-bildirimleri")}
                              testId="dropdown-event-notifications"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="📥"
                              label={t("detailed_report")}
                              onClick={downloadXlsx}
                              testId="dropdown-export"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="🔍"
                              label={t("nav_duplicate_members", { defaultValue: "Duplicate Üyeler" })}
                              onClick={() => goto("/admin/duplicate-uyeler")}
                              testId="dropdown-duplicate-members"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="📣"
                              label={t("nav_announcements", "Duyurular")}
                              onClick={() => goto("/admin/duyurular")}
                              testId="dropdown-announcements"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="📋"
                              label={t("nav_admin_todos", "Görevler")}
                              onClick={() => goto("/admin/gorevler")}
                              testId="dropdown-admin-todos"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="👤"
                              label={t("nav_user_mgmt", { defaultValue: "Kullanıcı Yönetimi" })}
                              onClick={() => goto("/kullanicilar")}
                              testId="dropdown-users"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="📖"
                              label={t("nav_points_about") || "Puanlar Hakkında"}
                              onClick={() => goto("/puanlar-hakkinda")}
                              testId="dropdown-points-about"
                            />
                          )}
                          {isAdmin && BADGES_ENABLED && (
                            <MenuItem
                              emoji="🏅"
                              label={t("nav_badges_admin", "Rozet Yönetimi")}
                              onClick={() => goto("/admin/rozetler")}
                              testId="dropdown-badges"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="🏆"
                              label={t("nav_issue_cert", "Sertifika Ver")}
                              onClick={() => goto("/admin/sertifika-ver")}
                              testId="dropdown-issue-cert"
                            />
                          )}
                          {isAdmin && (
                            <MenuItem
                              emoji="📚"
                              label={t("nav_templates", "Şablonlar")}
                              onClick={() => goto("/sablonlar")}
                              testId="dropdown-templates"
                            />
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ height: 1, background: "rgba(231,76,26,0.3)" }} />
                  <MenuItem
                    emoji="🚪"
                    label={t("logout")}
                    onClick={() => {
                      logout();
                      nav("/");
                      toast.success(t("logout_done"));
                      setMenuOpen(false);
                    }}
                    testId="dropdown-logout"
                  />
                </div>
              </>,
              document.body
            )}
          </div>
        ) : (
          loc.pathname !== "/login" && (
            isGuest ? (
              // v136 — Ziyaretçi menüsü: public linkler + "Giriş Yap" alt aksiyonu.
              <div className="relative">
                <button
                  data-testid="header-guest-menu-btn"
                  onClick={() => setGuestMenuOpen((v) => !v)}
                  className="flex items-center gap-1 px-2 h-8 rounded-full border border-amber-500/55 text-amber-200 text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                  style={{ background: "rgba(245,166,35,0.10)" }}
                  aria-expanded={guestMenuOpen}
                  title={t("guest_login_hint", "Sadece Sıralama ekranını görüntüle")}
                >
                  🎭 {t("guest_badge", "Ziyaretçi")}
                </button>
                {guestMenuOpen && ReactDOM.createPortal(
                  <>
                    <div
                      data-testid="header-guest-overlay"
                      onClick={() => setGuestMenuOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 999998, background: "transparent" }}
                    />
                    <div
                      data-testid="header-guest-dropdown"
                      style={{
                        position: "fixed",
                        top: "60px",
                        right: "8px",
                        zIndex: 999999,
                        minWidth: 220,
                        background: "#1E1410",
                        border: "1px solid rgba(245,166,35,0.55)",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.95)",
                        borderRadius: 8,
                        overflow: "visible",
                      }}
                    >
                      {/* Public items */}
                      <MenuItem
                        emoji="🏆"
                        label={t("nav_leaderboard", "Sıralama")}
                        onClick={() => { nav("/"); setGuestMenuOpen(false); }}
                        testId="guest-menu-leaderboard"
                      />
                      <MenuItem
                        emoji="📣"
                        label={t("nav_announcements", "Duyurular")}
                        onClick={() => { nav("/duyurular"); setGuestMenuOpen(false); }}
                        testId="guest-menu-announcements"
                      />
                      <MenuItem
                        emoji="📜"
                        label={t("nav_guild_rules", "Lonca Kuralları")}
                        onClick={() => { nav("/kurallar"); setGuestMenuOpen(false); }}
                        testId="guest-menu-rules"
                      />
                      <MenuItem
                        emoji="🏰"
                        label={t("nav_guild_profile", "Lonca")}
                        onClick={() => { nav("/lonca"); setGuestMenuOpen(false); }}
                        testId="guest-menu-guild"
                      />
                      <MenuItem
                        emoji="🧮"
                        label={t("nav_point_calc", "Puan Hesaplama")}
                        onClick={() => { nav("/puan-hesaplama"); setGuestMenuOpen(false); }}
                        testId="guest-menu-point-calc"
                      />
                      <MenuItem
                        emoji="🎟️"
                        label={t("nav_vip_support", "VIP Destek")}
                        onClick={() => { nav("/vip-destek"); setGuestMenuOpen(false); }}
                        testId="guest-menu-vip-support"
                      />
                      {/* v136 — Kilitli sayfa örneklerini gri renkle göster */}
                      <div style={{ height: 1, background: "rgba(148,163,184,0.25)", margin: "4px 0" }} />
                      <div
                        style={{
                          padding: "4px 12px 2px",
                          fontSize: 8,
                          fontWeight: 800,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "#94A3B8",
                          fontFamily: "Cinzel, serif",
                        }}
                      >
                        {t("guest_locked_section", "🔒 Kilitli (Giriş Gerekli)")}
                      </div>
                      {[
                        { emoji: "📅", label: t("nav_events", "Etkinlikler"), path: "/etkinlikler", tid: "guest-menu-events-locked" },
                        { emoji: "👥", label: t("nav_members", "Üyeler"), path: "/uyeler", tid: "guest-menu-members-locked" },
                        { emoji: "🙂", label: t("my_profile", "Profilim"), path: "/profil", tid: "guest-menu-profile-locked" },
                        { emoji: "⚔️", label: t("dropdown_svs", "SvS Takip"), path: "/svs", tid: "guest-menu-svs-locked" },
                      ].map((it) => (
                        <button
                          key={it.tid}
                          type="button"
                          data-testid={it.tid}
                          onClick={() => { nav(it.path); setGuestMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                          style={{
                            color: "#6B7280",
                            fontFamily: "Cinzel, Rajdhani, serif",
                            letterSpacing: "0.06em",
                            filter: "grayscale(1)",
                            opacity: 0.75,
                          }}
                          title={t("locked_page_message", "Bu sayfayı görüntülemek için giriş yapmalısınız")}
                        >
                          <span aria-hidden style={{ width: 14, height: 14, fontSize: 13, lineHeight: 1 }}>{it.emoji}</span>
                          <span className="truncate flex-1">{it.label}</span>
                          <span style={{ fontSize: 10 }}>🔒</span>
                        </button>
                      ))}
                      <div style={{ height: 1, background: "rgba(231,76,26,0.3)", margin: "4px 0" }} />
                      <MenuItem
                        emoji="🔑"
                        label={t("locked_page_login_btn", "Giriş Yap")}
                        onClick={() => { setGuestMenuOpen(false); nav("/login"); }}
                        testId="guest-menu-login"
                      />
                    </div>
                  </>,
                  document.body
                )}
              </div>
            ) : (
              <button
                data-testid="header-login-btn"
                onClick={() => nav("/login")}
                className="flex items-center gap-1 px-2 h-8 rounded-full red-gold-gradient text-white text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
              >
                <LogIn className="w-3 h-3" /> {t("login")}
              </button>
            )
          )
        )}
      </div>

      {/* v59 — Admin/Editor rütbe rozeti artık logonun sağ-alt köşesinde
          "Insignia" olarak render ediliyor (yukarıdaki header-role-insignia).
          Bu ayrı satır kaldırıldı. */}
      </div>
      {/* End sticky top bar */}

      {/* Row 2 — Breadcrumb (non-sticky, right above the title) */}
      <Breadcrumb />

      {/* Row 3 — Page title */}
      <div className="px-4 relative flex items-center justify-center" style={{ marginTop: title ? 2 : 0, marginBottom: title ? 6 : 0, minHeight: title ? 32 : 0 }}>
        <div className="divider-glow absolute left-0 right-0" style={{ top: "50%", transform: "translateY(-50%)" }} />
        {title && (
          <h2
            data-testid="page-header-title"
            className="text-xl font-bold uppercase tracking-wider whitespace-nowrap relative"
            style={{
              zIndex: 2,
              padding: "3px 18px",
              background:
                "linear-gradient(180deg, rgba(30,15,10,0.96) 0%, rgba(20,10,8,0.98) 50%, rgba(30,15,10,0.96) 100%)",
              border: "1px solid rgba(231,76,26,0.55)",
              borderRadius: 6,
              boxShadow:
                "0 0 12px rgba(231,76,26,0.35), inset 0 1px 0 rgba(255,200,120,0.15)",
              fontFamily: "'Cinzel', 'Rajdhani', serif",
              letterSpacing: "0.14em",
              color: "#F5A623",
              WebkitTextFillColor: "#F5A623",
              WebkitBackgroundClip: "border-box",
              backgroundClip: "border-box",
              textShadow: "0 0 8px rgba(231,76,26,0.55), 0 1px 0 rgba(0,0,0,0.6)",
            }}
          >
            {title}
          </h2>
        )}
      </div>

      {/* Row 4 — Page-injected sticky content (e.g. Leaderboard filter tabs). */}
      {children && (
        <div data-testid="header-sticky-children" className="px-4 pb-1">
          {children}
        </div>
      )}
      </div>
  );

  return (
    <>
      {headerSlot && ReactDOM.createPortal(headerContent, headerSlot)}
      {logoVideoOpen && <LogoVideoModal onClose={() => setLogoVideoOpen(false)} />}
    </>
  );
}
