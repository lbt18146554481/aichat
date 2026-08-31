// Local Agent-side persistence: long-term memory + inferred understanding.
//
// These two used to be read straight from src/lib by pages. They now sit
// behind ports so a real backend can persist them server-side without any UI
// change. (Conversation state per workspace lives in the sessions store and
// already flows through SessionsRepo, so it needs no separate port.)

import * as memoryStore from "@/lib/agent-memory";
import * as understandingStore from "@/lib/understanding";
import type { AgentMemoryRepo, UnderstandingRepo } from "@/data/ports";

export const agentMemory: AgentMemoryRepo = {
  async load() {
    return memoryStore.loadMemory();
  },
  async rememberTrait(trait) {
    memoryStore.rememberTrait(trait);
  },
  async lastTrait() {
    return memoryStore.lastTrait();
  },
};

export const understanding: UnderstandingRepo = {
  async load() {
    return understandingStore.loadUnderstanding();
  },
  async save(u) {
    understandingStore.saveUnderstanding(u);
  },
  async reset() {
    return understandingStore.resetUnderstanding();
  },
};
