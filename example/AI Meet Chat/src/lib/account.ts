// Account deletion — local-only demo implementation.
// In a real backend deployment this would call a server endpoint that
// cascades the deletion; the UI layer stays the same.

import { signOut } from "./auth";

export function clearAllUserData() {
  if (typeof window === "undefined") return;
  try {
    // Remove every key we own from localStorage and sessionStorage.
    const prefixes = ["kindred:"];
    for (const store of [window.localStorage, window.sessionStorage]) {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key) continue;
        if (prefixes.some((p) => key.startsWith(p))) keys.push(key);
      }
      keys.forEach((k) => store.removeItem(k));
    }
  } catch {
    /* noop */
  }
  signOut();
}
