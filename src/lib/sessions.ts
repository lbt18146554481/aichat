// Sessions — one row per "thing the user has started".
//
// Each time the user submits from the home composer, we create a new session
// (regardless of which Agent the intent gets routed to) and navigate to the
// corresponding agent page carrying its id. The agent page writes its state
// back into that session on every change.
//
// The History list is just `listSessions()` sorted by updatedAt desc — a
// live inventory of everything the user has ever said. One home submit =
// one row. No merging, no dedup, no "sessions of sessions".

import type { SideState } from "@/lib/agents/side-by-side";
import type { MatchmakerState } from "@/lib/agents/matchmaker";

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
  /** Agent-specific state blob. */
  state: unknown;
}

const KEY = "kindred:sessions.v1";
const LEGACY_SIDE_KEY = "kindred:sidebyside.v5";
const LEGACY_MATCHMAKER_KEY = "kindred:matchmaker.v3";
// Bumped to v2: re-run the migration once so we also carry over the old
// matchmaker blob, and clean up the legacy KEYs afterwards so they can't
// spawn phantom state on future visits.
const MIGRATION_FLAG = "kindred:sessions.migrated.v2";
const OLD_MIGRATION_FLAG = "kindred:sessions.migrated.v1";

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
  } catch {
    return [];
  }
}

function writeAll(rows: Session[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* noop */
  }
}

/** Derive the current status of a do_something session from its SideState. */
export function deriveDoSomethingStatus(state: SideState): SessionStatus {
  if (!state.myIntentId) return "revoked";
  if (state.stage === "chat") return "chatting";
  if (state.stage === "published" && state.matchIntentId) return "matched";
  if (state.stage === "published") return "waiting";
  return "waiting";
}

/** Derive the current status of an introduce (matchmaker) session. */
export function deriveIntroduceStatus(state: MatchmakerState): SessionStatus {
  if (state.currentPersonId) return "matched";
  return "waiting";
}

/** One-time migration: bring old single-blob agent state into the sessions
 *  list, so nothing the user did before disappears; then delete the legacy
 *  keys so they can't create phantom state next visit. */
function ensureMigrated() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === "1") return;

    const rows = readAll();
    const now = Date.now();

    // --- side-by-side legacy blob -----------------------------------------
    const sideRaw = window.localStorage.getItem(LEGACY_SIDE_KEY);
    if (sideRaw) {
      try {
        const parsed = JSON.parse(sideRaw) as Partial<SideState>;
        if (parsed && parsed.myIntentId) {
          const seed = (parsed.messages ?? []).find((m) => m.role === "user")?.text ?? "";
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
        }
      } catch {
        /* noop */
      }
    }

    // --- matchmaker legacy blob -------------------------------------------
    const mmRaw = window.localStorage.getItem(LEGACY_MATCHMAKER_KEY);
    if (mmRaw) {
      try {
        const parsed = JSON.parse(mmRaw) as Partial<MatchmakerState>;
        if (parsed && (parsed.messages?.length ?? 0) > 0) {
          const seed = (parsed.messages ?? []).find((m) => m.role === "user")?.text ?? "";
          if (seed) {
            const state = parsed as MatchmakerState;
            rows.push({
              id: uid(),
              agent: "introduce",
              createdAt: now,
              updatedAt: now,
              seed,
              status: deriveIntroduceStatus(state),
              state,
            });
          }
        }
      } catch {
        /* noop */
      }
    }

    writeAll(rows);

    // Wipe legacy keys so the agent pages can never load them again.
    try {
      window.localStorage.removeItem(LEGACY_SIDE_KEY);
    } catch {
      /* noop */
    }
    try {
      window.localStorage.removeItem(LEGACY_MATCHMAKER_KEY);
    } catch {
      /* noop */
    }
    try {
      window.localStorage.removeItem(OLD_MIGRATION_FLAG);
    } catch {
      /* noop */
    }

    window.localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    /* noop */
  }
}

export function listSessions(): Session[] {
  ensureMigrated();
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | null {
  ensureMigrated();
  return readAll().find((s) => s.id === id) ?? null;
}

export function createSession(agent: SessionAgent, seed: string, initialState: unknown): Session {
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
  return rows.find((s) => s.agent === "do_something" && s.status !== "revoked") ?? null;
}
