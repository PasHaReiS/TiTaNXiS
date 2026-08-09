// DeepL bulk translator with localStorage cache.
// Behaviour:
//   1. On language change (i18next), fetch translations for a curated set of
//      UI keys once from POST /api/translate, then i18n.addResourceBundle().
//   2. Persist per-language translation dicts in localStorage so subsequent
//      visits skip the API call and stay instant / free of quota.
//   3. If the endpoint fails (missing DEEPL_API_KEY, network etc.) we silently
//      fall through — i18next fallback (`tr`) keeps the UI usable.

import i18n, { LANGUAGES } from "@/i18n";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const CACHE_KEY = "ol_deepl_cache_v1";
const inflight = new Map();

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
};
const writeCache = (obj) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
};

// Curated set of Turkish keys we want auto-translated. Keeping this list
// intentionally short — DeepL free tier is 500k chars/month.
const UI_KEYS = [
  // Nav & auth
  "nav_leaderboard", "nav_commanders", "nav_points", "nav_add_points",
  "nav_members", "nav_events", "nav_points_about", "nav_point_calc",
  "loading", "save", "cancel", "delete", "edit", "no_permission",
  "choose_language",
  // Puan Hesaplama
  "pc_tab_pre", "pc_tab_other", "pc_add_event", "pc_add_day", "pc_event_added",
  "pc_day_added", "pc_add_table", "pc_table_added", "pc_no_tables",
  "pc_confirm_delete_table", "pc_table", "pc_deleted", "pc_no_selection",
  "pc_table_title", "pc_title_placeholder", "pc_miktar", "pc_multiplier",
  "pc_multiplier_name", "pc_no_multiplier", "pc_total_points",
  "pc_total_materials", "pc_units", "pc_units_empty", "pc_unit_name",
  "pc_unit_amount", "pc_unit_total", "pc_add_unit", "pc_add_unit_btn",
  "pc_unit_saved",
];

const isSupported = (code) => LANGUAGES.some((l) => l.code === code);

export async function ensureLanguageTranslated(targetLang) {
  if (!targetLang || targetLang === "tr") return;
  if (!isSupported(targetLang)) return;

  const cache = readCache();
  const cached = cache[targetLang] || {};

  // Read the current TR strings straight from i18next (single source of truth).
  const trBundle = i18n.getResourceBundle("tr", "translation") || {};
  const needed = UI_KEYS.filter((k) => trBundle[k] && !cached[k]);

  // Hydrate whatever is already cached — no waiting required.
  if (Object.keys(cached).length > 0) {
    i18n.addResourceBundle(targetLang, "translation", cached, true, true);
  }

  if (needed.length === 0) return;
  if (inflight.has(targetLang)) return inflight.get(targetLang);

  const texts = needed.map((k) => trBundle[k]);

  const promise = (async () => {
    try {
      const res = await fetch(`${BACKEND}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texts, targetLangs: [targetLang], sourceLang: "TR" }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const arr = data?.translations?.[targetLang];
      if (!Array.isArray(arr)) return;

      const next = { ...cached };
      needed.forEach((key, idx) => {
        if (typeof arr[idx] === "string" && arr[idx]) next[key] = arr[idx];
      });

      const nextCache = { ...cache, [targetLang]: next };
      writeCache(nextCache);
      i18n.addResourceBundle(targetLang, "translation", next, true, true);
    } catch {
      /* silent — TR fallback keeps app usable */
    } finally {
      inflight.delete(targetLang);
    }
  })();

  inflight.set(targetLang, promise);
  return promise;
}

// Translate arbitrary user-supplied text (e.g. Puan Hesaplama event/table names)
// into every enabled language. Returns { EN: "...", DE: "...", ... }.
export async function translateUserText(text, targetLangs) {
  if (!text || !text.trim()) return {};
  const langs = targetLangs || LANGUAGES.filter((l) => l.code !== "tr").map((l) => l.code);
  try {
    const res = await fetch(`${BACKEND}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLangs: langs, sourceLang: "TR" }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const out = {};
    for (const [lang, val] of Object.entries(data?.translations || {})) {
      if (typeof val === "string") out[lang] = val;
    }
    return out;
  } catch {
    return {};
  }
}
