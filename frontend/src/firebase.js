/**
 * Firebase Analytics integration for TiTaNXiS.
 *
 * These keys are public client-safe (Google enforces access via Firebase
 * Security Rules + App Check + auth). Firebase Analytics itself has no
 * private secret — the measurementId is embedded in every request.
 *
 * Analytics won't be visible on Firebase Console for ~24h after first event.
 */
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent, setUserId, setUserProperties } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBS3p0UlOeo0O7VnWuEdHcTCZTkVgkjCJo",
  authDomain: "titanxis-firebase.firebaseapp.com",
  projectId: "titanxis-firebase",
  storageBucket: "titanxis-firebase.firebasestorage.app",
  messagingSenderId: "536581355016",
  appId: "1:536581355016:web:e72f7df7c1f46a3ac4c3bd",
  measurementId: "G-BMDBPGQLGD",
};

export const firebaseApp = initializeApp(firebaseConfig);

// Analytics only works in supported browser contexts (not SSR/service-worker/some in-app webviews).
// We lazily resolve `analytics` after isSupported() checks — `null` if unsupported so consumers no-op.
let _analytics = null;
let _ready = false;
const _readyWaiters = [];

isSupported()
  .then((ok) => {
    if (ok) {
      _analytics = getAnalytics(firebaseApp);
      // eslint-disable-next-line no-console
      console.info("[firebase] Analytics active — measurementId=G-BMDBPGQLGD");
    } else {
      // eslint-disable-next-line no-console
      console.warn("[firebase] Analytics not supported in this environment");
    }
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.warn("[firebase] Analytics init failed:", e);
  })
  .finally(() => {
    _ready = true;
    _readyWaiters.splice(0).forEach((w) => w());
  });

export function isAnalyticsReady() { return _ready; }
export function isAnalyticsActive() { return _analytics != null; }
export function onAnalyticsReady(cb) {
  if (_ready) cb();
  else _readyWaiters.push(cb);
}

/** Safe event logger — no-ops when analytics unavailable. */
export function trackEvent(name, params = {}) {
  if (!_analytics) return false;
  try {
    logEvent(_analytics, name, params);
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[firebase] logEvent(${name}) failed:`, e);
    return false;
  }
}

/** Attach a userId + basic properties once the user is known. */
export function identifyUser(user) {
  if (!_analytics || !user) return;
  try {
    setUserId(_analytics, user.id || user.username);
    setUserProperties(_analytics, {
      role: user.role || (user.is_admin ? "admin" : "member"),
      alliance: user.alliance || "",
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[firebase] identifyUser failed:", e);
  }
}

/** Track a page_view. Call on route change with `window.location.pathname`. */
export function trackPageView(pathname, title) {
  trackEvent("page_view", {
    page_path: pathname,
    page_location: typeof window !== "undefined" ? window.location.href : pathname,
    page_title: title || (typeof document !== "undefined" ? document.title : ""),
  });
}
