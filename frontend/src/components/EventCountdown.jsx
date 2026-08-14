import React, { useEffect, useState } from "react";

/**
 * Live countdown chip — renders "2s 15dk 32sn" ticking every second and turns
 * red in the final 60 minutes to create visible urgency for imminent events.
 * When the target time is in the past it renders a "başladı" style label.
 *
 * Props:
 *   - target: string | Date  — event timestamp
 *   - testId?: string
 */
export default function EventCountdown({ target, testId }) {
  const targetMs = target instanceof Date ? target.getTime() : new Date(target).getTime();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const dt = targetMs - now;
  const past = dt < 0;
  const abs = Math.abs(dt);
  const totalSec = Math.floor(abs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const parts = [];
  if (days) parts.push(`${days}g`);
  if (hours || days) parts.push(`${hours}s`);
  parts.push(`${mins}dk`);
  if (!days) parts.push(`${secs}sn`);
  const label = parts.join(" ");

  const urgent = !past && dt < 60 * 60 * 1000;
  const veryUrgent = !past && dt < 10 * 60 * 1000;

  return (
    <span
      data-testid={testId}
      className="mono text-[10px] px-1.5 py-0.5 rounded font-bold"
      style={{
        background: past ? "rgba(148,163,184,0.10)" : (veryUrgent ? "rgba(220,38,38,0.20)" : (urgent ? "rgba(245,166,35,0.15)" : "rgba(139,246,180,0.10)")),
        color: past ? "#94A3B8" : (veryUrgent ? "#F87171" : (urgent ? "#F5A623" : "#6EE7B7")),
        border: `1px solid ${past ? "rgba(148,163,184,0.20)" : (veryUrgent ? "rgba(220,38,38,0.55)" : (urgent ? "rgba(245,166,35,0.40)" : "rgba(139,246,180,0.30)"))}`,
        letterSpacing: "0.05em",
        animation: veryUrgent ? "pulse 1s ease-in-out infinite" : undefined,
      }}
      title={new Date(targetMs).toLocaleString()}
    >
      {past ? `⏱ ${label} önce` : `⏳ ${label}`}
    </span>
  );
}
