import { chatCompletionJson } from "./llm.server";
import { rosterFromIds, recallCandidates } from "./match-recall";
import type { MatchHardFilters, MatchmakerLang } from "./match-types";
import type { Person } from "./types";
import type { UserUnderstanding } from "./understanding";
import { log } from "./logger.server";
import {
  MATCH_QUEUE_LIMIT,
  mergeRankedIds,
  recallQueueIds,
} from "./matchmaker-queue";

export interface RankMatchmakerInput {
  lang: MatchmakerLang;
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  pool: Person[];
}

export interface RankMatchmakerOutput {
  rankedIds: string[];
  recallEmpty: boolean;
}

interface LlmRankJson {
  rankedIds?: string[];
}

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

export async function runMatchmakerRank(
  input: RankMatchmakerInput,
): Promise<RankMatchmakerOutput> {
  const { ids: recallIds, empty } = recallQueueIds({
    understanding: input.understanding,
    hardFilters: input.hardFilters,
    blockedIds: input.blockedIds,
    shownIds: input.shownIds,
    passedIds: input.passedIds,
  });

  if (recallIds.length === 0) {
    return { rankedIds: [], recallEmpty: empty };
  }

  const roster = rosterFromIds(recallIds, input.lang, new Set(input.blockedIds), input.pool);
  const u = input.understanding;
  const mem = [
    u.positive.length ? `wants in others: ${u.positive.join(", ")}` : "",
    u.negative.length ? `avoids: ${u.negative.join(", ")}` : "",
    u.notes.length ? `notes: ${u.notes.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system = zh(input.lang)
    ? `你是 Maitri 的匹配排序器。根据用户对「想认识什么样的人」的偏好，把候选人从最合适到较不合适排序。
只能使用下方候选人列表里的 id，必须全部来自列表，不要编造 id，不要遗漏列表里的 id（除非明显不符合硬条件）。
输出 JSON：{"rankedIds":["id1","id2",...]}，最贴切排最前。`
    : `You rank matchmaker candidates for Maitri. Order the pool from best fit to weaker fit for who the user wants to meet.
Use only ids from the candidate list below — no invented ids. Include every listed id unless clearly wrong.
JSON only: {"rankedIds":["id1","id2",...]} best first.`;

  const user = [
    mem ? `用户偏好：\n${mem}` : "用户偏好：较少",
    `候选人（共 ${recallIds.length} 位）：\n${roster}`,
  ].join("\n\n");

  try {
    const parsed = await chatCompletionJson<LlmRankJson>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.35, maxTokens: 800 },
    );

    const ranked = mergeRankedIds(parsed?.rankedIds ?? [], recallIds);
    log.info("matchmaker", "ranked queue", { count: ranked.length, top: ranked[0] });
    return { rankedIds: ranked, recallEmpty: empty };
  } catch (e) {
    log.warn("matchmaker", "rank fallback to recall order", e);
    return { rankedIds: recallIds, recallEmpty: empty };
  }
}

/** @internal for tests */
export function recallOrderFallback(input: RankMatchmakerInput): string[] {
  const recall = recallCandidates({ ...input, limit: MATCH_QUEUE_LIMIT });
  return recall.candidates.map((c) => c.id);
}
