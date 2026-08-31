// Local sessions (one wish = one session) storage.

import * as sessionStore from "@/lib/sessions";
import type { SessionsRepo } from "@/data/ports";

export const sessions: SessionsRepo = {
  async list() {
    return sessionStore.listSessions();
  },
  async get(id) {
    return sessionStore.getSession(id);
  },
  async create(agent, seed, initialState) {
    return sessionStore.createSession(agent, seed, initialState);
  },
  async update(id, patch) {
    sessionStore.updateSession(id, patch);
  },
  async revoke(id) {
    sessionStore.revokeSession(id);
  },
  async mostRecentActiveDoSomething() {
    return sessionStore.mostRecentActiveDoSomething();
  },
};
