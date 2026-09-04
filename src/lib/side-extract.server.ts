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
import { formatNowContext, normalizeIsoDate, normalizeTimeHHmm, resolveDraftDates } from "./wish-date";

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
  when?: string | null;
  level?: string | null;
  cities?: string[];
  excludeCities?: string[];
  kinds?: string[];
  rawText?: string;
  whenAny?: boolean;
  levelAny?: boolean;
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
  const allowCrossCity =
    raw.allowCrossCity !== undefined ? Boolean(raw.allowCrossCity) : prev.allowCrossCity;
  return { cities, excludeCities, kinds, allowCrossCity };
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
kind: tennis|run|climb|cook|exhibition|bookstore|other|null
when: weekend|weeknight|any|null（未提及则 whenAny=true）
dateStart/dateEnd: ISO YYYY-MM-DD（含首尾）。用户说「这周末/下周六/3月5号」等相对或绝对日期时，根据上方当前时间算出具体日期填入；单日只填 dateStart，dateEnd 可同天或省略
timeStart/timeEnd: 24h HH:mm（如 12:00、16:00）。用户说「上午/下午/12点到4点」等时解析为具体时刻；未提及则 null
level: beginner|intermediate|advanced|null（未提及则 levelAny=true）
strictWhen: 用户明确说时间必须满足（必须周末/只能晚上）→ true
strictLevel: 用户明确说水平必须一致（同级别/水平差不多）→ true
allowCrossCity: 用户明确接受异地/跨城 → true
cities / excludeCities：地点短语（国家/省/市，中英文均可；「中国」填国家即可，勿展开成城市列表）
kinds：只接受的活动类型列表
rawText：用户原话或合并后的一句话心愿
readyToPublish：仅当 kind 明确且用户已表达完整意愿时为 true（只用于判断可展示表单，不会自动发布）
understanding：软偏好 notes/likes/dislikes；用户明确说对搭子「没要求/随便」时写入 notes（如「搭子无特别要求」）
buddyHardFilters：用户对搭子人群的硬要求（仅当明确说出）— genders[]、excludeGenders[]、ageMin、ageMax；没说则全空/null
buddyPrefRaw：搭子偏好描述原文（性格、性别、年龄、相处方式等，合并为一句）
otherReqRaw：其他信息原文（与搭子偏好无关，与活动相关的任意补充）
区分：「搭子最好女生」→ buddyHardFilters.genders=["female"]；「想认识女生」→ 不要填 buddy（那是 Matchmaker）
JSON:
{"kind":null,"when":null,"dateStart":null,"dateEnd":null,"timeStart":null,"timeEnd":null,"level":null,"buddyHardFilters":{"genders":[],"excludeGenders":[],"ageMin":null,"ageMax":null},"cities":[],"excludeCities":[],"kinds":[],"rawText":"","whenAny":true,"levelAny":true,"readyToPublish":false,"understanding":{"notes":[],"likes":[],"dislikes":[]}}`
    : `Extract wish fields from Side by Side chat. No reply text.
${nowLine}
kind: tennis|run|climb|cook|exhibition|bookstore|other|null
when/level as enums; whenAny/levelAny true if unspecified
dateStart/dateEnd: ISO YYYY-MM-DD inclusive. Resolve "this weekend", "next Saturday", "March 5" using current time above
timeStart/timeEnd: 24h HH:mm (e.g. 12:00, 16:00). Parse "morning", "noon to 4pm" into concrete times; null if not mentioned
strictWhen/strictLevel/allowCrossCity: set true only when user explicitly requires
cities / excludeCities: location phrases (country / region / city; EN or ZH). Put ["China"] for country — do not expand to city list.
readyToPublish true only when kind is clear and user intent is complete (signals form-ready only — never auto-publishes)
understanding: soft prefs; if user says no buddy preference, add note like "no buddy preference"
JSON:
{"kind":null,"when":null,"dateStart":null,"dateEnd":null,"timeStart":null,"timeEnd":null,"level":null,"buddyHardFilters":{"genders":[],"excludeGenders":[],"ageMin":null,"ageMax":null},"cities":[],"excludeCities":[],"kinds":[],"rawText":"","whenAny":true,"levelAny":true,"readyToPublish":false,"understanding":{"notes":[],"likes":[],"dislikes":[]}}`;
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

  const parsedDateStart =
    parsed.dateStart !== undefined ? normalizeIsoDate(parsed.dateStart ?? undefined) : undefined;
  const parsedDateEnd =
    parsed.dateEnd !== undefined ? normalizeIsoDate(parsed.dateEnd ?? undefined) : undefined;

  const draft: WishDraft = {
    kind: kind ?? input.prevDraft.kind,
    when,
    level,
    city: input.prevDraft.city,
    city_zh: input.prevDraft.city_zh,
    rawText: rawText || input.prevDraft.rawText,
    activityDescRaw: rawText || input.prevDraft.activityDescRaw || input.prevDraft.rawText,
    buddyPrefRaw:
      (parsed.buddyPrefRaw ?? input.prevDraft.buddyPrefRaw ?? "").trim() || undefined,
    otherReqRaw:
      (parsed.otherReqRaw ?? input.prevDraft.otherReqRaw ?? "").trim() || undefined,
    whenAny: parsed.whenAny ?? (when === undefined && !parsedDateStart),
    levelAny: parsed.levelAny ?? (level === undefined),
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
    readyToPublish: Boolean(parsed.readyToPublish && draft.kind),
  };
}

export { EMPTY_WISH_HARD_FILTERS, EMPTY_BUDDY_HARD_FILTERS, emptyWishDraft };
