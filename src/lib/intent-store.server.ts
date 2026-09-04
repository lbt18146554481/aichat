/**
 * DB-backed intent pool for Side by Side recall (Phase 3).
 */

import { and, eq, ne, or, gt } from "drizzle-orm";
import { getDb } from "./db/client.server";
import { intents } from "./db/schema";
import type { Intent } from "./intents";
import {
  intentCityId,
  intentIndexFromIntent,
  isIntentRecallable,
  WISH_INTENT_MAX_AGE_MS,
} from "./intent-index";

const poolCache = new Map<string, { at: number; items: Intent[] }>();
const POOL_CACHE_MS = 60_000;

function cacheKey(mine: Intent): string {
  return `${mine.kind}:${intentCityId(mine)}`;
}

export function invalidateIntentPoolCache(_intentId?: string): void {
  poolCache.clear();
}

export function intentRowToIntent(row: {
  id: string;
  ownerId: string;
  data: Record<string, unknown>;
  createdAt: Date;
}): Intent {
  const data = row.data as unknown as Intent;
  return {
    ...data,
    id: row.id,
    createdAt: data.createdAt ?? row.createdAt.getTime(),
  };
}

export function intentIndexValues(intent: Intent) {
  const idx = intentIndexFromIntent(intent);
  return {
    kind: idx.kind,
    cityId: idx.cityId,
    status: idx.status,
    whenTier: idx.whenTier,
    levelTier: idx.levelTier,
  };
}

/** Load active intents for recall — indexed DB query with in-memory fallback. */
export async function queryRecallIntentPool(mine: Intent): Promise<Intent[]> {
  const key = cacheKey(mine);
  const hit = poolCache.get(key);
  if (hit && Date.now() - hit.at < POOL_CACHE_MS) return hit.items;

  try {
    const db = getDb();
    const minCreated = new Date(Date.now() - WISH_INTENT_MAX_AGE_MS);
    const kindClause =
      mine.kind === "other"
        ? or(eq(intents.kind, "other"), eq(intents.kind, mine.kind))
        : or(eq(intents.kind, mine.kind), eq(intents.kind, "other"));

    const rows = await db
      .select()
      .from(intents)
      .where(
        and(
          eq(intents.status, "active"),
          gt(intents.createdAt, minCreated),
          ne(intents.ownerId, mine.ownerId),
          ne(intents.id, mine.id),
          kindClause,
        ),
      )
      .limit(500);

    const items = rows
      .map(intentRowToIntent)
      .filter((it) => isIntentRecallable(it) && it.id !== mine.id);

    poolCache.set(key, { at: Date.now(), items });
    return items;
  } catch {
    const { seedPool, loadMyIntents } = await import("./intents");
    return [...seedPool(), ...loadMyIntents()].filter((it) => it.id !== mine.id);
  }
}

export async function upsertIntentIndex(intent: Intent, userId: string | null): Promise<void> {
  const idx = intentIndexValues(intent);
  const db = getDb();
  await db
    .insert(intents)
    .values({
      id: intent.id,
      ownerId: intent.ownerId,
      userId,
      data: intent as unknown as Record<string, unknown>,
      kind: idx.kind,
      cityId: idx.cityId,
      status: idx.status,
      whenTier: idx.whenTier,
      levelTier: idx.levelTier,
    })
    .onConflictDoUpdate({
      target: intents.id,
      set: {
        data: intent as unknown as Record<string, unknown>,
        ownerId: intent.ownerId,
        userId,
        kind: idx.kind,
        cityId: idx.cityId,
        status: idx.status,
        whenTier: idx.whenTier,
        levelTier: idx.levelTier,
      },
    });
  invalidateIntentPoolCache(intent.id);
}

export async function backfillIntentIndexColumns(): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(intents);
  let n = 0;
  for (const row of rows) {
    const intent = intentRowToIntent(row);
    const idx = intentIndexValues(intent);
    await db
      .update(intents)
      .set({
        kind: idx.kind,
        cityId: idx.cityId,
        status: idx.status,
        whenTier: idx.whenTier,
        levelTier: idx.levelTier,
      })
      .where(eq(intents.id, row.id));
    n += 1;
  }
  invalidateIntentPoolCache();
  return n;
}
