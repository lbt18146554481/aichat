import { chatCompletionJson } from "./llm.server";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { UserUnderstanding } from "./understanding";
import {
  mergePositiveBag,
  normalizeUnderstandingShape,
  softPrefLists,
} from "./understanding";
import {
  clampAge,
  normalizeCityList,
  normalizeEducationLevel,
  normalizeEducationLevels,
  normalizeGenders,
} from "./match-normalize";
import type { EducationLevel } from "./types";
import type { MatchmakerLang } from "./match-types";
import { parseStrength } from "./field-constraint";

export interface ExtractInput {
  lang: MatchmakerLang;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  prevUnderstanding: UserUnderstanding;
  prevHardFilters: MatchHardFilters;
}

export interface ExtractOutput {
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
}

interface LlmExtractJson {
  hardFilters?: {
    ageMin?: number | null;
    ageMax?: number | null;
    ageStrength?: string | null;
    genders?: string[];
    excludeGenders?: string[];
    genderStrength?: string | null;
    cities?: string[];
    excludeCities?: string[];
    cityStrength?: string | null;
    educationMin?: string | null;
    educationLevels?: string[];
    excludeEducationLevels?: string[];
    educationStrength?: string | null;
  };
  understanding?: {
    notes?: string[];
    likes?: string[];
    dislikes?: string[];
    traits?: string[];
    interests?: string[];
    occupation?: string[];
    pace?: string[];
  };
}

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

function listField(
  raw: string[] | undefined,
  prev: string[] | undefined,
  lim: number,
): string[] {
  if (raw === undefined) return (prev ?? []).map((s) => s.trim()).filter(Boolean).slice(0, lim);
  return raw.map((s) => s.trim()).filter(Boolean).slice(0, lim);
}

function normalizeUnderstanding(
  prev: UserUnderstanding,
  raw: LlmExtractJson["understanding"],
): UserUnderstanding {
  const prevN = normalizeUnderstandingShape(prev);
  if (!raw) return prevN;

  const traits = listField(raw.traits, prevN.traits, 12);
  const interests = listField(raw.interests, prevN.interests, 12);
  const occupation = listField(raw.occupation, prevN.occupation, 8);
  const pace = listField(raw.pace, prevN.pace, 8);
  const notes = listField(raw.notes, prevN.notes, 6).slice(-6);
  const negative = listField(raw.dislikes, prevN.negative, 12);

  // Legacy likes: keep when structured soft fields weren't sent this turn.
  const legacyLikes =
    raw.likes !== undefined
      ? raw.likes.map((s) => s.trim()).filter(Boolean)
      : softPrefLists(prevN).traits.length ||
          softPrefLists(prevN).interests.length ||
          softPrefLists(prevN).occupation.length ||
          softPrefLists(prevN).pace.length
        ? []
        : prevN.positive;

  const structuredEmpty =
    traits.length === 0 &&
    interests.length === 0 &&
    occupation.length === 0 &&
    pace.length === 0;

  // If LLM only filled likes, park leftovers in positive via merge.
  const positive = mergePositiveBag(
    { traits, interests, occupation, pace },
    structuredEmpty ? legacyLikes : raw.likes !== undefined ? legacyLikes : [],
  );

  return normalizeUnderstandingShape({
    traits,
    interests,
    occupation,
    pace,
    notes,
    negative,
    positive,
  });
}

function hasAge(f: { ageMin: number | null; ageMax: number | null }) {
  return f.ageMin != null || f.ageMax != null;
}

function hasEducation(f: MatchHardFilters) {
  return (
    f.educationMin != null ||
    f.educationLevels.length > 0 ||
    f.excludeEducationLevels.length > 0
  );
}

