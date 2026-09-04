import {
  findNearMisses,
  getIntentById,
  loadMyIntents,
  LEVEL_KINDS,
  seedPool,
  slotToWhen,
  whenCompatible,
  levelCompatible,
  sameCity,
  type Intent,
  type LevelTier,
  type MatchQuality,
  type WhenTier,
} from "./intents";
import {
  matchesLocationFilters,
  parsePlaceList,
  placeFromCityLabels,
} from "./geo";
import { isIntentRecallable } from "./intent-index";
import {
  buddyFiltersActive,
  EMPTY_BUDDY_HARD_FILTERS,
  ownerPassesBuddyHardFilters,
  type BuddyHardFilters,
} from "./buddy-filters";
import { resolveOwnerSnapshot } from "./owner-snapshot";
import { buildPreferenceQuery } from "./person-facets";
import { semanticSimilarity } from "./text-similarity";
import type { UserUnderstanding } from "./understanding";
import { datesCompatible, intentDateRange } from "./wish-date";
import type { SideLang, WishHardFilters } from "./wish-types";
import { resolvePlaceOnline, passesOfflinePlaceHardFilter } from "./wish-place";
import type { BuddyMatchQuery } from "./wish-match-profile";
import {
  buddyHardFiltersFromMatchQuery,
  otherReqSimilarityScore,
  passesBuddyStrictMatch,
  personalityProfileScore,
  softBuddyDemographicScore,
} from "./buddy-match";

export const WISH_RECALL_LIMIT = 8;
export const OTHER_SEMANTIC_MIN = 0.12;

const QUALITY_RANK: Record<MatchQuality, number> = {
  exact: 0,
  "relaxed-when": 1,
  "relaxed-level": 2,
};

export interface WishRecallOpts {
  mine: Intent;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  buddyMatchQuery?: BuddyMatchQuery;
  understanding: UserUnderstanding;
  exclude?: string[];
  excludeOwnerIds?: string[];
  shownIds?: string[];
  passedIds?: string[];
  limit?: number;
  /** Server/tests: explicit candidate pool. Falls back to seed + my intents. */
  pool?: Intent[];
  /** Browse lane: no silent cross-city or city-filter relaxation. */
  browseStrict?: boolean;
}

export interface RecalledWish {
  id: string;
  score: number;
  quality: MatchQuality;
  crossCity: boolean;
}

export interface WishRecallResult {
  candidates: RecalledWish[];
  nearMissIds: string[];
  sameCityEmpty: boolean;
  crossCityUsed: boolean;
  filteredCount: number;
  filtersRelaxed: boolean;
  relaxHints: string[];
}

export interface WishRecallContext {
  mine: Intent;
  hardFilters: WishHardFilters;
  buddyHardFilters: BuddyHardFilters;
  buddyMatchQuery?: BuddyMatchQuery;
}

function intentPlace(it: Intent) {
  return placeFromCityLabels(it.city || it.ownerCity, it.city_zh || it.ownerCity_zh);
}

function crossCityAllowed(mine: Intent, filters: WishHardFilters): boolean {
  return Boolean(mine.allowCrossCity || filters.allowCrossCity);
}

function otherSemanticScore(a: string, b: string): number {
  return semanticSimilarity(a, b);
}

function kindsCompatible(mine: Intent, other: Intent): boolean {
  if (mine.kind !== "other" && other.kind !== "other") {
    return mine.kind === other.kind;
  }
  if (mine.kind !== "other" && other.kind === "other") return false;
  if (mine.kind === "other" && other.kind !== "other") {
    return (
      otherSemanticScore(
        `${mine.rawText} ${mine.rawText_zh}`,
        `${other.rawText} ${other.rawText_zh}`,
      ) >= OTHER_SEMANTIC_MIN
    );
  }
  return (
    otherSemanticScore(
      `${mine.rawText} ${mine.rawText_zh}`,
      `${other.rawText} ${other.rawText_zh}`,
    ) >= OTHER_SEMANTIC_MIN
  );
}

