import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, and, gt, desc, asc } from "drizzle-orm";
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
    const full: Intent = { ...intent, id, ownerId: "me" };
    const db = getDb();
    await db
      .insert(intents)
      .values({
        id,
        ownerId: "me",
        userId: user.id,
        data: full as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: intents.id,
        set: { data: full as unknown as Record<string, unknown> },
      });
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
    .where(eq(chatSessions.userId, user.id))
    .orderBy(desc(chatSessions.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    agent: r.agent,
    seed: r.seed,
    status: r.status,
    state: r.state,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }));
});

export const upsertSessionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      agent: z.string(),
      seed: z.string().optional(),
      status: z.string().optional(),
      state: z.unknown(),
      createdAt: z.number().optional(),
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
        agent: data.agent,
        seed: data.seed ?? "",
        status: data.status ?? "waiting",
        state: data.state,
        createdAt: data.createdAt ? new Date(data.createdAt) : now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: chatSessions.id,
        set: {
          state: data.state,
          status: data.status ?? "waiting",
          seed: data.seed ?? "",
          updatedAt: now,
        },
      });
    return { ok: true as const };
  });

export const deleteSessionFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("unauthorized");
    const db = getDb();
    await db.delete(chatSessions).where(and(eq(chatSessions.id, data.id), eq(chatSessions.userId, user.id)));
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

    const id = newId("conn");
    const now = new Date();
    await db.insert(connections).values({
      id,
      userId: user.id,
      personId: data.personId,
      status: "sent",
      initiatedBy: "me",
      helloAt: now,
      originSessionId: data.originSessionId ?? null,
      fromMe: data.fromMe,
      updatedAt: now,
    });

    // Schedule async resolution via fire-and-forget LLM reply (run inline for reliability)
    void resolveHello(user.id, id, data.personId, data.fromMe.reply, data.lang ?? "en").catch(console.error);

    const created: Connection = {
      id,
      personId: data.personId,
      status: "sent",
      initiatedBy: "me",
      helloAt: now.getTime(),
      originSessionId: data.originSessionId,
      fromMe: data.fromMe,
      messages: [],
    };
    void import("../realtime-push.server").then(({ pushConnectionUpdate }) =>
      pushConnectionUpdate(user.id, created),
    );
    return created;
  });

async function resolveHello(
  userId: string,
  connectionId: string,
  personId: string,
  userHello: string,
  lang: "zh" | "en",
) {
  // Delay 3-8s to feel natural
  await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000));
  const db = getDb();
  const rows = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
  const conn = rows[0];
  if (!conn || conn.status !== "sent") return;

  const wantsToTalk = Math.random() < 0.75;
  if (!wantsToTalk) {
    await db
      .update(connections)
      .set({ status: "faded", fadedAt: new Date(), updatedAt: new Date() })
      .where(eq(connections.id, connectionId));
    await broadcastConnection(userId, connectionId);
    return;
  }

  const personRows = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  const person = personRows[0]?.data as unknown as Person | undefined;
  const persona = person
    ? `Name: ${person.name}. City: ${person.city}. Occupation: ${person.occupation}. Bio: ${person.portrait}. Signals: ${(person.signals ?? []).join(", ")}.`
    : "You are a warm, thoughtful person open to meeting someone new.";

  const { generatePersonaReply } = await import("../llm.server");
  const reply =
    (await generatePersonaReply({
      persona,
      history: [],
      userMessage: `Someone said hello to you with: "${userHello}". Write your reply accepting the hello.`,
      lang,
    })) ||
    (lang === "zh"
      ? "这句我看了两遍。很想继续聊聊。"
      : "That landed. I'd love to talk more.");

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

    const { pushTyping } = await import("../realtime-push.server");
    void pushTyping(user.id, data.personId, true);
    void replyAsPerson(user.id, conn.id, data.personId, data.text.trim(), data.lang ?? "en").catch(
      console.error,
    );

    return {
      id: msgId,
      from: "me" as const,
      t: now.getTime(),
      text: data.text.trim(),
    };
  });

