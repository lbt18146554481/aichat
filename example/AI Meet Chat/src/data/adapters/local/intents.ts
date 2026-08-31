// Local intents (wishes) storage.

import * as intentStore from "@/lib/intents";
import type { IntentsRepo } from "@/data/ports";

export const intents: IntentsRepo = {
  async listMine() {
    return intentStore.loadMyIntents();
  },
  async getById(id) {
    return intentStore.getIntentById(id);
  },
  async publish(input) {
    return intentStore.publishMyIntent(input);
  },
  async update(id, patch) {
    return intentStore.updateMyIntent(id, patch);
  },
  async revoke(id) {
    intentStore.revokeMyIntent(id);
  },
  async pool() {
    return intentStore.seedPool();
  },
};
