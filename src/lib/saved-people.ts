import { getPersonById } from "./people";
import { isBlocked } from "./blocklist";
import { createSession, findIntroduceSessionForPerson, getSession } from "./sessions";
import { EMPTY, focusPerson } from "./agents/matchmaker";
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
  return cache.filter((r) => !!getPersonById(r.personId) && !isBlocked(r.personId));
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

/** Resolve which matchmaker session to reopen for a saved person. */
export function resolveSavedPersonSession(rec: SavedPersonRecord): string | null {
  const savedId = rec.sessionId?.trim();
  if (savedId) {
    const s = getSession(savedId);
    if (s?.agent === "introduce" && !s.supersededAt) return s.id;
  }
  return findIntroduceSessionForPerson(rec.personId)?.id ?? null;
}

/** Session + person id for opening a saved person card (creates session if needed). */
export function openSavedPersonTarget(
  rec: SavedPersonRecord,
): { sessionId: string; personId: string } | null {
  if (!getPersonById(rec.personId)) return null;
  const existing = resolveSavedPersonSession(rec);
  if (existing) return { sessionId: existing, personId: rec.personId };
  const loc = getPersonById(rec.personId)!;
  const seed = loc.name?.trim() || rec.personId;
  const sess = createSession("introduce", seed, focusPerson(EMPTY, rec.personId));
  return { sessionId: sess.id, personId: rec.personId };
}

export function subscribeSavedPeople(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
