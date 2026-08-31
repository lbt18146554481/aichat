import type { MatchmakerState } from "./agents/matchmaker";
import { matchmakerTurnFn } from "./api/data.functions";
import type {
  MatchmakerLang,
  MatchmakerStreamEvent,
  MatchmakerTurnAction,
  MatchmakerTurnOutput,
} from "./matchmaker-llm.server";
import { EMPTY_HARD_FILTERS } from "./match-types";
import { consumeEventStream } from "./stream-client";

export async function requestMatchmakerTurn(opts: {
  lang: MatchmakerLang;
  action: MatchmakerTurnAction;
  userMessage?: string;
  state: MatchmakerState;
  seed?: string;
  onDelta?: (text: string) => void;
}): Promise<MatchmakerTurnOutput> {
  const history = opts.state.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.text }));

  const stream = await matchmakerTurnFn({
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
    },
  });

  let result: MatchmakerTurnOutput | null = null;
  await consumeEventStream(stream as ReadableStream<MatchmakerStreamEvent>, (ev) => {
    if (ev.type === "delta") opts.onDelta?.(ev.text);
    else if (ev.type === "done") result = ev.result;
  });

  if (!result) throw new Error("matchmaker stream ended without result");
  return result;
}
