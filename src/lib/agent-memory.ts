import { getPrefsFn, savePrefsFn } from "./api/data.functions";

export interface AgentMemory {
  preferredTraits: string[];
}

const EMPTY: AgentMemory = { preferredTraits: [] };
let cache: AgentMemory = { ...EMPTY };

export function loadMemory(): AgentMemory {
  return cache;
}

export function saveMemory(mem: AgentMemory) {
  cache = mem;
  void savePrefsFn({ data: { agentMemory: mem as unknown as Record<string, unknown> } }).catch(
    console.error,
  );
}

export function rememberTrait(trait: string) {
  const clean = trait.trim();
  if (!clean) return;
  const next = [clean, ...cache.preferredTraits.filter((t) => t !== clean)].slice(0, 6);
  saveMemory({ preferredTraits: next });
}

export function lastTrait(): string | null {
  return cache.preferredTraits[0] ?? null;
}

export async function hydrateAgentMemory() {
  try {
    const prefs = await getPrefsFn();
    if (prefs.agentMemory) {
      cache = { preferredTraits: (prefs.agentMemory as AgentMemory).preferredTraits ?? [] };
    }
  } catch {
    /* ignore */
  }
  return cache;
}
