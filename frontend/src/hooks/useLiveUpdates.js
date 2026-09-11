// v143.3 — WebSocket live-update hook.
// Connects to `/api/ws/live` on mount; when server broadcasts a change
// (leaderboard.updated / points.updated / rsvp.updated) we call SWR
// `mutate()` on the affected cache keys so every subscribed page revalidates
// automatically. No payload is trusted — messages are just "revalidate now"
// signals.

import { useEffect } from "react";
import { useSWRConfig } from "swr";

const RECONNECT_MS = 3000;

const buildWsUrl = () => {
  const base = process.env.REACT_APP_BACKEND_URL || "";
  if (!base) return "";
  const wsBase = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsBase}/api/ws/live`;
};

export function useLiveUpdates() {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const url = buildWsUrl();
    if (!url) return undefined;
    let ws;
    let closed = false;
    let reconnectTimer;
    const revalidate = (predicates) => {
      // predicates: array of prefix strings; match any string SWR key that
      // starts with one of them.
      mutate(
        (key) => {
          if (typeof key !== "string") return false;
          return predicates.some((p) => key.includes(p));
        },
        undefined,
        { revalidate: true }
      );
    };
    const connect = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        // Environment doesn't support WS or URL malformed — silent retry.
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
        return;
      }
      ws.onopen = () => {
        // no-op — server pushes only.
      };
      ws.onmessage = (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (!msg || typeof msg.type !== "string") return;
        switch (msg.type) {
          case "leaderboard.updated":
            revalidate(["/members", "/leaderboard", "/scores", "/dashboard"]);
            break;
          case "points.updated":
            revalidate(["/points", "/scores", "/members", "/leaderboard", "/event-group-results"]);
            break;
          case "rsvp.updated":
            revalidate(["/events", "/rsvp"]);
            break;
          default:
            break;
        }
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws && ws.close(); } catch {}
    };
  }, [mutate]);
}
