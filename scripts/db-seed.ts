import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { inviteCodes, people, intents } from "../src/lib/db/schema";

// Dynamic import of PEOPLE so tsx can resolve path aliases poorly — use relative.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  // Import compiled-ish module via relative path from scripts/
  const { PEOPLE } = await import("../src/lib/people.ts");
  const { seedPool } = await import("../src/lib/intents.ts");

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

  for (const person of PEOPLE) {
    await db
      .insert(people)
      .values({ id: person.id, data: person as unknown as Record<string, unknown> })
      .onConflictDoUpdate({
        target: people.id,
        set: { data: person as unknown as Record<string, unknown> },
      });
  }
  console.log(`seeded ${PEOPLE.length} people`);

  const seedIntents = seedPool();
  for (const intent of seedIntents) {
    await db
      .insert(intents)
      .values({
        id: intent.id,
        ownerId: intent.ownerId,
        userId: null,
        data: intent as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: intents.id,
        set: { data: intent as unknown as Record<string, unknown>, ownerId: intent.ownerId },
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
