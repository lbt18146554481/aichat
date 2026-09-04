import type { ActivityKind } from "./types";
import type { LevelTier, WhenTier } from "./intents";
import { chatCompletionJson } from "./llm.server";
import { normalizeCityList } from "./match-normalize";
import type { UserUnderstanding } from "./understanding";
import {
  EMPTY_WISH_HARD_FILTERS,
  EMPTY_BUDDY_HARD_FILTERS,
  emptyWishDraft,
  type SideLang,
  type WishDraft,
  type WishHardFilters,
  type BuddyHardFilters,
} from "./wish-types";
import { normalizeBuddyHardFilters } from "./buddy-filters";
import { normalizeGender } from "./match-normalize";
import type { PersonGender } from "./types";
import { parseStrength } from "./field-constraint";
import { legacyFlagsFromWhenLevel, resolveLevelConstraint, resolveWhenConstraint } from "./wish-constraints";
import { formatNowContext, normalizeIsoDate, normalizeTimeHHmm, resolveDraftDates } from "./wish-date";
import { activityCoreFromKind, kindFromActivityCore } from "./activity-core";

export interface SideExtractInput {
  lang: SideLang;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  prevDraft: WishDraft;
  prevHardFilters: WishHardFilters;
  prevBuddyHardFilters: BuddyHardFilters;
  prevUnderstanding: UserUnderstanding;
}

export interface SideExtractOutput {
  draft: WishDraft;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  understanding: UserUnderstanding;
  readyToPublish: boolean;
}

interface BuddyExtractJson {
  genders?: string[];
  excludeGenders?: string[];
  ageMin?: number | null;
  ageMax?: number | null;
}

interface LlmSideExtractJson {
  kind?: string | null;
  /** Short activity phrase only, e.g. 跑步 — no when/where */
  activityCore?: string | null;
  activityStrength?: string | null;
  when?: string | null;
  level?: string | null;
  cities?: string[];
  excludeCities?: string[];
  kinds?: string[];
  rawText?: string;
  whenAny?: boolean;
  levelAny?: boolean;
  whenStrength?: string | null;
  levelStrength?: string | null;
  placeStrength?: string | null;
  buddyGenderStrength?: string | null;
  strictWhen?: boolean;
  strictLevel?: boolean;
  allowCrossCity?: boolean;
  dateStart?: string | null;
  dateEnd?: string | null;
  timeStart?: string | null;
  timeEnd?: string | null;
  buddyHardFilters?: BuddyExtractJson;
  buddyPrefRaw?: string | null;
  otherReqRaw?: string | null;
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
  return {
    notes,
    positive,
    negative,
    traits: prev.traits ?? [],
    interests: prev.interests ?? [],
    occupation: prev.occupation ?? [],
    pace: prev.pace ?? [],
  };
}

function normalizeHardFilters(
  prev: WishHardFilters,
  raw: LlmSideExtractJson,
): WishHardFilters {
  // Geography comes from structured place (runPlaceExtract), not cities[] here.
  // Keep previous cities until place sync overwrites; ignore LLM cities.
  const excludeCities =
    raw.excludeCities !== undefined
      ? normalizeCityList(raw.excludeCities)
      : prev.excludeCities;
  const kinds =
    raw.kinds !== undefined
      ? raw.kinds.map((k) => normKind(k)).filter((k): k is ActivityKind => Boolean(k))
      : prev.kinds;
  const allowCrossCity =
    raw.allowCrossCity !== undefined ? Boolean(raw.allowCrossCity) : prev.allowCrossCity;
  return { cities: prev.cities, excludeCities, kinds, allowCrossCity };
}

