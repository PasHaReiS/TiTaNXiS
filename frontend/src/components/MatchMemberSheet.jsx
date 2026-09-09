import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactDOM from "react-dom";
import { Search, X, User as UserIcon, Check, UserPlus } from "lucide-react";

// v142.10 — Shared bottom-sheet modal for OCR fuzzy member matching.
// Sentinel value for the "add as new member" card at the bottom of the list.
export const NEW_MEMBER_SENTINEL = "__match_new_member__";

// Levenshtein — cheap enough for a client-side list of ~1000 members.
function _lev(a, b) {
  a = String(a || "").toLowerCase();
  b = String(b || "").toLowerCase();
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarityPct(a, b) {
  const A = String(a || "").toLowerCase();
  const B = String(b || "").toLowerCase();
  if (!A || !B) return 0;
  const d = _lev(A, B);
  const maxLen = Math.max(A.length, B.length);
  return Math.max(0, Math.round(100 * (1 - d / Math.max(1, maxLen))));
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/).filter(Boolean);
  const one = (parts[0] || "?").slice(0, 1);
  const two = parts.length > 1 ? parts[parts.length - 1].slice(0, 1) : "";
  return (one + two).toUpperCase();
}

function pctColor(pct) {
  if (pct >= 85) return { bg: "rgba(34,197,94,0.20)", fg: "#4ade80", border: "rgba(34,197,94,0.60)" };
  if (pct >= 70) return { bg: "rgba(245,166,35,0.20)", fg: "#FCD34D", border: "rgba(245,166,35,0.60)" };
  return { bg: "rgba(148,163,184,0.15)", fg: "#94A3B8", border: "rgba(148,163,184,0.4)" };
}

/**
 * MatchMemberSheet — v142.10
 *
 * Bottom-sheet modal for picking a member match on OCR flows.
 * onSelect receives (pickedName, meta) where:
 *   meta.isNew === true → user chose "Add as new member" sentinel.
 *   meta.member         → full member row when picking an existing one.
 */