async function replyAsPerson(
  userId: string,
  connectionId: string,
  personId: string,
  userText: string,
  lang: "zh" | "en",
) {
  await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
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
    : "A thoughtful person.";
  const { generatePersonaReply } = await import("../llm.server");
  const reply =
    (await generatePersonaReply({ persona, history, userMessage: userText, lang })) ||
    (lang === "zh" ? "嗯，我也这么觉得。再多说一点？" : "Yeah — I feel that too. Say more?");

  await db.insert(messages).values({
    id: newId("msg"),
    connectionId,
    from: "them",
    text: reply,
    createdAt: new Date(),
  });
  await db.update(connections).set({ updatedAt: new Date() }).where(eq(connections.id, connectionId));
  const { pushTyping } = await import("../realtime-push.server");
  void pushTyping(userId, personId, false);
  await broadcastConnection(userId, connectionId);
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

export const updateConnectionStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      personId: z.string(),
      action: z.enum(["withdraw", "respond", "dismiss", "undo_faded", "remove_faded"]),
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
    return { ok: false };
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
      action: z.enum(["start", "message", "pass_and_next", "see_next"]),
      userMessage: z.string().optional(),
      seed: z.string().optional(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      understanding: z.object({
        positive: z.array(z.string()),
        negative: z.array(z.string()),
        notes: z.array(z.string()),
      }),
      hardFilters: z
        .object({
          ageMin: z.number().nullable(),
          ageMax: z.number().nullable(),
          cities: z.array(z.string()),
          excludeCities: z.array(z.string()),
          educationMin: z
            .enum(["high_school", "associate", "bachelor", "master", "doctorate"])
            .nullable(),
          educationLevels: z.array(
            z.enum(["high_school", "associate", "bachelor", "master", "doctorate"]),
          ),
          excludeEducationLevels: z.array(
            z.enum(["high_school", "associate", "bachelor", "master", "doctorate"]),
          ),
        })
        .optional(),
      currentPersonId: z.string().nullable(),
      shownIds: z.array(z.string()),
      passedIds: z.array(z.string()),
      handoffCount: z.number().optional(),
      handoffSummary: z.string().optional(),
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
    const blockedPersonIds = connRows
      .filter((c) => ["faded", "sent", "connected", "incoming"].includes(c.status))
      .map((c) => c.personId);

    const { matchmakerTurnReadable } = await import("../matchmaker-llm.server");
    const { EMPTY_HARD_FILTERS } = await import("../match-types");
    try {
      return matchmakerTurnReadable({
        ...data,
        hardFilters: data.hardFilters ?? EMPTY_HARD_FILTERS,
        profile,
        blockedPersonIds,
      });
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
    try {
      const { orchestratorTurnReadable } = await import("../orchestrator-llm.server");
      return orchestratorTurnReadable({
        lang: data.lang,
        userMessage: data.userMessage,
        history: data.history,
        forcedTarget: data.forcedTarget ?? null,
      });
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
      action: z.enum(["start", "message", "confirm_publish", "skip_match", "see_next", "rematch"]),
      userMessage: z.string().optional(),
      seed: z.string().optional(),
      preferredTrait: z.string().optional(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      understanding: z.object({
        positive: z.array(z.string()),
        negative: z.array(z.string()),
        notes: z.array(z.string()),
      }),
      hardFilters: z.object({
        cities: z.array(z.string()),
        excludeCities: z.array(z.string()),
        kinds: z.array(
          z.enum(["tennis", "run", "climb", "cook", "exhibition", "bookstore", "other"]),
        ),
      }),
      wishDraft: z.object({
        kind: z
          .enum(["tennis", "run", "climb", "cook", "exhibition", "bookstore", "other"])
          .nullable(),
        when: z.enum(["weekend", "weeknight", "any"]).optional(),
        level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        city: z.string().optional(),
        city_zh: z.string().optional(),
        rawText: z.string(),
        whenAny: z.boolean(),
        levelAny: z.boolean(),
      }),
      pendingConfirm: z.string().nullable(),
      myIntentId: z.string().nullable(),
      matchIntentId: z.string().nullable(),
      triedIntentIds: z.array(z.string()),
      triedOwnerIds: z.array(z.string()),
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
    try {
      return sideTurnReadable({ ...data, profile });
    } catch (e) {
      const { log } = await import("../logger.server");
      log.error("api", "sideBySideTurnFn failed", e);
      throw e;
    }
  });
