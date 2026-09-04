import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import { people } from "../src/lib/db/schema";

/** Remove demo seed personas from `people` (ids in people-seed.ids.ts). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const { SEED_PERSON_IDS } = await import("../src/lib/people-seed.ids.ts");
  const { invalidatePeopleCache } = await import("../src/lib/people-store.server.ts");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const deleted = await db
    .delete(people)
    .where(inArray(people.id, [...SEED_PERSON_IDS]))
    .returning({ id: people.id });

  invalidatePeopleCache();
  await client.end();

  console.log(`removed ${deleted.length} seed people:`, deleted.map((r) => r.id).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
