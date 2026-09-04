import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, and, gt, desc, asc, isNull } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { chatSessions, connections, messages, people, intents, savedPeople, savedIntents, userPrefs, profiles } from "../db/schema";
import { getSessionUser, newId } from "../db/session.server";
import { EMPTY_PROFILE, type Profile } from "../profile-shape";
import type { Person } from "../types";
import type { Intent } from "../intents";
import type { Connection, ChatMsg } from "../connection-types";

export const listPeopleFn = createServerFn({ method: "GET" }).handler(async (): Promise<Person[]> => {
  const db = getDb();
  const rows = await db.select().from(people);
  return rows.map((r) => r.data as unknown as Person);
});

export const getPersonFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<Person | null> => {
    const db = getDb();
    const rows = await db.select().from(people).where(eq(people.id, data.id)).limit(1);
    return rows[0] ? (rows[0].data as unknown as Person) : null;
  });

export const listSeedIntentsFn = createServerFn({ method: "GET" }).handler(async (): Promise<Intent[]> => {
  const db = getDb();
  const rows = await db.select().from(intents);
  return rows.filter((r) => !r.userId).map((r) => r.data as unknown as Intent);
});

export const listMyIntentsFn = createServerFn({ method: "GET" }).handler(async (): Promise<Intent[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getDb();
  const rows = await db.select().from(intents).where(eq(intents.userId, user.id));
  return rows.map((r) => r.data as unknown as Intent);
});

export const publishIntentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ intent: z.record(z.unknown()) }))
  .handler(async ({ data }): Promise<Intent> => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const intent = data.intent as unknown as Intent;
    const id = intent.id || newId("intent");
    const full: Intent = { ...intent, id, ownerId: "me", status: intent.status ?? "active" };
    const { upsertIntentIndex, invalidateIntentPoolCache } = await import("../intent-store.server");
    const { invalidateWishRecallCache } = await import("../wish-recall-cache.server");
    await upsertIntentIndex(full, user.id);
    invalidateIntentPoolCache(full.id);
    invalidateWishRecallCache();
    return full;
  });

export const revokeIntentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    await db.delete(intents).where(and(eq(intents.id, data.id), eq(intents.userId, user.id)));
    return { ok: true as const };
  });

// ---- Sessions ----

export const listSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, user.id), isNull(chatSessions.supersededAt)))
    .orderBy(desc(chatSessions.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    agent: r.agent,
    seed: r.seed,
    status: r.status,
    state: r.state,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    supersededAt: r.supersededAt?.getTime(),
  }));
});

export const upsertSessionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      threadId: z.string(),
      agent: z.string(),
      seed: z.string().optional(),
      status: z.string().optional(),
      state: z.unknown(),
      createdAt: z.number().optional(),
      supersededAt: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const now = new Date();
    await db
      .insert(chatSessions)
      .values({
        id: data.id,
        userId: user.id,
        threadId: data.threadId,
        agent: data.agent,
        seed: data.seed ?? "",
        status: data.status ?? "waiting",
        state: data.state,
        supersededAt: data.supersededAt ? new Date(data.supersededAt) : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: chatSessions.id,
        set: {
          state: data.state,
          status: data.status ?? "waiting",
          seed: data.seed ?? "",
          supersededAt: data.supersededAt ? new Date(data.supersededAt) : null,
          updatedAt: now,
        },
      });
    return { ok: true as const };
  });

export const deleteSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), threadId: z.string().optional() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    if (data.threadId) {
      await db
        .delete(chatSessions)
        .where(and(eq(chatSessions.userId, user.id), eq(chatSessions.threadId, data.threadId)));
    } else {
      await db.delete(chatSessions).where(and(eq(chatSessions.id, data.id), eq(chatSessions.userId, user.id)));
    }
    return { ok: true as const };
  });

// ---- Saved ----

export const listSavedPeopleFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getDb();
  const rows = await db.select().from(savedPeople).where(eq(savedPeople.userId, user.id));
  return rows.map((r) => ({ personId: r.personId, sessionId: r.sessionId, savedAt: r.savedAt.getTime() }));
});

