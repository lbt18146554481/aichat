import { orchestratorTurnFn, detectHandoffFn } from "./api/data.functions";
import type { AgentId } from "./seed";
import type { OrchestratorOutput, OrchestratorStreamEvent } from "./orchestrator-llm.server";
import type { DetectHandoffOutput } from "./handoff-detect.server";
import { consumeNdjsonResponse } from "./ndjson-stream-consume";

export async function requestOrchestratorTurn(opts: {
  lang: "en" | "zh-CN";
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  forcedTarget?: AgentId | null;
  onDelta?: (text: string) => void;
}): Promise<OrchestratorOutput> {
  const response = await orchestratorTurnFn({
    data: {
      lang: opts.lang,
      userMessage: opts.userMessage,
      history: opts.history,
      forcedTarget: opts.forcedTarget ?? null,
    },
  });

  if (!(response instanceof Response)) {
    throw new Error("orchestrator turn expected streaming Response");
  }

  let result: OrchestratorOutput | null = null;
  await consumeNdjsonResponse<OrchestratorStreamEvent>(response, (ev) => {
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
  const empty: DetectHandoffOutput = {
    handoffTo: null,
    askRevokeWish: false,
    transitionReply: "",
    summary: "",
    needsClarify: false,
    clarifyReply: "",
  };
  const timeoutMs = 8_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      detectHandoffFn({ data: opts }),
      new Promise<DetectHandoffOutput>((resolve) => {
        timer = setTimeout(() => resolve(empty), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
