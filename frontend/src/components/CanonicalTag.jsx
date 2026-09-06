// v136 — Per-page canonical + og:url updater.
// Google Search Console'daki "Doğru standart etikete sahip alternatif sayfa —
// Yönlendirmeli sayfa" uyarısını gidermek için her route değişiminde
// <link rel="canonical"> ve og:url tam https://titanxis.com{path} olarak
// güncellenir. Query string ve hash canonical'dan strip edilir (RFC-2396
// canonical form).
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PROD_ORIGIN = "https://titanxis.com";

function _canonicalHref(pathname) {
  let p = String(pathname || "/");
  // Trailing slash sadece kök için; diğer path'ler slash'sız.
  if (p !== "/" && p.endsWith("/")) p = p.replace(/\/+$/, "");
  return `${PROD_ORIGIN}${p || "/"}`;
}

function _setMetaAttr(selector, attr, value) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.setAttribute(attr, value);
}

export default function CanonicalTag() {
  const loc = useLocation();
  useEffect(() => {
    const href = _canonicalHref(loc.pathname);
    _setMetaAttr('link[rel="canonical"]', "href", href);
    _setMetaAttr('meta[property="og:url"]', "content", href);
  }, [loc.pathname]);
  return null;
}
