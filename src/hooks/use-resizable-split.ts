import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const STORAGE_KEY = "kindred:workspace-split-left";
const DEFAULT_LEFT = 48;
const MIN_LEFT = 28;
const MAX_LEFT = 72;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readStoredLeft(): number {
  if (typeof window === "undefined") return DEFAULT_LEFT;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clamp(n, MIN_LEFT, MAX_LEFT) : DEFAULT_LEFT;
  } catch {
    return DEFAULT_LEFT;
  }
}

/** Draggable left pane width (%). Desktop split only — pass enabled=false on mobile. */
export function useResizableSplit(enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const leftRef = useRef(DEFAULT_LEFT);
  const [leftPercent, setLeftPercent] = useState(readStoredLeft);

  leftRef.current = leftPercent;

  const applyFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setLeftPercent(clamp(pct, MIN_LEFT, MAX_LEFT));
  }, []);

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try {
      sessionStorage.setItem(STORAGE_KEY, String(leftRef.current));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      applyFromClientX(e.clientX);
    };
    const onPointerUp = () => endDrag();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, applyFromClientX, endDrag]);

  const onSplitterPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.currentTarget.setPointerCapture(e.pointerId);
    applyFromClientX(e.clientX);
  }, [enabled, applyFromClientX]);

  return {
    containerRef,
    leftPercent,
    onSplitterPointerDown,
    splitEnabled: enabled,
  };
}
