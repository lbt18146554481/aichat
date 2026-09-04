/**
 * Ranked wish queue for Side by Side — same navigation model as Matchmaker.
 */

import type { Intent } from "./intents";
import { getIntentById, sameCity } from "./intents";
import {
  advanceMatchmakerQueue,
  mergeRankedIds,
  queueBrowseReply,
  queueExhaustedReply,
  retreatMatchmakerQueue,
  type QueueAdvanceMode,
} from "./matchmaker-queue";
import type { BuddyHardFilters } from "./buddy-filters";
import type { UserUnderstanding } from "./understanding";
import { matchQualityBetween } from "./wish-recall";
import type { WishHardFilters } from "./wish-types";

export {
  mergeRankedIds,
  queueBrowseReply,
  queueExhaustedReply,
  type QueueAdvanceMode,
};

export const SIDE_WISH_QUEUE_LIMIT = 8;

export interface SideWishQueueCarrier {
  rankedQueue: string[];
  queueCursor: number;
  passedIntentIds: string[];
  shownIntentIds: string[];
  matchIntentId: string | null;
}

function toMatchmakerCarrier(state: SideWishQueueCarrier) {
  return {
    rankedQueue: state.rankedQueue,
    queueCursor: state.queueCursor,
    passedIds: state.passedIntentIds,
    shownIds: state.shownIntentIds,
    currentPersonId: state.matchIntentId,
  };
}

export function sideWishQueueFingerprint(
  mineId: string,
  hardFilters: WishHardFilters,
  buddyHardFilters: BuddyHardFilters,
  understanding: UserUnderstanding,
  browseStrict: boolean,
): string {
  return JSON.stringify({
    mineId,
    hardFilters,
    buddyHardFilters,
    understanding,
    browseStrict,
  });
}

export function advanceSideWishQueue(
  state: SideWishQueueCarrier,
  mode: QueueAdvanceMode,
  blockedIds: string[] = [],
): SideWishQueueCarrier & { exhausted: boolean } {
  const advanced = advanceMatchmakerQueue(toMatchmakerCarrier(state), mode, blockedIds);
  return {
    rankedQueue: advanced.rankedQueue,
    queueCursor: advanced.queueCursor,
    passedIntentIds: advanced.passedIds,
    shownIntentIds: advanced.shownIds,
    matchIntentId: advanced.currentPersonId,
    exhausted: advanced.exhausted,
  };
}

export function retreatSideWishQueue(
  state: SideWishQueueCarrier,
  blockedIds: string[] = [],
): SideWishQueueCarrier & { atStart: boolean } {
  const retreated = retreatMatchmakerQueue(toMatchmakerCarrier(state), blockedIds);
  return {
    rankedQueue: retreated.rankedQueue,
    queueCursor: retreated.queueCursor,
    passedIntentIds: retreated.passedIds,
    shownIntentIds: retreated.shownIds,
    matchIntentId: retreated.currentPersonId,
    atStart: retreated.atStart,
  };
}

export function canRetreatSideWishQueue(state: SideWishQueueCarrier, blockedIds: string[] = []): boolean {
  if (state.rankedQueue.length === 0 || state.queueCursor <= 0) return false;
  const blocked = new Set(blockedIds);
  for (let i = state.queueCursor - 1; i >= 0; i--) {
    if (!blocked.has(state.rankedQueue[i]!)) return true;
  }
  return false;
}

export function matchMetaForIntent(
  mine: Intent,
  intentId: string,
): { quality: import("./intents").MatchQuality; crossCity: boolean } | null {
  const other = getIntentById(intentId);
  if (!other) return null;
  return {
    quality: matchQualityBetween(mine, other),
    crossCity: !sameCity(mine, other),
  };
}

export function carrierFromSideState(state: {
  rankedQueue?: string[];
  queueCursor?: number;
  passedIntentIds?: string[];
  shownIntentIds?: string[];
  matchIntentId?: string | null;
  triedIntentIds?: string[];
}): SideWishQueueCarrier {
  return {
    rankedQueue: state.rankedQueue ?? [],
    queueCursor: state.queueCursor ?? 0,
    passedIntentIds: state.passedIntentIds ?? [],
    shownIntentIds: state.shownIntentIds ?? state.triedIntentIds ?? [],
    matchIntentId: state.matchIntentId ?? null,
  };
}
