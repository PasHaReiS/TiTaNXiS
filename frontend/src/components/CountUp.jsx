import React, { useEffect, useRef, useState } from "react";

// Small count-up animator. Renders the number formatted with dot thousands (tr-TR style).
export default function CountUp({ value = 0, duration = 900, className, style, testId }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(target);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    fromRef.current = display;
    startRef.current = null;
    const step = (ts) => {
      if (startRef.current == null) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setDisplay(next);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  const formatted = display.toLocaleString("tr-TR").replace(/,/g, ".");
  return (
    <span className={className} style={style} data-testid={testId}>
      {formatted}
    </span>
  );
}
