// Global "Saved for later" store.
//
// Cross-session and cross-page: any wish's saved candidate lives here and can
// be reopened from the header entry regardless of which session the user is
// currently viewing. Persisted in localStorage, subscribable so header badges
// update in real time.

import { getIntentById } from "./intents";

export interface SavedRecord {
  intentId: string;
  sessionId: string;
  savedAt: number;
}

const KEY = "kindred:saved-intents:v1";
const listeners = new Set<() => void>();

function read(): SavedRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedRecord[]) : [];
  } catch {
    return [];
  }
}
function write(items: SavedRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Ignore write failures (private mode / quota).
  }
  listeners.forEach((fn) => fn());
}

/** Newest-first list, filtered to entries whose Intent still exists. */
export function listSaved(): SavedRecord[] {
  return read()
    .filter((r) => !!getIntentById(r.intentId))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function isSaved(intentId: string): boolean {
  return read().some((r) => r.intentId === intentId);
}

export function saveIntent(intentId: string, sessionId: string): void {
  const cur = read();
  if (cur.some((r) => r.intentId === intentId)) return;
  write([{ intentId, sessionId, savedAt: Date.now() }, ...cur]);
}

export function removeSaved(intentId: string): void {
  write(read().filter((r) => r.intentId !== intentId));
}

export function removeSavedForSession(sessionId: string): void {
  write(read().filter((r) => r.sessionId !== sessionId));
}

export function toggleSaved(intentId: string, sessionId: string): void {
  if (isSaved(intentId)) removeSaved(intentId);
  else saveIntent(intentId, sessionId);
}

export function subscribeSaved(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
