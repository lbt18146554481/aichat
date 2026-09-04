import { getIntentById } from "./intents";
import { chatCompletionJson } from "./llm.server";
import type { SideLang } from "./wish-types";

export async function generateMatchReason(opts: {
  lang: SideLang;
  mineId: string;
  otherId: string;
  mine?: import("./intents").Intent;
}): Promise<string> {
  const mine = opts.mine ?? getIntentById(opts.mineId);
  const other = getIntentById(opts.otherId);
  if (!mine || !other) return "";

  const isZh = opts.lang === "zh-CN";
  const system = isZh
    ? `根据双方心愿原文写一句匹配理由（1句话）。只能引用给定字段，禁止编造人名以外的信息。只输出 JSON：{"reason":"..."}`
    : `Write one-sentence match reason from the given wish fields only. No invented facts. JSON: {"reason":"..."}`;

  const facts = isZh
    ? `我的心愿：${mine.rawText_zh || mine.rawText}
对方：${other.ownerName_zh}，${other.city_zh}，${other.rawText_zh || other.rawText}`
    : `My wish: ${mine.rawText}
Theirs: ${other.ownerName}, ${other.city}, ${other.rawText}`;

  const parsed = await chatCompletionJson<{ reason?: string }>(
    [
      { role: "system", content: system },
      { role: "user", content: facts },
    ],
    { temperature: 0.4, maxTokens: 120 },
  );

  return (parsed?.reason ?? "").trim();
}
