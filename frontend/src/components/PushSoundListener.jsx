import { useEffect } from "react";
import { playPushSound } from "@/lib/pushSound";

// Mounted once at app root. Listens for service-worker `push-sound` messages and
// plays the matching cue via the shared synthesizer. Silent no-op when SW isn't
// registered or the browser blocks autoplay.
export default function PushSoundListener() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMsg = (event) => {
      const data = event.data || {};
      if (data.type === "push-sound" && data.sound) {
        playPushSound(data.sound).catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => {
      try { navigator.serviceWorker.removeEventListener("message", onMsg); } catch {}
    };
  }, []);
  return null;
}
