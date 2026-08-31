import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { getServerConfig } from "../config.server";

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  const { databaseUrl } = getServerConfig();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  client = postgres(databaseUrl, { max: 10 });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export type Db = ReturnType<typeof getDb>;