export const toggleSavedPersonFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ personId: z.string(), sessionId: z.string().optional() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const existing = await db
      .select()
      .from(savedPeople)
      .where(and(eq(savedPeople.userId, user.id), eq(savedPeople.personId, data.personId)))
      .limit(1);
    if (existing[0]) {
      await db
        .delete(savedPeople)
        .where(and(eq(savedPeople.userId, user.id), eq(savedPeople.personId, data.personId)));
      return { saved: false };
    }
    await db.insert(savedPeople).values({
      userId: user.id,
      personId: data.personId,
      sessionId: data.sessionId ?? null,
    });
    return { saved: true };
  });

export const listSavedIntentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getDb();
  const rows = await db.select().from(savedIntents).where(eq(savedIntents.userId, user.id));
  return rows.map((r) => ({ intentId: r.intentId, sessionId: r.sessionId, savedAt: r.savedAt.getTime() }));
});

export const toggleSavedIntentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ intentId: z.string(), sessionId: z.string().optional() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const existing = await db
      .select()
      .from(savedIntents)
      .where(and(eq(savedIntents.userId, user.id), eq(savedIntents.intentId, data.intentId)))
      .limit(1);
    if (existing[0]) {
      await db
        .delete(savedIntents)
        .where(and(eq(savedIntents.userId, user.id), eq(savedIntents.intentId, data.intentId)));
      return { saved: false };
    }
    await db.insert(savedIntents).values({
      userId: user.id,
      intentId: data.intentId,
      sessionId: data.sessionId ?? null,
    });
    return { saved: true };
  });

// ---- Prefs ----

export const getPrefsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return { understanding: null, agentMemory: null };
  const db = getDb();
  const rows = await db.select().from(userPrefs).where(eq(userPrefs.userId, user.id)).limit(1);
  return {
    understanding: rows[0]?.understanding ?? null,
    agentMemory: rows[0]?.agentMemory ?? null,
  };
});

export const savePrefsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      understanding: z.record(z.unknown()).nullable().optional(),
      agentMemory: z.record(z.unknown()).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const existing = await db.select().from(userPrefs).where(eq(userPrefs.userId, user.id)).limit(1);
    const understanding = data.understanding !== undefined ? data.understanding : (existing[0]?.understanding ?? null);
    const agentMemory = data.agentMemory !== undefined ? data.agentMemory : (existing[0]?.agentMemory ?? null);
    await db
      .insert(userPrefs)
      .values({ userId: user.id, understanding, agentMemory, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPrefs.userId,
        set: { understanding, agentMemory, updatedAt: new Date() },
      });
    return { ok: true as const };
  });

// ---- Connections ----

function rowToConnection(
  row: typeof connections.$inferSelect,
  msgs: ChatMsg[],
): Connection {
  return {
    id: row.id,
    personId: row.personId,
    status: row.status as Connection["status"],
    initiatedBy: row.initiatedBy as "me" | "them",
    helloAt: row.helloAt.getTime(),
    connectedAt: row.connectedAt?.getTime(),
    fadedAt: row.fadedAt?.getTime(),
    lastSeenAt: row.lastSeenAt?.getTime(),
    originSessionId: row.originSessionId ?? undefined,
    fromMe: row.fromMe as Connection["fromMe"],
    fromThem: row.fromThem as Connection["fromThem"],
    messages: msgs,
  };
}

async function loadFullConnection(connectionId: string): Promise<Connection | null> {
  const db = getDb();
  const rows = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.connectionId, row.id))
    .orderBy(asc(messages.createdAt));
  return rowToConnection(
    row,
    msgs.map((m) => ({
      id: m.id,
      from: m.from as "me" | "them",
      t: m.createdAt.getTime(),
      text: m.text,
    })),
  );
}

async function broadcastConnection(userId: string, connectionId: string) {
  const conn = await loadFullConnection(connectionId);
  if (!conn) return;
  const { pushConnectionUpdate } = await import("../realtime-push.server");
  await pushConnectionUpdate(userId, conn);
}

