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
import { log } from "./logger.server";

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
  if (hit && Date.now() - hit.at < POOL_CACHE_MS) {
    log.debug("wish-pool", "cache hit", {
      mineOwnerId: mine.ownerId,
      mineKind: mine.kind,
      poolSize: hit.items.length,
      cacheKey: key,
    });
    return hit.items;
  }

  const { seedPool, loadMyIntents } = await import("./intents");
  const mergeDemoSeeds = (items: Intent[]): Intent[] => {
    const byId = new Map(items.map((it) => [it.id, it]));
    for (const seed of seedPool()) {
      if (!byId.has(seed.id) && seed.id !== mine.id && seed.ownerId !== mine.ownerId) {
        byId.set(seed.id, seed);
      }
    }
    for (const mineLocal of loadMyIntents()) {
      if (!byId.has(mineLocal.id) && mineLocal.id !== mine.id) {
        byId.set(mineLocal.id, mineLocal);
      }
    }
    return [...byId.values()].filter((it) => isIntentRecallable(it) && it.id !== mine.id);
  };

  try {
    const db = getDb();
    const minCreated = new Date(Date.now() - WISH_INTENT_MAX_AGE_MS);
    // kind=other (e.g.「运动类」) must still see run/climb/tennis in SQL; refine in recall.
    const kindClause =
      mine.kind === "other"
        ? undefined
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

    const fromDb = rows.map(intentRowToIntent);
    const items = mergeDemoSeeds(fromDb);
    const addedFromSeeds = items.filter((it) => !fromDb.some((d) => d.id === it.id)).length;
    poolCache.set(key, { at: Date.now(), items });
    log.info("wish-pool", "loaded", {
      mineId: mine.id,
      mineOwnerId: mine.ownerId,
      mineKind: mine.kind,
      mineCity: mine.city_zh || mine.city || mine.ownerCity_zh || mine.ownerCity || "",
      cacheKey: key,
      dbRows: fromDb.length,
      afterMerge: items.length,
      addedFromSeeds,
      kindFilter: mine.kind === "other" ? "all" : `${mine.kind}|other`,
      sampleIds: items.slice(0, 6).map((it) => it.id),
    });
    return items;
  } catch (err) {
    const items = mergeDemoSeeds([]);
    log.warn("wish-pool", "db failed — using seeds/local", {
      mineId: mine.id,
      mineOwnerId: mine.ownerId,
      poolSize: items.length,
      err,
    });
    return items;
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
