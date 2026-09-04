import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import { inviteCodes, people, intents } from "../src/lib/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const { buildSeedPeople } = await import("../src/lib/people-seed.data.ts");
  const { SEED_PERSON_IDS } = await import("../src/lib/people-seed.ids.ts");
  const { invalidatePeopleCache } = await import("../src/lib/people-store.server.ts");
  const { seedPool } = await import("../src/lib/intents.ts");
  const { intentIndexFromIntent } = await import("../src/lib/intent-index.ts");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const SEED_CODES = ["KINDRED2026", "WELCOME", "FRIENDS"];
  for (const code of SEED_CODES) {
    const existing = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code)).limit(1);
    if (existing.length === 0) {
      await db.insert(inviteCodes).values({
        code,
        createdBy: "seed",
        usedBy: null,
        usedAt: null,
      });
      console.log("seeded invite", code);
    } else {
      console.log("invite exists", code);
    }
  }

  const seedPeople = buildSeedPeople();
  for (const person of seedPeople) {
    await db
      .insert(people)
      .values({ id: person.id, data: person as unknown as Record<string, unknown> })
      .onConflictDoUpdate({
        target: people.id,
        set: { data: person as unknown as Record<string, unknown> },
      });
  }
  console.log(`seeded ${seedPeople.length} people`);
  console.log("seed person ids:", SEED_PERSON_IDS.join(", "));
  invalidatePeopleCache();

  const seedIntents = seedPool();
  for (const intent of seedIntents) {
    const idx = intentIndexFromIntent(intent);
    await db
      .insert(intents)
      .values({
        id: intent.id,
        ownerId: intent.ownerId,
        userId: null,
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
          kind: idx.kind,
          cityId: idx.cityId,
          status: idx.status,
          whenTier: idx.whenTier,
          levelTier: idx.levelTier,
        },
      });
  }
  console.log(`seeded ${seedIntents.length} intents`);

  await client.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