function normalizeHardFilters(
  prev: MatchHardFilters,
  raw: LlmExtractJson["hardFilters"],
): MatchHardFilters {
  if (!raw) return prev;

  const ageMin = raw.ageMin !== undefined ? clampAge(raw.ageMin) : prev.ageMin;
  const ageMax = raw.ageMax !== undefined ? clampAge(raw.ageMax) : prev.ageMax;

  const cities =
    raw.cities !== undefined ? normalizeCityList(raw.cities) : prev.cities;
  const excludeCities =
    raw.excludeCities !== undefined
      ? normalizeCityList(raw.excludeCities)
      : prev.excludeCities;

  let educationMin: EducationLevel | null = prev.educationMin;
  if (raw.educationMin !== undefined) {
    educationMin =
      raw.educationMin === null ? null : normalizeEducationLevel(String(raw.educationMin));
  }

  const educationLevels =
    raw.educationLevels !== undefined
      ? normalizeEducationLevels(raw.educationLevels)
      : prev.educationLevels;

  const excludeEducationLevels =
    raw.excludeEducationLevels !== undefined
      ? normalizeEducationLevels(raw.excludeEducationLevels)
      : prev.excludeEducationLevels;

  const excludeGenders =
    raw.excludeGenders !== undefined
      ? normalizeGenders(raw.excludeGenders)
      : prev.excludeGenders;

  const genders =
    raw.genders !== undefined ? normalizeGenders(raw.genders) : prev.genders;

  const genderStrength =
    raw.genderStrength !== undefined
      ? parseStrength(raw.genderStrength) ?? (genders.length ? "hard" : null)
      : prev.genderStrength ?? (genders.length ? "hard" : null);

  const cityStrength =
    raw.cityStrength !== undefined
      ? parseStrength(raw.cityStrength) ?? (cities.length ? "hard" : null)
      : prev.cityStrength ?? (cities.length ? "hard" : null);

  const nextAge = { ageMin, ageMax };
  const ageStrength =
    raw.ageStrength !== undefined
      ? parseStrength(raw.ageStrength) ?? (hasAge(nextAge) ? "hard" : null)
      : prev.ageStrength ?? (hasAge(nextAge) ? "hard" : null);

  const educationProbe: MatchHardFilters = {
    ...EMPTY_HARD_FILTERS,
    educationMin,
    educationLevels,
    excludeEducationLevels,
  };
  const educationStrength =
    raw.educationStrength !== undefined
      ? parseStrength(raw.educationStrength) ?? (hasEducation(educationProbe) ? "hard" : null)
      : prev.educationStrength ?? (hasEducation(educationProbe) ? "hard" : null);

  return {
    ageMin,
    ageMax,
    ageStrength,
    genders,
    excludeGenders,
    genderStrength,
    cities,
    excludeCities,
    cityStrength,
    educationMin,
    educationLevels,
    excludeEducationLevels,
    educationStrength,
  };
}

