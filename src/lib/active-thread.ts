/** Client-only: which conversation thread is active this visit. */

const THREAD_KEY = "kindred:activeThreadId";

export function getActiveThreadId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(THREAD_KEY);
  } catch {
    return null;
  }
}

export function setActiveThreadId(threadId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(THREAD_KEY, threadId);
  } catch {
    /* ignore */
  }
}

export function clearActiveThreadId() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(THREAD_KEY);
  } catch {
    /* ignore */
  }
}

/** Full page reload → start a fresh thread on next message (not mid-SPA navigation). */
export function clearActiveThreadOnReload() {
  if (typeof window === "undefined") return;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload") {
      clearActiveThreadId();
    }
  } catch {
    /* ignore */
  }
}
