/**
 * Side people match — intro reply, person summary, why tags, hanging invite summary.
 */

import type { Person } from "./types";
import type { WishDraft } from "./wish-types";
import { chatCompletionJson, chatCompletionJsonStream } from "./llm.server";
import { selfVoiceRule } from "./agent-voice";
import { localized } from "./people";
import { buildActivityQuery } from "./side-people-recall";
import { llmReplyLanguageRule } from "./lang";

export type SideLang = "en" | "zh-CN";

function zh(lang: SideLang) {
  return lang === "zh-CN";
}

interface IntroJson {
  reply?: string;
  personSummary?: string;
  whyTags?: string[];
}

interface HangJson {
  summary?: string;
}

export async function runSideHangInviteSummary(opts: {
  /** User-writing language for the summary (not UI locale). */
  lang: SideLang;
  draft: WishDraft;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const replyLang = opts.lang;
  const activity = buildActivityQuery(opts.draft);
  const fallback = activity
    ? zh(replyLang)
      ? `想找人一起：${activity}`
      : `Looking for a buddy for: ${activity}`
    : zh(replyLang)
      ? "想找一起做事的搭子"
      : "Looking for an activity buddy";

  const system = `根据对话，用一句话总结用户想找什么样的活动搭子（做什么、大概时间/地点若有）。不要照抄原话堆砌，不要提「心愿池」。
${llmReplyLanguageRule(replyLang)}
JSON：{"summary":"..."}`;

  const recent = opts.history
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const parsed = await chatCompletionJson<HangJson>(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `【活动草稿】${activity || "（较少）"}\n【对话】\n${recent || "（无）"}`,
      },
    ],
    { temperature: 0.4, maxTokens: 120 },
  );
  return parsed?.summary?.trim() || fallback;
}

export async function runSidePersonIntro(opts: {
  /** User-writing language for reply / personSummary / whyTags (not UI locale). */
  lang: SideLang;
  person: Person;
  draft: WishDraft;
  rankReason?: string;
  onDelta?: (text: string) => void;
}): Promise<{ reply: string; personSummary: string; whyTags: string[] }> {
  const replyLang = opts.lang;
  const loc = localized(opts.person, replyLang);
  const activity = buildActivityQuery(opts.draft);
  const brief = opts.person.personBrief
    ? zh(replyLang)
      ? opts.person.personBrief.zh
      : opts.person.personBrief.en
    : loc.portrait || "";
  const profileText = (opts.person.profileText || "").trim().slice(0, 280);

  const fallbackTags = [activity.slice(0, 12)].filter(Boolean);
  const fallbackSummary =
    brief.slice(0, 80) ||
    (zh(replyLang) ? `${loc.name}，或许适合一起做事。` : `${loc.name} might be a good buddy.`);
  const fallbackReply = zh(replyLang)
    ? `我帮你找到了 ${loc.name}。${fallbackSummary} 详情在右边，感兴趣可以聊聊。`
    : `I found ${loc.name}. ${fallbackSummary} Details on the right — say hi if it feels right.`;

  const system = `你在 Maitri 帮用户找一起做活动的搭子。根据给定字段写 JSON。
- reply：2-5 句。先讲对方是谁、资料里和这次邀约相关的点，再说明为何适合【用户活动】这场邀约，并请用户看右边卡片。【用户活动】是「想一起做的事」，介绍时以对方为主，用「她/他喜欢…，适合一起…」这类说法。
- personSummary：2-3 句，概括对方资料里已有的身份与兴趣。
- whyTags：2-4 个短标签（≤12字），写法像对方的特质/习惯，例如「爱徒步」「常跑步」——写「对方为什么合适」，不要写成双方共同点。只选资料里站得住的点；没有把握就少给或 []。
${selfVoiceRule(true)}
${llmReplyLanguageRule(replyLang)}
JSON：{"reply":"...","personSummary":"...","whyTags":["..."]}`;

  const user = `【用户活动】${activity || "（未写清）"}
【对方】${loc.name} · ${loc.city} · ${opts.person.occupation_zh || opts.person.occupation}
【简介】${brief || "（无）"}
【资料原文】${profileText || "（无）"}
【排序理由】${opts.rankReason?.trim() || "（无）"}`;

  let value: IntroJson | null = null;
  if (opts.onDelta) {
    for await (const ev of chatCompletionJsonStream<IntroJson>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.55, maxTokens: 500 },
    )) {
      if (ev.type === "delta") opts.onDelta(ev.text);
      else if (ev.type === "done") value = ev.value;
    }
  } else {
    value = await chatCompletionJson<IntroJson>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.55, maxTokens: 500 },
    );
  }

  const whyTags = (value?.whyTags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    reply: value?.reply?.trim() || fallbackReply,
    personSummary: value?.personSummary?.trim() || fallbackSummary,
    whyTags: whyTags.length ? whyTags : fallbackTags,
  };
}

export async function runSideEmptyPeopleReply(opts: {
  lang: SideLang;
  draft: WishDraft;
  hangSummary: string;
}): Promise<string> {
  const replyLang = opts.lang;
  const activity = buildActivityQuery(opts.draft);
  const system = `用户暂时没匹配到一起做事的搭子。用 2-3 句说明：按当前邀约暂时没合适的人；邀约会留在右边继续留意；也可撤回后改条件。
${llmReplyLanguageRule(replyLang)}
JSON：{"reply":"..."}`;
  const parsed = await chatCompletionJson<{ reply?: string }>(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `【活动】${activity || "（较少）"}\n【挂起摘要】${opts.hangSummary || "（无）"}`,
      },
    ],
    { temperature: 0.5, maxTokens: 200 },
  );
  if (parsed?.reply?.trim()) return parsed.reply.trim();
  if (zh(replyLang)) {
    return `按现在的条件（${opts.hangSummary || activity || "你的活动邀约"}），暂时还没有合适的搭子。我先把这条邀约挂在右边——之后会继续帮你留意，对上了会直接显示在这里。也可以撤回后改条件再试。`;
  }
  return `No good buddy yet for (${opts.hangSummary || activity || "your invite"}). I'll keep it on the right and keep looking — when someone's a fit they'll show up here. You can also revoke and tweak.`;
}
