import { chatCompletionJson } from "./llm.server";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { UserUnderstanding } from "./understanding";
import {
  mergePositiveBag,
  normalizeUnderstandingShape,
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

/** Soft lists: when the model returns an understanding object, treat missing keys as []. */
function snapshotListField(raw: string[] | undefined, lim: number): string[] {
  if (raw === undefined) return [];
  return raw.map((s) => s.trim()).filter(Boolean).slice(0, lim);
}

function normalizeUnderstanding(
  prev: UserUnderstanding,
  raw: LlmExtractJson["understanding"],
): UserUnderstanding {
  const prevN = normalizeUnderstandingShape(prev);
  // No understanding block → keep previous (model chose not to touch soft prefs).
  if (!raw) return prevN;

  // Full soft snapshot: LLM decides reset/change/keep by what it puts in each array.
  const traits = snapshotListField(raw.traits, 12);
  const interests = snapshotListField(raw.interests, 12);
  const occupation = snapshotListField(raw.occupation, 8);
  const pace = snapshotListField(raw.pace, 8);
  const notes = snapshotListField(raw.notes, 6).slice(-6);
  const negative = snapshotListField(raw.dislikes, 12);

  const legacyLikes =
    raw.likes !== undefined ? raw.likes.map((s) => s.trim()).filter(Boolean) : [];

  const structuredEmpty =
    traits.length === 0 &&
    interests.length === 0 &&
    occupation.length === 0 &&
    pace.length === 0;

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

你会收到【当前状态】和【本轮用户消息】。请判断本轮结束后，每条偏好应「保留 / 修改 / 重置」，并输出仍然有效的完整状态。

【如何判断 — 由你根据语境决定，不要机械套模板】
- 保留：用户没提、也没否定该项 → hardFilters 里可省略该字段（系统沿用）；understanding 里仍要写出仍有效的完整列表
- 修改：用户补充或改写（如「还要开朗」「改成25-30岁」）→ 写入新值
- 重置/清空：用户换方向或明确放弃（如「我想再找开朗的」不再要运动；「城市不限」）→ 对应字段写 null 或 []
- 「再找一个…」「换…」「不要…了」多半是切换/重置相关软偏好，不要把已过时的兴趣/性格悄悄留着
- 「还要…」「最好也…」多半是补充，在旧偏好上合并

hardFilters（硬/软约束 — 用户明确说出的才填）：
- ageMin / ageMax；取消年龄 → 显式 null
- ageStrength / genderStrength / cityStrength / educationStrength: hard|flex|null
- genders / excludeGenders：female | male | nonbinary
- cities / excludeCities；不限地点 → cities=[]
- educationMin / educationLevels / excludeEducationLevels
- 未改动的 hard 字段可以省略（系统沿用【当前状态】）；要清空必须显式 null 或 []

understanding（想找的人的软偏好 — 不是用户自己）：
- 每次只要输出 understanding，就必须给出完整快照：traits / interests / occupation / pace / dislikes / notes / likes 都写上
- 仍有效的项原样留下；本轮不要的项不要出现在列表里（用 [] 表示该类清空）
- 缺省的列表键会被当成 []（清空），不会自动沿用旧 soft
- traits / interests / occupation / pace / dislikes / notes；likes 仅兼容旧字段
- 「随便找一个」通常是开始匹配，不是性格标签

【「都行 / 都可以 / 随便」— 结合在回应什么来判断】
1) 刚问城市 → 清空 cities，其它 hard 保留
2) 刚问年龄 → 清空年龄
3) 刚问性格/兴趣 → 不要新增 soft；是否清空看用户是「没要求」还是「先这样」
4) 「年龄30以下，其他都行」→ 保留 ageMax，其它未敲定 hard 可清
5) 「没有了 / 开始找」→ 不再加限制；已明确的保留

只输出 JSON：
{"hardFilters":{"ageMin":null,"ageMax":null,"ageStrength":null,"genders":[],"excludeGenders":[],"genderStrength":null,"cities":[],"excludeCities":[],"cityStrength":null,"educationMin":null,"educationLevels":[],"excludeEducationLevels":[],"educationStrength":null},"understanding":{"notes":[],"traits":[],"interests":[],"occupation":[],"pace":[],"dislikes":[],"likes":[]}}`
      : `You extract structured match preferences. No chat reply.

You receive [current state] and [this user message]. For each preference, decide keep / change / reset, then output the prefs still valid after this turn.

How to decide (you judge from context):
- Keep: not mentioned and not contradicted → omit that hardFilters field (system keeps it); for understanding, still list all soft prefs that remain valid
- Change: user updates or adds → write the new value
- Reset/clear: user pivots or drops something (e.g. "find someone outgoing instead" after sports; "any city") → null or []
- "Find another…" / "switch to…" often resets stale soft prefs — do not silently keep obsolete interests/traits
- "Also…" / "preferably also…" usually merges onto existing soft prefs

hardFilters: explicit constraints. Omit unchanged fields (kept). Clear with null or [].
- Prefer → flex strength; must → hard. Any city → cities=[].

understanding (who they want — not the seeker):
- Whenever you output understanding, emit a FULL snapshot: traits, interests, occupation, pace, dislikes, notes, likes
- Keep still-valid items; omit dropped ones (use [] to clear a category)
- Missing list keys are treated as [] (cleared) — soft prefs are NOT auto-carried from previous state
- "Just find someone" is not a personality trait

["Anything goes" — interpret from what was asked:]
1) City → clear cities
2) Age → clear age
3) Personality/interests → usually no new soft; clear only if they reject prior soft prefs
4) "Under 30, else fine" → keep ageMax
5) "That's all" → no new constraints

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
      "请自行判断哪些偏好保留、修改或重置；输出结束后仍有效的完整状态。understanding 须为完整快照。",
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
    "Decide keep / change / reset for each pref; output the full valid state. understanding must be a complete snapshot.",
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
