import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Globe, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { mutate as swrMutate } from "swr";
import { COUNTRIES, COUNTRY_BY_ISO2 } from "@/lib/countries";

/**
 * Country picker trigger + centered modal.
 *
 * The trigger renders the member's current flag (or a dashed "?" placeholder
 * when no country is set). Clicking it opens a portal-hosted centered modal
 * with a search input and full country list — so editors can select or
 * change the country from a large, easy-to-tap surface instead of a small
 * anchored dropdown.
 *
 * Props:
 *   memberId   — the member document id (required)
 *   currentIso — current country ISO2 or falsy (required)
 *   size       — icon font size in px (default 11)
 *   canEdit    — bool, non-editors just see the flag with no click behaviour
 */
export default function InlineCountryPicker({ memberId, currentIso, size = 11, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const meta = currentIso ? COUNTRY_BY_ISO2[currentIso] : null;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.iso2.toLowerCase().includes(needle) ||
        c.iso3.toLowerCase().includes(needle) ||
        c.name.toLowerCase().includes(needle),
    );
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    // Lock body scroll while the modal is open so the underlying list
    // doesn't jitter behind the overlay.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const save = async (iso2) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/members/${memberId}`, { country: iso2 || null });
      const label = iso2 ? `${COUNTRY_BY_ISO2[iso2]?.flag || ""} ${COUNTRY_BY_ISO2[iso2]?.name || iso2}` : "boş";
      toast.success(`Ülke güncellendi → ${label}`);
      swrMutate((k) => typeof k === "string" && k.startsWith("/members"));
      swrMutate("/admin/country-coverage");
      setOpen(false);
      setQ("");
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!canEdit) return;
        setOpen(true);
      }}
      className="flex-shrink-0 inline-flex items-center justify-center"
      style={{
        fontSize: size,
        lineHeight: 1,
        cursor: canEdit ? "pointer" : "default",
        width: meta ? "auto" : 14,
        height: 14,
        borderRadius: 3,
        border: meta ? "none" : "1px dashed rgba(139,92,246,0.55)",
        color: meta ? undefined : "#A78BFA",
        background: meta ? "transparent" : "rgba(139,92,246,0.10)",
      }}
      title={canEdit
        ? (meta ? `${meta.name} — değiştirmek için tıkla` : "Ülke ata")
        : (meta?.name || "Ülke yok")}
      data-testid={`member-country-btn-${memberId}`}
      aria-label={meta?.name || "Ülke ata"}
    >
      {meta ? (
        <span data-testid={`member-flag-${memberId}`}>{meta.flag}</span>
      ) : (
        <span style={{ fontSize: 8, fontWeight: 900 }}>?</span>
      )}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      {createPortal(
        <div
          data-testid={`member-country-picker-${memberId}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #1E1410 0%, #0F0806 100%)",
              border: "1px solid rgba(245,166,35,0.55)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(231,76,26,0.25)",
              maxHeight: "80vh",
            }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(245,166,35,0.35)" }}>
              <Globe className="w-4 h-4 flex-shrink-0" style={{ color: "#F5A623" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest" style={{ color: "#D4730A" }}>
                  Ülke Seç
                </div>
                <div className="text-sm font-bold truncate" style={{ color: "#F5F0E8", fontFamily: "Rajdhani, sans-serif" }}>
                  {meta ? `${meta.flag} ${meta.name}` : "Atanmadı"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-white/10 transition"
                style={{ color: "#F5F0E8" }}
                aria-label="Kapat"
                data-testid={`member-country-close-${memberId}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-2 border-b" style={{ borderColor: "rgba(245,166,35,0.2)" }}>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ara: TR, Türkiye…"
                className="w-full rounded px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none"
                style={{ background: "#1A1210", border: "1px solid rgba(245,166,35,0.35)" }}
                data-testid={`member-country-search-${memberId}`}
              />
            </div>
            <div className="flex-1 overflow-y-auto py-1" data-testid={`member-country-list-${memberId}`}>
              {currentIso && (
                <button
                  type="button"
                  onClick={() => save(null)}
                  disabled={saving}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                  data-testid={`member-country-clear-${memberId}`}
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Temizle (ülke yok)</span>
                </button>
              )}
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Eşleşme yok
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => save(c.iso2)}
                    disabled={saving}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs text-left hover:bg-white/5 ${
                      c.iso2 === currentIso ? "bg-amber-500/10" : ""
                    }`}
                    data-testid={`member-country-opt-${memberId}-${c.iso2}`}
                  >
                    <span style={{ fontSize: 18 }}>{c.flag}</span>
                    <span className="text-white truncate flex-1">{c.name}</span>
                    <span className="mono text-[10px] text-muted-foreground">{c.iso2}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
