import { chatCompletionJson } from "./llm.server";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { UserUnderstanding } from "./understanding";
import {
  clampAge,
  normalizeCityList,
  normalizeEducationLevel,
  normalizeEducationLevels,
  normalizeGenders,
} from "./match-normalize";
import type { EducationLevel } from "./types";
import type { MatchmakerLang } from "./match-types";

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
    genders?: string[];
    excludeGenders?: string[];
    cities?: string[];
    excludeCities?: string[];
    educationMin?: string | null;
    educationLevels?: string[];
    excludeEducationLevels?: string[];
  };
  understanding?: {
    notes?: string[];
    likes?: string[];
    dislikes?: string[];
  };
}

function zh(lang: MatchmakerLang) {
  return lang === "zh-CN";
}

function normalizeUnderstanding(
  prev: UserUnderstanding,
  raw: LlmExtractJson["understanding"],
): UserUnderstanding {
  const notes = (raw?.notes ?? prev.notes).map((n) => n.trim()).filter(Boolean).slice(-6);
  const positive = (raw?.likes ?? prev.positive).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const negative = (raw?.dislikes ?? prev.dislikes).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  return { notes, positive, negative };
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

  return {
    ageMin,
    ageMax,
    genders,
    excludeGenders,
    cities,
    excludeCities,
    educationMin,
    educationLevels,
    excludeEducationLevels,
  };
}

function buildExtractSystem(lang: MatchmakerLang): string {
  const isZh = lang === "zh-CN";
  return [
    isZh
      ? `你是 Matchmaker 的信息抽取器。只从对话中提取结构化偏好，不生成聊天回复。

你会收到【当前状态】和【本轮用户消息】。请输出本轮结束后仍然有效的完整偏好。

hardFilters（硬条件 — 只有用户明确、当前仍有效的限制才填）：
- ageMin / ageMax：整数年龄；要取消年龄限制 → 显式设 null
- genders / excludeGenders：female | male | nonbinary
- cities / excludeCities：国家/省/市短语；要表示不限地点 → cities 设 []
- 「最好/优先/倾向于 XX」→ understanding.likes 或 notes（软偏好），不要写入 cities；只有「必须在/只在/一定要 XX」才写入 cities
- educationMin / educationLevels / excludeEducationLevels

understanding（软偏好 — 性格、相处方式、兴趣等）：
- likes / dislikes / notes
- 「异地可接受」「城市不限」→ notes，不要写入 cities

【「都行 / 都可以 / 随便」— 必须结合语境判断，不要写死规则】
看用户是在回应哪一类问题，再决定清除哪些字段、是否新增软偏好：
1) 助手刚问城市/地点，用户说「都行」「其他城市也可以」→ 清空 cities（不限地点），已确定的性别/年龄等保留
2) 助手刚问年龄，用户说「都行」「差不多就行」→ 清空 ageMin/ageMax
3) 助手刚问性格/节奏/兴趣，用户说「都行」→ 不新增 likes/notes；不要动 hardFilters
4) 用户说「年龄30以下，其他的都行」→ 保留 ageMax=30，清空其他尚未敲定的硬条件
5) 助手问「还有别的要求吗」，用户说「没有了」「都行」「随便找一个」→ 不再加新限制；仅清除仍在开放追问中、用户已表示随意的字段；已明确说过的性别/年龄等保留
6) 「随便找一个」通常表示可以开始匹配，不是性格标签 — 不要写入 likes

输出 hardFilters 时：对需要清除的维度必须显式设 null 或 []；未改变的字段可以省略（系统会沿用【当前状态】）。

只输出 JSON：
{"hardFilters":{"ageMin":null,"ageMax":null,"genders":[],"excludeGenders":[],"cities":[],"excludeCities":[],"educationMin":null,"educationLevels":[],"excludeEducationLevels":[]},"understanding":{"notes":[],"likes":[],"dislikes":[]}}`
      : `You extract structured match preferences. No chat reply.

You receive [current state] and [this user message]. Output prefs still valid after this turn.

hardFilters: explicit active constraints only. To remove a constraint, set that field to null or []. Omitted fields keep the current state.
- "Prefer / ideally in X" → likes or notes (soft), NOT cities; only "must be in / only in X" → cities.

understanding: soft traits (likes/dislikes/notes). Location-flex phrases go in notes, not cities.

["Anything goes" / "either is fine" / "whatever" — interpret from context, do not apply a fixed rule:]
1) Assistant asked city → user says "any city" / "either" → clear cities []; keep gender/age already set
2) Assistant asked age → user says "flexible" → clear ageMin/ageMax
3) Assistant asked personality/pace → user says "either" → do not add likes; do not change hardFilters
4) "Under 30, anything else is fine" → keep ageMax=30; clear other open hard filters only
5) Assistant asked "anything else?" → user says "that's all" / "whatever" / "just pick someone" → no new constraints; clear only fields still open that user waved off; keep stated gender/age
6) "Just find someone" is not a personality trait — not in likes

JSON only:
{"hardFilters":{"ageMin":null,"ageMax":null,"genders":[],"excludeGenders":[],"cities":[],"excludeCities":[],"educationMin":null,"educationLevels":[],"excludeEducationLevels":[]},"understanding":{"notes":[],"likes":[],"dislikes":[]}}`,
  ].join("\n");
}

function buildExtractUserContent(input: ExtractInput): string {
  const isZh = zh(input.lang);
  const lastAssistant = [...input.history].reverse().find((h) => h.role === "assistant");
  const u = input.prevUnderstanding;
  const state = {
    hardFilters: input.prevHardFilters,
    understanding: { notes: u.notes, likes: u.positive, dislikes: u.negative },
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
    { temperature: 0.2, maxTokens: 600 },
  );

  if (!parsed) {
    return {
      understanding: input.prevUnderstanding,
      hardFilters: input.prevHardFilters,
    };
  }

  return {
    understanding: normalizeUnderstanding(input.prevUnderstanding, parsed.understanding),
    hardFilters: normalizeHardFilters(input.prevHardFilters, parsed.hardFilters),
  };
}

export { EMPTY_HARD_FILTERS };
