import { useEffect, useState } from "react";

/**
 * Tracks the on-screen keyboard height on iOS/Android using visualViewport.
 * Returns pixels of overlap between the keyboard and the layout viewport.
 * On desktop or when no keyboard is visible, returns 0.
 *
 * Rationale: `env(safe-area-inset-bottom)` is a static home-indicator inset
 * (~34px on notched iPhones) and does NOT grow when the software keyboard
 * appears, so a composer anchored with only safe-area padding gets covered
 * by the keyboard. visualViewport reflects the true visible region.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Overlap between layout viewport bottom and visual viewport bottom.
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(overlap > 40 ? Math.round(overlap) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
