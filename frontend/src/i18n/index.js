import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// v141 — Refactor Phase 2: her dilin çeviri sözlüğü src/i18n/langs/*.js
// altına ayrıldı. Bu dosya artık sadece yükleyici (loader).
import tr from './langs/tr';
import en from './langs/en';
import ru from './langs/ru';
import de from './langs/de';
import fr from './langs/fr';
import es from './langs/es';
import ko from './langs/ko';
import bg from './langs/bg';
import cs from './langs/cs';
import da from './langs/da';
import el from './langs/el';
import et from './langs/et';
import fi from './langs/fi';
import hu from './langs/hu';
import id_ from './langs/id';
import it from './langs/it';
import ja from './langs/ja';
import lt from './langs/lt';
import lv from './langs/lv';
import nb from './langs/nb';
import nl from './langs/nl';
import pl from './langs/pl';
import pt from './langs/pt';
import ro from './langs/ro';
import sk from './langs/sk';
import sl from './langs/sl';
import sv from './langs/sv';
import uk from './langs/uk';
import zh from './langs/zh';

const resources = {
  tr: { translation: tr },
  en: { translation: en },
  ru: { translation: ru },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  ko: { translation: ko },
  bg: { translation: bg },
  cs: { translation: cs },
  da: { translation: da },
  el: { translation: el },
  et: { translation: et },
  fi: { translation: fi },
  hu: { translation: hu },
  id: { translation: id_ },
  it: { translation: it },
  ja: { translation: ja },
  lt: { translation: lt },
  lv: { translation: lv },
  nb: { translation: nb },
  nl: { translation: nl },
  pl: { translation: pl },
  pt: { translation: pt },
  ro: { translation: ro },
  sk: { translation: sk },
  sl: { translation: sl },
  sv: { translation: sv },
  uk: { translation: uk },
  zh: { translation: zh }
};

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

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem("ol_lang") || "tr",
    fallbackLng: ["en", "tr"],
    interpolation: { escapeValue: false },
  });

export default i18n;