export const listConnectionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<Connection[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const db = getDb();
  const rows = await db.select().from(connections).where(eq(connections.userId, user.id));
  const result: Connection[] = [];
  for (const row of rows) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.connectionId, row.id))
      .orderBy(asc(messages.createdAt));
    result.push(
      rowToConnection(
        row,
        msgs.map((m) => ({
          id: m.id,
          from: m.from as "me" | "them",
          t: m.createdAt.getTime(),
          text: m.text,
        })),
      ),
    );
  }
  return result.sort((a, b) => (b.connectedAt ?? b.helloAt) - (a.connectedAt ?? a.helloAt));
});

export const sayHelloFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      personId: z.string(),
      fromMe: z.object({
        quotedMomentId: z.string().nullable(),
        reply: z.string(),
      }),
      originSessionId: z.string().optional(),
      lang: z.enum(["zh", "en"]).optional(),
    }),
  )
  .handler(async ({ data }): Promise<Connection> => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const existing = await db
      .select()
      .from(connections)
      .where(and(eq(connections.userId, user.id), eq(connections.personId, data.personId)))
      .limit(1);
    if (existing[0] && existing[0].status !== "faded") {
      const msgs = await db.select().from(messages).where(eq(messages.connectionId, existing[0].id));
      return rowToConnection(
        existing[0],
        msgs.map((m) => ({ id: m.id, from: m.from as "me" | "them", t: m.createdAt.getTime(), text: m.text })),
      );
    }

    const now = new Date();
    let connectionId: string;

    if (existing[0]?.status === "faded") {
      connectionId = existing[0].id;
      await db
        .update(connections)
        .set({
          status: "sent",
          initiatedBy: "me",
          helloAt: now,
          originSessionId: data.originSessionId ?? null,
          fromMe: data.fromMe,
          fromThem: null,
          connectedAt: null,
          fadedAt: null,
          updatedAt: now,
        })
        .where(eq(connections.id, connectionId));
      await db.delete(messages).where(eq(messages.connectionId, connectionId));
    } else {
      connectionId = newId("conn");
      await db.insert(connections).values({
        id: connectionId,
        userId: user.id,
        personId: data.personId,
        status: "sent",
        initiatedBy: "me",
        helloAt: now,
        originSessionId: data.originSessionId ?? null,
        fromMe: data.fromMe,
        updatedAt: now,
      });
    }

    await resolveHello(user.id, connectionId, data.personId, data.fromMe.reply, data.lang ?? "en");

    const row = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
    const msgs = await db.select().from(messages).where(eq(messages.connectionId, connectionId));
    const conn = rowToConnection(
      row[0]!,
      msgs.map((m) => ({ id: m.id, from: m.from as "me" | "them", t: m.createdAt.getTime(), text: m.text })),
    );
    void import("../realtime-push.server").then(({ pushConnectionUpdate }) =>
      pushConnectionUpdate(user.id, conn),
    );
    return conn;
  });

async function resolveHello(
  userId: string,
  connectionId: string,
  personId: string,
  userHello: string,
  lang: "zh" | "en",
) {
  const db = getDb();
  const rows = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
  const conn = rows[0];
  if (!conn || conn.status !== "sent") return;

  const personRows = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  const person = personRows[0]?.data as unknown as Person | undefined;
  const persona = person
    ? `Name: ${person.name} (${person.name_zh}). City: ${person.city}. Occupation: ${person.occupation}. Bio: ${person.portrait}. Signals: ${(person.signals ?? []).join(", ")}.`
    : "A warm, thoughtful persona open to conversation.";

  const { generatePersonaReply } = await import("../llm.server");
  const reply =
    (await generatePersonaReply({
      persona,
      history: [],
      userMessage: userHello,
      lang,
      isHello: true,
    })) ||
    (lang === "zh"
      ? "你好呀，这句我看到了。想继续聊聊吗？"
      : "Hey — I read that twice. Happy to keep talking.");

  await db
    .update(connections)
    .set({
      status: "connected",
      connectedAt: new Date(),
      fromThem: { quotedUserMomentPromptId: "hello", reply },
      updatedAt: new Date(),
    })
    .where(eq(connections.id, connectionId));
  await broadcastConnection(userId, connectionId);
}

