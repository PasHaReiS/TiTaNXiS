// DeepL bulk translator with localStorage cache.
// Behaviour:
//   1. On language change, translate the FULL TR bundle in chunked batches so
//      every visible key gets a real translation instead of falling back to TR.
//   2. Persist per-language translation dicts in localStorage so subsequent
//      visits skip the API call and stay instant / free of quota.
//   3. If the endpoint fails (missing DEEPL_API_KEY, network etc.) we silently
//      fall through — i18next fallback (`tr`) keeps the UI usable.

import i18n, { LANGUAGES } from "@/i18n";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const CACHE_KEY = "ol_deepl_cache_v1";
const CHUNK_SIZE = 60;
const inflight = new Map();

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
};
const writeCache = (obj) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
};

const isSupported = (code) => LANGUAGES.some((l) => l.code === code);

// Only translate string values (skip numbers, objects, nested keys). We accept
// values with `{{placeholders}}` — DeepL preserves them verbatim when the
// language uses the same Latin/CJK grammar.
const isTranslatable = (v) => typeof v === "string" && v.trim().length > 0;

// Translate the full TR bundle for `targetLang`. Chunked into batches of 60 so
// each network round-trip stays under DeepL's per-request cap. Returns the
// number of newly-translated keys.
export async function ensureLanguageTranslated(targetLang) {
  if (!targetLang || targetLang === "tr") return 0;
  if (!isSupported(targetLang)) return 0;

  const cache = readCache();
  const cached = cache[targetLang] || {};

  const trBundle = i18n.getResourceBundle("tr", "translation") || {};
  const existingBundle = i18n.getResourceBundle(targetLang, "translation") || {};

  // A key needs translation if:
  //   - TR has a real string for it, AND
  //   - the target bundle has no non-empty value for it, AND
  //   - the cache also doesn't already know it.
  const keys = Object.keys(trBundle).filter((k) => {
    if (!isTranslatable(trBundle[k])) return false;
    if (isTranslatable(existingBundle[k]) && existingBundle[k] !== trBundle[k]) return false;
    if (isTranslatable(cached[k]) && cached[k] !== trBundle[k]) return false;
    return true;
  });

  // Even if nothing needs fetching, still hydrate whatever is cached.
  if (Object.keys(cached).length > 0) {
    i18n.addResourceBundle(targetLang, "translation", cached, true, true);
  }
  if (keys.length === 0) return 0;
  if (inflight.has(targetLang)) return inflight.get(targetLang);

  const promise = (async () => {
    let added = 0;
    try {
      // Chunk to avoid single-request payload blow-up.
      for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
        const slice = keys.slice(i, i + CHUNK_SIZE);
        const texts = slice.map((k) => trBundle[k]);
        const res = await fetch(`${BACKEND}/api/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: texts, targetLangs: [targetLang], sourceLang: "TR" }),
        });
        if (!res.ok) break;
        const data = await res.json();
        const arr = data?.translations?.[targetLang];
        if (!Array.isArray(arr)) break;

        // Merge into cache + i18n bundle after each chunk so partial progress
        // is preserved on network hiccups.
        const next = { ...readCache() };
        const langDict = { ...(next[targetLang] || {}) };
        slice.forEach((key, idx) => {
          const val = arr[idx];
          if (typeof val === "string" && val.trim().length > 0) {
            langDict[key] = val;
            added += 1;
          }
        });
        next[targetLang] = langDict;
        writeCache(next);
        i18n.addResourceBundle(targetLang, "translation", langDict, true, true);
      }
      // Force any i18next consumer to re-render with the freshly-added keys.
      if (added > 0 && i18n.language === targetLang) {
        i18n.emit("languageChanged", targetLang);
      }
    } catch {
      /* silent — TR fallback keeps app usable */
    } finally {
      inflight.delete(targetLang);
    }
    return added;
  })();

  inflight.set(targetLang, promise);
  return promise;
}

// Wipe the entire cache — used by the "Yeniden Çevir" admin action.
export function clearTranslationCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
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
