/**
 * Side people match — intro reply, person summary, why tags, hanging invite summary.
 */

import type { Person } from "./types";
import type { WishDraft } from "./wish-types";
import { chatCompletionJson, chatCompletionJsonStream } from "./llm.server";
import { selfVoiceRule } from "./agent-voice";
import { localized } from "./people";
import { buildActivityQuery } from "./side-people-recall";

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
  lang: SideLang;
  draft: WishDraft;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const isZh = zh(opts.lang);
  const activity = buildActivityQuery(opts.draft);
  const fallback = activity
    ? isZh
      ? `想找人一起：${activity}`
      : `Looking for a buddy for: ${activity}`
    : isZh
      ? "想找一起做事的搭子"
      : "Looking for an activity buddy";

  const system = isZh
    ? `根据对话，用一句中文总结用户想找什么样的活动搭子（做什么、大概时间/地点若有）。不要照抄原话堆砌，不要提「心愿池」。JSON：{"summary":"..."}`
    : `Summarize in one sentence what activity buddy the user wants. Do not dump raw quotes. JSON: {"summary":"..."}`;

  const recent = opts.history
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const parsed = await chatCompletionJson<HangJson>(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: isZh
          ? `【活动草稿】${activity || "（较少）"}\n【对话】\n${recent || "（无）"}`
          : `[Draft] ${activity || "(sparse)"}\n[Chat]\n${recent || "(none)"}`,
      },
    ],
    { temperature: 0.4, maxTokens: 120 },
  );
  return parsed?.summary?.trim() || fallback;
}

export async function runSidePersonIntro(opts: {
  lang: SideLang;
  person: Person;
  draft: WishDraft;
  rankReason?: string;
  onDelta?: (text: string) => void;
}): Promise<{ reply: string; personSummary: string; whyTags: string[] }> {
  const isZh = zh(opts.lang);
  const loc = localized(opts.person, opts.lang);
  const activity = buildActivityQuery(opts.draft);
  const brief = opts.person.personBrief
    ? isZh
      ? opts.person.personBrief.zh
      : opts.person.personBrief.en
    : loc.portrait || "";

  const fallbackTags = [activity.slice(0, 12)].filter(Boolean);
  const fallbackSummary = brief.slice(0, 80) || (isZh ? `${loc.name}，或许适合一起做事。` : `${loc.name} might be a good buddy.`);
  const fallbackReply = isZh
    ? `我帮你找到了 ${loc.name}。${fallbackSummary} 详情在右边，感兴趣可以聊聊。`
    : `I found ${loc.name}. ${fallbackSummary} Details on the right — say hi if it feels right.`;

  const system = isZh
    ? `你在 Maitri 帮用户找一起做活动的搭子。根据【对方资料】与【用户活动】输出 JSON：
- reply：2-5 句，介绍这位搭子，邀请看右边卡片。禁止说「心愿池」「发布心愿」。
- personSummary：2-3 句，AI 对这个人的客观总结（不是「为什么匹配」）。
- whyTags：2-4 个短标签（每条≤12字），说明为什么适合这个活动邀约，例如「都想周末看展」。
${selfVoiceRule(true)}
JSON：{"reply":"...","personSummary":"...","whyTags":["..."]}`
    : `Help find an activity buddy. JSON:
- reply: 2-5 sentences introducing them; invite the right card. Never say wish pool.
- personSummary: 2-3 sentences — who they are (not match why).
- whyTags: 2-4 short chips (≤8 words) why they fit this activity invite.
${selfVoiceRule(false)}
JSON: {"reply":"...","personSummary":"...","whyTags":["..."]}`;

  const user = isZh
    ? `【用户活动】${activity || "（未写清）"}
【对方】${loc.name} · ${loc.city} · ${opts.person.occupation_zh || opts.person.occupation}
【简介】${brief}
【排序理由】${opts.rankReason?.trim() || "（无）"}`
    : `[Activity] ${activity || "(sparse)"}
[Person] ${loc.name} · ${loc.city} · ${opts.person.occupation}
[Brief] ${brief}
[Rank reason] ${opts.rankReason?.trim() || "(none)"}`;

  let value: IntroJson | null = null;
  if (opts.onDelta) {
    for await (const ev of chatCompletionJsonStream<IntroJson>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.75, maxTokens: 500 },
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
      { temperature: 0.75, maxTokens: 500 },
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
  const isZh = zh(opts.lang);
  const activity = buildActivityQuery(opts.draft);
  if (isZh) {
    return `按现在的条件（${opts.hangSummary || activity || "你的活动邀约"}），暂时还没有合适的搭子。我先把这条邀约挂在右边——之后会继续帮你留意，对上了会直接显示在这里。也可以撤回后改条件再试。`;
  }
  return `No good buddy yet for (${opts.hangSummary || activity || "your invite"}). I'll keep it on the right and keep looking — when someone's a fit they'll show up here. You can also revoke and tweak.`;
}
