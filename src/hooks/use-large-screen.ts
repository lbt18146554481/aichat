import { useEffect, useState } from "react";

/** True when viewport is lg (1024px) or wider — matches Tailwind `lg:` breakpoint. */
export function useLargeScreen(): boolean {
  const [large, setLarge] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setLarge(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return large;
}
