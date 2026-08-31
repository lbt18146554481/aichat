import type { ActivityKind } from "./types";
import type { LevelTier, WhenTier } from "./intents";
import { chatCompletionJson } from "./llm.server";
import { normalizeCityList } from "./match-normalize";
import type { UserUnderstanding } from "./understanding";
import {
  EMPTY_WISH_HARD_FILTERS,
  emptyWishDraft,
  type SideLang,
  type WishDraft,
  type WishHardFilters,
} from "./wish-types";

export interface SideExtractInput {
  lang: SideLang;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  prevDraft: WishDraft;
  prevHardFilters: WishHardFilters;
  prevUnderstanding: UserUnderstanding;
}

export interface SideExtractOutput {
  draft: WishDraft;
  hardFilters: WishHardFilters;
  understanding: UserUnderstanding;
  readyToPublish: boolean;
}

interface LlmSideExtractJson {
  kind?: string | null;
  when?: string | null;
  level?: string | null;
  cities?: string[];
  excludeCities?: string[];
  kinds?: string[];
  rawText?: string;
  whenAny?: boolean;
  levelAny?: boolean;
  readyToPublish?: boolean;
  understanding?: { notes?: string[]; likes?: string[]; dislikes?: string[] };
}

const KINDS: ActivityKind[] = [
  "tennis",
  "run",
  "climb",
  "cook",
  "exhibition",
  "bookstore",
  "other",
];
const WHENS: WhenTier[] = ["weekend", "weeknight", "any"];
const LEVELS: LevelTier[] = ["beginner", "intermediate", "advanced"];

function normKind(raw: string | null | undefined): ActivityKind | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return KINDS.find((k) => k === t) ?? null;
}

function normWhen(raw: string | null | undefined): WhenTier | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase() as WhenTier;
  return WHENS.includes(t) ? t : undefined;
}

function normLevel(raw: string | null | undefined): LevelTier | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase() as LevelTier;
  return LEVELS.includes(t) ? t : undefined;
}

function normalizeUnderstanding(
  prev: UserUnderstanding,
  raw: LlmSideExtractJson["understanding"],
): UserUnderstanding {
  const notes = (raw?.notes ?? prev.notes).map((n) => n.trim()).filter(Boolean).slice(-6);
  const positive = (raw?.likes ?? prev.positive).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const negative = (raw?.dislikes ?? prev.negative).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  return { notes, positive, negative };
}

function normalizeHardFilters(
  prev: WishHardFilters,
  raw: LlmSideExtractJson,
): WishHardFilters {
  const cities =
    raw.cities !== undefined ? normalizeCityList(raw.cities) : prev.cities;
  const excludeCities =
    raw.excludeCities !== undefined
      ? normalizeCityList(raw.excludeCities)
      : prev.excludeCities;
  const kinds =
    raw.kinds !== undefined
      ? raw.kinds.map((k) => normKind(k)).filter((k): k is ActivityKind => Boolean(k))
      : prev.kinds;
  return { cities, excludeCities, kinds };
}

function buildSystem(lang: SideLang): string {
  const isZh = lang === "zh-CN";
  return isZh
    ? `你是 Side by Side 心愿抽取器。只提取结构化字段，不生成聊天。
kind: tennis|run|climb|cook|exhibition|bookstore|other|null
when: weekend|weeknight|any|null（未提及则 whenAny=true）
level: beginner|intermediate|advanced|null（未提及则 levelAny=true）
cities / excludeCities：用户明确说的城市
kinds：只接受的活动类型列表
rawText：用户原话或合并后的一句话心愿
readyToPublish：仅当 kind 明确且用户已表达完整意愿时为 true（发布前仍需对话确认）
understanding：软偏好 notes/likes/dislikes
JSON:
{"kind":null,"when":null,"level":null,"cities":[],"excludeCities":[],"kinds":[],"rawText":"","whenAny":true,"levelAny":true,"readyToPublish":false,"understanding":{"notes":[],"likes":[],"dislikes":[]}}`
    : `Extract wish fields from Side by Side chat. No reply text.
kind: tennis|run|climb|cook|exhibition|bookstore|other|null
when/level as enums; whenAny/levelAny true if unspecified
readyToPublish true only when kind is clear and user intent is complete (confirmation still required in chat)
JSON:
{"kind":null,"when":null,"level":null,"cities":[],"excludeCities":[],"kinds":[],"rawText":"","whenAny":true,"levelAny":true,"readyToPublish":false,"understanding":{"notes":[],"likes":[],"dislikes":[]}}`;
}

export async function runSideExtract(input: SideExtractInput): Promise<SideExtractOutput> {
  const parsed = await chatCompletionJson<LlmSideExtractJson>(
    [
      { role: "system", content: buildSystem(input.lang) },
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.userMessage },
    ],
    { temperature: 0.2, maxTokens: 500 },
  );

  if (!parsed) {
    return {
      draft: input.prevDraft,
      hardFilters: input.prevHardFilters,
      understanding: input.prevUnderstanding,
      readyToPublish: false,
    };
  }

  const kind = parsed.kind !== undefined ? normKind(parsed.kind) : input.prevDraft.kind;
  const when = parsed.when !== undefined ? normWhen(parsed.when) : input.prevDraft.when;
  const level = parsed.level !== undefined ? normLevel(parsed.level) : input.prevDraft.level;
  const rawText = (parsed.rawText ?? input.prevDraft.rawText ?? input.userMessage).trim();

  const draft: WishDraft = {
    kind: kind ?? input.prevDraft.kind,
    when,
    level,
    city: input.prevDraft.city,
    city_zh: input.prevDraft.city_zh,
    rawText: rawText || input.prevDraft.rawText,
    whenAny: parsed.whenAny ?? (when === undefined),
    levelAny: parsed.levelAny ?? (level === undefined),
  };

  return {
    draft,
    hardFilters: normalizeHardFilters(input.prevHardFilters, parsed),
    understanding: normalizeUnderstanding(input.prevUnderstanding, parsed.understanding),
    readyToPublish: Boolean(parsed.readyToPublish && draft.kind),
  };
}

export { EMPTY_WISH_HARD_FILTERS, emptyWishDraft };
