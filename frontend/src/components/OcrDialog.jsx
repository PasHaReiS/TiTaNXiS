import React, { useRef, useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Loader2, Check, AlertTriangle, Upload, Scissors, Trash2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import CropDialog from "@/components/CropDialog";

const _fetcher = (url) => api.get(url).then((r) => r.data);

// Damerau-Levenshtein distance (case-insensitive, alliance-tag agnostic).
// Used for the OCR "Autolink" suggester — cheap enough to run against ~500
// members every keystroke since each pair-wise comparison is O(m·n) where
// m, n are typically ≤ 24 chars.
function _lev(a, b) {
  a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase();
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
function _fuzzyTopMatches(needle, hayNames, limit = 3) {
  const stripTag = (n) => {
    const mm = /^\s*\[[^\]]+\]\s*(.+)$/.exec(String(n || ""));
    return (mm ? mm[1] : String(n || "")).trim();
  };
  const nk = stripTag(needle).toLowerCase();
  if (!nk) return [];
  const scored = hayNames.map((n) => {
    const hk = stripTag(n).toLowerCase();
    const dist = _lev(nk, hk);
    const rel = dist / Math.max(1, Math.max(nk.length, hk.length));
    return { name: n, dist, rel };
  }).filter((x) => x.rel < 0.45).sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit);
}

// Alliance-tag helpers. OCR outputs often prefix a row with junk like
// "12 [GOW] Ekko" — we ONLY care about the [XXX] bracket (2-5 chars,
// letters/digits) and strip everything else. The bracket may sit anywhere
// in the string, not just at the start; leading digits + separators get
// dropped from the display name too.
const _ALLIANCE_TAG_RE = /\[([A-Za-z0-9]{2,5})\]/;
const _RANK_RE = /\b(R[1-5])\b/i;
function _extractAllianceTag(n) {
  const m = _ALLIANCE_TAG_RE.exec(String(n || ""));
  return m ? m[1].trim() : "";
}
function _extractRank(n) {
  const m = _RANK_RE.exec(String(n || ""));
  return m ? m[1].toUpperCase() : "";
}
function _stripTagAndJunk(n) {
  let s = String(n || "");
  s = s.replace(_ALLIANCE_TAG_RE, "");
  s = s.replace(_RANK_RE, "");
  s = s.replace(/^[\s\d.\-|:_/\\]+/, "");
  return s.trim();
}

/**
 * Reusable OCR dialog.
 *
 * Props:
 *   open, onClose       — modal control
 *   mode                — "members" | "event" | "war"
 *   onApply(data, extra)— called with parsed rows + optional extra (e.g. { event_id })
 *   title?              — custom dialog title
 *   requireSelection?   — object { type: "event", options: [{id,label}] } — when set,
 *                         Apply is blocked until the user picks a value from the dropdown.
 */
