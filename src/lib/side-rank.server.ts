import { chatCompletionJson } from "./llm.server";
import type { Intent } from "./intents";
import { rosterFromIntentIds } from "./wish-recall";
import type { RecalledWish } from "./wish-recall";
import { log } from "./logger.server";
import { mergeRankedIds, SIDE_WISH_QUEUE_LIMIT } from "./side-queue";
import type { SideLang } from "./wish-types";
import type { UserUnderstanding } from "./understanding";

export interface RankSideWishInput {
  lang: SideLang;
  mine: Intent;
  candidates: RecalledWish[];
  understanding: UserUnderstanding;
}

export interface RankSideWishOutput {
  rankedIds: string[];
  recallEmpty: boolean;
}

interface LlmRankJson {
  rankedIds?: string[];
}

function zh(lang: SideLang): boolean {
  return lang === "zh-CN";
}

export async function runSideWishRank(input: RankSideWishInput): Promise<RankSideWishOutput> {
  const recallIds = input.candidates.map((c) => c.id).slice(0, SIDE_WISH_QUEUE_LIMIT);
  if (recallIds.length === 0) {
    return { rankedIds: [], recallEmpty: true };
  }

  const roster = rosterFromIntentIds(recallIds, input.lang, new Set());
  const mineWish = zh(input.lang)
    ? input.mine.rawText_zh || input.mine.rawText
    : input.mine.rawText;
  const u = input.understanding;
  const mem = [
    u.positive.length ? `偏好：${u.positive.join("、")}` : "",
    u.negative.length ? `避免：${u.negative.join("、")}` : "",
    u.notes.length ? `备注：${u.notes.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system = zh(input.lang)
    ? `你是 Maitri Side by Side 的心愿排序器。根据用户搜索/心愿条件，把池子里的活动心愿从最合适到较弱排序。
只能使用下方列表里的 id，不要编造 id。尽量保留列表中的全部 id（除非明显不符合）。
输出 JSON：{"rankedIds":["id1","id2",...]}，最贴切排最前。`
    : `You rank activity wishes in Maitri Side by Side. Order the pool from best fit to weaker fit for the user's search/wish.
Use only ids from the list below — no invented ids. Include every listed id unless clearly wrong.
JSON only: {"rankedIds":["id1","id2",...]} best first.`;

  const user = [
    `用户条件/心愿：${mineWish || "(empty)"}`,
    mem ? `补充：\n${mem}` : "",
    `候选心愿（共 ${recallIds.length} 条）：\n${roster}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const parsed = await chatCompletionJson<LlmRankJson>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.35, maxTokens: 800 },
    );
    const ranked = mergeRankedIds(parsed?.rankedIds ?? [], recallIds);
    log.info("side-by-side", "ranked wish queue", { count: ranked.length, top: ranked[0] });
    return { rankedIds: ranked, recallEmpty: ranked.length === 0 };
  } catch (e) {
    log.warn("side-by-side", "wish rank failed, using recall order", e);
    return { rankedIds: recallIds, recallEmpty: false };
  }
}
