import { chatCompletionJson } from "./llm.server";
import type { MatchHardFilters } from "./match-types";
import { EMPTY_HARD_FILTERS } from "./match-types";
import type { UserUnderstanding } from "./understanding";
import {
  clampAge,
  normalizeCityList,
  normalizeEducationLevel,
  normalizeEducationLevels,
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
  const negative = (raw?.dislikes ?? prev.negative).map((s) => s.trim()).filter(Boolean).slice(0, 12);
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

  return {
    ageMin,
    ageMax,
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
hardFilters（硬条件 — 只有用户明确、当前有效的限制才填；未提及的字段保持 null 或 []）：
- ageMin / ageMax：整数年龄
- cities：想要的城市（中英文均可，如 北京、Berlin）
- excludeCities：不要的城市
- educationMin：最低学历 high_school | associate | bachelor | master | doctorate
- educationLevels：只接受这些学历（精确列表，如只要硕士填 ["master"]）
- excludeEducationLevels：不要的学历

understanding（软偏好 — 性格、爱好、生活方式，不要放硬条件）：
- notes：简短记忆，最多6条
- likes / dislikes：软特质标签

只输出 JSON：
{"hardFilters":{"ageMin":null,"ageMax":null,"cities":[],"excludeCities":[],"educationMin":null,"educationLevels":[],"excludeEducationLevels":[]},"understanding":{"notes":[],"likes":[],"dislikes":[]}}`
      : `You extract structured match preferences from conversation. No chat reply.
hardFilters: only explicit current constraints (ageMin/ageMax, cities, excludeCities, educationMin, educationLevels, excludeEducationLevels using high_school|associate|bachelor|master|doctorate).
understanding: soft traits in notes/likes/dislikes.
JSON only:
{"hardFilters":{...},"understanding":{"notes":[],"likes":[],"dislikes":[]}}`,
  ].join("\n");
}

export async function runMatchmakerExtract(input: ExtractInput): Promise<ExtractOutput> {
  const parsed = await chatCompletionJson<LlmExtractJson>(
    [
      { role: "system", content: buildExtractSystem(input.lang) },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.userMessage },
    ],
    { temperature: 0.2, maxTokens: 500 },
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
