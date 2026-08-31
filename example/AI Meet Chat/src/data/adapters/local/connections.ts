// Local connections (threads) storage.

import * as connStore from "@/lib/connections";
import type { ConnectionsRepo } from "@/data/ports";

export const connections: ConnectionsRepo = {
  async bootstrap() {
    connStore.rehydrate();
  },
  async list() {
    return connStore.list();
  },
  async get(personId) {
    return connStore.get(personId);
  },
  async sayHello(personId, fromMe, originSessionId) {
    return connStore.sayHello(personId, fromMe, originSessionId);
  },
  async withdrawSent(personId) {
    connStore.withdrawSent(personId);
  },
  async respondToIncoming(personId, fromMe) {
    connStore.respondToIncoming(personId, fromMe);
  },
  async dismissIncoming(personId) {
    connStore.dismissIncoming(personId);
  },
  async removeFaded(personId) {
    connStore.removeFaded(personId);
  },
  async undoFaded(personId) {
    connStore.undoFadedFor(personId);
  },
  async isTyping(personId) {
    return connStore.isTyping(personId);
  },
  async send(personId, text) {
    connStore.send(personId, text);
  },
  async markSeen(personId) {
    connStore.markSeen(personId);
  },
  subscribe: (fn) => connStore.subscribe(fn),
};
