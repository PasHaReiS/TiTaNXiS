import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

// v142.7 — Capture PWA install event as early as possible so the hamburger
// menu can show the "Uygulamayı Yükle" button on first render.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__pwaInstallEvent__ = e;
});
window.addEventListener("appinstalled", () => {
  window.__pwaInstallEvent__ = null;
});

// Register service worker for offline mode + push notifications
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Swallow: service-worker registration failures should not block the app
      // (browser dev-tools or extension isolation can cause spurious errors).
    });
  });
}
