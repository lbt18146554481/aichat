// Local invite codes.

import * as inviteStore from "@/lib/invites";
import type { InvitesRepo } from "@/data/ports";

export const invites: InvitesRepo = {
  async validate(code) {
    return inviteStore.validateInvite(code);
  },
  async listMine(userId) {
    return inviteStore.listMyCodes(userId);
  },
  async remaining(userId) {
    return inviteStore.remainingInvites(userId);
  },
  async generate(userId) {
    return inviteStore.generateInvite(userId);
  },
};