function passesStrictWhen(mine: Intent, other: Intent): boolean {
  if (!mine.strictWhen || mine.whenAny) return true;
  const mineRange = intentDateRange(mine);
  if (mineRange && !datesCompatible(mine, other)) return false;
  const mineWhen = slotToWhen(mine.day, mine.window);
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  if (mineRange) return true;
  return whenCompatible(mineWhen, theirWhen);
}

function passesStrictLevel(mine: Intent, other: Intent): boolean {
  if (!mine.strictLevel || mine.levelAny) return true;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;
  if (!LEVEL_KINDS.includes(kind)) return true;
  if (other.levelAny) return false;
  return mine.level === other.level;
}

function resolveBuddyQuery(opts: WishRecallOpts): BuddyMatchQuery | null {
  return opts.buddyMatchQuery ?? opts.mine.buddyMatchQuery ?? null;
}

function effectiveBuddyHardFilters(opts: WishRecallOpts): BuddyHardFilters {
  const q = resolveBuddyQuery(opts);
  if (q) return buddyHardFiltersFromMatchQuery(q);
  return opts.buddyHardFilters;
}

function passesPlaceModeHardFilter(mine: Intent, other: Intent): boolean {
  return resolvePlaceOnline(mine) === resolvePlaceOnline(other);
}

function passesOfflineGeoHardFilter(
  mine: Intent,
  other: Intent,
  respectCity: boolean,
): boolean {
  return passesOfflinePlaceHardFilter(mine, other, respectCity, sameCity);
}

function passesHardFilters(
  it: Intent,
  mine: Intent,
  f: WishHardFilters,
  opts: WishRecallOpts,
  respectCity: boolean,
): boolean {
  const buddy = effectiveBuddyHardFilters(opts);
  const buddyQ = resolveBuddyQuery(opts);
  if (it.ownerId === mine.ownerId || it.id === mine.id) return false;
  if (!isIntentRecallable(it)) return false;
  if (!passesPlaceModeHardFilter(mine, it)) return false;

  const mineOnline = resolvePlaceOnline(mine);
  if (!mineOnline && !passesOfflineGeoHardFilter(mine, it, respectCity)) return false;

  const place = intentPlace(it);
  const include = respectCity ? parsePlaceList(f.cities) : [];
  const exclude = parsePlaceList(f.excludeCities);
  if (!matchesLocationFilters(place, include, exclude)) return false;

  if (
    f.kinds.length > 0 &&
    !f.kinds.includes(it.kind) &&
    it.kind !== "other" &&
    mine.kind !== "other"
  ) {
    if (!f.kinds.includes(mine.kind)) return false;
    if (it.kind !== mine.kind) return false;
  }

  if (!kindsCompatible(mine, it)) return false;
  if (!passesStrictWhen(mine, it)) return false;
  if (!passesStrictLevel(mine, it)) return false;
  if (intentDateRange(mine) && !datesCompatible(mine, it)) return false;
  if (
    buddyFiltersActive(buddy) &&
    !ownerPassesBuddyHardFilters(resolveOwnerSnapshot(it), buddy)
  ) {
    return false;
  }
  if (buddyQ && !passesBuddyStrictMatch(it, buddyQ)) return false;
  return true;
}

function freshnessScore(it: Intent): number {
  const age = Date.now() - (it.createdAt || 0);
  const day = 86_400_000;
  if (age <= 7 * day) return 2;
  if (age <= 30 * day) return 1;
  return 0;
}

function semanticScore(mine: Intent, other: Intent, u: UserUnderstanding): number {
  const query = [buildPreferenceQuery(u), mine.rawText, mine.rawText_zh].filter(Boolean).join(" ");
  const doc = `${other.rawText} ${other.rawText_zh}`;
  if (!query.trim() || !doc.trim()) return 0;
  let s = semanticSimilarity(query, doc) * 10;
  for (const neg of u.negative) {
    s -= semanticSimilarity(neg, doc) * 0.85;
  }
  return s;
}

