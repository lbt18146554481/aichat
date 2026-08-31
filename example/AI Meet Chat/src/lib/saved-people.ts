// Global "Saved for later" store for people surfaced by the Matchmaker.
//
// Parallel to saved-intents.ts but scoped to Person records. Users tap Save
// on an introduction to park someone without deciding — no permanent Pass.
// The header entry lists both saved wishes and saved people; opening a
// saved person routes back to their matchmaker session with a focus hop.

import { getPersonById } from "./people";
import { isBlocked } from "./blocklist";

export interface SavedPersonRecord {
  personId: string;
  sessionId: string;
  savedAt: number;
}

const KEY = "kindred:saved-people:v1";
const listeners = new Set<() => void>();

function read(): SavedPersonRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    // A hand-edited or corrupted blob must never crash the render path.
    return Array.isArray(parsed) ? (parsed as SavedPersonRecord[]) : [];
  } catch {
    return [];
  }
}
function write(items: SavedPersonRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Ignore write failures (private mode / quota).
  }
  listeners.forEach((fn) => fn());
}

/** Newest-first, filtered to entries whose Person still exists and isn't blocked. */
export function listSavedPeople(): SavedPersonRecord[] {
  return read()
    .filter((r) => !!getPersonById(r.personId) && !isBlocked(r.personId))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function isPersonSaved(personId: string): boolean {
  return read().some((r) => r.personId === personId);
}

export function savePerson(personId: string, sessionId: string): void {
  const cur = read();
  if (cur.some((r) => r.personId === personId)) return;
  write([{ personId, sessionId, savedAt: Date.now() }, ...cur]);
}

export function removeSavedPerson(personId: string): void {
  write(read().filter((r) => r.personId !== personId));
}

export function toggleSavedPerson(personId: string, sessionId: string): void {
  if (isPersonSaved(personId)) removeSavedPerson(personId);
  else savePerson(personId, sessionId);
}

export function subscribeSavedPeople(fn: () => void): () => void {
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