export const sendMessageFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      personId: z.string(),
      text: z.string().min(1),
      lang: z.enum(["zh", "en"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.userId, user.id), eq(connections.personId, data.personId)))
      .limit(1);
    const conn = rows[0];
    if (!conn || conn.status !== "connected") throw new Error("not_connected");

    const msgId = newId("msg");
    const now = new Date();
    await db.insert(messages).values({
      id: msgId,
      connectionId: conn.id,
      from: "me",
      text: data.text.trim(),
      createdAt: now,
    });
    await db.update(connections).set({ updatedAt: now }).where(eq(connections.id, conn.id));
    await broadcastConnection(user.id, conn.id);

    const theirMessage = await replyAsPerson(
      user.id,
      conn.id,
      data.personId,
      data.text.trim(),
      data.lang ?? "en",
    );

    return {
      userMessage: {
        id: msgId,
        from: "me" as const,
        t: now.getTime(),
        text: data.text.trim(),
      },
      theirMessage,
    };
  });

async function replyAsPerson(
  userId: string,
  connectionId: string,
  personId: string,
  userText: string,
  lang: "zh" | "en",
): Promise<{ id: string; from: "them"; t: number; text: string }> {
  const db = getDb();
  const personRows = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  const person = personRows[0]?.data as unknown as Person | undefined;
  const historyRows = await db
    .select()
    .from(messages)
    .where(eq(messages.connectionId, connectionId))
    .orderBy(asc(messages.createdAt));
  const history = historyRows.slice(-12).map((m) => ({
    role: (m.from === "me" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));
  const persona = person
    ? `Name: ${person.name} (${person.name_zh}). ${person.portrait}. Occupation: ${person.occupation}.`
    : "A thoughtful persona.";
  const { generatePersonaReply } = await import("../llm.server");
  const replyText =
    (await generatePersonaReply({ persona, history, userMessage: userText, lang })) ||
    (lang === "zh" ? "嗯，我也这么觉得。再多说一点？" : "Yeah — I feel that too. Say more?");

  const msgId = newId("msg");
  const now = new Date();
  await db.insert(messages).values({
    id: msgId,
    connectionId,
    from: "them",
    text: replyText,
    createdAt: now,
  });
  await db.update(connections).set({ updatedAt: now }).where(eq(connections.id, connectionId));
  await broadcastConnection(userId, connectionId);
  return { id: msgId, from: "them", t: now.getTime(), text: replyText };
}

export const pollConnectionsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ since: z.number().optional() }))
  .handler(async ({ data }): Promise<{ connections: Connection[]; serverTime: number }> => {
    const user = await getSessionUser();
    const serverTime = Date.now();
    if (!user) return { connections: [], serverTime };
    const db = getDb();
    const since = data.since ? new Date(data.since) : new Date(0);
    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.userId, user.id), gt(connections.updatedAt, since)));
    const result: Connection[] = [];
    for (const row of rows) {
      const msgs = await db.select().from(messages).where(eq(messages.connectionId, row.id)).orderBy(asc(messages.createdAt));
      result.push(
        rowToConnection(
          row,
          msgs.map((m) => ({
            id: m.id,
            from: m.from as "me" | "them",
            t: m.createdAt.getTime(),
            text: m.text,
          })),
        ),
      );
    }
    return { connections: result, serverTime };
  });

export const markConnectionSeenFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ personId: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const now = new Date();
    await db
      .update(connections)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(and(eq(connections.userId, user.id), eq(connections.personId, data.personId)));
    return { ok: true as const, lastSeenAt: now.getTime() };
  });