function softScore(mine: Intent, other: Intent, u: UserUnderstanding, opts: WishRecallOpts): number {
  let s = 0;
  const buddyQ = resolveBuddyQuery(opts);
  const mineWhen: WhenTier | undefined = mine.whenAny ? undefined : slotToWhen(mine.day, mine.window);
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;
  const theirLevel: LevelTier | undefined = other.levelAny ? undefined : other.level;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;

  if (mine.day === other.day && mine.window === other.window) s += 5;
  else if (whenCompatible(mineWhen, theirWhen)) s += 2;
  const mineDates = intentDateRange(mine);
  const otherDates = intentDateRange(other);
  if (mineDates && otherDates && mineDates.start === otherDates.start && mineDates.end === otherDates.end) {
    s += 4;
  } else if (mineDates && otherDates && datesCompatible(mine, other)) {
    s += 2;
  }
  if (mine.level === other.level) s += 3;
  if (levelCompatible(kind, mineLevel, theirLevel ?? "intermediate")) s += 1;

  s += semanticScore(mine, other, u);
  if (buddyQ) {
    s += softBuddyDemographicScore(other, buddyQ);
    s += personalityProfileScore(other, buddyQ);
  }
  s += otherReqSimilarityScore(mine, other);
  s += freshnessScore(other);

  if (resolvePlaceOnline(mine) && resolvePlaceOnline(other)) s += 4;
  else if (!resolvePlaceOnline(mine) && sameCity(mine, other)) s += 3;

  if (opts.shownIds?.includes(other.id)) s -= 1.5;
  if (opts.passedIds?.includes(other.id)) s -= 4;

  return s;
}

function classifyQuality(mine: Intent, other: Intent): MatchQuality {
  const mineWhen: WhenTier | undefined = mine.whenAny ? undefined : slotToWhen(mine.day, mine.window);
  const theirWhen: WhenTier = other.whenAny ? "any" : slotToWhen(other.day, other.window);
  const mineLevel: LevelTier | undefined = mine.levelAny ? undefined : mine.level;
  const theirLevel: LevelTier | undefined = other.levelAny ? undefined : other.level;
  const kind = mine.kind !== "other" ? mine.kind : other.kind;
  const whenOk = whenCompatible(mineWhen, theirWhen);
  const levelOk = levelCompatible(kind, mineLevel, theirLevel ?? "intermediate");
  if (whenOk && levelOk) return "exact";
  if (!whenOk && levelOk) return "relaxed-when";
  return "relaxed-level";
}

export function matchQualityBetween(mine: Intent, other: Intent): MatchQuality {
  return classifyQuality(mine, other);
}

function compareRecalled(a: RecalledWish, b: RecalledWish): number {
  const q = QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality];
  if (q !== 0) return q;
  return b.score - a.score;
}

function poolFor(mine: Intent, pool?: Intent[]): Intent[] {
  const base = pool ?? [...seedPool(), ...loadMyIntents().filter((it) => it.id !== mine.id)];
  return base.filter((it) => it.id !== mine.id);
}

function intentFromPool(id: string, pool?: Intent[]): Intent | null {
  return getIntentById(id) ?? pool?.find((it) => it.id === id) ?? null;
}

function recallFromPool(
  mine: Intent,
  opts: WishRecallOpts,
  respectCity: boolean,
): { rows: RecalledWish[]; filteredCount: number } {
  const excluded = new Set([...(opts.exclude ?? []), ...(opts.passedIds ?? [])]);
  const excludedOwners = new Set(opts.excludeOwnerIds ?? []);
  const limit = opts.limit ?? WISH_RECALL_LIMIT;

  const items = poolFor(mine, opts.pool)
    .filter((it) => !excluded.has(it.id) && !excludedOwners.has(it.ownerId))
    .filter((it) => passesHardFilters(it, mine, opts.hardFilters, opts, respectCity));

  const scored = items
    .map((it) => ({
      id: it.id,
      score: softScore(mine, it, opts.understanding, opts),
      quality: classifyQuality(mine, it),
      crossCity: respectCity ? false : !sameCity(mine, it),
    }))
    .sort(compareRecalled);

  const seenOwners = new Set<string>();
  const out: RecalledWish[] = [];
  for (const row of scored) {
    const it = intentFromPool(row.id, opts.pool);
    if (!it || seenOwners.has(it.ownerId)) continue;
    seenOwners.add(it.ownerId);
    out.push(row);
    if (out.length >= limit) break;
  }
  return { rows: out, filteredCount: items.length };
}

