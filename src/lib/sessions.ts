// Sessions — one row per "thing the user has started".
//
// Each time the user submits from the home composer, we create a new session
// and navigate to the corresponding agent page carrying its id. The agent
// page writes its state back into that session on every change.
//
// The session list on the home page is just `listSessions()` sorted by
// updatedAt desc — a live inventory of everything the user has ever said.
//
// This is a demo store: pure localStorage, no cross-device, no expiration.

import type { SideState } from "@/lib/agents/side-by-side";

export type SessionAgent = "do_something" | "introduce";
export type SessionStatus = "waiting" | "matched" | "chatting" | "revoked";

export interface Session {
  id: string;
  agent: SessionAgent;
  createdAt: number;
  updatedAt: number;
  /** The original sentence the user typed on the home page. Used as title. */
  seed: string;
  status: SessionStatus;
  /** Agent-specific state blob. For "do_something" this is SideState. */
  state: unknown;
}

const KEY = "kindred:sessions.v1";
const LEGACY_SIDE_KEY = "kindred:sidebyside.v5";
const MIGRATION_FLAG = "kindred:sessions.migrated.v1";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readAll(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Session[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeAll(rows: Session[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* noop */ }
}

/** Derive the current status of a do_something session from its SideState. */
export function deriveDoSomethingStatus(state: SideState): SessionStatus {
  if (!state.myIntentId) return "revoked";
  if (state.stage === "chat") return "chatting";
  if (state.stage === "published" && state.matchIntentId) return "matched";
  if (state.stage === "published") return "waiting";
  return "waiting";
}

/** One-time migration: bring the old single-session sidebyside.v5 blob into
 *  the new sessions list so nothing the user did before disappears. */
function ensureMigrated() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === "1") return;
    const rows = readAll();
    const raw = window.localStorage.getItem(LEGACY_SIDE_KEY);
    if (raw && rows.length === 0) {
      const parsed = JSON.parse(raw) as Partial<SideState>;
      // Only migrate if there's an actual wish worth carrying over.
      if (parsed && parsed.myIntentId) {
        const seed = (parsed.messages ?? []).find((m) => m.role === "user")?.text ?? "";
        const now = Date.now();
        const state = parsed as SideState;
        rows.push({
          id: uid(),
          agent: "do_something",
          createdAt: now,
          updatedAt: now,
          seed,
          status: deriveDoSomethingStatus(state),
          state,
        });
        writeAll(rows);
      }
    }
    window.localStorage.setItem(MIGRATION_FLAG, "1");
  } catch { /* noop */ }
}

export function listSessions(): Session[] {
  ensureMigrated();
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | null {
  ensureMigrated();
  return readAll().find((s) => s.id === id) ?? null;
}

export function createSession(
  agent: SessionAgent,
  seed: string,
  initialState: unknown,
): Session {
  ensureMigrated();
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
  const rows = readAll();
  rows.push(sess);
  writeAll(rows);
  return sess;
}

export function updateSession(
  id: string,
  patch: { state?: unknown; status?: SessionStatus; seed?: string },
) {
  ensureMigrated();
  const rows = readAll();
  const idx = rows.findIndex((s) => s.id === id);
  if (idx < 0) return;
  rows[idx] = {
    ...rows[idx],
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.seed !== undefined ? { seed: patch.seed } : {}),
    updatedAt: Date.now(),
  };
  writeAll(rows);
}

export function revokeSession(id: string) {
  updateSession(id, { status: "revoked" });
}

/** The banner on the home page uses this: the most recent non-revoked
 *  do_something session, if any. */
export function mostRecentActiveDoSomething(): Session | null {
  const rows = listSessions();
  return rows.find(
    (s) => s.agent === "do_something" && s.status !== "revoked",
  ) ?? null;
}
