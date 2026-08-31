// Local blocklist + reports.

import * as blocklistStore from "@/lib/blocklist";
import type { BlocklistRepo } from "@/data/ports";

export const blocklist: BlocklistRepo = {
  async list() {
    return blocklistStore.listBlocked();
  },
  async block(personId) {
    blocklistStore.blockPerson(personId);
  },
  async unblock(personId) {
    blocklistStore.unblockPerson(personId);
  },
  async report(report) {
    blocklistStore.submitReport(report);
  },
  subscribe: (fn) => blocklistStore.subscribe(fn),
};