function recallWithContext(
  ctx: WishRecallContext,
  opts: Omit<WishRecallOpts, "mine" | "hardFilters" | "buddyHardFilters">,
  filtersRelaxed: boolean,
  relaxHints: string[],
  browseStrict = false,
): WishRecallResult {
  const poolOpts: WishRecallOpts = {
    ...opts,
    mine: ctx.mine,
    hardFilters: ctx.hardFilters,
    buddyHardFilters: ctx.buddyHardFilters,
    buddyMatchQuery: ctx.buddyMatchQuery ?? ctx.mine.buddyMatchQuery ?? opts.buddyMatchQuery,
  };

  if (resolvePlaceOnline(ctx.mine)) {
    const onlineResult = recallFromPool(ctx.mine, poolOpts, false);
    const nears = findNearMisses(ctx.mine, {
      exclude: opts.exclude,
      excludeOwnerIds: opts.excludeOwnerIds,
    });
    return {
      candidates: onlineResult.rows,
      nearMissIds: nears.map((n) => n.id).slice(0, 3),
      sameCityEmpty: false,
      crossCityUsed: false,
      filteredCount: onlineResult.filteredCount,
      filtersRelaxed,
      relaxHints,
    };
  }

  const sameCityResult = recallFromPool(ctx.mine, poolOpts, true);
  if (sameCityResult.rows.length > 0) {
    const nears = findNearMisses(ctx.mine, {
      exclude: opts.exclude,
      excludeOwnerIds: opts.excludeOwnerIds,
    });
    return {
      candidates: sameCityResult.rows,
      nearMissIds: nears.map((n) => n.id).slice(0, 3),
      sameCityEmpty: false,
      crossCityUsed: false,
      filteredCount: sameCityResult.filteredCount,
      filtersRelaxed,
      relaxHints,
    };
  }

  if (!crossCityAllowed(ctx.mine, ctx.hardFilters) || browseStrict) {
    const nears = findNearMisses(ctx.mine, {
      exclude: opts.exclude,
      excludeOwnerIds: opts.excludeOwnerIds,
    });
    return {
      candidates: [],
      nearMissIds: nears.map((n) => n.id).slice(0, 3),
      sameCityEmpty: true,
      crossCityUsed: false,
      filteredCount: sameCityResult.filteredCount,
      filtersRelaxed,
      relaxHints,
    };
  }

  const cross = recallFromPool(ctx.mine, poolOpts, false);
  const nears = findNearMisses(ctx.mine, {
    exclude: opts.exclude,
    excludeOwnerIds: opts.excludeOwnerIds,
  });
  return {
    candidates: cross.rows,
    nearMissIds: nears.map((n) => n.id).slice(0, 3),
    sameCityEmpty: true,
    crossCityUsed: cross.rows.length > 0,
    filteredCount: cross.filteredCount,
    filtersRelaxed,
    relaxHints,
  };
}

export function recallWishCandidates(opts: WishRecallOpts): WishRecallResult {
  return recallWithContext(
    {
      mine: opts.mine,
      hardFilters: opts.hardFilters,
      buddyHardFilters: opts.buddyHardFilters,
      buddyMatchQuery: opts.buddyMatchQuery ?? opts.mine.buddyMatchQuery,
    },
    opts,
    false,
    [],
  );
}

function probeContext(
  ctx: WishRecallContext,
  opts: Omit<WishRecallOpts, "mine" | "hardFilters" | "buddyHardFilters">,
): number {
  const poolOpts: WishRecallOpts = {
    ...opts,
    mine: ctx.mine,
    hardFilters: ctx.hardFilters,
    buddyHardFilters: ctx.buddyHardFilters,
    buddyMatchQuery: ctx.buddyMatchQuery ?? ctx.mine.buddyMatchQuery ?? opts.buddyMatchQuery,
  };
  const same = recallFromPool(ctx.mine, poolOpts, true);
  if (same.filteredCount > 0) return same.filteredCount;
  if (!crossCityAllowed(ctx.mine, ctx.hardFilters)) return 0;
  return recallFromPool(ctx.mine, poolOpts, false).filteredCount;
}

