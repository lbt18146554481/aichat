import type { SideState } from "./agents/side-by-side";
import { sideBySideTurnFn } from "./api/data.functions";
import type { SideStreamEvent, SideTurnAction, SideTurnOutput } from "./side-llm.server";
import { EMPTY_WISH_HARD_FILTERS, emptyWishDraft, EMPTY_BUDDY_HARD_FILTERS } from "./wish-types";
import { consumeNdjsonResponse } from "./ndjson-stream-consume";
import { chatHistoryFromMessages } from "./handoff";

export async function requestSideBySideTurn(opts: {
  lang: "en" | "zh-CN";
  action: SideTurnAction;
  userMessage?: string;
  seed?: string;
  preferredTrait?: string;
  state: SideState;
  onDelta?: (text: string) => void;
  onReady?: (opts: { reply: string; suggestions: string[] }) => void;
  onMatching?: () => void;
  onMatchReady?: (preview: import("./side-llm.server").SideMatchPreview) => void;
  onFollowUpDelta?: (text: string) => void;
  onFollowUpReady?: (opts: { reply: string; suggestions: string[] }) => void;
}): Promise<SideTurnOutput> {
  const history = chatHistoryFromMessages(opts.state.messages);

  const response = await sideBySideTurnFn({
    data: {
      lang: opts.lang,
      action: opts.action,
      userMessage: opts.userMessage,
      seed: opts.seed,
      preferredTrait: opts.preferredTrait,
      history,
      understanding: opts.state.understanding ?? {
        positive: [],
        negative: [],
        notes: [],
        traits: [],
        interests: [],
        occupation: [],
        pace: [],
      },
      hardFilters: opts.state.hardFilters ?? EMPTY_WISH_HARD_FILTERS,
      buddyHardFilters: opts.state.buddyHardFilters ?? EMPTY_BUDDY_HARD_FILTERS,
      wishDraft: opts.state.wishDraft ?? emptyWishDraft(),
      pendingConfirm: opts.state.pendingConfirm ?? null,
      pendingBrowseConfirm: opts.state.pendingBrowseConfirm ?? null,
      pendingMatchConfirm: opts.state.pendingMatchConfirm ?? null,
      pendingOfferMatch: opts.state.pendingOfferMatch ?? false,
      wishLane: opts.state.wishLane ?? "unset",
      browseSearched: opts.state.browseSearched ?? false,
      myIntentId: opts.state.myIntentId,
      matchIntentId: opts.state.matchIntentId,
      triedIntentIds: opts.state.triedIntentIds ?? [],
      triedOwnerIds: opts.state.triedOwnerIds ?? [],
      rankedQueue: opts.state.rankedQueue ?? [],
      queueCursor: opts.state.queueCursor ?? 0,
      queueFingerprint: opts.state.queueFingerprint ?? null,
      passedIntentIds: opts.state.passedIntentIds ?? [],
      shownIntentIds: opts.state.shownIntentIds ?? opts.state.triedIntentIds ?? [],
      handoffCount: opts.state.handoffCount ?? 0,
      handoffSummary: opts.state.handoff?.summary,
      handoffHints: opts.state.handoff?.sideBySideHints,
    },
  });

  if (!(response instanceof Response)) {
    throw new Error("side-by-side turn expected streaming Response");
  }

  let result: SideTurnOutput | null = null;
  await consumeNdjsonResponse<SideStreamEvent>(response, (ev) => {
    if (ev.type === "delta") opts.onDelta?.(ev.text);
    else if (ev.type === "ready") opts.onReady?.(ev);
    else if (ev.type === "matching") opts.onMatching?.();
    else if (ev.type === "matchReady") opts.onMatchReady?.(ev.preview);
    else if (ev.type === "followUpDelta") opts.onFollowUpDelta?.(ev.text);
    else if (ev.type === "followUpReady") opts.onFollowUpReady?.(ev);
    else if (ev.type === "done") result = ev.result;
  });

  if (!result) throw new Error("side-by-side stream ended without result");
  return result;
}