export const updateConnectionStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      personId: z.string(),
      action: z.enum(["withdraw", "respond", "dismiss", "undo_faded", "remove_faded", "delete"]),
      fromMe: z
        .object({ quotedMomentId: z.string().nullable(), reply: z.string() })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.userId, user.id), eq(connections.personId, data.personId)))
      .limit(1);
    const conn = rows[0];
    if (!conn) return { ok: false };

    if (data.action === "withdraw" && conn.status === "sent") {
      await db.delete(connections).where(eq(connections.id, conn.id));
      return { ok: true };
    }
    if (data.action === "respond" && conn.status === "incoming" && data.fromMe) {
      await db
        .update(connections)
        .set({
          status: "connected",
          connectedAt: new Date(),
          fromMe: data.fromMe,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, conn.id));
      await broadcastConnection(user.id, conn.id);
      return { ok: true };
    }
    if (data.action === "dismiss" && conn.status === "incoming") {
      await db
        .update(connections)
        .set({ status: "faded", fadedAt: new Date(), updatedAt: new Date() })
        .where(eq(connections.id, conn.id));
      await broadcastConnection(user.id, conn.id);
      return { ok: true };
    }
    if ((data.action === "undo_faded" || data.action === "remove_faded") && conn.status === "faded") {
      await db.delete(connections).where(eq(connections.id, conn.id));
      return { ok: true };
    }
    if (data.action === "delete") {
      await db.delete(messages).where(eq(messages.connectionId, conn.id));
      await db.delete(connections).where(eq(connections.id, conn.id));
      return { ok: true };
    }
    return { ok: false };
  });

// ---- Thread title (history list) ----

export const generateThreadTitleFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lang: z.enum(["en", "zh-CN"]),
      agent: z.enum(["introduce", "do_something", "reception"]),
      context: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await getSessionUser();
    const { generateThreadTitle } = await import("../thread-title-llm.server");
    const title = await generateThreadTitle(data);
    return title ?? "";
  });

// ---- Agent LLM helper ----

export const agentChatFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      system: z.string(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      userMessage: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { generateAgentReply } = await import("../llm.server");
    const text = await generateAgentReply(data);
    return { text };
  });

export const matchmakerTurnFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lang: z.enum(["en", "zh-CN"]),
      action: z.enum(["start", "message", "confirm_match", "confirm_rematch", "pass_and_next", "see_next"]),
      userMessage: z.string().optional(),
      seed: z.string().optional(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      understanding: z.object({
        positive: z.array(z.string()),
        negative: z.array(z.string()),
        notes: z.array(z.string()),
        traits: z.array(z.string()).optional(),
        interests: z.array(z.string()).optional(),
        occupation: z.array(z.string()).optional(),
        pace: z.array(z.string()).optional(),
      }),
      hardFilters: z
        .object({
          ageMin: z.number().nullable(),
          ageMax: z.number().nullable(),
          ageStrength: z.enum(["hard", "flex"]).nullable().optional(),
          genders: z.array(z.enum(["female", "male", "nonbinary"])),
          excludeGenders: z.array(z.enum(["female", "male", "nonbinary"])),
          genderStrength: z.enum(["hard", "flex"]).nullable().optional(),
          cities: z.array(z.string()),
          excludeCities: z.array(z.string()),
          cityStrength: z.enum(["hard", "flex"]).nullable().optional(),
          educationMin: z
            .enum(["high_school", "associate", "bachelor", "master", "doctorate"])
            .nullable(),
          educationLevels: z.array(
            z.enum(["high_school", "associate", "bachelor", "master", "doctorate"]),
          ),
          excludeEducationLevels: z.array(
            z.enum(["high_school", "associate", "bachelor", "master", "doctorate"]),
          ),
          educationStrength: z.enum(["hard", "flex"]).nullable().optional(),
        })
        .optional(),
      currentPersonId: z.string().nullable(),
      shownIds: z.array(z.string()),
      passedIds: z.array(z.string()),
      pendingMatchConfirm: z.string().nullable().optional(),
      pendingRematchConfirm: z.string().nullable().optional(),
      rankedQueue: z.array(z.string()).optional(),
      queueCursor: z.number().optional(),
      queueFingerprint: z.string().nullable().optional(),
      handoffCount: z.number().optional(),
      handoffSummary: z.string().optional(),
      userBlocklist: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");

    const db = getDb();
    const profileRows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const profile: Profile = profileRows[0]?.data
      ? { ...EMPTY_PROFILE, ...(profileRows[0].data as unknown as Profile) }
      : { ...EMPTY_PROFILE };

    const connRows = await db.select().from(connections).where(eq(connections.userId, user.id));
    const blockedPersonIds = [
      ...connRows
        .filter((c) => ["faded", "sent", "connected", "incoming"].includes(c.status))
        .map((c) => c.personId),
      ...(data.userBlocklist ?? []),
    ];

    const { runMatchmakerTurnStream } = await import("../matchmaker-llm.server");
    const { eventsToNdjsonResponse } = await import("../ndjson-stream.server");
    const { EMPTY_HARD_FILTERS } = await import("../match-types");
    try {
      return eventsToNdjsonResponse(
        runMatchmakerTurnStream({
          ...data,
          hardFilters: data.hardFilters ?? EMPTY_HARD_FILTERS,
          profile,
          blockedPersonIds,
          pendingMatchConfirm: data.pendingMatchConfirm ?? null,
          pendingRematchConfirm: data.pendingRematchConfirm ?? null,
          rankedQueue: data.rankedQueue ?? [],
          queueCursor: data.queueCursor ?? 0,
          queueFingerprint: data.queueFingerprint ?? null,
        }),
      );
    } catch (e) {
      const { log } = await import("../logger.server");
      log.error("api", "matchmakerTurnFn failed", e);
      throw e;
    }
  });

