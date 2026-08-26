import { useTranslation } from "react-i18next";

/**
 * v125 — Read the localized value for a user-visible field (name /
 * subtitle / group_name) off an object that has a companion
 * `<field>_translations: {en, de, ...}` dict populated on the backend.
 * Falls back to the TR source when the current language is TR or the
 * translation is missing. Two-arg convenience: fld("name") on an event.
 */
export function useLocalized(obj) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || "tr").split("-")[0].toLowerCase();
  const fld = (base) => {
    if (!obj) return "";
    if (lang === "tr") return obj[base] || "";
    const tr = (obj[`${base}_translations`] || {})[lang];
    return tr || obj[base] || "";
  };
  return { name: fld("name"), subtitle: fld("subtitle"), groupName: fld("group_name"), fld };
}

/** Sync helper for one-shot lookups when hooks aren't ergonomic. */
export function pickLocalized(obj, field, lang) {
  if (!obj) return "";
  const lg = (lang || "tr").split("-")[0].toLowerCase();
  if (lg === "tr") return obj[field] || "";
  return (obj[`${field}_translations`] || {})[lg] || obj[field] || "";
}
