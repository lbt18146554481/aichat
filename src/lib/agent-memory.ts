// Agent's long-term memory about you — persists across "activities/wishes".
// Demo-only: a flat list of trait phrases the user has told the Agent
// ("more quiet", "someone who reads", etc.). Stored in localStorage so a
// "new activity" (which clears the current conversation and right pane)
// still remembers who you want to meet.

const KEY = "kindred:agent-memory.v1";

export interface AgentMemory {
  /** Free-text traits the user has told the Agent. Most recent first. */
  preferredTraits: string[];
}

const EMPTY: AgentMemory = { preferredTraits: [] };

export function loadMemory(): AgentMemory {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AgentMemory>;
    return { preferredTraits: parsed.preferredTraits ?? [] };
  } catch {
    return EMPTY;
  }
}

export function saveMemory(mem: AgentMemory) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* noop */ }
}

export function rememberTrait(trait: string) {
  const clean = trait.trim();
  if (!clean) return;
  const mem = loadMemory();
  // De-dupe, most recent first, cap at 6.
  const next = [clean, ...mem.preferredTraits.filter((t) => t !== clean)].slice(0, 6);
  saveMemory({ preferredTraits: next });
}

/** Most recently mentioned trait, if any. */
export function lastTrait(): string | null {
  const mem = loadMemory();
  return mem.preferredTraits[0] ?? null;
}
