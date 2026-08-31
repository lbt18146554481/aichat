import { orchestratorTurnFn, detectHandoffFn } from "./api/data.functions";
import type { AgentId } from "./seed";
import type { OrchestratorOutput, OrchestratorStreamEvent } from "./orchestrator-llm.server";
import type { DetectHandoffOutput } from "./handoff-detect.server";
import { consumeEventStream } from "./stream-client";

export async function requestOrchestratorTurn(opts: {
  lang: "en" | "zh-CN";
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  forcedTarget?: AgentId | null;
  onDelta?: (text: string) => void;
}): Promise<OrchestratorOutput> {
  const stream = await orchestratorTurnFn({
    data: {
      lang: opts.lang,
      userMessage: opts.userMessage,
      history: opts.history,
      forcedTarget: opts.forcedTarget ?? null,
    },
  });

  let result: OrchestratorOutput | null = null;
  await consumeEventStream(stream as ReadableStream<OrchestratorStreamEvent>, (ev) => {
    if (ev.type === "delta") opts.onDelta?.(ev.text);
    else if (ev.type === "done") result = ev.result;
  });

  if (!result) {
    throw new Error("orchestrator stream ended without result");
  }
  return result;
}

export async function requestDetectHandoff(opts: {
  lang: "en" | "zh-CN";
  currentAgent: "matchmaker" | "sidebyside";
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  handoffCount: number;
}): Promise<DetectHandoffOutput> {
  return detectHandoffFn({ data: opts });
}