/** Stepwise relax strict flags / filters when the pool is empty. */
export function ensureMatchableWishContext(
  ctx: WishRecallContext,
  opts: Omit<WishRecallOpts, "mine" | "hardFilters" | "buddyHardFilters">,
  lang: SideLang = "zh-CN",
): { context: WishRecallContext; relaxHints: string[] } {
  const isZh = lang === "zh-CN";
  const hints: string[] = [];
  const browseStrict = Boolean(opts.browseStrict);

  if (probeContext(ctx, opts) > 0) {
    return { context: ctx, relaxHints: hints };
  }

  if (ctx.mine.strictWhen) {
    const next: WishRecallContext = {
      ...ctx,
      mine: { ...ctx.mine, strictWhen: false },
    };
    if (probeContext(next, opts) > 0) {
      hints.push(isZh ? "已放宽：时间不再硬性要求。" : "Relaxed: when is no longer strict.");
      return { context: next, relaxHints: hints };
    }
  }

  if (ctx.mine.strictLevel) {
    const next: WishRecallContext = {
      ...ctx,
      mine: { ...ctx.mine, strictLevel: false },
    };
    if (probeContext(next, opts) > 0) {
      hints.push(isZh ? "已放宽：水平不再硬性要求。" : "Relaxed: level is no longer strict.");
      return { context: next, relaxHints: hints };
    }
  }

  if (ctx.hardFilters.kinds.length > 0) {
    const next: WishRecallContext = {
      ...ctx,
      hardFilters: { ...ctx.hardFilters, kinds: [] },
    };
    if (probeContext(next, opts) > 0) {
      hints.push(isZh ? "已放宽：活动类型限制。" : "Relaxed: activity kind filter.");
      return { context: next, relaxHints: hints };
    }
  }

  if (buddyFiltersActive(ctx.buddyHardFilters)) {
    if (ctx.buddyHardFilters.ageMin != null || ctx.buddyHardFilters.ageMax != null) {
      const noAge: WishRecallContext = {
        ...ctx,
        buddyHardFilters: { ...ctx.buddyHardFilters, ageMin: null, ageMax: null },
      };
      if (probeContext(noAge, opts) > 0) {
        hints.push(isZh ? "已放宽：搭子年龄限制。" : "Relaxed: buddy age filter.");
        return { context: noAge, relaxHints: hints };
      }
    }
    if (ctx.buddyHardFilters.genders.length > 0 || ctx.buddyHardFilters.excludeGenders.length > 0) {
      const noGender: WishRecallContext = {
        ...ctx,
        buddyHardFilters: {
          ...ctx.buddyHardFilters,
          genders: [],
          excludeGenders: [],
        },
      };
      if (probeContext(noGender, opts) > 0) {
        hints.push(isZh ? "已放宽：搭子性别限制。" : "Relaxed: buddy gender filter.");
        return { context: noGender, relaxHints: hints };
      }
    }
    const noBuddy: WishRecallContext = {
      ...ctx,
      buddyHardFilters: { ...EMPTY_BUDDY_HARD_FILTERS },
    };
    if (probeContext(noBuddy, opts) > 0) {
      hints.push(isZh ? "已放宽：搭子人群要求。" : "Relaxed: buddy demographic filters.");
      return { context: noBuddy, relaxHints: hints };
    }
  }

  if (
    !browseStrict &&
    !crossCityAllowed(ctx.mine, ctx.hardFilters) &&
    (ctx.hardFilters.cities.length > 0 || ctx.hardFilters.excludeCities.length > 0)
  ) {
    const next: WishRecallContext = {
      ...ctx,
      mine: { ...ctx.mine, allowCrossCity: true },
      hardFilters: { ...ctx.hardFilters, allowCrossCity: true },
    };
    if (probeContext(next, opts) > 0) {
      hints.push(isZh ? "已放宽：允许跨城匹配。" : "Relaxed: cross-city matches allowed.");
      return { context: next, relaxHints: hints };
    }
  }

  if (
    !browseStrict &&
    (ctx.hardFilters.cities.length > 0 || ctx.hardFilters.excludeCities.length > 0)
  ) {
    const next: WishRecallContext = {
      ...ctx,
      hardFilters: { ...ctx.hardFilters, cities: [], excludeCities: [] },
    };
    if (probeContext(next, opts) > 0) {
      hints.push(isZh ? "已放宽：城市限制。" : "Relaxed: city filter.");
      return { context: next, relaxHints: hints };
    }
  }

  return { context: ctx, relaxHints: hints };
}

