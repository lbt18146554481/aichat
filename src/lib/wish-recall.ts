import {
  findNearMisses,
  getIntentById,
  loadMyIntents,
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
import { passesActivityCoreHardFilter, resolveActivityCoreText } from "./activity-core";
import {
  buddyFiltersActive,
  EMPTY_BUDDY_HARD_FILTERS,
  ownerPassesBuddyHardFilters,
  type BuddyHardFilters,
} from "./buddy-filters";
import { resolveOwnerSnapshot } from "./owner-snapshot";
import type { UserUnderstanding } from "./understanding";
import { datesCompatible, intentDateRange } from "./wish-date";
import type { SideLang, WishHardFilters } from "./wish-types";
import { resolvePlaceOnline, passesPlaceModeHardFilter as placeModeOk, normalizePlaceSpec } from "./wish-place";
import {
  isHardConstrained,
  passesLevelHardFilter,
  passesPlaceCityHardFilter,
  passesWhenHardFilter,
  resolvePlaceCityConstraint,
  resolveWhenConstraint,
} from "./wish-constraints";
import type { BuddyMatchQuery } from "./wish-match-profile";
import {
  buddyHardFiltersFromMatchQuery,
  passesBuddyStrictMatch,
} from "./buddy-match";
import { scoreWishCandidate } from "./wish-match-score";
import { semanticSimilarity } from "./text-similarity";

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

const SPORT_KINDS = new Set(["run", "tennis", "climb"]);
const SPORT_QUERY_RE =
  /运动|体育|健身|走跑|跑步|慢跑|快跑|徒步|爬山|攀岩|网球|羽毛球|篮球|足球|骑行|游泳|sport|run|jog|hike|climb|tennis|gym|workout/i;
const SPORT_DOC_RE =
  /运动|体育|健身|走跑|跑步|慢跑|快跑|徒步|爬山|攀岩|网球|羽毛球|篮球|足球|骑行|游泳|散步|走一?圈|park|run|jog|hike|climb|tennis|gym|walk-?run|bouldering/i;

function intentBlob(it: Intent): string {
  return `${it.rawText ?? ""} ${it.rawText_zh ?? ""} ${it.activityDescRaw ?? ""} ${it.venue ?? ""} ${it.venue_zh ?? ""}`;
}

function sportsCompatible(mine: Intent, other: Intent): boolean {
  const mineBlob = intentBlob(mine);
  if (!SPORT_QUERY_RE.test(mineBlob)) return false;
  if (SPORT_KINDS.has(other.kind)) return true;
  return SPORT_DOC_RE.test(intentBlob(other));
}

function kindsCompatible(mine: Intent, other: Intent): boolean {
  // When either side has an activity core (explicit or mapped from kind),
  // enum kind is not a hard gate — activity hard/flex + τ handles it.
  if (resolveActivityCoreText(mine) || resolveActivityCoreText(other)) {
    return true;
  }
  if (mine.kind !== "other" && other.kind !== "other") {
    return mine.kind === other.kind;
  }
  if (mine.kind !== "other" && other.kind === "other") {
    // Specific seeker (e.g. run) vs vague pool wish: allow if pool text is sports-compatible.
    return sportsCompatible(mine, other) || sportsCompatible(other, mine);
  }
  if (mine.kind === "other" && other.kind !== "other") {
    if (sportsCompatible(mine, other)) return true;
    return (
      otherSemanticScore(
        `${mine.rawText} ${mine.rawText_zh}`,
        `${other.rawText} ${other.rawText_zh}`,
      ) >= OTHER_SEMANTIC_MIN
    );
  }
  if (sportsCompatible(mine, other)) return true;
  return (
    otherSemanticScore(
      `${mine.rawText} ${mine.rawText_zh}`,
      `${other.rawText} ${other.rawText_zh}`,
    ) >= OTHER_SEMANTIC_MIN
  );
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
  return placeModeOk(mine, other);
}

function passesOfflineGeoHardFilter(
  mine: Intent,
  other: Intent,
  respectCity: boolean,
): boolean {
  const placeC = resolvePlaceCityConstraint(mine);
  if (!isHardConstrained(placeC)) return true;
  return passesPlaceCityHardFilter(mine, other, respectCity, sameCity);
}

function hardFilterDropReason(
  it: Intent,
  mine: Intent,
  f: WishHardFilters,
  opts: WishRecallOpts,
  respectCity: boolean,
): string | null {
  const buddy = effectiveBuddyHardFilters(opts);
  const buddyQ = resolveBuddyQuery(opts);
  if (it.ownerId === mine.ownerId || it.id === mine.id) return "same_owner";
  if (!isIntentRecallable(it)) return "not_recallable";
  if (!passesPlaceModeHardFilter(mine, it)) return "place_mode";

  const mineOnline = resolvePlaceOnline(mine);
  if (!mineOnline && !passesOfflineGeoHardFilter(mine, it, respectCity)) return "offline_geo";

  const place = intentPlace(it);
  const include = respectCity ? parsePlaceList(f.cities) : [];
  const exclude = parsePlaceList(f.excludeCities);
  if (
    include.length > 0 &&
    isHardConstrained(resolvePlaceCityConstraint(mine)) &&
    !matchesLocationFilters(place, include, exclude)
  ) {
    return "location_filters";
  }
  if (exclude.length > 0 && !matchesLocationFilters(place, [], exclude)) {
    return "location_filters";
  }

  if (
    f.kinds.length > 0 &&
    !f.kinds.includes(it.kind) &&
    it.kind !== "other" &&
    mine.kind !== "other"
  ) {
    if (!f.kinds.includes(mine.kind)) return "kinds";
    if (it.kind !== mine.kind) return "kinds";
  }

  if (!kindsCompatible(mine, it)) return "kinds_compatible";
  if (!passesActivityCoreHardFilter(mine, it)) return "activity_core";
  if (!passesWhenHardFilter(mine, it)) return "strict_when";
  if (!passesLevelHardFilter(mine, it)) return "strict_level";
  if (
    intentDateRange(mine) &&
    isHardConstrained(resolveWhenConstraint(mine)) &&
    !datesCompatible(mine, it)
  ) {
    return "dates";
  }
  if (
    buddyFiltersActive(buddy) &&
    (mine.buddyGenderStrength !== "flex") &&
    !ownerPassesBuddyHardFilters(resolveOwnerSnapshot(it), buddy)
  ) {
    return "buddy_hard";
  }
  if (buddyQ && !passesBuddyStrictMatch(it, buddyQ)) return "buddy_strict";
  return null;
}

function passesHardFilters(
  it: Intent,
  mine: Intent,
  f: WishHardFilters,
  opts: WishRecallOpts,
  respectCity: boolean,
): boolean {
  return hardFilterDropReason(it, mine, f, opts, respectCity) == null;
}

/** Why candidates dropped — for server logs when recall is empty. */
export function diagnoseWishRecallDrops(
  opts: WishRecallOpts,
  respectCity = true,
): {
  poolSize: number;
  afterExclude: number;
  survivors: number;
  drops: Record<string, number>;
  sampleDropped: Array<{ id: string; reason: string; kind: string; city: string; ownerId: string }>;
} {
  const excluded = new Set([...(opts.exclude ?? []), ...(opts.passedIds ?? [])]);
  const excludedOwners = new Set(opts.excludeOwnerIds ?? []);
  const pool = poolFor(opts.mine, opts.pool);
  const drops: Record<string, number> = {};
  const sampleDropped: Array<{
    id: string;
    reason: string;
    kind: string;
    city: string;
    ownerId: string;
  }> = [];
  let afterExclude = 0;
  let survivors = 0;

  for (const it of pool) {
    if (excluded.has(it.id) || excludedOwners.has(it.ownerId)) {
      drops.excluded = (drops.excluded ?? 0) + 1;
      continue;
    }
    afterExclude += 1;
    const reason = hardFilterDropReason(it, opts.mine, opts.hardFilters, opts, respectCity);
    if (!reason) {
      survivors += 1;
      continue;
    }
    drops[reason] = (drops[reason] ?? 0) + 1;
    if (sampleDropped.length < 8) {
      sampleDropped.push({
        id: it.id,
        reason,
        kind: it.kind,
        city: it.city_zh || it.city || it.ownerCity_zh || it.ownerCity || "",
        ownerId: it.ownerId,
      });
    }
  }

  return { poolSize: pool.length, afterExclude, survivors, drops, sampleDropped };
}

function softScore(mine: Intent, other: Intent, u: UserUnderstanding, opts: WishRecallOpts): number {
  const buddy = effectiveBuddyHardFilters(opts);
  const buddyQ = resolveBuddyQuery(opts);
  return scoreWishCandidate(mine, other, u, {
    buddyHardFilters: buddy,
    buddyMatchQuery: buddyQ,
    shownIds: opts.shownIds,
    passedIds: opts.passedIds,
  }).total;
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
    placeMode: normalizePlaceSpec(ctx.mine).placeMode,
    placeCity: normalizePlaceSpec(ctx.mine).place?.city ?? null,
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