function buildExtractSystem(lang: MatchmakerLang): string {
  const isZh = zh(lang);
  return [
    isZh
      ? `你是 Matchmaker 的信息抽取器。只从对话中提取结构化偏好，不生成聊天回复。

你会收到【当前状态】和【本轮用户消息】。请输出本轮结束后仍然有效的完整偏好。

hardFilters（硬/软约束字段 — 用户明确说出的才填）：
- ageMin / ageMax：整数年龄；要取消年龄限制 → 显式设 null
- ageStrength: hard|flex|null — 「必须25-30」→ hard；「最好30左右」→ flex；有年龄默认 hard
- genders / excludeGenders：female | male | nonbinary
- genderStrength: hard|flex|null — 「必须女生」→ hard；「最好女生」→ flex；有 genders 默认 hard
- cities / excludeCities：国家/省/市短语；不限地点 → cities 设 []
- cityStrength: hard|flex|null — 「必须在北京」→ hard；「最好北京」→ flex；有 cities 默认 hard
- educationMin / educationLevels / excludeEducationLevels
- educationStrength: hard|flex|null — 「必须硕士」→ hard；「最好本科以上」→ flex；有学历默认 hard

understanding（想找的人的软偏好 — 不是用户自己）：
- traits：性格短词（安静、幽默…）
- interests：兴趣短词（徒步、读书…）
- occupation：对方在做什么（设计师、在上学、自由职业…）短词列表
- pace：节奏/相处（慢热、话少…）
- dislikes：不想要的
- notes：补充说明
- likes：兼容旧字段；能归入 traits/interests/occupation/pace 时优先用分字段
- 「异地可接受」「城市不限」→ cities=[] + notes，不要编造城市

【「都行 / 都可以 / 随便」— 必须结合语境判断，不要写死规则】
看用户是在回应哪一类问题，再决定清除哪些字段、是否新增软偏好：
1) 助手刚问城市/地点，用户说「都行」「其他城市也可以」→ 清空 cities（不限地点），已确定的性别/年龄等保留
2) 助手刚问年龄，用户说「都行」「差不多就行」→ 清空 ageMin/ageMax
3) 助手刚问性格/节奏/兴趣/职业，用户说「都行」→ 不新增 soft；不要动 hardFilters
4) 用户说「年龄30以下，其他的都行」→ 保留 ageMax=30，清空其他尚未敲定的硬条件
5) 助手问「还有别的要求吗」，用户说「没有了」「都行」「随便找一个」→ 不再加新限制；已明确说过的保留
6) 「随便找一个」通常表示可以开始匹配，不是性格标签 — 不要写入 traits/likes

输出 hardFilters 时：对需要清除的维度必须显式设 null 或 []；未改变的字段可以省略（系统会沿用【当前状态】）。

只输出 JSON：
{"hardFilters":{"ageMin":null,"ageMax":null,"ageStrength":null,"genders":[],"excludeGenders":[],"genderStrength":null,"cities":[],"excludeCities":[],"cityStrength":null,"educationMin":null,"educationLevels":[],"excludeEducationLevels":[],"educationStrength":null},"understanding":{"notes":[],"traits":[],"interests":[],"occupation":[],"pace":[],"dislikes":[],"likes":[]}}`
      : `You extract structured match preferences. No chat reply.

You receive [current state] and [this user message]. Output prefs still valid after this turn.

hardFilters: explicit constraints. To remove a constraint, set that field to null or []. Omitted fields keep the current state.
- Prefer / ideally → value + ageStrength/genderStrength/cityStrength/educationStrength="flex"; must / only → "hard".
- Location-flex ("any city") → cities=[].

understanding (who they want — not the seeker's self-profile):
- traits, interests, occupation (job/studying), pace, dislikes, notes
- legacy likes only if you cannot classify into the fields above

["Anything goes" — interpret from context:]
1) Asked city → "any city" → clear cities []; keep gender/age
2) Asked age → "flexible" → clear ageMin/ageMax
3) Asked personality/interests/job → "either" → no new soft prefs; leave hardFilters
4) "Under 30, anything else fine" → keep ageMax=30
5) "That's all" → no new constraints
6) "Just find someone" is not a personality trait

JSON only:
{"hardFilters":{"ageMin":null,"ageMax":null,"ageStrength":null,"genders":[],"excludeGenders":[],"genderStrength":null,"cities":[],"excludeCities":[],"cityStrength":null,"educationMin":null,"educationLevels":[],"excludeEducationLevels":[],"educationStrength":null},"understanding":{"notes":[],"traits":[],"interests":[],"occupation":[],"pace":[],"dislikes":[],"likes":[]}}`,
  ].join("\n");
}

function buildExtractUserContent(input: ExtractInput): string {
  const isZh = zh(input.lang);
  const lastAssistant = [...input.history].reverse().find((h) => h.role === "assistant");
  const u = normalizeUnderstandingShape(input.prevUnderstanding);
  const state = {
    hardFilters: input.prevHardFilters,
    understanding: {
      notes: u.notes,
      traits: u.traits ?? [],
      interests: u.interests ?? [],
      occupation: u.occupation ?? [],
      pace: u.pace ?? [],
      dislikes: u.negative,
      likes: u.positive,
    },
  };

  if (isZh) {
    return [
      "【当前状态】",
      JSON.stringify(state, null, 0),
      lastAssistant ? `【上一条助手消息】\n${lastAssistant.content}` : "",
      "【本轮用户消息】",
      input.userMessage,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "[Current state]",
    JSON.stringify(state, null, 0),
    lastAssistant ? `[Last assistant message]\n${lastAssistant.content}` : "",
    "[This user message]",
    input.userMessage,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runMatchmakerExtract(input: ExtractInput): Promise<ExtractOutput> {
  const parsed = await chatCompletionJson<LlmExtractJson>(
    [
      { role: "system", content: buildExtractSystem(input.lang) },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: buildExtractUserContent(input) },
    ],
    { temperature: 0.2, maxTokens: 700 },
  );

  if (!parsed) {
    return {
      understanding: normalizeUnderstandingShape(input.prevUnderstanding),
      hardFilters: input.prevHardFilters,
    };
  }

  return {
    understanding: normalizeUnderstanding(input.prevUnderstanding, parsed.understanding),
    hardFilters: normalizeHardFilters(input.prevHardFilters, parsed.hardFilters),
  };
}

export { EMPTY_HARD_FILTERS };
