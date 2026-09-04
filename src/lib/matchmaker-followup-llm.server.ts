import { chatCompletionJson } from "./llm.server";
import { buildReasons, buildIntroduceReply, type Reason } from "./match-reasons";
import type { MatchHardFilters, MatchmakerLang } from "./match-types";
import type { Person } from "./types";
import type { Profile } from "./profile";
import type { UserUnderstanding } from "./understanding";
import { localized } from "./people";
import { selfVoiceRule } from "./agent-voice";

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

interface FollowupJson {
  reply?: string;
}

async function runFollowup(
  system: string,
  user: string,
  fallback: string,
): Promise<string> {
  const parsed = await chatCompletionJson<FollowupJson>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.75, maxTokens: 400 },
  );
  const reply = parsed?.reply?.trim();
  return reply || fallback;
}

/** Evidence bundle for the intro model — same sources as the right-pane "why" block. */
export function formatReasonsForPrompt(
  reasons: Reason[],
  person: Person,
  lang: MatchmakerLang,
): string {
  if (reasons.length === 0) return zh(lang) ? "（暂无可靠匹配依据）" : "(no traceable match evidence yet)";
  const name = localized(person, lang).name;
  const isZh = zh(lang);
  return reasons
    .map((r, i) => {
      if (r.kind === "favorite") {
        return isZh
          ? `${i + 1}. 共同收藏：《${r.title}》`
          : `${i + 1}. Shared favorite: “${r.title}”`;
      }
      if (r.kind === "values") {
        return isZh
          ? `${i + 1}. ${name} 的 values 回答（${r.prompt}）：「${r.theirs}」`
          : `${i + 1}. ${name}'s values answer (${r.prompt}): “${r.theirs}”`;
      }
      return isZh
        ? `${i + 1}. 用户说过「${r.yours}」↔ ${name} 写过「${r.theirs}」`
        : `${i + 1}. User said “${r.yours}” ↔ ${name} wrote “${r.theirs}”`;
    })
    .join("\n");
}

export async function runMatchmakerIntroReply(opts: {
  lang: MatchmakerLang;
  person: Person;
  profile: Profile;
  understanding: UserUnderstanding;
}): Promise<string> {
  const isZh = zh(opts.lang);
  const loc = localized(opts.person, opts.lang);
  const reasons = buildReasons(opts.person, opts.profile, opts.understanding, opts.lang);
  const evidence = formatReasonsForPrompt(reasons, opts.person, opts.lang);
  const fallback = buildIntroduceReply(
    opts.person,
    opts.profile,
    opts.understanding,
    opts.lang,
  );

  const system = isZh
    ? `你是 Maitri，刚为用户选好一位要认识的人。写 2-4 句简体中文介绍 TA，并自然说明「为什么是 TA」。
只能使用下方【匹配依据】里的事实，不要编造共同点。没有依据时诚实说还在试探匹配，请用户看右边或补充偏好。
不要提 AI。${selfVoiceRule(true)}
只输出 JSON：{"reply":"..."}`
    : `You are Maitri introducing someone the user may want to meet. Write 2-4 warm sentences and explain why they might fit.
Use ONLY facts from [Match evidence] — do not invent overlaps. If evidence is thin, say so and point to the right pane.
${selfVoiceRule(false)}
JSON only: {"reply":"..."}`;

  const user = isZh
    ? `【人选】${loc.name}，${opts.person.age}岁，${loc.city}，${loc.occupation}
【用户想找的人（摘要）】${[...opts.understanding.positive, ...opts.understanding.notes].join("；") || "较少"}
【匹配依据】
${evidence}`
    : `[Person] ${loc.name}, ${opts.person.age}, ${loc.city}, ${loc.occupation}
[What user wants] ${[...opts.understanding.positive, ...opts.understanding.notes].join("; ") || "sparse"}
[Match evidence]
${evidence}`;

  return runFollowup(system, user, fallback);
}

export async function runMatchmakerEmptyReply(opts: {
  lang: MatchmakerLang;
  facts: string;
}): Promise<string> {
  const isZh = zh(opts.lang);
  const fallback = opts.facts;

  const system = isZh
    ? `你是 Maitri。用户已确认开始找，但当前条件下没有可介绍的人。
用 2-3 句简体中文说明情况，并建议怎么放宽；数字和事实必须与【统计事实】完全一致，不要改人数。
${selfVoiceRule(true)}
JSON：{"reply":"..."}`
    : `You are Maitri. User confirmed search but no one fits.
Explain in 2-3 sentences; counts in [Facts] must be exact.
${selfVoiceRule(false)}
JSON: {"reply":"..."}`;

  const user = isZh ? `【统计事实】\n${opts.facts}` : `[Facts]\n${opts.facts}`;
  return runFollowup(system, user, fallback);
}

export async function runMatchmakerClarifyCapReply(opts: {
  lang: MatchmakerLang;
  recapFacts: string;
}): Promise<string> {
  const isZh = zh(opts.lang);
  const fallback = isZh
    ? `${opts.recapFacts}没有的话我就按这些开始帮你找。`
    : `${opts.recapFacts} If not, I'll start searching with this.`;

  const system = isZh
    ? `你是 Maitri。追问已够多轮，请复述目前已知的找人偏好，并问用户还有没有其他要求；不要继续追问新细节。
必须包含【已知偏好】里的要点；语气自然，2-4 句。${selfVoiceRule(true)}
JSON：{"reply":"..."}`
    : `You are Maitri. Recap what you know about who they want and ask if anything else; no new questions.
Include points from [Known prefs]. 2-4 sentences. ${selfVoiceRule(false)}
JSON: {"reply":"..."}`;

  const user = isZh ? `【已知偏好】\n${opts.recapFacts}` : `[Known prefs]\n${opts.recapFacts}`;
  return runFollowup(system, user, fallback);
}

export async function runMatchmakerQueueExhaustedReply(opts: {
  lang: MatchmakerLang;
  filterSummary: string;
}): Promise<string> {
  const isZh = zh(opts.lang);
  const fallback = isZh
    ? `按你现在的条件（${opts.filterSummary}），我这边暂时就这些了。要不放宽一下其中一条，我们再找？`
    : `That's everyone for (${opts.filterSummary}). Want to loosen a filter and search again?`;

  const system = isZh
    ? `你是 Maitri。用户已浏览完当前队列里符合硬条件的人。
用 1-2 句说明暂时没有更多合适人选，并自然建议放宽哪类条件（年龄/城市/性别/学历）。${selfVoiceRule(true)}
JSON：{"reply":"..."}`
    : `You are Maitri. The ranked queue is exhausted for current filters.
1-2 sentences; suggest loosening a filter. ${selfVoiceRule(false)}
JSON: {"reply":"..."}`;

  const user = isZh
    ? `【当前硬条件】${opts.filterSummary}`
    : `[Hard filters] ${opts.filterSummary}`;

  return runFollowup(system, user, fallback);
}
