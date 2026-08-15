import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import useSWR from "swr";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

/**
 * NotificationBell — header widget that polls `/api/notifications` every 30s,
 * shows a red unread badge, and renders a dropdown of the most recent items
 * on click. Each row can be individually marked read; a footer "read all"
 * clears the badge in one click. Hidden entirely for anonymous visitors.
 *
 * Positioned inside the Header next to the theme toggle. The dropdown uses
 * the same ReactDOM.createPortal pattern as the profile menu so it escapes
 * any parent overflow: hidden.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  const { data, mutate } = useSWR(
    user ? "/notifications?limit=30" : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  // Real-time SSE stream — the moment the backend inserts a notification for
  // this user, we get it via `notification` event and prepend it to the SWR
  // cache. The 30s poll above becomes a safety net (reconciles state after
  // a reconnect / missed frame). Falls back gracefully if EventSource fails.
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("ol_token");
    if (!token) return;
    const base = process.env.REACT_APP_BACKEND_URL || "";
    const url = `${base}/api/notifications/stream?token=${encodeURIComponent(token)}`;
    let es;
    try {
      es = new EventSource(url);
    } catch {
      return;
    }
    es.addEventListener("notification", (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        mutate((prev) => {
          const items = prev?.items || [];
          // Dedup: if the id already exists, no-op (poll may have raced us).
          if (items.some((x) => x.id === payload.id)) return prev;
          return {
            items: [payload, ...items].slice(0, 30),
            unread: (prev?.unread || 0) + 1,
            total: (prev?.total || 0) + 1,
          };
        }, { revalidate: false });
      } catch {}
    });
    es.onerror = () => {
      // Browser auto-reconnects EventSource with exponential backoff; we just
      // let it retry. The 30s poll will keep the badge accurate meanwhile.
    };
    return () => { try { es.close(); } catch {} };
  }, [user, mutate]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!user) return null;

  const items = data?.items || [];
  const unread = data?.unread || 0;

  const markRead = async (n) => {
    if (n.read) return;
    // Optimistic: flip local then reconcile after API round-trip.
    mutate(
      { ...data, items: items.map((x) => x.id === n.id ? { ...x, read: true } : x), unread: Math.max(0, unread - 1) },
      { revalidate: false }
    );
    try {
      await api.post(`/notifications/${n.id}/read`);
    } catch {
      mutate();
    }
  };

  const markAllRead = async () => {
    if (unread === 0) return;
    mutate(
      { ...data, items: items.map((x) => ({ ...x, read: true })), unread: 0 },
      { revalidate: false }
    );
    try {
      const r = await api.post("/notifications/read-all");
      toast.success(t("notif_marked_all_read") || `${r.data.updated} bildirim okundu`);
    } catch {
      mutate();
    }
  };

  const openItem = (n) => {
    markRead(n);
    setOpen(false);
    if (n.url) nav(n.url);
  };

  const relTime = (iso) => {
    try {
      const d = new Date(iso);
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return "şimdi";
      if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
      return `${Math.floor(diff / 86400)}g`;
    } catch { return ""; }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="notif-bell-btn"
        className="relative w-8 h-8 rounded-full flex items-center justify-center border border-border hover:border-primary transition-colors flex-shrink-0"
        aria-label="Bildirimler"
        aria-expanded={open}
      >
        <Bell className="w-3.5 h-3.5" style={{ color: unread > 0 ? "#F5A623" : "#94A3B8" }} />
        {unread > 0 && (
          <span
            data-testid="notif-bell-badge"
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "#E74C1A", color: "#FFF", boxShadow: "0 0 6px rgba(231,76,26,0.7)" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && ReactDOM.createPortal(
        <>
          <div
            data-testid="notif-bell-overlay"
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 999998, background: "transparent" }}
          />
          <div
            data-testid="notif-bell-dropdown"
            style={{
              position: "fixed",
              top: 60,
              right: 8,
              zIndex: 999999,
              width: "min(360px, calc(100vw - 16px))",
              maxHeight: "70vh",
              background: "#1E1410",
              border: "1px solid #E74C1A",
              boxShadow: "0 8px 32px rgba(0,0,0,0.95)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-3 py-2 flex-shrink-0"
              style={{ borderBottom: "1px solid rgba(231,76,26,0.3)" }}
            >
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 gold-text" />
                <span className="text-xs font-bold uppercase gold-text" style={{ letterSpacing: "0.1em" }}>
                  {t("notif_bell_title") || "Bildirimler"}
                </span>
                {unread > 0 && (
                  <span className="text-[9px] px-1.5 rounded-full font-bold"
                        style={{ background: "rgba(231,76,26,0.25)", color: "#F5A623" }}>
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    data-testid="notif-bell-read-all"
                    className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-primary/15 transition-colors text-white"
                    title={t("notif_read_all_tooltip") || "Hepsini okundu işaretle"}
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>{t("notif_read_all") || "Hepsi"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  data-testid="notif-bell-close"
                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-primary/15 text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground" data-testid="notif-bell-empty">
                  {t("notif_bell_empty") || "Henüz bildirim yok"}
                </div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    data-testid={`notif-bell-item-${n.id}`}
                    className="w-full text-left px-3 py-2.5 border-b flex items-start gap-2 hover:bg-primary/10 transition-colors"
                    style={{
                      borderColor: "rgba(231,76,26,0.15)",
                      background: n.read ? "transparent" : "rgba(245,166,35,0.06)",
                    }}
                  >
                    <span
                      className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: n.read ? "transparent" : "#F5A623" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xs truncate ${n.read ? "text-muted-foreground" : "text-white font-bold"}`}>
                          {n.title}
                        </span>
                        <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-auto">
                          {relTime(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.read && (
                      <span
                        onClick={(e) => { e.stopPropagation(); markRead(n); }}
                        data-testid={`notif-bell-mark-${n.id}`}
                        className="p-1 rounded hover:bg-primary/20 cursor-pointer flex-shrink-0"
                        title={t("notif_mark_read") || "Okundu işaretle"}
                      >
                        <Check className="w-3 h-3 text-muted-foreground hover:text-white" />
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