export default function OcrDialog({ open, onClose, mode, onApply, title, requireSelection, subMode }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const supportsMulti = mode === "event" || mode === "members";

  // For members/event mode we need the existing roster so we can flag each parsed
  // row as "new" (will be created) vs "existing" (case-insensitive name match).
  const { data: existingMembers = [] } = useSWR(
    open && (mode === "members" || mode === "event") ? "/members" : null,
    _fetcher,
  );
  const { data: existingAlliances = [] } = useSWR(
    open && mode === "members" ? "/alliances" : null,
    _fetcher,
  );
  // Event-mode duplicate guard: once an event is picked in the dropdown, fetch
  // every member that ALREADY has a point row for that event so the preview
  // can render a "önceki → yeni" diff and block resubmits.
  const [selection, setSelection] = useState("");
  const { data: eventExistingParts = { participants: [] } } = useSWR(
    open && mode === "event" && selection ? `/ocr/event-participants/${selection}` : null,
    _fetcher,
  );
  const eventExistingByMemberId = React.useMemo(() => {
    const m = new Map();
    for (const p of eventExistingParts?.participants || []) {
      if (p?.member_id) m.set(p.member_id, p);
    }
    return m;
  }, [eventExistingParts]);
  const eventExistingByNameLc = React.useMemo(() => {
    const m = new Map();
    for (const p of eventExistingParts?.participants || []) {
      const k = String(p?.name || "").trim().toLowerCase();
      if (k) m.set(k, p);
    }
    return m;
  }, [eventExistingParts]);
  const { data: allianceColorsMap = {} } = useSWR(
    open && mode === "members" ? "/alliance-colors" : null,
    _fetcher,
  );
  const allianceColor = React.useCallback((name) => {
    if (!name) return null;
    // Case-insensitive lookup so "gow" and "GOW" share the swatch.
    const direct = allianceColorsMap[name];
    if (direct) return direct;
    const lower = String(name).toLowerCase();
    for (const k of Object.keys(allianceColorsMap || {})) {
      if (k.toLowerCase() === lower) return allianceColorsMap[k];
    }
    return null;
  }, [allianceColorsMap]);
  const allianceNames = React.useMemo(
    () => Array.from(new Set(((existingAlliances || []).map((a) => typeof a === "string" ? a : a?.name).filter(Boolean)))).sort(),
    [existingAlliances],
  );
  const existingNamesLc = React.useMemo(
    () => new Set((existingMembers || []).map((m) => (m.name || "").trim().toLowerCase())),
    [existingMembers],
  );
  // Diff support: quick lookup from lowercased clean name → full existing member doc.
  // Lets the members preview show "önceki değer → yeni değer" so admins spot
  // silent overwrites of curated stats (bireysel_guc / castle_level / rank / alliance_name).
  const existingByLcName = React.useMemo(() => {
    const m = new Map();
    for (const em of existingMembers || []) {
      const k = String(em.name || "").trim().toLowerCase();
      if (k) m.set(k, em);
    }
    return m;
  }, [existingMembers]);

  // Strip a leading "[TAG]" bracket to check membership against the roster.
  const _stripTag = (n) => _stripTagAndJunk(n);
  const [previews, setPreviews] = useState([]); // [{file, url, cropped?}]
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [result, setResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState("sum"); // sum | max | first
  const [cropIdx, setCropIdx] = useState(-1); // index of image currently being cropped, -1 = none
  // Preview-and-eliminate: OCR rows the user has struck out before save.
  // Keyed by row index so a re-scan (which resets result → rows) also wipes
  // stale exclusions. Only kept rows are sent to /ocr/apply-*.
  const [excludedRows, setExcludedRows] = useState(() => new Set());
  // Per-row inline edits — `{ [rowIdx]: { name?: string, points?: number } }`.
  // Applied on top of the OCR row before doApply so admins can hand-fix a
  // misread without deleting the whole row.
  const [rowEdits, setRowEdits] = useState({});
  // Keep raw parsed chunks so we can re-merge live when the admin flips the
  // "Topla / En yüksek / İlkini kullan" chip after already seeing the preview.
  const [rawChunks, setRawChunks] = useState([]);
  // Collapsible "N yeni üye oluşacak" panel — starts open so admins see the
  // warning up-front but can hide it once they've reviewed.
  const [showNewList, setShowNewList] = useState(true);
  // Auto-Apply bookkeeping — remember which row indices the useEffect
  // rewrote so admins can undo the whole batch in one tap.
  const [autoAppliedRows, setAutoAppliedRows] = useState([]);
  // Duplicate-conflict policy for event OCR. `skip` (default) leaves existing
  // point rows untouched and surfaces the dupes; `overwrite` deletes the old
  // rows and replaces them with the new OCR values.
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip"); // skip | overwrite
  // Skip-confirm modal — when the admin picks "üzerine yaz" AND there's ≥1
  // duplicate, we stop doApply mid-flight, pop this confirm, and only proceed
  // if the admin explicitly OKs it. Prevents accidental point-row wipes.
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(null); // null | { count, names, existingTotal }
  // Bulk alliance set — free-text input paired with a datalist of existing
  // alliance names so admins can stamp one alliance across every row in a
  // single-alliance event.
  const [bulkAlliance, setBulkAlliance] = useState("");
  // Legend Filter — when set, the preview table only shows rows belonging
  // to this alliance (case-insensitive; "" means no filter). Click a
  // legend chip to toggle.
  const [allianceFilter, setAllianceFilter] = useState("");
  React.useEffect(() => {
    setExcludedRows(new Set()); setRowEdits({}); setShowNewList(true);
    setAutoAppliedRows([]); setAllianceFilter("");
  }, [result]);
  // Autolink Auto-Apply — as soon as the preview lands, look at every row
  // whose OCR name matches an existing member with Levenshtein ≤ 1 (green
  // "Yüksek eşleşme"), and auto-rewrite the name to that canonical form.
  // Admins still see the full row/table and can undo by editing the input
  // back; this just saves a tap on the top green chip.
  React.useEffect(() => {
    // Autolink Auto-Apply was removed on user request — no automatic
    // rewrites; admins pick suggestions manually via the 🔗 chips.
    return;
    // eslint-disable-next-line no-unreachable
    if (!result || !rows || rows.length === 0) return;
    if (mode !== "members" && mode !== "event") return;
    if (!existingMembers || existingMembers.length === 0) return;
    const hayNames = (existingMembers || []).map((m) => m.name || "");
    const patches = {};
    rows.forEach((r, i) => {
      if (rowEdits[i]?.name !== undefined) return; // respect manual edits
      const cleanName = _stripTag(r.name || "");
      if (!cleanName) return;
      if (existingNamesLc.has(cleanName.toLowerCase())) return; // already matches
      const top = _fuzzyTopMatches(r.name, hayNames, 1)[0];
      if (top && top.dist <= 1 && top.name !== r.name) {
        patches[i] = { ...(rowEdits[i] || {}), name: top.name };
      }
    });
    if (Object.keys(patches).length > 0) {
      const changed = Object.keys(patches).map((k) => Number(k));
      setRowEdits((prev) => ({ ...prev, ...patches }));
      setAutoAppliedRows(changed);
      toast.success(`✨ ${changed.length} isim otomatik bağlandı`, { duration: 2600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, existingMembers]);

  // Progress-UI heuristic: for 2+ images we show a live X/N counter and bar.
  // Every image is always dispatched as its own /ocr/parse request (below) —
  // NEVER batched — so Cloudflare's 100s edge timeout can't be hit.
  const SEQUENTIAL_THRESHOLD = 2;

  // Hard reset when the modal closes so the next open starts pristine.
  // Otherwise previews / result / selection linger, and the freshly-mounted
  // dialog paints a stale layer over the events list ("background only")
  // while React reconciles state — the exact freeze admins have been hitting
  // after an OCR save.
  React.useEffect(() => {
    if (open) return;
    setPreviews([]);
    setResult(null);
    setSelection("");
    setApplying(false);
    setParsing(false);
    setProgress({ current: 0, total: 0, errors: 0 });
    setCropIdx(-1);
    setExcludedRows(new Set());
    setRowEdits({});
    setRawChunks([]);
    setAutoAppliedRows([]);
    setAllianceFilter("");
    setShowNewList(true);
  }, [open]);

  if (!open) return null;

  const pick = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList).filter((f) => /^image\/(png|jpe?g|webp)$/i.test(f.type));
    if (arr.length === 0) {
      toast.error("PNG, JPEG veya WEBP yükleyin");
      return;
    }
    setResult(null);
    const readers = arr.map(
      (f) => new Promise((resolve) => {
        const r = new FileReader();
        r.onload = (e) => resolve({ file: f, url: e.target.result });
        r.readAsDataURL(f);
      }),
    );
    Promise.all(readers).then((items) => {
      setPreviews(supportsMulti ? items : items.slice(0, 1));
    });
  };

  const removePreview = (idx) => {
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  // Merge helper: dedupe rows by normalised name (alliance-tag-stripped, lowercased).
  // For `event` mode we apply the chosen strategy to `points`. For `members` mode
  // we keep the first non-empty scalar per field. Both track `sources` count.
  const _mergeRows = (all) => {
    const merged = new Map();
    let event_hint = null;
    for (const chunk of all) {
      if (mode === "event") {
        if (!event_hint && chunk?.event_hint) event_hint = chunk.event_hint;
        for (const p of chunk?.participants || []) {
          const raw = String(p.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          const pts = Number(p.points || 0) || 0;
          if (!merged.has(key)) {
            merged.set(key, {
              name: raw,
              points: pts,
              rank: p.rank || null,
              alliance_name: p.alliance_name || null,
              sources: 1,
            });
          } else {
            const cur = merged.get(key);
            cur.sources += 1;
            if (mergeStrategy === "sum") cur.points += pts;
            else if (mergeStrategy === "max") cur.points = Math.max(cur.points, pts);
            // 'first' → keep original
            if (!cur.alliance_name && p.alliance_name) cur.alliance_name = p.alliance_name;
            if (!cur.rank && p.rank) cur.rank = p.rank;
          }
        }
      } else if (mode === "members") {
        for (const r of chunk?.members || []) {
          const raw = String(r.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          if (!merged.has(key)) {
            merged.set(key, { ...r, name: raw, sources: 1 });
          } else {
            const cur = merged.get(key);
            cur.sources += 1;
            for (const fld of ["power", "castle_level", "rank", "alliance_name"]) {
              if (!cur[fld] && r[fld]) cur[fld] = r[fld];
            }
          }
        }
      }
    }
    const arr = Array.from(merged.values());
    if (mode === "event") arr.sort((a, b) => (b.points || 0) - (a.points || 0));
    else arr.sort((a, b) => (b.power || 0) - (a.power || 0));
    return { arr, event_hint };
  };

  const runParse = async () => {
    if (previews.length === 0) return;
    setParsing(true);
    setResult(null);
    setProgress({ current: 0, total: previews.length, errors: 0 });

    // Always dispatch ONE /ocr/parse request PER image, sequentially. Never
    // batch. Each request stays well under Cloudflare's 100s edge timeout.
    // Frontend merges the chunks below (`_mergeRows`) — identical logic to
    // what the old server-side batch endpoint did.
    const chunks = [];
    let errCount = 0;
    for (let i = 0; i < previews.length; i++) {
      setProgress({ current: i, total: previews.length, errors: errCount });
      const fd = new FormData();
      fd.append("file", previews[i].file);
      try {
        const res = await api.post(`/ocr/parse?mode=${mode}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 90000,
        });
        chunks.push(res.data?.data || {});
      } catch (e) {
        errCount += 1;
        toast.error(`Resim ${i + 1}/${previews.length}: ${apiErr(e)}`);
      }
      setProgress({ current: i + 1, total: previews.length, errors: errCount });
    }

    // Single-image shortcut: pass through unchanged so the raw parse response
    // shape is preserved (mostly cosmetic — merge still works with 1 chunk).
    if (previews.length === 1) {
      const only = chunks[0] || {};
      setRawChunks(chunks);
      const single =
        mode === "war"
          ? only
          : mode === "event"
          ? { participants: only.participants || [], event_hint: only.event_hint || null }
          : { members: only.members || [] };
      setResult({ mode, data: single });
      setParsing(false);
      if (errCount) toast.error("OCR başarısız");
      else toast.success("OCR analizi tamamlandı");
      return;
    }

    const { arr, event_hint } = _mergeRows(chunks);
    setRawChunks(chunks);
    const merged =
      mode === "event"
        ? { participants: arr, event_hint }
        : { members: arr };
    setResult({
      mode,
      data: merged,
      merge_strategy: mergeStrategy,
      per_image_errors: errCount,
    });
    setProgress({ current: previews.length, total: previews.length, errors: errCount });
    if (errCount) {
      toast.success(
        `${previews.length - errCount}/${previews.length} resim başarılı · ${errCount} hata`,
      );
    } else {
      toast.success(`${previews.length} resim analiz edildi`);
    }
    setParsing(false);
  };

  // Re-merge stored chunks whenever the admin flips the merge strategy chip
  // AFTER the preview is on screen. Skips single-image case (no dedupe there).
  const remergeWithStrategy = (nextStrategy) => {
    setMergeStrategy(nextStrategy);
    if (!result || rawChunks.length === 0 || previews.length <= 1) return;
    // Rebuild with the fresh strategy by cloning _mergeRows logic — we can't
    // call _mergeRows directly because it reads state which hasn't tick'd yet.
    const merged = new Map();
    let event_hint = null;
    for (const chunk of rawChunks) {
      if (mode === "event") {
        if (!event_hint && chunk?.event_hint) event_hint = chunk.event_hint;
        for (const p of chunk?.participants || []) {
          const raw = String(p.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          const pts = Number(p.points || 0) || 0;
          if (!merged.has(key)) merged.set(key, {
            name: raw, points: pts,
            rank: p.rank || null,
            alliance_name: p.alliance_name || null,
            sources: 1,
          });
          else {
            const cur = merged.get(key);
            cur.sources += 1;
            if (nextStrategy === "sum") cur.points += pts;
            else if (nextStrategy === "max") cur.points = Math.max(cur.points, pts);
            if (!cur.alliance_name && p.alliance_name) cur.alliance_name = p.alliance_name;
            if (!cur.rank && p.rank) cur.rank = p.rank;
          }
        }
      } else if (mode === "members") {
        for (const r of chunk?.members || []) {
          const raw = String(r.name || "").trim();
          if (!raw) continue;
          const key = _stripTag(raw).toLowerCase();
          if (!merged.has(key)) merged.set(key, { ...r, name: raw, sources: 1 });
          else {
            const cur = merged.get(key);
            cur.sources += 1;
            for (const fld of ["power", "castle_level", "rank", "alliance_name"]) {
              if (!cur[fld] && r[fld]) cur[fld] = r[fld];
            }
          }
        }
      }
    }
    const arr = Array.from(merged.values());
    if (mode === "event") arr.sort((a, b) => (b.points || 0) - (a.points || 0));
    else arr.sort((a, b) => (b.power || 0) - (a.power || 0));
    const nextData = mode === "event" ? { participants: arr, event_hint } : { members: arr };
    setResult({ mode, data: nextData, merge_strategy: nextStrategy, per_image_errors: 0 });
  };

  // Rank tier colour legend used across the OCR preview — every place we
  // render a rank pill/dropdown/badge routes through this so R5/R4/R3/R2 look
  // consistent (altın · amber · gümüş · bronz) and R1 stays a muted neutral.
  const RANK_COLORS = {
    R1: "#22c55e", // yeşil
    R2: "#3b82f6", // mavi
    R3: "#a855f7", // mor
    R4: "#f97316", // turuncu
    R5: "#ef4444", // kırmızı
  };
  const rankColor = (rk) => RANK_COLORS[String(rk || "").toUpperCase()] || RANK_COLORS.R1;

  const doApply = async (bypassConfirm = false) => {
    if (!result?.data) return;
    if (requireSelection && !selection) {
      toast.error("Lütfen bir seçim yapın");
      return;
    }
    // Skip-confirm gate — overwrite mode with duplicates → show a modal first
    // so the admin can eyeball what's about to be wiped.
    if (!bypassConfirm && mode === "event" && duplicatePolicy === "overwrite" && selection) {
      const dupInfo = (result.data.participants || []).reduce((acc, r, i) => {
        if (excludedRows.has(i)) return acc;
        const clean = _stripTag(rowEdits[i]?.name ?? r.name).toLowerCase();
        const hit = eventExistingByNameLc.get(clean);
        if (hit) {
          acc.count += 1;
          acc.existingTotal += Number(hit.existing_points || 0);
          if (acc.names.length < 6) acc.names.push(hit.name);
        }
        return acc;
      }, { count: 0, names: [], existingTotal: 0 });
      if (dupInfo.count > 0) {
        setConfirmingOverwrite(dupInfo);
        return;
      }
    }
    setApplying(true);
    try {
      const extra = requireSelection ? { [`${requireSelection.type}_id`]: selection } : {};
      // Event mode sends the duplicate policy alongside so the backend knows
      // whether to overwrite or skip existing point rows.
      if (mode === "event") extra.overwrite_duplicates = duplicatePolicy === "overwrite";
      // Merge inline edits + drop excluded rows so only "approved" names
      // (with any manual fixes) ever hit the DB.
      const applyEditsAndKeep = (arr, kind) => {
        if (!Array.isArray(arr)) return arr;
        return arr
          .map((r, i) => {
            const patch = rowEdits[i] || {};
            const next = { ...r };
            // Smart alliance + name derivation when the admin hasn't
            // explicitly touched them: extract the [TAG] bracket, drop
            // it + any leading digits from the name so what lands in the
            // DB is clean canonical data.
            if (typeof patch.name === "string") {
              next.name = patch.name;
            } else if (kind === "event") {
              const cleaned = _stripTagAndJunk(next.name || "");
              if (cleaned) next.name = cleaned;
            }
            if (kind === "event" && patch.points !== undefined) next.points = Number(patch.points) || 0;
            if (kind === "event" && patch.alliance_name !== undefined) {
              const trimmed = String(patch.alliance_name || "").replace(/[\[\]]/g, "").trim();
              next.alliance_name = trimmed || null;
            } else if (kind === "event" && !next.alliance_name) {
              const tag = _extractAllianceTag(r.name || "");
              if (tag) next.alliance_name = tag;
            } else if (kind === "event" && typeof next.alliance_name === "string") {
              const clean = next.alliance_name.replace(/[\[\]]/g, "").trim();
              next.alliance_name = clean || null;
            }
            // Event mode: castle_level / power intentionally NOT sent —
            // they belong to members-mode OCR only. RANK is user-chosen via
            // the preview dropdown (defaults to R1 if not touched) so it IS
            // included: for existing members it backfills a missing rank,
            // for new members it seeds the correct rank instead of R1.
            if (kind === "event") {
              const rawRank = String((patch.rank ?? next.rank ?? "R1") || "R1").toUpperCase();
              next.rank = ["R1","R2","R3","R4","R5"].includes(rawRank) ? rawRank : "R1";
              delete next.castle_level;
              delete next.power;
            }
            if (kind === "members" && patch.alliance_name !== undefined) {
              const trimmed = String(patch.alliance_name || "").trim();
              next.alliance_name = trimmed || null;
            }
            return next;
          })
          .filter((_, i) => !excludedRows.has(i));
      };
      const filteredData = { ...result.data };
      if (mode === "event") {
        const parts = applyEditsAndKeep(result.data.participants || [], "event");
        // When policy=skip, mirror the backend by dropping duplicate rows on the
        // client so the toast summary matches what actually landed. When policy
        // =overwrite, we deliberately KEEP them so the backend can replace.
        if (duplicatePolicy === "skip") {
          filteredData.participants = parts.filter((p) => {
            const clean = _stripTag(String(p.name || "")).toLowerCase();
            return !(selection && eventExistingByNameLc.has(clean));
          });
          if ((result.data.participants || []).length > 0 && filteredData.participants.length === 0) {
            toast.error("Kaydedilecek satır kalmadı — tüm üyeler bu etkinlikte zaten puan almış");
            setApplying(false);
            return;
          }
        } else {
          filteredData.participants = parts;
        }
      } else if (mode === "members") {
        filteredData.members = applyEditsAndKeep(result.data.members || [], "members");
      }
      await onApply(filteredData, extra);
      // Close the modal FIRST so the user sees an immediate return to the
      // events list; SWR revalidation kicked off inside onApply continues
      // in the background and repaints the row when it lands. Previously
      // we awaited nothing between apply and close, which combined with
      // stale internal state (previews/result/applying) manifested as a
      // frozen "background only" screen after a successful upload.
      setApplying(false);
      onClose?.();
      return;
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setApplying(false);
    }
  };

  const rows = (() => {
    if (!result?.data) return [];
    if (mode === "members") return result.data.members || [];
    if (mode === "event") return result.data.participants || [];
    if (mode === "war") return [result.data]; // single-row summary
    return [];
  })();

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={applying ? undefined : onClose}
        data-testid="ocr-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          className="card-red-gold w-full max-w-2xl p-5 relative max-h-[90vh] flex flex-col"
          data-testid="ocr-dialog"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.7 }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 text-muted-foreground hover:text-white"
            data-testid="ocr-close"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold uppercase gold-text mb-1 flex items-center gap-2">
            <Camera className="w-4 h-4" /> {title || "Ekran Görüntüsünden Aktar"}
            <span
              className="text-[9px] font-normal px-1.5 py-0.5 rounded"
              style={{ background: "rgba(34,197,94,0.2)", color: "#4ade80", letterSpacing: "0.1em" }}
              data-testid="ocr-version"
              title="Per-image sequential mode — Cloudflare 524 fix"
            >
              v2 • SEQ
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Ekran görüntüsünü yükle, AI ile analiz et, önizle, onayla.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple={supportsMulti}
            className="hidden"
            data-testid="ocr-file-input"
            onChange={(e) => pick(e.target.files)}
          />

          {previews.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-gold w-full py-6 justify-center flex-col gap-2"
              data-testid="ocr-select"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">
                {supportsMulti ? "Ekran Görüntüleri Seç (çoklu)" : "Ekran Görüntüsü Seç"}
              </span>
              <span className="text-[10px] opacity-75">PNG / JPEG / WEBP</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="flex gap-2 overflow-x-auto flex-shrink-0" data-testid="ocr-thumbs">
                {previews.map((p, i) => (
                  <div key={i} className="relative flex-shrink-0" style={{ width: 90, height: 60 }}>
                    <img src={p.url} alt={`preview-${i}`} className="w-full h-full object-cover rounded border border-white/10"
                      data-testid={`ocr-image-preview-${i}`} />
                    {p.cropped && (
                      <span
                        className="absolute top-0.5 left-0.5 px-1 rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-0.5"
                        style={{ background: "rgba(245,166,35,0.85)", color: "#0A0806" }}
                        data-testid={`ocr-cropped-badge-${i}`}
                        title="Kırpıldı"
                      >
                        <Scissors className="w-2 h-2" /> KIRP
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCropIdx(i)}
                      className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/80 hover:bg-amber-500/90 text-amber-400 hover:text-black flex items-center justify-center transition-colors"
                      data-testid={`ocr-crop-${i}`}
                      title="Kırp"
                    >
                      <Scissors className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePreview(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center"
                      data-testid={`ocr-remove-${i}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {supportsMulti && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex-shrink-0 rounded border border-dashed border-white/25 hover:border-amber-500/60 text-muted-foreground hover:text-amber-400 flex items-center justify-center"
                    style={{ width: 90, height: 60 }}
                    data-testid="ocr-add-more"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                )}
              </div>

              {supportsMulti && previews.length > 1 && !result && (
                <div className="flex items-center gap-1.5 text-[10px]" data-testid="ocr-merge-strategy">
                  <span className="uppercase tracking-widest text-muted-foreground mr-1">
                    Tekrarlanan üyeler:
                  </span>
                  {[
                    { id: "sum", label: "Topla" },
                    { id: "max", label: "En yüksek" },
                    { id: "first", label: "İlkini kullan" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMergeStrategy(opt.id)}
                      data-testid={`ocr-merge-${opt.id}`}
                      className={`chip px-2 py-1 text-[10px] ${mergeStrategy === opt.id ? "active" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {supportsMulti && previews.length > 1 && result && (
                <div className="flex items-center gap-1.5 text-[10px]" data-testid="ocr-merge-strategy-inline">
                  <span className="uppercase tracking-widest mr-1" style={{ color: "#A78BFA" }}>
                    Tekrar birleştirme:
                  </span>
                  {[
                    { id: "sum", label: "Topla" },
                    { id: "max", label: "En yüksek" },
                    { id: "first", label: "İlkini kullan" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => remergeWithStrategy(opt.id)}
                      data-testid={`ocr-merge-inline-${opt.id}`}
                      className={`chip px-2 py-1 text-[10px] ${mergeStrategy === opt.id ? "active" : ""}`}
                      title={mergeStrategy === opt.id ? "Aktif" : "Değiştir → satırlar anında yeniden birleştirilir"}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {!result && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={runParse}
                    disabled={parsing}
                    data-testid="ocr-analyze"
                    className="btn-gold w-full py-3 justify-center"
                  >
                    {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {parsing
                      ? progress.total > 1 && previews.length >= SEQUENTIAL_THRESHOLD
                        ? `Analiz ediliyor… ${progress.current}/${progress.total}`
                        : `Analiz ediliyor (${previews.length} resim)…`
                      : `AI ile Analiz Et (${previews.length} resim)`}
                  </button>

                  {parsing && progress.total > 1 && previews.length >= SEQUENTIAL_THRESHOLD && (
                    <div className="flex flex-col gap-1" data-testid="ocr-progress">
                      <div
                        className="w-full h-2 rounded overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${Math.round((progress.current / progress.total) * 100)}%`,
                            background: "linear-gradient(90deg, #F5A623, #FF6B00)",
                          }}
                          data-testid="ocr-progress-bar"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span data-testid="ocr-progress-label">
                          {progress.current}/{progress.total} resim
                          {progress.errors > 0 && (
                            <span className="text-red-400 ml-1.5">· {progress.errors} hata</span>
                          )}
                        </span>
                        <span className="opacity-60">
                          ~{Math.max(1, Math.round(((progress.total - progress.current) * 10) / 60))} dk kaldı
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div
                  className="flex-1 min-h-0 overflow-y-auto rounded-lg p-3"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(245,166,35,0.3)" }}
                  data-testid="ocr-result-panel"
                >
                  <div className="text-[10px] uppercase tracking-widest gold-text mb-2 flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" /> {rows.length - excludedRows.size} / {rows.length} onaylı
                    </span>
                    {excludedRows.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setExcludedRows(new Set())}
                        className="text-[9px] normal-case font-normal underline decoration-dotted hover:text-white"
                        style={{ color: "#93C5FD" }}
                        data-testid="ocr-restore-all"
                      >
                        ↩ {excludedRows.size} elenen kişiyi geri al
                      </button>
                    )}
                    {autoAppliedRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRowEdits((prev) => {
                            const nx = { ...prev };
                            autoAppliedRows.forEach((idx) => {
                              if (nx[idx] && nx[idx].name !== undefined) {
                                const rest = { ...nx[idx] };
                                delete rest.name;
                                if (Object.keys(rest).length === 0) delete nx[idx];
                                else nx[idx] = rest;
                              }
                            });
                            return nx;
                          });
                          const n = autoAppliedRows.length;
                          setAutoAppliedRows([]);
                          toast.success(`↩ ${n} otomatik bağlama geri alındı`);
                        }}
                        className="text-[9px] normal-case font-normal underline decoration-dotted hover:text-white"
                        style={{ color: "#FCD34D" }}
                        data-testid="ocr-autolink-undo"
                        title="Otomatik bağlanan tüm isimleri OCR ham haline geri al"
                      >
                        ↩ {autoAppliedRows.length} otomatik bağlamayı geri al
                      </button>
                    )}
                  </div>
                  {mode === "event" && selection && (() => {
                    // Preflight duplicate summary — count preview rows whose
                    // resolved name already has a point row for the picked event.
                    const dupCount = rows.reduce((acc, r, i) => {
                      if (excludedRows.has(i)) return acc;
                      const clean = _stripTag(rowEdits[i]?.name ?? r.name).toLowerCase();
                      return eventExistingByNameLc.has(clean) ? acc + 1 : acc;
                    }, 0);
                    if (dupCount === 0) return null;
                    const isOverwrite = duplicatePolicy === "overwrite";
                    return (
                      <div
                        className="rounded-lg p-2 mb-2 text-[10px]"
                        style={{
                          background: isOverwrite ? "rgba(245,166,35,0.10)" : "rgba(248,113,113,0.10)",
                          border: `1px solid ${isOverwrite ? "rgba(245,166,35,0.55)" : "rgba(248,113,113,0.45)"}`,
                        }}
                        data-testid="ocr-event-dup-banner"
                      >
                        <div
                          className="flex items-center gap-2 font-bold uppercase tracking-widest flex-wrap"
                          style={{ color: isOverwrite ? "#FCD34D" : "#FCA5A5" }}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {dupCount} üye bu etkinlikte zaten puan almış — {isOverwrite ? "üzerine yazılacak" : "atlanacak"}
                          <div
                            role="tablist"
                            aria-label="Mükerrer politikası"
                            className="ml-auto inline-flex rounded-md overflow-hidden border"
                            style={{ borderColor: "rgba(255,255,255,0.15)" }}
                            data-testid="ocr-dup-policy-toggle"
                          >
                            <button
                              type="button"
                              onClick={() => setDuplicatePolicy("skip")}
                              className="px-2 py-0.5 text-[9px] uppercase tracking-widest font-bold transition-all"
                              style={{
                                background: !isOverwrite ? "rgba(248,113,113,0.28)" : "rgba(255,255,255,0.05)",
                                color: !isOverwrite ? "#FCA5A5" : "rgba(255,255,255,0.55)",
                              }}
                              aria-pressed={!isOverwrite}
                              data-testid="ocr-dup-policy-skip"
                              title="Mükerrer satırları atla, mevcut puanı koru"
                            >
                              🚫 Atla
                            </button>
                            <button
                              type="button"
                              onClick={() => setDuplicatePolicy("overwrite")}
                              className="px-2 py-0.5 text-[9px] uppercase tracking-widest font-bold transition-all"
                              style={{
                                background: isOverwrite ? "rgba(245,166,35,0.28)" : "rgba(255,255,255,0.05)",
                                color: isOverwrite ? "#FCD34D" : "rgba(255,255,255,0.55)",
                              }}
                              aria-pressed={isOverwrite}
                              data-testid="ocr-dup-policy-overwrite"
                              title="Mevcut puan satırlarını sil ve OCR ile üzerine yaz"
                            >
                              🔄 Üzerine Yaz
                            </button>
                          </div>
                          {!isOverwrite && (
                            <button
                              type="button"
                              onClick={() => setExcludedRows((prev) => {
                                const nx = new Set(prev);
                                rows.forEach((r, i) => {
                                  const clean = _stripTag(rowEdits[i]?.name ?? r.name).toLowerCase();
                                  if (eventExistingByNameLc.has(clean)) nx.add(i);
                                });
                                return nx;
                              })}
                              className="normal-case font-normal underline decoration-dotted"
                              style={{ color: "#93C5FD" }}
                              data-testid="ocr-event-dup-exclude-all"
                              title="Mükerrer satırların hepsini ele"
                            >
                              🗑 hepsini ele
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {mode === "members" && allianceNames.length > 0 && (
                    <div
                      className="flex flex-wrap items-center gap-1 mb-2 rounded-lg px-2 py-1"
                      style={{ background: "rgba(20,15,10,0.55)", border: "1px dashed rgba(148,163,184,0.35)" }}
                      data-testid="ocr-alliance-legend"
                    >
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground mr-1">
                        İttifak Renkleri:
                      </span>
                      {allianceNames.map((n) => {
                        const c = allianceColor(n);
                        const isActive = allianceFilter.toLowerCase() === n.toLowerCase();
                        // Count preview rows currently belonging to this alliance
                        // (respects manual edits + [TAG] fallback + excludes struck rows).
                        const count = rows.reduce((acc, r, i) => {
                          if (excludedRows.has(i)) return acc;
                          const patched = rowEdits[i] || {};
                          let a = patched.alliance_name !== undefined ? patched.alliance_name : r.alliance_name;
                          if (!a) {
                            const mm = /^\s*\[([^\]]+)\]/.exec(String(patched.name ?? r.name ?? ""));
                            if (mm) a = mm[1].trim();
                          }
                          return String(a || "").toLowerCase() === n.toLowerCase() ? acc + 1 : acc;
                        }, 0);
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setAllianceFilter(isActive ? "" : n)}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-all"
                            style={{
                              background: isActive
                                ? (c ? `${c}30` : "rgba(148,163,184,0.25)")
                                : (c ? `${c}18` : "rgba(148,163,184,0.10)"),
                              border: `1px solid ${isActive ? (c || "#F5A623") : (c ? c + "55" : "rgba(148,163,184,0.30)")}`,
                              color: "#F5F0E8",
                              boxShadow: isActive && c ? `0 0 6px ${c}77` : "none",
                              cursor: "pointer",
                              opacity: count === 0 ? 0.45 : 1,
                            }}
                            title={isActive ? `${n} filtresi aktif — tıkla temizle` : `Tabloyu sadece ${n} üyelerine filtrele (${count})`}
                            data-testid={`ocr-alliance-legend-${n.replace(/\s+/g,'_')}`}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                display: "inline-block",
                                width: 8, height: 8, borderRadius: 999,
                                background: c || "#6B7280",
                                boxShadow: c ? `0 0 4px ${c}88` : "none",
                                border: "1px solid rgba(255,255,255,0.30)",
                              }}
                            />
                            {n}
                            <span
                              className="mono font-bold text-[9px] px-1 rounded"
                              style={{
                                background: "rgba(0,0,0,0.35)",
                                color: count > 0 ? (c || "#F5A623") : "#94A3B8",
                                minWidth: 16, textAlign: "center",
                              }}
                              data-testid={`ocr-alliance-legend-count-${n.replace(/\s+/g,'_')}`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                      {allianceFilter && (
                        <button
                          type="button"
                          onClick={() => setAllianceFilter("")}
                          className="text-[9px] underline decoration-dotted ml-1"
                          style={{ color: "#93C5FD" }}
                          data-testid="ocr-alliance-legend-clear"
                        >
                          × filtreyi temizle
                        </button>
                      )}
                    </div>
                  )}
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Hiç veri okunmadı — daha net bir görüntü deneyin.
                    </div>
                  ) : (
                    <>
                        {/* Bulk actions for auto-created members — collapsible warning above the table */}
                        {(mode === "members") && (() => {
                          const newRows = rows
                            .map((r, i) => {
                              const currName = rowEdits[i]?.name ?? r.name;
                              const clean = _stripTag(currName);
                              const isNew = !existingNamesLc.has(clean.toLowerCase());
                              const origClean = _stripTag(r.name);
                              const origWasExisting = existingNamesLc.has(origClean.toLowerCase());
                              const editedIntoNew = origWasExisting && isNew && (rowEdits[i]?.name !== undefined);
                              return { i, name: currName, isNew, editedIntoNew, isExcluded: excludedRows.has(i) };
                            })
                            .filter((x) => x.isNew && !x.isExcluded);
                          if (newRows.length === 0) return null;
                          const editedTypos = newRows.filter((x) => x.editedIntoNew).length;
                          return (
                            <div
                              className="rounded-lg p-2 mb-2"
                              style={{ background: editedTypos > 0 ? "rgba(245,166,35,0.10)" : "rgba(34,197,94,0.08)", border: `1px solid ${editedTypos > 0 ? "rgba(245,166,35,0.45)" : "rgba(34,197,94,0.35)"}` }}
                              data-testid="ocr-new-members-panel"
                            >
                              <button
                                type="button"
                                onClick={() => setShowNewList((v) => !v)}
                                className="w-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: editedTypos > 0 ? "#FCD34D" : "#4ade80" }}
                                data-testid="ocr-new-members-toggle"
                              >
                                {showNewList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {editedTypos > 0 ? <AlertTriangle className="w-3 h-3" /> : <span>+</span>}
                                {newRows.length} yeni üye oluşacak
                                {editedTypos > 0 && (
                                  <span className="normal-case font-normal opacity-90" title="Düzenlediğin isim mevcut bir üyeye tam eşleşmiyor — yazım hatası olabilir">
                                    · ⚠ {editedTypos} olası yazım hatası
                                  </span>
                                )}
                                <span className="ml-auto normal-case font-normal opacity-70">
                                  {showNewList ? "gizle" : "göster"}
                                </span>
                              </button>
                              {showNewList && (
                                <div className="mt-1.5 flex flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setExcludedRows((prev) => {
                                      const nx = new Set(prev);
                                      newRows.forEach((x) => nx.add(x.i));
                                      return nx;
                                    })}
                                    data-testid="ocr-new-members-exclude-all"
                                    className="chip text-[9px] self-start"
                                    style={{ borderColor: "rgba(248,113,113,0.55)", color: "#FCA5A5" }}
                                    title="Yeni oluşacak tüm satırları tek tıkla ele"
                                  >
                                    <Trash2 className="w-3 h-3" /> Hepsini Ele
                                  </button>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                    {newRows.map((x) => (
                                      <div
                                        key={x.i}
                                        className="flex items-center gap-2 text-[10px] rounded px-2 py-1"
                                        style={{ background: "rgba(20,15,10,0.55)" }}
                                        data-testid={`ocr-new-member-${x.i}`}
                                      >
                                        {x.editedIntoNew && (
                                          <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: "#FCD34D" }} />
                                        )}
                                        <span className="truncate flex-1 text-white" title={x.name}>{x.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => setExcludedRows((prev) => { const nx = new Set(prev); nx.add(x.i); return nx; })}
                                          className="opacity-70 hover:opacity-100"
                                          style={{ color: "#F87171" }}
                                          title="Bu satırı ele"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div className="rounded-md">
                        <table className="w-full text-[10px] table-fixed">
                      <thead>
                        <tr className="text-muted-foreground uppercase tracking-widest">
                            {(mode === "members" || mode === "event") && (<>
                              <th style={{width: mode === "members" ? '20px' : '24px', padding:'6px 4px', textAlign:'center', whiteSpace:'nowrap', ...(mode === "event" ? {borderBottom:'1px solid rgba(245,166,35,0.4)'} : {})}}></th>
                              <th style={{width: mode === "members" ? '20px' : '24px', padding:'6px 4px', textAlign:'center', whiteSpace:'nowrap', ...(mode === "event" ? {borderBottom:'1px solid rgba(245,166,35,0.4)'} : {})}}></th>
                            </>)}
                          {mode === "members" && (<>
                            <th style={{width: subMode === "power" ? '56px' : '36px', padding:'6px 2px', textAlign:'center', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.03em', textTransform:'uppercase', whiteSpace:'nowrap'}}>İttf.</th>
                            <th style={{width: subMode === "power" ? '136px' : '90px', minWidth: subMode === "power" ? '136px' : undefined, padding:'6px 4px 6px 10px', textAlign:'left', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.03em', textTransform:'uppercase', whiteSpace:'nowrap'}}>Ad</th>
                            {subMode !== "power" && (
                              <th style={{width:'60px', padding:'6px 4px', textAlign:'center', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.03em', textTransform:'uppercase', whiteSpace:'nowrap'}}>Rank</th>
                            )}
                            {subMode !== "power" && (
                              <th style={{width:'50px', padding:'6px 4px', textAlign:'center', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.03em', textTransform:'uppercase', whiteSpace:'nowrap'}}>Kale</th>
                            )}
                            {subMode !== "castle_rank" && (
                              <th style={{width: subMode === "power" ? '136px' : undefined, minWidth: subMode === "power" ? '136px' : '100px', padding:'6px 4px', textAlign:'right', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.03em', textTransform:'uppercase', whiteSpace:'nowrap'}}>Güç</th>
                            )}
                          </>)}
                          {mode === "event" && (<>
                            <th style={{width:'48px', padding:'6px 4px', textAlign:'center', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.05em', textTransform:'uppercase', borderBottom:'1px solid rgba(245,166,35,0.4)'}}>İttifak</th>
                            <th style={{minWidth:'136px', width:'136px', padding:'6px 4px 6px 12px', textAlign:'left', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.05em', textTransform:'uppercase', borderBottom:'1px solid rgba(245,166,35,0.4)'}}>Üye Adı</th>
                            <th style={{minWidth:'136px', width:'136px', padding:'6px 4px', textAlign:'right', color:'#fbbf24', fontSize:'10px', fontWeight:'bold', letterSpacing:'0.05em', textTransform:'uppercase', borderBottom:'1px solid rgba(245,166,35,0.4)'}}>Puan</th>
                          </>)}
                          {mode === "war" && (<>
                            <th className="text-left py-1">Kazanan</th>
                            <th className="text-left py-1">Kaybeden</th>
                            <th className="text-right py-1">Kayıp+</th>
                            <th className="text-right py-1">Kayıp−</th>
                          </>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          // Legend filter — hide rows outside the picked alliance.
                          if (mode === "members" && allianceFilter) {
                            const patched = rowEdits[i] || {};
                            let a = patched.alliance_name !== undefined ? patched.alliance_name : r.alliance_name;
                            if (!a) {
                              const mm = /^\s*\[([^\]]+)\]/.exec(String(patched.name ?? r.name ?? ""));
                              if (mm) a = mm[1].trim();
                            }
                            if (String(a || "").toLowerCase() !== allianceFilter.toLowerCase()) return null;
                          }
                          const isExcluded = excludedRows.has(i);
                          const isAutoApplied = autoAppliedRows.includes(i) && rowEdits[i]?.name !== undefined;
                          const toggleExclude = () => setExcludedRows((prev) => {
                            const nx = new Set(prev);
                            nx.has(i) ? nx.delete(i) : nx.add(i);
                            return nx;
                          });
                          return (
                          <React.Fragment key={i}>
                          <tr
                            className={`transition-colors ${mode === "event" ? "" : "border-t border-white/5"} ${(mode !== "event" && i % 2 === 1) ? "bg-white/[0.02]" : ""}`}
                            style={mode === "event" ? { borderTop: '1px solid rgba(245,166,35,0.3)', background: 'rgba(0,0,0,0.2)' } : undefined}
                            data-testid={`ocr-row-${i}`}
                            style={{
                              ...(isExcluded ? { opacity: 0.35, textDecoration: "line-through" } : {}),
                              ...(isAutoApplied && !isExcluded ? {
                                borderLeft: "3px solid #FCD34D",
                                background: "linear-gradient(90deg, rgba(245,166,35,0.10), transparent 40%)",
                              } : {}),
                            }}
                            title={isAutoApplied ? "Otomatik bağlandı — düzenlersen bu vurgu kalkar" : undefined}
                          >
                            {(mode === "members" || mode === "event") && (<>
                              <td style={{padding:'4px', textAlign:'center', width: mode === "members" ? '20px' : '24px', ...(mode === "event" ? {borderTop:'1px solid rgba(245,166,35,0.3)'} : {})}}>
                                <input
                                  type="checkbox"
                                  checked={!isExcluded}
                                  onChange={toggleExclude}
                                  data-testid={`ocr-row-status-${i}`}
                                  style={{cursor:'pointer', accentColor:'#22c55e'}}
                                  title="Bu satır kaydedilecek mi?"
                                />
                              </td>
                              <td style={{padding:'4px', textAlign:'center', width: mode === "members" ? '20px' : '24px', ...(mode === "event" ? {borderTop:'1px solid rgba(245,166,35,0.3)'} : {})}}>
                                <button
                                  type="button"
                                  onClick={toggleExclude}
                                  data-testid={`ocr-row-toggle-${i}`}
                                  title={isExcluded ? "Bu satırı geri al" : "Bu satırı ele"}
                                  style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'14px', padding:'2px'}}
                                >
                                  {isExcluded ? "↺" : "🗑"}
                                </button>
                              </td>
                            </>)}
                            {mode === "members" && (() => {
                              const currName = rowEdits[i]?.name ?? r.name ?? "";
                              const cleanName = _stripTag(currName);
                              const isExisting = existingNamesLc.has(cleanName.toLowerCase());
                              const suggestions = !isExisting
                                ? _fuzzyTopMatches(currName, (existingMembers || []).map((m) => m.name || ""), 3)
                                : [];
                              // Alliance lookup — support every field name the OCR
                              // pipeline (and any legacy row shape) might use.
                              let allianceGuess = rowEdits[i]?.alliance_name;
                              if (allianceGuess === undefined || allianceGuess === null || allianceGuess === "") {
                                allianceGuess = r.alliance_name ?? r.alliance ?? r.ittifak ?? r.tag ?? "";
                                if (!allianceGuess) {
                                  const mm = /^\s*\[([^\]]+)\]/.exec(String(currName ?? ""));
                                  if (mm) allianceGuess = mm[1].trim();
                                }
                              }
                              if (typeof allianceGuess === "string") allianceGuess = allianceGuess.replace(/[\[\]]/g, "").trim();
                              const currRank = (rowEdits[i]?.rank ?? r.rank ?? "R1") || "R1";
                              const currCastle = rowEdits[i]?.castle_level ?? r.castle_level ?? "";
                              const currPower = rowEdits[i]?.power ?? r.power ?? r.guc ?? "";
                              // Türkçe binlik ayraçlı görüntüleme — input string tabanlı,
                              // değişimde noktalar sıyrılır ve number olarak state'e yazılır.
                              const powerDisplay = (currPower === "" || currPower === null || currPower === undefined)
                                ? ""
                                : Number(currPower).toLocaleString("tr-TR");
                              const cellStyle = { padding: '2px', verticalAlign: 'middle' };
                              const inputStyle = {
                                width: '100%',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                color: 'white',
                                fontSize: '11px',
                                outline: 'none',
                                fontFamily: 'inherit',
                              };
                              return (<>
                                <td style={{...cellStyle, width: subMode === "power" ? '56px' : '36px'}}>
                                {subMode === "power" ? (
                                  <>
                                    <input
                                      type="text"
                                      list={`ocr-alliance-list-${i}`}
                                      value={allianceGuess || ''}
                                      onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], alliance_name: e.target.value } }))}
                                      disabled={isExcluded}
                                      data-testid={`ocr-row-alliance-${i}`}
                                      placeholder="—"
                                      maxLength={4}
                                      style={{
                                        ...inputStyle,
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: allianceGuess ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                                        fontWeight: 'bold',
                                        textAlign: 'center',
                                        fontSize: '11px',
                                      }}
                                      title={allianceGuess || "İttifak"}
                                    />
                                    <datalist id={`ocr-alliance-list-${i}`}>
                                      {allianceNames.map((n) => (<option key={n} value={n} />))}
                                    </datalist>
                                  </>
                                ) : (
                                  <>
                                    <input
                                      type="text"
                                      list={`ocr-alliance-list-${i}`}
                                      value={allianceGuess || ''}
                                      onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], alliance_name: e.target.value } }))}
                                      disabled={isExcluded}
                                      data-testid={`ocr-row-alliance-${i}`}
                                      placeholder="—"
                                      maxLength={4}
                                      style={{
                                        ...inputStyle,
                                        background: allianceGuess ? 'rgba(251,191,36,0.15)' : 'rgba(0,0,0,0.3)',
                                        border: allianceGuess ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                        color: allianceGuess ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                                        borderRadius: '9999px',
                                        textAlign: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '11px',
                                        padding: '3px 2px',
                                      }}
                                      title={allianceGuess || "İttifak"}
                                    />
                                    <datalist id={`ocr-alliance-list-${i}`}>
                                      {allianceNames.map((n) => (<option key={n} value={n} />))}
                                    </datalist>
                                  </>
                                )}
                                </td>
                                <td style={{...cellStyle, width: subMode === "power" ? '136px' : '90px', minWidth: subMode === "power" ? '136px' : undefined, paddingLeft:'10px'}}>
                                  <input
                                    type="text"
                                    value={currName}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-name-${i}`}
                                    style={{
                                      ...inputStyle,
                                      whiteSpace: 'normal',
                                      overflow: 'visible',
                                      textOverflow: 'clip',
                                    }}
                                    title={currName}
                                  />
                                  {suggestions.length > 0 && !isExcluded && (
                                    <div style={{display:'flex', flexWrap:'wrap', gap:'2px', marginTop:'2px'}} data-testid={`ocr-suggest-${i}`}>
                                      {suggestions.slice(0, 2).map((s) => (
                                        <button
                                          key={s.name}
                                          type="button"
                                          onClick={() => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: s.name } }))}
                                          style={{
                                            fontSize:'8px', padding:'1px 4px', borderRadius:'3px', fontWeight:'bold',
                                            background: 'rgba(34,197,94,0.20)', color: '#4ade80',
                                            border: '1px solid rgba(34,197,94,0.5)', cursor: 'pointer',
                                          }}
                                          title={`Levenshtein ${s.dist} — tıkla bağla`}
                                        >
                                          🔗 {s.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                {subMode !== "power" && (
                                <td style={{...cellStyle, width:'60px', textAlign:'center'}}>
                                  <select
                                    value={currRank}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], rank: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-rank-${i}`}
                                    style={{...inputStyle, color: rankColor(currRank), fontWeight:'bold', textAlign:'center', cursor:'pointer'}}
                                    title="Rütbe"
                                  >
                                    <option value="R1">R1</option>
                                    <option value="R2">R2</option>
                                    <option value="R3">R3</option>
                                    <option value="R4">R4</option>
                                    <option value="R5">R5</option>
                                  </select>
                                </td>
                                )}
                                {subMode !== "power" && (
                                <td style={{...cellStyle, width:'50px', textAlign:'center'}}>
                                  <select
                                    value={currCastle}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], castle_level: e.target.value === "" ? "" : Number(e.target.value) } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-castle-${i}`}
                                    style={{
                                      ...inputStyle,
                                      color: currCastle ? '#F472B6' : 'rgba(255,255,255,0.4)',
                                      fontWeight: 'bold', textAlign: 'center', cursor: 'pointer',
                                      fontFamily: 'monospace',
                                    }}
                                    title="Kale seviyesi (pembe altıgen)"
                                  >
                                    <option value="">—</option>
                                    {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                                      <option key={n} value={n}>F{n}</option>
                                    ))}
                                  </select>
                                </td>
                                )}
                                {subMode !== "castle_rank" && (
                                <td style={{...cellStyle, width: subMode === "power" ? '136px' : undefined, minWidth: subMode === "power" ? '136px' : '100px', textAlign:'right'}}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={powerDisplay}
                                    placeholder="—"
                                    onChange={(e) => {
                                      const raw = String(e.target.value || "").replace(/[^\d]/g, "");
                                      setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], power: raw === "" ? "" : Number(raw) } }));
                                    }}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-power-${i}`}
                                    style={{
                                      ...inputStyle,
                                      color: currPower ? '#f97316' : 'rgba(255,255,255,0.35)',
                                      textAlign: 'right',
                                      fontFamily: 'monospace',
                                      fontWeight: 'bold',
                                    }}
                                    title={currPower ? `Güç: ${powerDisplay}` : "Güç"}
                                  />
                                </td>
                                )}
                              </>);
                            })()}
                            {mode === "event" && (() => {
                              const currName = rowEdits[i]?.name ?? r.name ?? "";
                              const currPoints = Number(rowEdits[i]?.points ?? r.points ?? 0) || 0;
                              let allianceGuess = rowEdits[i]?.alliance_name;
                              if (allianceGuess === undefined || allianceGuess === null || allianceGuess === "") {
                                allianceGuess = r.alliance_name ?? r.alliance ?? r.tag ?? "";
                                if (!allianceGuess) {
                                  const tag = _extractAllianceTag(currName ?? "");
                                  if (tag) allianceGuess = tag;
                                }
                              }
                              if (typeof allianceGuess === "string") {
                                allianceGuess = allianceGuess.replace(/[\[\]]/g, "").trim();
                              }
                              const displayName = _stripTagAndJunk(currName ?? "") || currName || "";
                              const pointsDisplay = currPoints ? Number(currPoints).toLocaleString("tr-TR") : "";
                              const cellStyle = { padding: '2px 4px', borderTop: '1px solid rgba(245,166,35,0.3)', verticalAlign: 'middle' };
                              // Belirgin input box stili — kullanıcı hemen "buraya
                              // tıklayabilirim" hissini alsın: hafif koyu arka plan,
                              // ince gümüş kenarlık, focus'ta amber halka.
                              const boxInputStyle = {
                                width: '100%',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                color: 'white',
                                fontSize: '12px',
                                outline: 'none',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                              };
                              const onBoxFocus = (e) => {
                                e.target.style.borderColor = '#fbbf24';
                                e.target.style.boxShadow = '0 0 0 2px rgba(251,191,36,0.25)';
                              };
                              const onBoxBlur = (e) => {
                                e.target.style.borderColor = 'rgba(255,255,255,0.15)';
                                e.target.style.boxShadow = 'none';
                              };
                              return (<>
                                <td style={{ ...cellStyle, width: '48px', textAlign: 'center' }}>
                                  <input
                                    type="text"
                                    list={`ocr-ev-alliance-list-${i}`}
                                    value={allianceGuess || ''}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], alliance_name: e.target.value } }))}
                                    onFocus={onBoxFocus}
                                    onBlur={onBoxBlur}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-alliance-${i}`}
                                    placeholder="—"
                                    maxLength={4}
                                    style={{
                                      ...boxInputStyle,
                                      color: allianceGuess ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                                      fontWeight: 'bold',
                                      textAlign: 'center',
                                      fontSize: '11px',
                                    }}
                                    title={allianceGuess || "İttifak"}
                                  />
                                  <datalist id={`ocr-ev-alliance-list-${i}`}>
                                    {allianceNames.map((n) => (<option key={n} value={n} />))}
                                  </datalist>
                                </td>
                                <td style={{...cellStyle, paddingLeft: '12px', minWidth: '136px', width: '136px'}}>
                                  <input
                                    type="text"
                                    value={rowEdits[i]?.name !== undefined ? currName : displayName}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: e.target.value } }))}
                                    onFocus={onBoxFocus}
                                    onBlur={onBoxBlur}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-name-${i}`}
                                    style={{ ...boxInputStyle, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}
                                    title={currName || "Üye adı"}
                                  />
                                </td>
                                <td style={{ ...cellStyle, minWidth: '136px', width: '136px', textAlign: 'right' }}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={pointsDisplay}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const raw = String(e.target.value || "").replace(/[^\d]/g, "");
                                      setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], points: raw === "" ? "" : Number(raw) } }));
                                    }}
                                    onFocus={onBoxFocus}
                                    onBlur={onBoxBlur}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-points-${i}`}
                                    style={{
                                      ...boxInputStyle,
                                      color: '#f97316',
                                      textAlign: 'right',
                                      fontFamily: 'monospace',
                                      fontWeight: 'bold',
                                    }}
                                    title={currPoints ? `Puan: ${pointsDisplay}` : "Puan"}
                                  />
                                </td>
                              </>);
                            })()}
                            {false && mode === "event" && (() => {
                              const currName = rowEdits[i]?.name ?? r.name;
                              const cleanName = _stripTag(currName);
                              const isExisting = existingNamesLc.has(cleanName.toLowerCase());
                              const currPoints = rowEdits[i]?.points ?? r.points ?? 0;
                              const origClean = _stripTag(r.name);
                              const origWasExisting = existingNamesLc.has(origClean.toLowerCase());
                              const editedIntoNew = origWasExisting && !isExisting && (rowEdits[i]?.name !== undefined);
                              const suggestions = !isExisting
                                ? _fuzzyTopMatches(currName, (existingMembers || []).map((m) => m.name || ""), 3)
                                : [];
                              return (<>
                                <td className="py-1 max-w-[180px]">
                                  <input
                                    type="text"
                                    value={currName ?? ""}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-name-${i}`}
                                    className="w-full bg-transparent text-white outline-none border-b border-transparent hover:border-white/30 focus:border-amber-400 text-[10px]"
                                    title="Adı düzeltmek için tıkla"
                                  />
                                  {suggestions.length > 0 && !isExcluded && (
                                    <div className="flex flex-wrap gap-1 mt-0.5" data-testid={`ocr-suggest-${i}`}>
                                      {suggestions.map((s) => {
                                        // Confidence halo: green = safe (Levenshtein ≤ 1), soft green
                                        // ≤ 2, amber ≤ 3, muted orange when the model is guessing.
                                        const conf = s.dist <= 1 ? { bg: "rgba(34,197,94,0.20)", fg: "#4ade80", border: "rgba(34,197,94,0.75)", glow: "0 0 6px rgba(34,197,94,0.55)", label: "Yüksek eşleşme" }
                                                  : s.dist <= 2 ? { bg: "rgba(74,222,128,0.14)", fg: "#86EFAC", border: "rgba(74,222,128,0.55)", glow: "0 0 4px rgba(74,222,128,0.35)", label: "İyi eşleşme" }
                                                  : s.dist <= 3 ? { bg: "rgba(245,166,35,0.18)", fg: "#FCD34D", border: "rgba(245,166,35,0.60)", glow: "0 0 4px rgba(245,166,35,0.35)", label: "Yaklaşık eşleşme" }
                                                                : { bg: "rgba(249,115,22,0.15)", fg: "#FDBA74", border: "rgba(249,115,22,0.55)", glow: "none", label: "Zayıf eşleşme" };
                                        return (
                                          <button
                                            key={s.name}
                                            type="button"
                                            onClick={() => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], name: s.name } }))}
                                            className="text-[9px] px-1.5 py-0.5 rounded border font-bold"
                                            style={{ background: conf.bg, color: conf.fg, borderColor: conf.border, boxShadow: conf.glow }}
                                            title={`${conf.label} · Levenshtein ${s.dist} — tıkla ve bu üyeye bağla`}
                                            data-testid={`ocr-suggest-${i}-${s.name.replace(/\s+/g,'_')}`}
                                          >
                                            🔗 {s.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1">
                                  <input
                                    type="number"
                                    value={currPoints}
                                    min={0}
                                    onChange={(e) => setRowEdits((prev) => ({ ...prev, [i]: { ...prev[i], points: e.target.value } }))}
                                    disabled={isExcluded}
                                    data-testid={`ocr-row-points-${i}`}
                                    className="w-full bg-transparent gold-text mono outline-none border-b border-transparent hover:border-white/30 focus:border-amber-400 text-[10px] text-right"
                                    title="Puanı düzeltmek için tıkla"
                                  />
                                </td>
                                <td className="text-right py-1 text-white/60">
                                  {r.sources > 1 ? (
                                    <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.2)", color: "#A78BFA" }}>
                                      ×{r.sources}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="text-right py-1">
                                  {isExisting ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(107,114,128,0.25)", color: "#9ca3af" }}>
                                      MEVCUT
                                    </span>
                                  ) : editedIntoNew ? (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold inline-flex items-center gap-0.5"
                                      style={{ background: "rgba(245,166,35,0.25)", color: "#FCD34D" }}
                                      title="Bu ismi düzenledin ve artık mevcut hiçbir üyeye eşleşmiyor — yazım hatası olabilir. Kaydedilirse yeni üye açılır."
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5" /> YENİ ⚠
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#4ade80" }} title="Yeni üye oluşturulacak">
                                      + YENİ
                                    </span>
                                  )}
                                </td>
                              </>);
                            })()}
                            {mode === "war" && (<>
                              <td className="text-green-400 py-1">{r.winner || "—"}</td>
                              <td className="text-red-400 py-1">{r.loser || "—"}</td>
                              <td className="text-right py-1 text-white/70">{r.casualties_won || "—"}</td>
                              <td className="text-right py-1 text-white/70">{r.casualties_lost || "—"}</td>
                            </>)}
                          </tr>
                          {false && mode === "event" && !isExcluded && selection && (() => {
                            // Event mode diff — show existing points vs new points
                            // for members already scored in the picked event. Also
                            // acts as the visual signal that Apply will BLOCK this
                            // row (the doApply predicate filters duplicates out).
                            const currName = _stripTag(rowEdits[i]?.name ?? r.name);
                            const existing = eventExistingByNameLc.get(currName.toLowerCase());
                            if (!existing) return null;
                            const oldPts = Number(existing.existing_points || 0);
                            const newPts = Number(rowEdits[i]?.points ?? r.points ?? 0) || 0;
                            return (
                              <tr
                                className="border-b border-white/5"
                                data-testid={`ocr-row-diff-${i}`}
                              >
                                <td colSpan={4} className="py-1 px-2" style={{ background: "rgba(248,113,113,0.06)" }}>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                                    <span
                                      className="uppercase tracking-widest flex items-center gap-0.5"
                                      style={{ color: "#FCA5A5" }}
                                      title="Bu üyenin bu etkinlikte zaten puanı var — kaydet düğmesine basınca atlanacak"
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5" /> Mükerrer — Atlanacak
                                    </span>
                                    <span
                                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                                      style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(248,113,113,0.45)" }}
                                      data-testid={`ocr-row-diff-points-${i}`}
                                    >
                                      <span className="uppercase tracking-widest opacity-70" style={{ color: "#FCA5A5" }}>Puan:</span>
                                      <span className="mono opacity-60 line-through" title="Mevcut puan (DB)">{oldPts.toLocaleString("tr-TR")}</span>
                                      <span className="opacity-60">→</span>
                                      <span className="mono font-bold" style={{ color: "#FCA5A5" }} title="Yeni puan (OCR — atlanacak)">{newPts.toLocaleString("tr-TR")}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setExcludedRows((prev) => { const nx = new Set(prev); nx.add(i); return nx; })}
                                      className="ml-auto text-[9px] underline decoration-dotted"
                                      style={{ color: "#93C5FD" }}
                                      data-testid={`ocr-row-diff-exclude-${i}`}
                                      title="Bu satırı manuel olarak ele — mükerrer olduğu için nasılsa atlanacak"
                                    >
                                      🗑 satırı ele
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                          {false && mode === "members" && !isExcluded && (() => {
                            // Diff strip — for rows that match an existing member,
                            // show `önceki değer → yeni değer` badges per field so
                            // admins immediately spot silent overwrites of curated
                            // castle_level / rank / alliance_name / bireysel_guc values.
                            const cleanName = _stripTag(rowEdits[i]?.name ?? r.name);
                            const existing = existingByLcName.get(cleanName.toLowerCase());
                            if (!existing) return null;
                            // Resolved OCR row values (respecting inline edits).
                            const patch = rowEdits[i] || {};
                            const ocrPower = (typeof patch.power === "number" ? patch.power : r.power);
                            const ocrCastle = (typeof patch.castle_level === "number" ? patch.castle_level : r.castle_level);
                            const ocrRank = (patch.rank !== undefined ? patch.rank : r.rank) || null;
                            let ocrAlliance = patch.alliance_name;
                            if (ocrAlliance === undefined) {
                              ocrAlliance = r.alliance_name;
                              if (!ocrAlliance) {
                                const mm = /^\s*\[([^\]]+)\]/.exec(String(patch.name ?? r.name ?? ""));
                                if (mm) ocrAlliance = mm[1].trim();
                              }
                            }
                            if (typeof ocrAlliance === "string") ocrAlliance = ocrAlliance.replace(/[\[\]]/g, "").trim();
                            // Backend apply_members only overwrites when OCR values
                            // are truthy / whitelisted — mirror that predicate here so
                            // the diff strip reflects what will actually hit the DB.
                            const willWritePower = typeof ocrPower === "number" && ocrPower > 0;
                            const willWriteCastle = typeof ocrCastle === "number" && ocrCastle > 0;
                            const willWriteRank = ["R1","R2","R3","R4","R5"].includes(String(ocrRank || "").toUpperCase());
                            const willWriteAlliance = !!(ocrAlliance && String(ocrAlliance).trim());
                            const fmtNum = (n) => (n === null || n === undefined || n === "" || n === 0 ? "—" : Number(n).toLocaleString("tr-TR"));
                            const fmtCastle = (n) => (!n ? "—" : `F${n}`);
                            const fmtStr = (s) => (s ? String(s) : "—");
                            const diffs = [];
                            if (willWritePower && Number(existing.bireysel_guc || 0) !== Number(ocrPower)) {
                              diffs.push({ label: "Güç", from: fmtNum(existing.bireysel_guc), to: fmtNum(ocrPower), color: "#FF6B00" });
                            }
                            if (willWriteCastle && Number(existing.castle_level || 0) !== Number(ocrCastle)) {
                              diffs.push({ label: "Kale", from: fmtCastle(existing.castle_level), to: fmtCastle(ocrCastle), color: "#F472B6" });
                            }
                            if (willWriteRank && String(existing.rank || "") !== String(ocrRank).toUpperCase()) {
                              diffs.push({ label: "Rütbe", from: fmtStr(existing.rank), to: String(ocrRank).toUpperCase(), color: "#FCD34D" });
                            }
                            if (willWriteAlliance && String(existing.alliance_name || "") !== String(ocrAlliance)) {
                              diffs.push({ label: "İttifak", from: fmtStr(existing.alliance_name), to: String(ocrAlliance), color: "#93C5FD" });
                            }
                            if (diffs.length === 0) return null;
                            return (
                              <tr
                                className="border-b border-white/5"
                                data-testid={`ocr-row-diff-${i}`}
                              >
                                <td colSpan={7} className="py-1 px-2" style={{ background: "rgba(245,166,35,0.06)" }}>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                                    <span
                                      className="uppercase tracking-widest flex items-center gap-0.5"
                                      style={{ color: "#FCD34D" }}
                                      title="Bu satır kaydedilirse aşağıdaki mevcut değerlerin üzerine yazılacak"
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5" /> Üzerine Yazılacak
                                    </span>
                                    {diffs.map((d) => (
                                      <span
                                        key={d.label}
                                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                                        style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${d.color}55` }}
                                        data-testid={`ocr-row-diff-${d.label.toLowerCase()}-${i}`}
                                      >
                                        <span className="uppercase tracking-widest opacity-70" style={{ color: d.color }}>{d.label}:</span>
                                        <span className="mono opacity-60 line-through" title="Önceki değer (DB)">{d.from}</span>
                                        <span className="opacity-60">→</span>
                                        <span className="mono font-bold" style={{ color: d.color }} title="Yeni değer (OCR)">{d.to}</span>
                                      </span>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setRowEdits((prev) => {
                                        // Revert all diff-triggering fields back to existing DB values so
                                        // the row becomes a no-op update (admins tap once to protect data).
                                        const nx = { ...(prev[i] || {}) };
                                        nx.power = Number(existing.bireysel_guc || 0);
                                        nx.castle_level = Number(existing.castle_level || 0);
                                        nx.rank = existing.rank || null;
                                        nx.alliance_name = existing.alliance_name || "";
                                        return { ...prev, [i]: nx };
                                      })}
                                      className="ml-auto text-[9px] underline decoration-dotted"
                                      style={{ color: "#93C5FD" }}
                                      data-testid={`ocr-row-diff-keep-existing-${i}`}
                                      title="Bu satır için OCR değerlerini yok say, mevcut DB değerlerini koru"
                                    >
                                      ↩ mevcut değerleri koru
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                          </React.Fragment>
                        );
                        })}
                      </tbody>
                    </table>
                    </div>
                    </>
                  )}
                </div>
              )}

              {result && rows.length > 0 && requireSelection && (
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.4)" }}
                  data-testid="ocr-selection-panel"
                >
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#A78BFA" }}>
                    {requireSelection.label || "Bir seçim yapın"}
                  </div>
                  <select
                    data-testid="ocr-selection-input"
                    value={selection}
                    onChange={(e) => setSelection(e.target.value)}
                    className="w-full card-dark text-sm text-white px-3 py-2 focus:outline-none focus:border-primary"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                  >
                    <option value="">— {requireSelection.placeholder || "Seçim yapın"} —</option>
                    {(requireSelection.options || []).map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {result && rows.length > 0 && (() => {
                // Pre-save summary — replaces the per-row diff strips inside the
                // table with a single compact card above the Save button. Shows
                // duplicate/overwrite counts for event mode and overwrite counts
                // for member rows that match an existing member. Non-empty only.
                if (mode === "event") {
                  if (!selection) return null;
                  let dupCount = 0;
                  rows.forEach((r, i) => {
                    if (excludedRows.has(i)) return;
                    const clean = _stripTag(rowEdits[i]?.name ?? r.name).toLowerCase();
                    if (eventExistingByNameLc.has(clean)) dupCount += 1;
                  });
                  if (dupCount === 0) return null;
                  const isOverwrite = duplicatePolicy === "overwrite";
                  return (
                    <div
                      className="rounded-lg p-2.5 text-[11px]"
                      style={{
                        background: isOverwrite ? "rgba(245,166,35,0.10)" : "rgba(248,113,113,0.10)",
                        border: `1px solid ${isOverwrite ? "rgba(245,166,35,0.55)" : "rgba(248,113,113,0.45)"}`,
                      }}
                      data-testid="ocr-save-summary"
                    >
                      <div className="flex items-center gap-2 font-bold uppercase tracking-widest" style={{ color: isOverwrite ? "#FCD34D" : "#FCA5A5" }}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {isOverwrite
                          ? `${dupCount} üyenin mevcut puanının üzerine yazılacak`
                          : `${dupCount} üye bu etkinlikte zaten puan almış — atlanacak`}
                      </div>
                    </div>
                  );
                }
                if (mode === "members") {
                  let overwriteCount = 0;
                  rows.forEach((r, i) => {
                    if (excludedRows.has(i)) return;
                    const cleanName = _stripTag(rowEdits[i]?.name ?? r.name);
                    const ex = existingByLcName.get(cleanName.toLowerCase());
                    if (!ex) return;
                    const patch = rowEdits[i] || {};
                    const ocrPower = (patch.power !== undefined ? patch.power : r.power);
                    const ocrCastle = (patch.castle_level !== undefined ? patch.castle_level : r.castle_level);
                    const ocrRank = (patch.rank !== undefined ? patch.rank : r.rank);
                    let ocrAlli = patch.alliance_name;
                    if (ocrAlli === undefined) ocrAlli = r.alliance_name;
                    if (typeof ocrAlli === "string") ocrAlli = ocrAlli.replace(/[\[\]]/g, "").trim();
                    const willWrite =
                      (typeof ocrPower === "number" && ocrPower > 0 && Number(ex.bireysel_guc || 0) !== Number(ocrPower))
                      || (typeof ocrCastle === "number" && ocrCastle > 0 && Number(ex.castle_level || 0) !== Number(ocrCastle))
                      || (["R1","R2","R3","R4","R5"].includes(String(ocrRank || "").toUpperCase()) && String(ex.rank || "") !== String(ocrRank).toUpperCase())
                      || (ocrAlli && String(ex.alliance_name || "") !== String(ocrAlli));
                    if (willWrite) overwriteCount += 1;
                  });
                  if (overwriteCount === 0) return null;
                  return (
                    <div
                      className="rounded-lg p-2.5 text-[11px]"
                      style={{ background: "rgba(245,166,35,0.10)", border: "1px solid rgba(245,166,35,0.55)" }}
                      data-testid="ocr-save-summary"
                    >
                      <div className="flex items-center gap-2 font-bold uppercase tracking-widest" style={{ color: "#FCD34D" }}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {overwriteCount} mevcut üyenin verisi üzerine yazılacak
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {result && rows.length > 0 && (
                <button
                  type="button"
                  onClick={doApply}
                  disabled={applying || (requireSelection && !selection) || (rows.length - excludedRows.size) === 0}
                  data-testid="ocr-apply"
                  className="btn-gold w-full py-3 justify-center"
                  style={(requireSelection && !selection) || (rows.length - excludedRows.size) === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {applying ? "Kaydediliyor…" : `Onayla & Kaydet (${rows.length - excludedRows.size})`}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
      <CropDialog
        open={cropIdx >= 0 && cropIdx < previews.length}
        imageUrl={cropIdx >= 0 ? previews[cropIdx]?.url : null}
        originalFile={cropIdx >= 0 ? previews[cropIdx]?.file : null}
        onCancel={() => setCropIdx(-1)}
        onConfirm={(file, url) => {
          setPreviews((prev) => prev.map((p, i) => (i === cropIdx ? { file, url, cropped: true } : p)));
          setResult(null); // invalidate any previous OCR result since input changed
          setCropIdx(-1);
          toast.success("Kırpma uygulandı");
        }}
      />
    </AnimatePresence>
  );
}
