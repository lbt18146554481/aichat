import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    avatar: text("avatar").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    code: text("code").primaryKey(),
    createdBy: text("created_by").notNull(),
    usedBy: text("used_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("invite_codes_created_by_idx").on(t.createdBy)],
);

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
});

export const intents = pgTable(
  "intents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    kind: text("kind").notNull().default("other"),
    cityId: text("city_id").notNull().default(""),
    status: text("status").notNull().default("active"),
    whenTier: text("when_tier").notNull().default("any"),
    levelTier: text("level_tier").notNull().default("any"),
    recallCache: jsonb("recall_cache").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("intents_owner_idx").on(t.ownerId),
    index("intents_user_idx").on(t.userId),
    index("intents_recall_idx").on(t.status, t.kind, t.cityId),
    index("intents_created_idx").on(t.createdAt),
  ],
);

export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull(),
    status: text("status").notNull(),
    initiatedBy: text("initiated_by").notNull(),
    helloAt: timestamp("hello_at", { withTimezone: true }).notNull().defaultNow(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    fadedAt: timestamp("faded_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    originSessionId: text("origin_session_id"),
    fromMe: jsonb("from_me").$type<Record<string, unknown> | null>(),
    fromThem: jsonb("from_them").$type<Record<string, unknown> | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connections_user_person_idx").on(t.userId, t.personId),
    index("connections_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    from: text("from").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_connection_idx").on(t.connectionId)],
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    agent: text("agent").notNull(),
    seed: text("seed").notNull().default(""),
    status: text("status").notNull().default("waiting"),
    state: jsonb("state").notNull().$type<unknown>(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_sessions_user_idx").on(t.userId),
    index("chat_sessions_thread_idx").on(t.userId, t.threadId),
  ],
);

export const savedPeople = pgTable(
  "saved_people",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull(),
    sessionId: text("session_id"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.personId] })],
);

export const savedIntents = pgTable(
  "saved_intents",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    intentId: text("intent_id").notNull(),
    sessionId: text("session_id"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.intentId] })],
);

export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  understanding: jsonb("understanding").$type<Record<string, unknown> | null>(),
  agentMemory: jsonb("agent_memory").$type<Record<string, unknown> | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
