import { chatCompletionJson } from "./llm.server";
import { buildReasons, buildIntroduceReply, type Reason } from "./match-reasons";
import type { MatchmakerLang } from "./match-types";
import type { Person } from "./types";
import type { Profile } from "./profile";
import type { UserUnderstanding } from "./understanding";
import { localized } from "./people";
import {
  composerSuggestionsRule,
  fallbackComposerSuggestions,
  normalizeComposerSuggestions,
  selfVoiceRule,
} from "./agent-voice";
import { llmReplyLanguageRule } from "./lang";

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

interface FollowupJson {
  reply?: string;
  suggestions?: string[];
}

export type MatchmakerFollowup = {
  reply: string;
  suggestions: string[];
};

async function runFollowup(
  system: string,
  user: string,
  fallback: string,
  suggestionFallback: string[],
): Promise<MatchmakerFollowup> {
  const parsed = await chatCompletionJson<FollowupJson>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.75, maxTokens: 450 },
  );
  const reply = parsed?.reply?.trim() || fallback;
  const suggestions = normalizeComposerSuggestions(parsed?.suggestions, suggestionFallback);
  return { reply, suggestions };
}

/** Evidence bundle for the intro model — same sources as the right-pane "why" block. */
export function formatReasonsForPrompt(
  reasons: Reason[],
  person: Person,
  lang: MatchmakerLang,
): string {
  if (reasons.length === 0) return "（暂无可靠匹配依据）";
  const name = localized(person, lang).name;
  return reasons
    .map((r, i) => {
      if (r.kind === "favorite") {
        return `${i + 1}. 共同收藏：《${r.title}》`;
      }
      if (r.kind === "values") {
        return `${i + 1}. ${name} 的 values 回答（${r.prompt}）：「${r.theirs}」`;
      }
      return `${i + 1}. 用户说过「${r.yours}」↔ ${name} 写过「${r.theirs}」`;
    })
    .join("\n");
}

export async function runMatchmakerIntroReply(opts: {
  /** User-writing language for the reply (not UI locale). */
  lang: MatchmakerLang;
  person: Person;
  profile: Profile;
  understanding: UserUnderstanding;
  /** Rank-time reason for this person (preferred evidence). */
  cachedReason?: string;
}): Promise<MatchmakerFollowup> {
  const replyLang = opts.lang;
  const loc = localized(opts.person, replyLang);
  const reasons = buildReasons(opts.person, opts.profile, opts.understanding, replyLang);
  const structured = formatReasonsForPrompt(reasons, opts.person, replyLang);
  const cached = opts.cachedReason?.trim() ?? "";
  const evidence = cached
    ? `排序理由：${cached}${reasons.length ? `\n补充依据：\n${structured}` : ""}`
    : structured;
  const fallback = cached
    ? zh(replyLang)
      ? `先介绍 ${loc.name}（${opts.person.age}岁，${loc.city}）。${cached}更多在右边。`
      : `Meet ${loc.name} (${opts.person.age}, ${loc.city}). ${cached} More on the right.`
    : buildIntroduceReply(
        opts.person,
        opts.profile,
        opts.understanding,
        replyLang,
      );

  const system = `你是 Maitri，刚为用户选好一位要认识的人。写 2-4 句介绍 TA，并自然说明「为什么是 TA」。
只能使用下方【匹配依据】里的事实，不要编造共同点。
写「为什么合适」时：只点出对方身上的具体点，不要复述用户已知的需求（不要说「你想要开朗，TA 也开朗」）。
没有依据时诚实说还在试探匹配，请用户看右边或补充偏好。
不要提 AI。${selfVoiceRule(true)}
${composerSuggestionsRule()}
${llmReplyLanguageRule(replyLang)}
输出 JSON：{"reply":"...","suggestions":["短句1","短句2","短句3"]}`;

  const want = [
    ...(opts.understanding.traits ?? []),
    ...(opts.understanding.interests ?? []),
    ...(opts.understanding.occupation ?? []),
    ...(opts.understanding.pace ?? []),
    ...opts.understanding.positive,
    ...opts.understanding.notes,
  ]
    .filter(Boolean)
    .join("；");

  const user = `【人选】${loc.name}，${opts.person.age}岁，${loc.city}，${loc.occupation}
【用户想找的人（摘要）】${want || "较少"}
【匹配依据】
${evidence}`;

  return runFollowup(
    system,
    user,
    fallback,
    fallbackComposerSuggestions("afterIntro", replyLang),
  );
}

export async function runMatchmakerEmptyReply(opts: {
  lang: MatchmakerLang;
  facts: string;
}): Promise<MatchmakerFollowup> {
  const replyLang = opts.lang;
  const fallback = opts.facts;

  const system = `你是 Maitri。用户已确认开始找，但当前条件下没有可介绍的人。
用 2-3 句说明情况，并建议怎么放宽；数字和事实必须与【统计事实】完全一致，不要改人数。
${selfVoiceRule(true)}
${composerSuggestionsRule()}
${llmReplyLanguageRule(replyLang)}
JSON：{"reply":"...","suggestions":["短句1","短句2"]}`;

  const user = `【统计事实】\n${opts.facts}`;
  return runFollowup(
    system,
    user,
    fallback,
    fallbackComposerSuggestions("empty", replyLang),
  );
}

export async function runMatchmakerQueueExhaustedReply(opts: {
  lang: MatchmakerLang;
  filterSummary: string;
}): Promise<MatchmakerFollowup> {
  const replyLang = opts.lang;
  const fallback = zh(replyLang)
    ? `按你现在的条件（${opts.filterSummary}），我这边暂时就这些了。要不放宽一下其中一条，我们再找？`
    : `That's everyone for (${opts.filterSummary}). Want to loosen a filter and search again?`;

  const system = `你是 Maitri。用户已浏览完当前队列里符合硬条件的人。
用 1-2 句说明暂时没有更多合适人选，并自然建议放宽哪类条件（年龄/城市/性别/学历）。${selfVoiceRule(true)}
${composerSuggestionsRule()}
${llmReplyLanguageRule(replyLang)}
JSON：{"reply":"...","suggestions":["短句1","短句2"]}`;

  const user = `【当前硬条件】${opts.filterSummary}`;

  return runFollowup(
    system,
    user,
    fallback,
    fallbackComposerSuggestions("empty", replyLang),
  );
}