export function recallWishWithRelaxation(
  opts: WishRecallOpts,
  lang: SideLang = "zh-CN",
): WishRecallResult {
  const base: WishRecallContext = {
    mine: opts.mine,
    hardFilters: opts.hardFilters,
    buddyHardFilters: opts.buddyHardFilters,
    buddyMatchQuery: opts.buddyMatchQuery ?? opts.mine.buddyMatchQuery,
  };
  const { context, relaxHints } = ensureMatchableWishContext(base, opts, lang);
  const filtersRelaxed = relaxHints.length > 0;
  return recallWithContext(context, opts, filtersRelaxed, relaxHints, Boolean(opts.browseStrict));
}

export function intentCardLine(intent: Intent, lang: SideLang, blocked: boolean): string {
  const zh = lang === "zh-CN";
  const snap = resolveOwnerSnapshot(intent);
  const name = zh ? snap.name_zh || intent.ownerName_zh : snap.name || intent.ownerName;
  const city = zh ? intent.city_zh || intent.ownerCity_zh : intent.city || intent.ownerCity;
  const raw = zh ? intent.rawText_zh || intent.rawText : intent.rawText;
  const when = intent.whenAny ? "any" : slotToWhen(intent.day, intent.window);
  const level = intent.levelAny ? "any" : intent.level;
  const dates = intentDateRange(intent);
  const dateLine = dates
    ? dates.start === dates.end
      ? dates.start
      : `${dates.start}..${dates.end}`
    : "any";
  const demo =
    snap.gender || snap.age != null
      ? ` | ${snap.gender || "?"}${snap.age != null ? ` ${snap.age}` : ""}`
      : "";
  const tag = blocked ? " [tried]" : "";
  return `- id=${intent.id} | ${name}${demo} | ${city} | kind=${intent.kind} | when=${when} | dates=${dateLine} | level=${level} | ${raw.slice(0, 80)}${tag}`;
}

export function rosterFromIntentIds(
  ids: string[],
  lang: SideLang,
  blocked: Set<string>,
): string {
  return ids
    .map((id) => {
      const it = getIntentById(id);
      if (!it) return null;
      return intentCardLine(it, lang, blocked.has(id));
    })
    .filter(Boolean)
    .join("\n");
}

export function pickNextFromRecall(
  recall: WishRecallResult,
  excludeIntentId?: string | null,
): RecalledWish | null {
  for (const c of recall.candidates) {
    if (c.id !== excludeIntentId) return c;
  }
  return null;
}

export function wishRecallFingerprint(
  ctx: WishRecallContext,
  u: UserUnderstanding,
  exclude: string[],
  browseStrict = false,
): string {
  return JSON.stringify({
    mineId: ctx.mine.id,
    kind: ctx.mine.kind,
    strictWhen: ctx.mine.strictWhen,
    strictLevel: ctx.mine.strictLevel,
    allowCrossCity: ctx.mine.allowCrossCity ?? ctx.hardFilters.allowCrossCity,
    placeOnline: resolvePlaceOnline(ctx.mine),
    placeFlex: ctx.mine.placeFlex ?? false,
    buddy: ctx.buddyHardFilters,
    buddyMatchQuery: ctx.buddyMatchQuery ?? ctx.mine.buddyMatchQuery,
    filters: ctx.hardFilters,
    notes: u.notes,
    positive: u.positive,
    negative: u.negative,
    exclude,
    browseStrict,
  });
}
