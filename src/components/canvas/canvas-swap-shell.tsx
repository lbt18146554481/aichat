import { useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SWAP_DURATION_S = 0.42;

interface Props {
  /** Changes when canvas content should cross-fade / slide (person id, intent id, swap key). */
  swapToken: string;
  /** Optional queue cursor — used to pick slide direction on prev/next. */
  queueCursor?: number;
  className?: string;
  children: ReactNode;
}

export function CanvasSwapShell({ swapToken, queueCursor, className, children }: Props) {
  const reduceMotion = useReducedMotion();
  const prevTokenRef = useRef(swapToken);
  const prevCursorRef = useRef(queueCursor);
  const navDirRef = useRef(0);

  if (swapToken !== prevTokenRef.current) {
    if (queueCursor !== undefined && prevCursorRef.current !== undefined) {
      navDirRef.current =
        queueCursor > prevCursorRef.current ? 1 : queueCursor < prevCursorRef.current ? -1 : 0;
    } else {
      navDirRef.current = 0;
    }
    prevTokenRef.current = swapToken;
  }
  if (queueCursor !== undefined) prevCursorRef.current = queueCursor;

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const dir = navDirRef.current;
  const enterX = dir === 1 ? 20 : dir === -1 ? -20 : 14;
  const exitX = dir === 1 ? -20 : dir === -1 ? 20 : -14;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapToken}
        className={className}
        initial={{ opacity: 0, x: enterX }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: exitX }}
        transition={{ duration: SWAP_DURATION_S, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
