import { getDb } from "./db/client.server";
import { people } from "./db/schema";
import { log } from "./logger.server";
import type { Person } from "./types";

const CACHE_TTL_MS = 60_000;

let cache: { people: Person[]; loadedAt: number } | null = null;

function parsePersonRow(data: Record<string, unknown>): Person | null {
  if (!data || typeof data !== "object") return null;
  const id = typeof data.id === "string" ? data.id : null;
  const age = typeof data.age === "number" ? data.age : null;
  if (!id || age == null) return null;
  return data as Person;
}

function activePeople(list: Person[]): Person[] {
  return list.filter((p) => (p.status ?? "active") === "active");
}

/** Drop in-memory cache (e.g. after db-seed). */
export function invalidatePeopleCache(): void {
  cache = null;
}

/** Matchable candidate pool — loaded from `people` table only. */
export async function getMatchablePeople(): Promise<Person[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.people;
  }

  const db = getDb();
  const rows = await db.select().from(people);
  const parsed = activePeople(
    rows.map((r) => parsePersonRow(r.data as Record<string, unknown>)).filter(Boolean) as Person[],
  );
  cache = { people: parsed, loadedAt: Date.now() };
  log.info("people-store", "loaded pool from db", { count: parsed.length });
  return parsed;
}

export function findPersonInPool(pool: Person[], id: string): Person | undefined {
  return pool.find((p) => p.id === id);
}
