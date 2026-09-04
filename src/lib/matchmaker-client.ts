import type { MatchmakerState } from "./agents/matchmaker";
import { matchmakerTurnFn } from "./api/data.functions";
import { listBlocked } from "./blocklist";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type {
  MatchmakerLang,
  MatchmakerStreamEvent,
  MatchmakerTurnAction,
  MatchmakerTurnOutput,
} from "./matchmaker-llm.server";
import { chatHistoryFromMessages } from "./handoff";
import { consumeNdjsonResponse } from "./ndjson-stream.client";

export async function requestMatchmakerTurn(opts: {
  lang: MatchmakerLang;
  action: MatchmakerTurnAction;
  userMessage?: string;
  state: MatchmakerState;
  seed?: string;
  onDelta?: (text: string) => void;
  /** Fired when chat reply is complete; extract/introduce may still be running. */
  onReady?: (opts: { reply: string; suggestions: string[] }) => void;
}): Promise<MatchmakerTurnOutput> {
  const history = chatHistoryFromMessages(opts.state.messages);

  const response = await matchmakerTurnFn({
    data: {
      lang: opts.lang,
      action: opts.action,
      userMessage: opts.userMessage,
      seed: opts.seed,
      history,
      understanding: opts.state.understanding,
      hardFilters: opts.state.hardFilters ?? EMPTY_HARD_FILTERS,
      currentPersonId: opts.state.currentPersonId,
      shownIds: opts.state.shownIds,
      passedIds: opts.state.passedIds,
      handoffCount: opts.state.handoffCount ?? 0,
      handoffSummary: opts.state.handoff?.summary,
      pendingMatchConfirm: opts.state.pendingMatchConfirm ?? null,
      pendingRematchConfirm: opts.state.pendingRematchConfirm ?? null,
      rankedQueue: opts.state.rankedQueue ?? [],
      queueCursor: opts.state.queueCursor ?? 0,
      queueFingerprint: opts.state.queueFingerprint ?? null,
      userBlocklist: listBlocked(),
    },
  });

  if (!(response instanceof Response)) {
    throw new Error("matchmaker turn expected streaming Response");
  }

  let result: MatchmakerTurnOutput | null = null;
  await consumeNdjsonResponse<MatchmakerStreamEvent>(response, (ev) => {
    if (ev.type === "delta") opts.onDelta?.(ev.text);
    else if (ev.type === "ready") opts.onReady?.(ev);
    else if (ev.type === "done") result = ev.result;
  });

  if (!result) throw new Error("matchmaker stream ended without result");
  return result;
}
