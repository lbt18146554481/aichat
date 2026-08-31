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
  agent: SessionAgent;
  createdAt: number;
  updatedAt: number;
  seed: string;
  status: SessionStatus;
  state: unknown;
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
      agent: row.agent,
      seed: row.seed,
      status: row.status,
      state: row.state,
      createdAt: row.createdAt,
    },
  }).catch(console.error);
}

export function deriveDoSomethingStatus(state: SideState): SessionStatus {
  if (!state.myIntentId) return "revoked";
  if (state.stage === "chat") return "chatting";
  if (state.stage === "published" && state.matchIntentId) return "matched";
  if (state.stage === "published") return "waiting";
  return "waiting";
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

export function listSessions(): Session[] {
  if (!hydrated) void ensureSessionsHydrated();
  return [...cache].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mostRecentReception(): Session | null {
  return listSessions().find((s) => s.agent === "reception") ?? null;
}

export function getSession(id: string): Session | null {
  return cache.find((s) => s.id === id) ?? null;
}

export function createSession(agent: SessionAgent, seed: string, initialState: unknown): Session {
  const now = Date.now();
  const sess: Session = {
    id: uid(),
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

export function updateSession(
  id: string,
  patch: { state?: unknown; status?: SessionStatus; seed?: string },
) {
  const idx = cache.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const next: Session = {
    ...cache[idx],
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.seed !== undefined ? { seed: patch.seed } : {}),
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
  cache = cache.filter((s) => s.id !== id);
  void deleteSessionFn({ data: { id } }).catch(console.error);
  emit();
}

export function mostRecentActiveDoSomething(): Session | null {
  const rows = listSessions();
  return rows.find((s) => s.agent === "do_something" && s.status !== "revoked") ?? null;
}
