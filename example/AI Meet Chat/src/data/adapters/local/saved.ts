// Local "saved" storage: wishes + people.

import * as savedWishes from "@/lib/saved-intents";
import * as savedPeople from "@/lib/saved-people";
import type { SavedRepo } from "@/data/ports";

export const saved: SavedRepo = {
  async listWishes() {
    return savedWishes.listSaved();
  },
  async toggleWish(intentId, sessionId) {
    savedWishes.toggleSaved(intentId, sessionId);
  },
  async removeWish(intentId) {
    savedWishes.removeSaved(intentId);
  },
  async listPeople() {
    return savedPeople.listSavedPeople();
  },
  async togglePerson(personId, sessionId) {
    savedPeople.toggleSavedPerson(personId, sessionId);
  },
  async removePerson(personId) {
    savedPeople.removeSavedPerson(personId);
  },
  subscribe(fn) {
    const a = savedWishes.subscribeSaved(fn);
    const b = savedPeople.subscribeSavedPeople(fn);
    return () => {
      a();
      b();
    };
  },
};
