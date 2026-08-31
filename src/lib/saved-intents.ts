import { getIntentById } from "./intents";
import { listSavedIntentsFn, toggleSavedIntentFn } from "./api/data.functions";

export interface SavedRecord {
  intentId: string;
  sessionId: string;
  savedAt: number;
}

let cache: SavedRecord[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export async function hydrateSavedIntents() {
  try {
    const rows = await listSavedIntentsFn();
    cache = rows.map((r) => ({
      intentId: r.intentId,
      sessionId: r.sessionId ?? "",
      savedAt: r.savedAt,
    }));
  } catch {
    cache = [];
  }
  emit();
  return cache;
}

export function listSaved(): SavedRecord[] {
  return cache
    .filter((r) => !!getIntentById(r.intentId))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function isSaved(intentId: string): boolean {
  return cache.some((r) => r.intentId === intentId);
}

export function saveIntent(intentId: string, sessionId: string): void {
  if (cache.some((r) => r.intentId === intentId)) return;
  cache = [{ intentId, sessionId, savedAt: Date.now() }, ...cache];
  emit();
  void toggleSavedIntentFn({ data: { intentId, sessionId } }).catch(console.error);
}

export function removeSaved(intentId: string): void {
  if (!isSaved(intentId)) return;
  cache = cache.filter((r) => r.intentId !== intentId);
  emit();
  void toggleSavedIntentFn({ data: { intentId } }).catch(console.error);
}

export function removeSavedForSession(sessionId: string): void {
  const toRemove = cache.filter((r) => r.sessionId === sessionId);
  cache = cache.filter((r) => r.sessionId !== sessionId);
  emit();
  for (const r of toRemove) {
    void toggleSavedIntentFn({ data: { intentId: r.intentId } }).catch(console.error);
  }
}

export function toggleSaved(intentId: string, sessionId: string): void {
  if (isSaved(intentId)) removeSaved(intentId);
  else saveIntent(intentId, sessionId);
}

export function subscribeSaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
