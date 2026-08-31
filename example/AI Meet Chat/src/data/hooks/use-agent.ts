// Hooks for the Agent-side persistent state: long-term memory and the
// inferred understanding of who the user is looking for.
//
// These wrap the repos so UI never touches the storage modules directly.
// (Per-workspace conversation state lives in the sessions store and flows
// through SessionsRepo — no separate hook needed here.)

import { useCallback, useEffect, useState } from "react";
import { repos } from "@/data";
import type { AgentMemory } from "@/lib/agent-memory";
import type { UserUnderstanding } from "@/lib/understanding";

/** Long-lived traits the user told the Agent, across wishes. */
export function useAgentMemory() {
  const [memory, setMemory] = useState<AgentMemory | null>(null);

  useEffect(() => {
    void repos.agentMemory.load().then(setMemory);
  }, []);

  const rememberTrait = useCallback(async (trait: string) => {
    await repos.agentMemory.rememberTrait(trait);
    setMemory(await repos.agentMemory.load());
  }, []);

  return { memory, rememberTrait };
}

/** The system's current read of who the user is looking for. */
export function useUnderstanding() {
  const [understanding, setUnderstanding] = useState<UserUnderstanding | null>(null);

  useEffect(() => {
    void repos.understanding.load().then(setUnderstanding);
  }, []);

  const save = useCallback((next: UserUnderstanding) => {
    setUnderstanding(next);
    void repos.understanding.save(next);
  }, []);

  const reset = useCallback(async () => {
    const fresh = await repos.understanding.reset();
    setUnderstanding(fresh);
    return fresh;
  }, []);

  return { understanding, save, reset };
}
