import type { SideState } from "./agents/side-by-side";
import { sideBySideTurnFn } from "./api/data.functions";
import type { SideStreamEvent, SideTurnAction, SideTurnOutput } from "./side-llm.server";
import { EMPTY_WISH_HARD_FILTERS, emptyWishDraft } from "./wish-types";
import { consumeEventStream } from "./stream-client";

export async function requestSideBySideTurn(opts: {
  lang: "en" | "zh-CN";
  action: SideTurnAction;
  userMessage?: string;
  seed?: string;
  preferredTrait?: string;
  state: SideState;
  onDelta?: (text: string) => void;
}): Promise<SideTurnOutput> {
  const history = opts.state.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.text }));

  const stream = await sideBySideTurnFn({
    data: {
      lang: opts.lang,
      action: opts.action,
      userMessage: opts.userMessage,
      seed: opts.seed,
      preferredTrait: opts.preferredTrait,
      history,
      understanding: opts.state.understanding ?? { positive: [], negative: [], notes: [] },
      hardFilters: opts.state.hardFilters ?? EMPTY_WISH_HARD_FILTERS,
      wishDraft: opts.state.wishDraft ?? emptyWishDraft(),
      pendingConfirm: opts.state.pendingConfirm ?? null,
      myIntentId: opts.state.myIntentId,
      matchIntentId: opts.state.matchIntentId,
      triedIntentIds: opts.state.triedIntentIds ?? [],
      triedOwnerIds: opts.state.triedOwnerIds ?? [],
      handoffCount: opts.state.handoffCount ?? 0,
      handoffSummary: opts.state.handoff?.summary,
      handoffHints: opts.state.handoff?.sideBySideHints,
    },
  });

  let result: SideTurnOutput | null = null;
  await consumeEventStream(stream as ReadableStream<SideStreamEvent>, (ev) => {
    if (ev.type === "delta") opts.onDelta?.(ev.text);
    else if (ev.type === "done") result = ev.result;
  });

  if (!result) throw new Error("side-by-side stream ended without result");
  return result;
}