export default function MatchMemberSheet({
  open,
  onClose,
  currentName = "",
  members = [],
  initialSelected = "",
  onSelect,
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(initialSelected || "");

  // Reset state when sheet opens.
  useEffect(() => {
    if (open) {
      setSelected(initialSelected || "");
      setQ("");
    }
  }, [open, initialSelected]);

  // Lock body scroll while sheet is open + add `.modal-open` class so global
  // CSS can hide the site footer (Gizlilik / Kullanım) which would otherwise
  // overlap the sheet's İptal/Seç buttons on mobile.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  // Ranked, filtered list.
  const ranked = useMemo(() => {
    const needle = String(currentName || "").trim();
    const list = (members || [])
      .map((m) => ({
        id: m.id || m.name,
        name: m.name || "",
        alliance: m.alliance_name || "",
        pct: similarityPct(needle, m.name || ""),
        _raw: m,
      }))
      .filter((r) => r.name);
    list.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
    if (!q.trim()) return list;
    const qk = q.trim().toLowerCase();
    return list.filter((r) => r.name.toLowerCase().includes(qk));
  }, [members, currentName, q]);

  if (!open) return null;

  const confirm = () => {
    if (!selected) return;
    if (selected === NEW_MEMBER_SENTINEL) {
      onSelect && onSelect(currentName || "", { isNew: true });
    } else {
      const row = ranked.find((r) => r.name === selected);
      onSelect && onSelect(selected, { isNew: false, member: row?._raw || null });
    }
    onClose && onClose();
  };

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        data-testid="match-member-sheet-backdrop"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 9998,
          animation: "match-sheet-fade 0.18s ease-out",
        }}
      />
      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        data-testid="match-member-sheet"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: "#1f1207",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          height: "75vh",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -18px 36px rgba(0,0,0,0.55)",
          animation: "match-sheet-slide 0.22s cubic-bezier(0.22,1,0.36,1)",
          border: "1px solid rgba(245,158,11,0.28)",
          borderBottom: "none",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 44, height: 4, background: "rgba(255,255,255,0.25)",
            borderRadius: 2, margin: "10px auto 4px", flexShrink: 0,
          }}
        />
        {/* Header */}
        <div style={{ padding: "8px 20px 12px", display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              data-testid="match-sheet-title"
              style={{
                fontSize: 18, fontWeight: 800, color: "#F5F0E8",
                fontFamily: "'Cinzel','Rajdhani',serif", letterSpacing: "0.04em",
              }}
            >
              {t("match_sheet_title", "Üye Eşleştir")}
            </div>
            <div
              data-testid="match-sheet-subtitle"
              style={{ fontSize: 12, color: "rgba(245,240,232,0.7)", marginTop: 2 }}
            >
              {t("match_sheet_subtitle", "{{name}} için öneri seçin", { name: currentName || "…" })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="match-sheet-close"
            aria-label={t("close", "Kapat")}
            style={{
              width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)", color: "#F5F0E8",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
        {/* Search */}
        <div style={{ padding: "0 20px 12px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, padding: "10px 12px",
            }}
          >
            <Search size={16} style={{ color: "rgba(245,240,232,0.5)" }} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("match_sheet_search_ph", "Ara...")}
              data-testid="match-sheet-search"
              autoFocus
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#F5F0E8", fontSize: 14,
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label={t("clear", "Temizle")}
                style={{
                  background: "transparent", border: "none",
                  color: "rgba(245,240,232,0.5)", cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {/* Member list — flex:1, scrolls internally */}
        <div
          data-testid="match-sheet-list"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "0 12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {ranked.length === 0 && (
            <div
              data-testid="match-sheet-empty"
              style={{
                textAlign: "center", padding: "40px 20px",
                color: "rgba(245,240,232,0.5)", fontSize: 13,
              }}
            >
              {t("match_sheet_empty", "Eşleşen üye bulunamadı")}
            </div>
          )}
          {ranked.map((r) => {
            const isSel = selected === r.name;
            const pc = pctColor(r.pct);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.name)}
                data-testid={`match-sheet-row-${r.name.replace(/\s+/g, "_")}`}
                style={{
                  minHeight: 64,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: isSel ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${isSel ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.08)"}`,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: isSel
                      ? "linear-gradient(135deg,#B45309,#F59E0B)"
                      : "linear-gradient(135deg,rgba(139,92,246,0.4),rgba(59,130,246,0.3))",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 800, fontSize: 15, flexShrink: 0,
                    fontFamily: "'Rajdhani',sans-serif",
                  }}
                >
                  {initials(r.name)}
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15, fontWeight: 700, color: "#F5F0E8",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {r.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11, color: "rgba(245,240,232,0.6)", marginTop: 2,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <UserIcon size={10} />
                    {t("match_sheet_existing", "Mevcut üye")}
                    {r.alliance && <span style={{ opacity: 0.7 }}>· {r.alliance}</span>}
                  </div>
                </div>
                {/* Similarity badge */}
                <div
                  style={{
                    fontSize: 11, fontWeight: 800, padding: "5px 10px",
                    borderRadius: 999, background: pc.bg, color: pc.fg,
                    border: `1px solid ${pc.border}`, flexShrink: 0,
                    fontFamily: "monospace",
                  }}
                  title={t("match_sheet_similarity", "Benzerlik")}
                >
                  %{r.pct}
                </div>
                {isSel && (
                  <Check size={18} style={{ color: "#F59E0B", flexShrink: 0 }} />
                )}
              </button>
            );
          })}

          {/* v142.10 — "Yeni Üye Olarak Ekle" — sticky pinned inside the list at the end.
              Always visible, positioned via sticky bottom so it stays at the tail even
              during scroll. */}
          <button
            type="button"
            onClick={() => setSelected(NEW_MEMBER_SENTINEL)}
            data-testid="match-sheet-new-member"
            style={{
              minHeight: 64,
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background:
                selected === NEW_MEMBER_SENTINEL
                  ? "rgba(139,92,246,0.20)"
                  : "rgba(139,92,246,0.06)",
              border: `1.5px dashed ${
                selected === NEW_MEMBER_SENTINEL ? "rgba(139,92,246,0.80)" : "rgba(139,92,246,0.45)"
              }`,
              cursor: "pointer",
              textAlign: "left",
              flexShrink: 0,
              marginTop: 6,
              position: "sticky",
              bottom: 0,
              backdropFilter: "blur(6px)",
            }}
          >
            {/* Avatar '?' gri daire */}
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "rgba(148,163,184,0.30)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: "#F5F0E8", fontWeight: 800, fontSize: 20, flexShrink: 0,
              }}
            >
              ?
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                data-testid="match-sheet-new-member-title"
                style={{ fontSize: 15, fontWeight: 700, color: "#F5F0E8" }}
              >
                {t("match_sheet_new_member_title", "Yeni Üye Olarak Ekle")}
              </div>
              <div
                style={{
                  fontSize: 11, color: "rgba(245,240,232,0.6)", marginTop: 2,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <UserPlus size={10} />
                {t("match_sheet_new_member_subtitle", "Sisteme yeni kayıt eklenecek")}
              </div>
            </div>
            {selected === NEW_MEMBER_SENTINEL && (
              <Check size={18} style={{ color: "#A78BFA", flexShrink: 0 }} />
            )}
          </button>
        </div>
        {/* Footer — pinned, never scrolls. Padding-bottom clears iOS safe-area
            + 30px LegalFooter (belt & braces even though body.modal-open hides
            it via index.css). */}
        <div
          style={{
            padding: "12px 20px max(env(safe-area-inset-bottom, 16px), 16px)",
            paddingBottom: "calc(max(env(safe-area-inset-bottom, 0px), 16px) + 16px)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            display: "flex",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            data-testid="match-sheet-cancel"
            style={{
              flex: 1, minHeight: 48, borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#F5F0E8", fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.02em",
            }}
          >
            {t("cancel", "İptal")}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!selected}
            data-testid="match-sheet-confirm"
            style={{
              flex: 1, minHeight: 48, borderRadius: 12,
              background: selected
                ? "linear-gradient(135deg,#B45309,#F59E0B)"
                : "rgba(245,158,11,0.15)",
              border: `1px solid ${selected ? "rgba(245,158,11,0.9)" : "rgba(245,158,11,0.3)"}`,
              color: selected ? "#0D0D0D" : "rgba(245,240,232,0.4)",
              fontSize: 14, fontWeight: 800, cursor: selected ? "pointer" : "not-allowed",
              fontFamily: "'Rajdhani',sans-serif", letterSpacing: "0.02em",
            }}
          >
            {t("match_sheet_confirm", "Seç")}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes match-sheet-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes match-sheet-slide {
          from { transform: translateY(100%); opacity: 0.4; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );

  return typeof document !== "undefined"
    ? ReactDOM.createPortal(sheet, document.body)
    : null;
}
