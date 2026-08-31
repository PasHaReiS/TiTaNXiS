import { useEffect, useRef, useState, useCallback } from "react";

/**
 * v138.4 — Sürüklenebilir FAB (floating action button) davranışı.
 *
 *   • Mouse + touch (mobil + masaüstü) desteği.
 *   • Konum `localStorage`'a `fab_pos_{storageKey}` anahtarıyla yazılır.
 *   • Sadece "drag" hareketi tespit edildiğinde ekrana yerleşir; kısa tıklama
 *     `onClick` prop'unu yine tetikler (5px hareket eşiği).
 *   • Ekran boyutu değişince buton görünür alanda tutulur (clamp).
 *
 * Kullanım:
 *   const { pos, dragProps, hasDragged } = useDraggableFab({
 *     storageKey: "chat", defaultPos: { top: 70, right: 16 },
 *   });
 *   <button {...dragProps} style={{ position: "fixed", ...pos }}>...</button>
 */
export function useDraggableFab({ storageKey, defaultPos, size = 44 }) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(`fab_pos_${storageKey}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return defaultPos;
  });
  const dragging = useRef(false);
  const startPtr = useRef({ x: 0, y: 0 });
  const startPos = useRef({ left: 0, top: 0 });
  const hasDraggedRef = useRef(false);
  const [hasDragged, setHasDragged] = useState(false);

  const clamp = useCallback((left, top) => {
    const maxLeft = window.innerWidth - size - 4;
    const maxTop = window.innerHeight - size - 4;
    return {
      left: Math.max(4, Math.min(maxLeft, left)),
      top: Math.max(4, Math.min(maxTop, top)),
    };
  }, [size]);

  useEffect(() => {
    // Convert right-based pos to left-based on mount so drag math is uniform.
    if (pos.right != null && pos.left == null) {
      const left = window.innerWidth - pos.right - size;
      const top = pos.top != null ? pos.top : window.innerHeight - (pos.bottom || 20) - size;
      setPos(clamp(left, top));
    }
    const onResize = () => setPos((p) => (p.left != null ? clamp(p.left, p.top) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e) => {
    // Touch veya mouse
    const point = e.touches ? e.touches[0] : e;
    dragging.current = true;
    hasDraggedRef.current = false;
    setHasDragged(false);
    startPtr.current = { x: point.clientX, y: point.clientY };
    startPos.current = { left: pos.left ?? 0, top: pos.top ?? 0 };
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - startPtr.current.x;
    const dy = point.clientY - startPtr.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasDraggedRef.current = true;
      setHasDragged(true);
    }
    if (e.cancelable) e.preventDefault();
    setPos(clamp(startPos.current.left + dx, startPos.current.top + dy));
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);
    if (hasDraggedRef.current) {
      try {
        localStorage.setItem(`fab_pos_${storageKey}`, JSON.stringify(pos));
      } catch {}
    }
    // Drag flag'i click handler'ın kontrolüne bırak; sonraki tıklamada temizlenir.
    setTimeout(() => setHasDragged(false), 50);
  };

  return {
    pos,
    hasDragged,
    dragProps: {
      onMouseDown: onPointerDown,
      onTouchStart: onPointerDown,
    },
  };
}

export default useDraggableFab;