function normGenders(raw: string[] | undefined): PersonGender[] {
  if (!raw?.length) return [];
  const out: PersonGender[] = [];
  for (const g of raw) {
    const n = normalizeGender(g);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function normalizeBuddyFromExtract(
  prev: BuddyHardFilters,
  raw: BuddyExtractJson | undefined,
): BuddyHardFilters {
  if (!raw) return prev;
  return normalizeBuddyHardFilters(prev, {
    genders: raw.genders !== undefined ? normGenders(raw.genders) : undefined,
    excludeGenders:
      raw.excludeGenders !== undefined ? normGenders(raw.excludeGenders) : undefined,
    ageMin: raw.ageMin !== undefined ? raw.ageMin : undefined,
    ageMax: raw.ageMax !== undefined ? raw.ageMax : undefined,
  });
}

function buildSystem(lang: SideLang): string {
  const isZh = lang === "zh-CN";
  const nowLine = formatNowContext(lang);
  return isZh
    ? `你是 Side by Side 心愿抽取器。只提取结构化字段，不生成聊天。
${nowLine}
activityCore: 活动核短词（如「跑步」「网球」「轻松读书」），只写活动本身，不要带时间/地点/人数。未提及 → null
activityStrength: hard|flex|null — 有 activityCore 时填。用户说「必须/只能打网球」→ hard；「最好跑步」→ flex；只说活动未强调 → flex
kind: tennis|run|climb|cook|exhibition|bookstore|other|null — 仅当能映射到已知枚举时填写；无法映射时用 other，以 activityCore 为准
when: weekend|weeknight|any|null（未提及 → null；明确不限 → any）
whenStrength: hard|flex|null — 有具体 when 时必填。用户说「必须/只能」→ hard；说「最好/尽量」→ flex；只说「周末」未强调 → flex
dateStart/dateEnd: ISO YYYY-MM-DD（含首尾）。用户说「这周末/下周六/3月5号」等相对或绝对日期时，根据上方当前时间算出具体日期填入；单日只填 dateStart，dateEnd 可同天或省略
timeStart/timeEnd: 24h HH:mm（如 12:00、16:00）。用户说「上午/下午/12点到4点」等时解析为具体时刻；未提及则 null
level: beginner|intermediate|advanced|any|null
levelStrength: hard|flex|null — 同 whenStrength 规则
allowCrossCity: 用户明确接受异地/跨城 → true
（不要填写 cities：地点由专门的地点抽取器写入 structured place）
placeStrength: hard|flex|null — 有具体城市时：「必须同城」→ hard；「最好北京」→ flex；默认 hard
kinds：只接受的活动类型列表（兼容旧枚举）
rawText：用户原话或合并后的一句话心愿
readyToPublish：仅当 activityCore（或 kind）明确且用户已表达完整意愿时为 true（只用于判断可展示表单，不会自动发布）
understanding：软偏好 notes/likes/dislikes；用户明确说对搭子「没要求/随便」时写入 notes（如「搭子无特别要求」）
buddyHardFilters：搭子人群 — genders[]、excludeGenders[]、ageMin、ageMax
buddyGenderStrength: hard|flex|null — 「必须女生」→ hard；「最好女生」→ flex；默认 hard
buddyPrefRaw：搭子偏好描述原文
otherReqRaw：其他信息原文（非活动核、非时间地点的补充）
区分：「搭子最好女生」→ genders=["female"] + buddyGenderStrength=flex；「想认识女生」→ 不要填 buddy（那是 Matchmaker）
兼容：whenAny/levelAny/strictWhen/strictLevel 仍可输出，但优先 whenStrength/levelStrength
JSON:
{"activityCore":null,"activityStrength":null,"kind":null,"when":null,"whenStrength":null,"dateStart":null,"dateEnd":null,"timeStart":null,"timeEnd":null,"level":null,"levelStrength":null,"placeStrength":null,"buddyGenderStrength":null,"buddyHardFilters":{"genders":[],"excludeGenders":[],"ageMin":null,"ageMax":null},"kinds":[],"rawText":"","whenAny":true,"levelAny":true,"strictWhen":false,"strictLevel":false,"readyToPublish":false,"understanding":{"notes":[],"likes":[],"dislikes":[]}}`
    : `Extract wish fields from Side by Side chat. No reply text.
${nowLine}
activityCore: short activity phrase only (e.g. "run", "casual reading") — no when/where. null if unmentioned
activityStrength: hard|flex|null — with activityCore: "must play tennis" → hard; "prefer running" → flex; default flex
kind: tennis|run|climb|cook|exhibition|bookstore|other|null — map when possible; else other and rely on activityCore
when/level as enums; whenAny/levelAny true if unspecified
dateStart/dateEnd: ISO YYYY-MM-DD inclusive. Resolve "this weekend", "next Saturday", "March 5" using current time above
timeStart/timeEnd: 24h HH:mm (e.g. 12:00, 16:00). Parse "morning", "noon to 4pm" into concrete times; null if not mentioned
strictWhen/strictLevel/allowCrossCity: set true only when user explicitly requires
Do NOT fill cities — location is handled by a dedicated place extractor.
kinds: activity kind allow-list only (legacy)
readyToPublish true only when activityCore (or kind) is clear and user intent is complete (signals form-ready only — never auto-publishes)
understanding: soft prefs; if user says no buddy preference, add note like "no buddy preference"
JSON:
{"activityCore":null,"activityStrength":null,"kind":null,"when":null,"dateStart":null,"dateEnd":null,"timeStart":null,"timeEnd":null,"level":null,"buddyHardFilters":{"genders":[],"excludeGenders":[],"ageMin":null,"ageMax":null},"cities":[],"excludeCities":[],"kinds":[],"rawText":"","whenAny":true,"levelAny":true,"readyToPublish":false,"understanding":{"notes":[],"likes":[],"dislikes":[]}}`;
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
      buddyHardFilters: input.prevBuddyHardFilters,
      understanding: input.prevUnderstanding,
      readyToPublish: false,
    };
  }

  const kind = parsed.kind !== undefined ? normKind(parsed.kind) : input.prevDraft.kind;
  const when = parsed.when !== undefined ? normWhen(parsed.when) : input.prevDraft.when;
  const level = parsed.level !== undefined ? normLevel(parsed.level) : input.prevDraft.level;
  const rawText = (parsed.rawText ?? input.prevDraft.rawText ?? input.userMessage).trim();

  const parsedCore =
    parsed.activityCore !== undefined
      ? (parsed.activityCore?.trim() || null)
      : undefined;
  let activityCore =
    parsedCore !== undefined
      ? parsedCore || undefined
      : input.prevDraft.activityCore;
  const activityStrength =
    parseStrength(parsed.activityStrength) ?? input.prevDraft.activityStrength ?? null;

  // Prefer activityCore → kind mapping; keep enum when LLM mapped it.
  let resolvedKind = kind ?? input.prevDraft.kind;
  if (activityCore) {
    const mapped = kindFromActivityCore(activityCore);
    if (!resolvedKind || resolvedKind === "other") resolvedKind = mapped;
  } else if (resolvedKind && resolvedKind !== "other" && !activityCore) {
    activityCore = activityCoreFromKind(resolvedKind) || undefined;
  }

  const parsedDateStart =
    parsed.dateStart !== undefined ? normalizeIsoDate(parsed.dateStart ?? undefined) : undefined;
  const parsedDateEnd =
    parsed.dateEnd !== undefined ? normalizeIsoDate(parsed.dateEnd ?? undefined) : undefined;

  const draft: WishDraft = {
    kind: resolvedKind ?? input.prevDraft.kind,
    activityCore,
    activityStrength,
    when,
    level,
    city: input.prevDraft.city,
    city_zh: input.prevDraft.city_zh,
    placeMode: input.prevDraft.placeMode,
    placeOnline: input.prevDraft.placeOnline,
    placeFlex: input.prevDraft.placeFlex,
    place: input.prevDraft.place,
    placeRaw: input.prevDraft.placeRaw,
    placeStrength:
      parseStrength(parsed.placeStrength) ?? input.prevDraft.placeStrength ?? null,
    buddyGenderStrength:
      parseStrength(parsed.buddyGenderStrength) ?? input.prevDraft.buddyGenderStrength ?? null,
    rawText: rawText || input.prevDraft.rawText,
    activityDescRaw: rawText || input.prevDraft.activityDescRaw || input.prevDraft.rawText,
    buddyPrefRaw:
      (parsed.buddyPrefRaw ?? input.prevDraft.buddyPrefRaw ?? "").trim() || undefined,
    otherReqRaw:
      (parsed.otherReqRaw ?? input.prevDraft.otherReqRaw ?? "").trim() || undefined,
    whenAny: parsed.whenAny ?? ((when === undefined && !parsedDateStart) || when === "any"),
    levelAny: parsed.levelAny ?? level === undefined,
    whenStrength: parseStrength(parsed.whenStrength),
    levelStrength: parseStrength(parsed.levelStrength),
    strictWhen: parsed.strictWhen ?? input.prevDraft.strictWhen ?? false,
    strictLevel: parsed.strictLevel ?? input.prevDraft.strictLevel ?? false,
    allowCrossCity: parsed.allowCrossCity ?? input.prevDraft.allowCrossCity ?? false,
    dateStart:
      parsed.dateStart !== undefined
        ? parsedDateStart
        : input.prevDraft.dateStart,
    dateEnd:
      parsed.dateEnd !== undefined ? parsedDateEnd : input.prevDraft.dateEnd,
    timeStart:
      parsed.timeStart !== undefined
        ? normalizeTimeHHmm(parsed.timeStart ?? undefined)
        : input.prevDraft.timeStart,
    timeEnd:
      parsed.timeEnd !== undefined
        ? normalizeTimeHHmm(parsed.timeEnd ?? undefined)
        : input.prevDraft.timeEnd,
  };

  const whenC = resolveWhenConstraint({
    ...draft,
    whenStrength: draft.whenStrength ?? parseStrength(parsed.whenStrength),
    strictWhen: parsed.strictWhen || parsed.whenStrength === "hard",
  });
  const levelC = resolveLevelConstraint({
    ...draft,
    levelStrength: draft.levelStrength ?? parseStrength(parsed.levelStrength),
    strictLevel: parsed.strictLevel || parsed.levelStrength === "hard",
  });
  const legacy = legacyFlagsFromWhenLevel({ when: whenC, level: levelC });
  draft.whenAny = legacy.whenAny;
  draft.levelAny = legacy.levelAny;
  draft.strictWhen = legacy.strictWhen;
  draft.strictLevel = legacy.strictLevel;
  draft.whenStrength = legacy.whenStrength;
  draft.levelStrength = legacy.levelStrength;
  if (whenC.value && whenC.value !== "any") draft.when = whenC.value;
  if (levelC.value && levelC.value !== "any") draft.level = levelC.value;

  const dates = resolveDraftDates(draft);
  if (dates.dateStart) {
    draft.dateStart = dates.dateStart;
    draft.dateEnd = dates.dateEnd;
    if (draft.whenAny && draft.when) draft.whenAny = false;
  }
  if (dates.timeStart) draft.timeStart = dates.timeStart;
  if (dates.timeEnd) draft.timeEnd = dates.timeEnd;

  return {
    draft,
    hardFilters: normalizeHardFilters(input.prevHardFilters, parsed),
    buddyHardFilters: normalizeBuddyFromExtract(
      input.prevBuddyHardFilters,
      parsed.buddyHardFilters,
    ),
    understanding: normalizeUnderstanding(input.prevUnderstanding, parsed.understanding),
    readyToPublish: Boolean(parsed.readyToPublish && (draft.activityCore || draft.kind)),
  };
}

export { EMPTY_WISH_HARD_FILTERS, EMPTY_BUDDY_HARD_FILTERS, emptyWishDraft };
