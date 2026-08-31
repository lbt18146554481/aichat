import { chatCompletionJson } from "./llm.server";
import { MAX_HANDOFF_COUNT } from "./handoff";

export interface DetectHandoffInput {
  lang: "en" | "zh-CN";
  currentAgent: "matchmaker" | "sidebyside";
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  handoffCount: number;
}

export interface DetectHandoffOutput {
  handoffTo: "matchmaker" | "sidebyside" | null;
  askRevokeWish: boolean;
  transitionReply: string;
  summary: string;
}

interface LlmJson {
  handoffTo?: "matchmaker" | "sidebyside" | null;
  askRevokeWish?: boolean;
  transitionReply?: string;
  summary?: string;
  confidence?: number;
}

export async function detectMidConversationHandoff(
  input: DetectHandoffInput,
): Promise<DetectHandoffOutput> {
  const empty: DetectHandoffOutput = {
    handoffTo: null,
    askRevokeWish: false,
    transitionReply: "",
    summary: "",
  };

  if (input.handoffCount >= MAX_HANDOFF_COUNT) return empty;

  const isZh = input.lang === "zh-CN";
  const other = input.currentAgent === "matchmaker" ? "sidebyside" : "matchmaker";
  const system = isZh
    ? `你在判断用户是否想切换 Agent。当前在 ${input.currentAgent}。
- matchmaker = 介绍人/认人
- sidebyside = 一起做事/约活动
只有用户明确想改方向时才 handoffTo="${other}"。犹豫或仍在当前话题 → handoffTo=null。
若从 sidebyside 切走且用户已发过心愿，askRevokeWish 可为 true。
JSON：{"handoffTo":null|"${other}","askRevokeWish":false,"transitionReply":"切换时对用户说的过渡句","summary":"新目标一句话","confidence":0-1}`
    : `Detect if the user wants to switch agents. Currently in ${input.currentAgent}.
matchmaker = meet someone; sidebyside = do an activity together.
Only set handoffTo="${other}" when they clearly want to change. Else null.
JSON: {"handoffTo":null|"${other}","askRevokeWish":false,"transitionReply":"...","summary":"...","confidence":0-1}`;

  const parsed = await chatCompletionJson<LlmJson>(
    [
      { role: "system", content: system },
      ...input.history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.userMessage },
    ],
    { temperature: 0.2, maxTokens: 400 },
  );

  if (!parsed) return empty;
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
  if (confidence < 0.7) return empty;
  if (parsed.handoffTo !== other) return empty;

  return {
    handoffTo: parsed.handoffTo,
    askRevokeWish: Boolean(parsed.askRevokeWish) && input.currentAgent === "sidebyside",
    transitionReply:
      (parsed.transitionReply ?? "").trim() ||
      (isZh
        ? parsed.handoffTo === "sidebyside"
          ? "好，那我们改成帮你找一起做事的搭子——"
          : "好，那我们改回帮你介绍人——"
        : parsed.handoffTo === "sidebyside"
          ? "Okay — let's find someone to do something with instead."
          : "Okay — let's go back to introducing someone."),
    summary: (parsed.summary ?? input.userMessage).trim(),
  };
}