export const orchestratorTurnFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lang: z.enum(["en", "zh-CN"]),
      userMessage: z.string(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      forcedTarget: z.enum(["matchmaker", "sidebyside"]).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");

    const db = getDb();
    const profileRows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const profile: Profile = profileRows[0]?.data
      ? { ...EMPTY_PROFILE, ...(profileRows[0].data as unknown as Profile) }
      : { ...EMPTY_PROFILE };

    try {
      const { runOrchestratorTurnStream } = await import("../orchestrator-llm.server");
      const { eventsToNdjsonResponse } = await import("../ndjson-stream.server");
      return eventsToNdjsonResponse(
        runOrchestratorTurnStream({
          lang: data.lang,
          userMessage: data.userMessage,
          history: data.history,
          profile,
          forcedTarget: data.forcedTarget ?? null,
        }),
      );
    } catch (e) {
      const { log } = await import("../logger.server");
      log.error("api", "orchestratorTurnFn failed", e);
      throw e;
    }
  });

export const detectHandoffFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lang: z.enum(["en", "zh-CN"]),
      currentAgent: z.enum(["matchmaker", "sidebyside"]),
      userMessage: z.string(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      handoffCount: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const { detectMidConversationHandoff } = await import("../handoff-detect.server");
    return detectMidConversationHandoff(data);
  });

