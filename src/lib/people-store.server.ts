import { getDb } from "./db/client.server";
import { people, premiumPeople } from "./db/schema";
import { eq } from "drizzle-orm";
import { log } from "./logger.server";
import { isVitalsComplete, type Profile } from "./profile-shape";
import type { Person } from "./types";

const CACHE_TTL_MS = 60_000;

let fullCache: { people: Person[]; loadedAt: number } | null = null;
let premiumCache: { people: Person[]; loadedAt: number } | null = null;

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

function parseRows(rows: { data: unknown }[]): Person[] {
  return activePeople(
    rows
      .map((r) => parsePersonRow(r.data as Record<string, unknown>))
      .filter(Boolean) as Person[],
  );
}

/** Drop in-memory caches (e.g. after db-seed). */
export function invalidatePeopleCache(): void {
  fullCache = null;
  premiumCache = null;
}

/** Full candidate pool — `people` table only. */
export async function getMatchablePeople(): Promise<Person[]> {
  if (fullCache && Date.now() - fullCache.loadedAt < CACHE_TTL_MS) {
    return fullCache.people;
  }

  const db = getDb();
  const rows = await db.select().from(people);
  const parsed = parseRows(rows);
  fullCache = { people: parsed, loadedAt: Date.now() };
  log.info("people-store", "loaded full pool from db", { count: parsed.length });
  return parsed;
}

/** Curated premium pool — `premium_people` table. */
export async function getPremiumPeople(): Promise<Person[]> {
  if (premiumCache && Date.now() - premiumCache.loadedAt < CACHE_TTL_MS) {
    return premiumCache.people;
  }

  const db = getDb();
  const rows = await db.select().from(premiumPeople);
  const parsed = parseRows(rows);
  premiumCache = { people: parsed, loadedAt: Date.now() };
  log.info("people-store", "loaded premium pool from db", { count: parsed.length });
  return parsed;
}

/**
 * Before vitals profile is complete → premium_people only.
 * After vitals complete → full people pool.
 */
export async function getMatchablePeopleForSeeker(
  profile: Profile | null | undefined,
): Promise<Person[]> {
  if (isVitalsComplete(profile)) {
    return getMatchablePeople();
  }
  return getPremiumPeople();
}

export function findPersonInPool(pool: Person[], id: string): Person | undefined {
  return pool.find((p) => p.id === id);
}

/** Lookup one person in full pool, then premium (for hello / connections). */
export async function findPersonById(id: string): Promise<Person | null> {
  const db = getDb();
  const full = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (full[0]) {
    return parsePersonRow(full[0].data as Record<string, unknown>);
  }
  const prem = await db.select().from(premiumPeople).where(eq(premiumPeople.id, id)).limit(1);
  if (prem[0]) {
    return parsePersonRow(prem[0].data as Record<string, unknown>);
  }
  return null;
}
