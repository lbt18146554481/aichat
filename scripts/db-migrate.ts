import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client);

async function migrate() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      used_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS invite_codes_created_by_idx ON invite_codes(created_by);

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS intents_owner_idx ON intents(owner_id);
    CREATE INDEX IF NOT EXISTS intents_user_idx ON intents(user_id);

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL,
      status TEXT NOT NULL,
      initiated_by TEXT NOT NULL,
      hello_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      connected_at TIMESTAMPTZ,
      faded_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      origin_session_id TEXT,
      from_me JSONB,
      from_them JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, person_id)
    );
    CREATE INDEX IF NOT EXISTS connections_user_idx ON connections(user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      "from" TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS messages_connection_idx ON messages(connection_id);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent TEXT NOT NULL,
      seed TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions(user_id);

    ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS thread_id TEXT;
    ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
    UPDATE chat_sessions SET thread_id = id WHERE thread_id IS NULL;
    ALTER TABLE chat_sessions ALTER COLUMN thread_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS chat_sessions_thread_idx ON chat_sessions(user_id, thread_id);

    CREATE TABLE IF NOT EXISTS saved_people (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL,
      session_id TEXT,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS saved_intents (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      intent_id TEXT NOT NULL,
      session_id TEXT,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, intent_id)
    );

    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      understanding JSONB,
      agent_memory JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE intents ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'other';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS city_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS when_tier TEXT NOT NULL DEFAULT 'any';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS level_tier TEXT NOT NULL DEFAULT 'any';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS recall_cache JSONB;
    CREATE INDEX IF NOT EXISTS intents_recall_idx ON intents(status, kind, city_id);
    CREATE INDEX IF NOT EXISTS intents_created_idx ON intents(created_at);
  `);
  console.log("Migration complete.");
  await client.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
