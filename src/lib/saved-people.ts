import { getPersonById } from "./people";
import {
  listSavedPeopleFn,
  toggleSavedPersonFn,
} from "./api/data.functions";

export interface SavedPersonRecord {
  personId: string;
  sessionId: string;
  savedAt: number;
}

let cache: SavedPersonRecord[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/** Test helper — clear in-memory cache. */
export function _resetSavedPeopleCache() {
  cache = [];
  emit();
}

export async function hydrateSavedPeople() {
  try {
    const rows = await listSavedPeopleFn();
    cache = rows.map((r) => ({
      personId: r.personId,
      sessionId: r.sessionId ?? "",
      savedAt: r.savedAt,
    }));
  } catch {
    cache = [];
  }
  emit();
  return cache;
}

export function listSavedPeople(): SavedPersonRecord[] {
  // cache is already newest-first (prepended on save)
  return cache.filter((r) => !!getPersonById(r.personId));
}

export function isPersonSaved(personId: string): boolean {
  return cache.some((r) => r.personId === personId);
}

export function savePerson(personId: string, sessionId: string): void {
  if (cache.some((r) => r.personId === personId)) return;
  cache = [{ personId, sessionId, savedAt: Date.now() }, ...cache];
  emit();
  void toggleSavedPersonFn({ data: { personId, sessionId } }).catch(() => {
    /* offline / test env */
  });
}

export function removeSavedPerson(personId: string): void {
  if (!isPersonSaved(personId)) return;
  cache = cache.filter((r) => r.personId !== personId);
  emit();
  void toggleSavedPersonFn({ data: { personId } }).catch(() => {
    /* offline / test env */
  });
}

export function toggleSavedPerson(personId: string, sessionId: string): void {
  if (isPersonSaved(personId)) removeSavedPerson(personId);
  else savePerson(personId, sessionId);
}

export function subscribeSavedPeople(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
