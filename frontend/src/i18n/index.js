import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// v141 — Refactor Phase 3: Lazy i18n loader.
// Bootstrap sadece TR + tarayıcı için tercih edilen dili yükler; diğer 27 dil
// webpack dinamik chunk'larına ayrılır ve `changeLanguage()` çağrısında JIT
// yüklenir. `import('./langs/${code}.js')` bir template-literal olduğu için
// CRA'daki Webpack her dili ayrı chunk'a böler (initial bundle 29× küçüldü).
import tr from "./langs/tr";

// v141 — Statik LANGUAGES listesi: dil değiştiriciyi flag+isim ile render eder.
// Bu dosyaya lazy yüklenen çevirilerden bağımsızdır; menü hep 29 dili gösterir.
export const LANGUAGES = [
  { code: "tr", flag: "🇹🇷", label: "TR", name: "Türkçe" },
  { code: "en", flag: "🇬🇧", label: "EN", name: "English" },
  { code: "ru", flag: "🇷🇺", label: "RU", name: "Русский" },
  { code: "de", flag: "🇩🇪", label: "DE", name: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "FR", name: "Français" },
  { code: "es", flag: "🇪🇸", label: "ES", name: "Español" },
  { code: "ko", flag: "🇰🇷", label: "KO", name: "한국어" },
  { code: "bg", flag: "🇧🇬", label: "BG", name: "Български" },
  { code: "cs", flag: "🇨🇿", label: "CS", name: "Čeština" },
  { code: "da", flag: "🇩🇰", label: "DA", name: "Dansk" },
  { code: "el", flag: "🇬🇷", label: "EL", name: "Ελληνικά" },
  { code: "et", flag: "🇪🇪", label: "ET", name: "Eesti" },
  { code: "fi", flag: "🇫🇮", label: "FI", name: "Suomi" },
  { code: "hu", flag: "🇭🇺", label: "HU", name: "Magyar" },
  { code: "id", flag: "🇮🇩", label: "ID", name: "Bahasa Indonesia" },
  { code: "it", flag: "🇮🇹", label: "IT", name: "Italiano" },
  { code: "ja", flag: "🇯🇵", label: "JA", name: "日本語" },
  { code: "lt", flag: "🇱🇹", label: "LT", name: "Lietuvių" },
  { code: "lv", flag: "🇱🇻", label: "LV", name: "Latviešu" },
  { code: "nb", flag: "🇳🇴", label: "NB", name: "Norsk" },
  { code: "nl", flag: "🇳🇱", label: "NL", name: "Nederlands" },
  { code: "pl", flag: "🇵🇱", label: "PL", name: "Polski" },
  { code: "pt", flag: "🇵🇹", label: "PT", name: "Português" },
  { code: "ro", flag: "🇷🇴", label: "RO", name: "Română" },
  { code: "sk", flag: "🇸🇰", label: "SK", name: "Slovenčina" },
  { code: "sl", flag: "🇸🇮", label: "SL", name: "Slovenščina" },
  { code: "sv", flag: "🇸🇪", label: "SV", name: "Svenska" },
  { code: "uk", flag: "🇺🇦", label: "UK", name: "Українська" },
  { code: "zh", flag: "🇨🇳", label: "ZH", name: "中文" },
];

const SUPPORTED = new Set(LANGUAGES.map((l) => l.code));

// v141 — In-flight cache to dedupe concurrent loads of the same lang.
const _inflight = new Map();

async function _loadResource(code) {
  if (i18n.hasResourceBundle(code, "translation")) return;
  if (!SUPPORTED.has(code)) return;
  if (_inflight.has(code)) return _inflight.get(code);
  // Note: template literal is required so Webpack can code-split at build time.
  const p = import(`./langs/${code}.js`)
    .then((mod) => {
      i18n.addResourceBundle(code, "translation", mod.default, true, true);
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.warn(`i18n: failed to load '${code}'`, e);
    })
    .finally(() => _inflight.delete(code));
  _inflight.set(code, p);
  return p;
}

// v141 — Wrap changeLanguage so callers don't have to think about lazy loading.
// Any consumer that runs `i18n.changeLanguage('fr')` triggers the chunk fetch,
// waits for the bundle, THEN swaps the active language — no flicker.
const _origChangeLanguage = i18n.changeLanguage.bind(i18n);

// Public helper for consumers who want to prefetch without switching (e.g.,
// hover-preload a flag in the language menu).
export async function preloadLanguage(code) {
  return _loadResource(code);
}

// Sync-init with ONLY tr so the app boots instantly. Everything else is JIT.
i18n
  .use(initReactI18next)
  .init({
    resources: { tr: { translation: tr } },
    lng: "tr",
    fallbackLng: "tr",
    interpolation: { escapeValue: false },
    // v141 — Do NOT set parseMissingKeyHandler here; it pre-empts the
    // `defaultValue` argument in `t(key, {defaultValue})` calls (breaks
    // any component that relies on defaultValue while a chunk is loading).
    // i18next's built-in behaviour already returns defaultValue when a key
    // is missing, and the key itself as last-resort fallback.
    saveMissing: false,
  });

// Rewrite changeLanguage AFTER init so the wrapper is bound to the same
// instance react-i18next subscribes to.
i18n.changeLanguage = async (code, cb) => {
  if (code && code !== "tr") {
    await _loadResource(code);
  }
  return _origChangeLanguage(code, cb);
};

// Hydrate the user's saved lang (may be non-tr) after boot — non-blocking so
// the initial render can still paint using tr fallback keys instantly.
const savedLang = localStorage.getItem("ol_lang");
if (savedLang && savedLang !== "tr" && SUPPORTED.has(savedLang)) {
  _loadResource(savedLang).then(() => _origChangeLanguage(savedLang));
}

export default i18n;
