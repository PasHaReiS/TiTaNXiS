import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Globe, Search, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { mutate as swrMutate } from "swr";
import { COUNTRIES, COUNTRY_BY_ISO2 } from "@/lib/countries";

/**
 * Inline country picker rendered next to a member's name so editors can
 * fill the 246 empty countries in minutes without opening the full modal.
 *
 * The trigger is either the member's current flag (with a subtle "edit"
 * outline on hover) or a dashed "?" placeholder when no country is set.
 * Clicking pops a portal-hosted dropdown with a search input + scroll list.
 *
 * Props:
 *   memberId  — the member document id (required)
 *   currentIso — current country ISO2 or falsy (required)
 *   size      — icon font size in px (default 11)
 *   canEdit   — bool, non-editors just see the flag with no click behaviour
 */
export default function InlineCountryPicker({ memberId, currentIso, size = 11, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

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
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Anchor below the trigger but flip up if it would overflow the viewport
      const spaceBelow = window.innerHeight - r.bottom;
      const wantHeight = 320;
      const top = spaceBelow < wantHeight ? r.top - wantHeight - 4 : r.bottom + 4;
      const left = Math.min(r.left, window.innerWidth - 260);
      setPos({ top: Math.max(8, top), left: Math.max(8, left) });
    }
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
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
      ref={btnRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!canEdit) return;
        setOpen((v) => !v);
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
          ref={popRef}
          data-testid={`member-country-picker-${memberId}`}
          className="fixed z-[1200] card-red-gold shadow-2xl"
          style={{
            top: pos.top,
            left: pos.left,
            width: 240,
            maxHeight: 320,
            display: "flex",
            flexDirection: "column",
            background: "#150911",
            border: "1px solid rgba(245,166,35,0.45)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
            <Globe className="w-3 h-3 gold-text flex-shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ara: TR, Türkiye…"
              className="flex-1 bg-transparent border-0 outline-none text-xs text-white placeholder:text-muted-foreground"
              data-testid={`member-country-search-${memberId}`}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-white flex-shrink-0"
              aria-label="Kapat"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1" data-testid={`member-country-list-${memberId}`}>
            {currentIso && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={saving}
                className="w-full flex items-center gap-2 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                data-testid={`member-country-clear-${memberId}`}
              >
                <X className="w-3 h-3" />
                <span>Temizle (ülke yok)</span>
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                Eşleşme yok
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => save(c.iso2)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2 px-2 py-1 text-[11px] text-left hover:bg-white/5 ${
                    c.iso2 === currentIso ? "bg-amber-500/10" : ""
                  }`}
                  data-testid={`member-country-opt-${memberId}-${c.iso2}`}
                >
                  <span style={{ fontSize: 14 }}>{c.flag}</span>
                  <span className="text-white truncate flex-1">{c.name}</span>
                  <span className="mono text-[9px] text-muted-foreground">{c.iso2}</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