export const sideBySideTurnFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      lang: z.enum(["en", "zh-CN"]),
      action: z.enum(["start", "message", "confirm_publish", "confirm_browse", "confirm_match", "skip_match", "see_next", "rematch"]),
      userMessage: z.string().optional(),
      seed: z.string().optional(),
      preferredTrait: z.string().optional(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      understanding: z.object({
        positive: z.array(z.string()),
        negative: z.array(z.string()),
        notes: z.array(z.string()),
        traits: z.array(z.string()).optional(),
        interests: z.array(z.string()).optional(),
        occupation: z.array(z.string()).optional(),
        pace: z.array(z.string()).optional(),
      }),
      hardFilters: z.object({
        cities: z.array(z.string()),
        excludeCities: z.array(z.string()),
        kinds: z.array(
          z.enum(["tennis", "run", "climb", "cook", "exhibition", "bookstore", "other"]),
        ),
        allowCrossCity: z.boolean().optional(),
      }),
      buddyHardFilters: z.object({
        genders: z.array(z.enum(["female", "male", "nonbinary"])),
        excludeGenders: z.array(z.enum(["female", "male", "nonbinary"])),
        ageMin: z.number().nullable(),
        ageMax: z.number().nullable(),
      }),
      wishDraft: z.object({
        kind: z
          .enum(["tennis", "run", "climb", "cook", "exhibition", "bookstore", "other"])
          .nullable(),
        activityCore: z.string().optional(),
        activityStrength: z.enum(["hard", "flex"]).nullable().optional(),
        when: z.enum(["weekend", "weeknight", "any"]).optional(),
        level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        city: z.string().optional(),
        city_zh: z.string().optional(),
        placeRaw: z.string().optional(),
        placeOnline: z.boolean().optional(),
        placeFlex: z.boolean().optional(),
        placeMode: z.enum(["online", "offline", "any"]).optional(),
        place: z
          .object({
            continent: z.string().optional(),
            country: z.string().optional(),
            admin1: z.string().optional(),
            city: z.string().optional(),
            detail: z.string().optional(),
            labels: z
              .object({
                country: z.string().optional(),
                admin1: z.string().optional(),
                city: z.string().optional(),
                detail: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        rawText: z.string(),
        whenAny: z.boolean(),
        levelAny: z.boolean(),
        strictWhen: z.boolean().optional(),
        strictLevel: z.boolean().optional(),
        allowCrossCity: z.boolean().optional(),
        dateStart: z.string().optional(),
        dateEnd: z.string().optional(),
        timeStart: z.string().optional(),
        timeEnd: z.string().optional(),
        activityDescRaw: z.string().optional(),
        buddyPrefRaw: z.string().optional(),
        otherReqRaw: z.string().optional(),
        buddyMatchQuery: z
          .object({
            genders: z.array(z.enum(["female", "male", "nonbinary"])),
            genderMode: z.enum(["strict", "soft"]).nullable(),
            ageMin: z.number().nullable(),
            ageMax: z.number().nullable(),
            ageMode: z.enum(["strict", "soft"]).nullable(),
            personalityTags: z.array(z.string()),
            personalityQueryText: z.string(),
          })
          .optional(),
      }),
      pendingConfirm: z.string().nullable(),
      pendingBrowseConfirm: z.string().nullable(),
      pendingMatchConfirm: z.string().nullable(),
      pendingOfferMatch: z.boolean(),
      wishLane: z.enum(["unset", "browse", "publish"]),
      browseSearched: z.boolean(),
      myIntentId: z.string().nullable(),
      matchIntentId: z.string().nullable(),
      triedIntentIds: z.array(z.string()),
      triedOwnerIds: z.array(z.string()),
      rankedQueue: z.array(z.string()).optional(),
      queueCursor: z.number().optional(),
      queueFingerprint: z.string().nullable().optional(),
      passedIntentIds: z.array(z.string()).optional(),
      shownIntentIds: z.array(z.string()).optional(),
      handoffCount: z.number().optional(),
      handoffSummary: z.string().optional(),
      handoffHints: z
        .object({
          activity: z.string().optional(),
          when: z.string().optional(),
          area: z.string().optional(),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");

    const db = getDb();
    const profileRows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    const profile: Profile = profileRows[0]?.data
      ? { ...EMPTY_PROFILE, ...(profileRows[0].data as unknown as Profile) }
      : { ...EMPTY_PROFILE };

    const { sideTurnReadable } = await import("../side-llm.server");
    const { eventsToNdjsonResponse, readableToAsyncIterable } = await import("../ndjson-stream.server");
    try {
      return eventsToNdjsonResponse(
        readableToAsyncIterable(sideTurnReadable({ ...data, profile, userId: user.id })),
      );
    } catch (e) {
      const { log } = await import("../logger.server");
      log.error("api", "sideBySideTurnFn failed", e);
      throw e;
    }
  });
