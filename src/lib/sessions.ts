// Sessions — server-backed with memory cache.

import type { SideState } from "@/lib/agents/side-by-side";
import type { MatchmakerState } from "@/lib/agents/matchmaker";
import { listSessionsFn, upsertSessionFn, deleteSessionFn } from "./api/data.functions";

export type SessionAgent = "reception" | "do_something" | "introduce";
export type SessionStatus = "waiting" | "matched" | "chatting" | "revoked";

export interface ReceptionState {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface Session {
  id: string;
  threadId: string;
  agent: SessionAgent;
  createdAt: number;
  updatedAt: number;
  seed: string;
  status: SessionStatus;
  state: unknown;
  supersededAt?: number;
}

let cache: Session[] = [];
let hydrated = false;
let hydratePromise: Promise<Session[]> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeSessions(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function ensureSessionsHydrated(): Promise<Session[]> {
  if (hydrated) return cache;
  if (!hydratePromise) {
    hydratePromise = hydrateSessions()
      .catch(() => cache)
      .finally(() => {
        hydratePromise = null;
      });
  }
  return hydratePromise;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function persist(row: Session) {
  void upsertSessionFn({
    data: {
      id: row.id,
      threadId: row.threadId,
      agent: row.agent,
      seed: row.seed,
      status: row.status,
      state: row.state,
      createdAt: row.createdAt,
      supersededAt: row.supersededAt,
    },
  }).catch(console.error);
}

export function deriveDoSomethingStatus(state: SideState): SessionStatus {
  if (state.stage === "chat") return "chatting";
  if (state.matchIntentId) return "matched";
  if (state.stage === "published" || state.myIntentId) return "waiting";
  if (state.wishLane === "browse" && state.browseSearched) return "waiting";
  if ((state.messages?.length ?? 0) > 0) return "waiting";
  return "revoked";
}

export function deriveIntroduceStatus(state: MatchmakerState): SessionStatus {
  if (state.currentPersonId) return "matched";
  return "waiting";
}

export async function hydrateSessions(): Promise<Session[]> {
  try {
    const rows = await listSessionsFn();
    cache = rows.map((r) => ({
      ...r,
      agent: r.agent as SessionAgent,
      status: r.status as SessionStatus,
    }));
    hydrated = true;
    emit();
  } catch {
    cache = [];
    hydrated = true;
    emit();
  }
  return cache;
}

function visibleSessions(): Session[] {
  return cache.filter((s) => !s.supersededAt);
}

export function listSessions(): Session[] {
  if (!hydrated) void ensureSessionsHydrated();
  return [...visibleSessions()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLatestSessionInThread(threadId: string): Session | null {
  const rows = visibleSessions()
    .filter((s) => s.threadId === threadId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return rows[0] ?? null;
}

export function mostRecentReception(): Session | null {
  return listSessions().find((s) => s.agent === "reception") ?? null;
}

export function getSession(id: string): Session | null {
  return cache.find((s) => s.id === id) ?? null;
}

/** Find a matchmaker session that already knows this person (queue, current, or shown). */
export function findIntroduceSessionForPerson(personId: string): Session | null {
  const rows = listSessions().filter((s) => s.agent === "introduce");
  for (const s of rows) {
    const st = s.state as Partial<MatchmakerState>;
    if (st.currentPersonId === personId) return s;
    if (st.rankedQueue?.includes(personId)) return s;
    if (st.shownIds?.includes(personId)) return s;
  }
  return rows[0] ?? null;
}

export function createSession(
  agent: SessionAgent,
  seed: string,
  initialState: unknown,
  opts?: { threadId?: string },
): Session {
  const now = Date.now();
  const id = uid();
  const sess: Session = {
    id,
    threadId: opts?.threadId ?? id,
    agent,
    createdAt: now,
    updatedAt: now,
    seed,
    status: "waiting",
    state: initialState,
  };
  cache = [sess, ...cache];
  persist(sess);
  emit();
  return sess;
}

export function supersedeSession(id: string) {
  const idx = cache.findIndex((s) => s.id === id);
  if (idx < 0 || cache[idx].supersededAt) return;
  const now = Date.now();
  const next: Session = { ...cache[idx], supersededAt: now, updatedAt: now };
  cache = [...cache.slice(0, idx), next, ...cache.slice(idx + 1)];
  persist(next);
  emit();
}

/** Replace the active step in a thread (handoff) without adding a history row. */
export function handoffSession(
  fromSessionId: string,
  agent: SessionAgent,
  seed: string,
  initialState: unknown,
): Session {
  const from = getSession(fromSessionId);
  const threadId = from?.threadId ?? fromSessionId;
  supersedeSession(fromSessionId);
  return createSession(agent, seed, initialState, { threadId });
}

export function updateSession(
  id: string,
  patch: { state?: unknown; status?: SessionStatus; seed?: string; supersededAt?: number },
) {
  const idx = cache.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const next: Session = {
    ...cache[idx],
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.seed !== undefined ? { seed: patch.seed } : {}),
    ...(patch.supersededAt !== undefined ? { supersededAt: patch.supersededAt } : {}),
    updatedAt: Date.now(),
  };
  cache = [...cache.slice(0, idx), next, ...cache.slice(idx + 1)];
  persist(next);
  emit();
}

export function revokeSession(id: string) {
  updateSession(id, { status: "revoked" });
}

export function deleteSession(id: string) {
  const row = cache.find((s) => s.id === id);
  const threadId = row?.threadId;
  if (threadId) {
    cache = cache.filter((s) => s.threadId !== threadId);
    void deleteSessionFn({ data: { id, threadId } }).catch(console.error);
  } else {
    cache = cache.filter((s) => s.id !== id);
    void deleteSessionFn({ data: { id } }).catch(console.error);
  }
  emit();
}

export function mostRecentActiveDoSomething(): Session | null {
  const rows = listSessions();
  return rows.find((s) => s.agent === "do_something" && s.status !== "revoked") ?? null;
}
