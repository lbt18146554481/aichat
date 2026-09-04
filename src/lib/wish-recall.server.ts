import type { SideLang } from "./wish-types";
import type { UserUnderstanding } from "./understanding";
import { queryRecallIntentPool } from "./intent-store.server";
import {
  getCachedWishRecall,
  setCachedWishRecall,
  invalidateWishRecallCache,
} from "./wish-recall-cache.server";
import {
  diagnoseWishRecallDrops,
  recallWishWithRelaxation,
  wishRecallFingerprint,
  type WishRecallOpts,
  type WishRecallResult,
} from "./wish-recall";
import { log } from "./logger.server";

export { invalidateWishRecallCache };

function mineSummary(mine: WishRecallOpts["mine"]) {
  return {
    id: mine.id,
    ownerId: mine.ownerId,
    kind: mine.kind,
    city: mine.city_zh || mine.city || mine.ownerCity_zh || mine.ownerCity || "",
    placeRaw: mine.placeRaw || "",
    whenAny: mine.whenAny ?? false,
    dateStart: mine.dateStart || null,
    dateEnd: mine.dateEnd || null,
    raw: (mine.rawText_zh || mine.rawText || "").slice(0, 80),
  };
}

export async function recallWishCandidatesServer(
  opts: WishRecallOpts,
  lang: SideLang = "zh-CN",
): Promise<WishRecallResult> {
  const pool = opts.pool ?? (await queryRecallIntentPool(opts.mine));
  const recallOpts = { ...opts, pool };
  const fp = wishRecallFingerprint(
    {
      mine: opts.mine,
      hardFilters: opts.hardFilters,
      buddyHardFilters: opts.buddyHardFilters,
      buddyMatchQuery: opts.buddyMatchQuery ?? opts.mine.buddyMatchQuery,
    },
    opts.understanding,
    [...(opts.exclude ?? []), ...(opts.passedIds ?? [])],
    Boolean(opts.browseStrict),
  );
  const cached = getCachedWishRecall(fp);
  if (cached) {
    log.info("wish-recall", "cache hit", {
      browseStrict: Boolean(opts.browseStrict),
      mine: mineSummary(opts.mine),
      candidates: cached.candidates.length,
      filteredCount: cached.filteredCount,
      topIds: cached.candidates.slice(0, 5).map((c) => c.id),
    });
    return cached;
  }
  const result = recallWishWithRelaxation(recallOpts, lang);
  setCachedWishRecall(fp, result);

  const payload: Record<string, unknown> = {
    browseStrict: Boolean(opts.browseStrict),
    mine: mineSummary(opts.mine),
    hardCities: opts.hardFilters.cities,
    hardKinds: opts.hardFilters.kinds,
    poolSize: pool.length,
    candidates: result.candidates.length,
    filteredCount: result.filteredCount,
    empty: result.candidates.length === 0,
    crossCityUsed: result.crossCityUsed,
    filtersRelaxed: result.filtersRelaxed,
    relaxHints: result.relaxHints,
    topIds: result.candidates.slice(0, 5).map((c) => c.id),
  };

  if (result.candidates.length === 0) {
    const diag = diagnoseWishRecallDrops(recallOpts, true);
    payload.drops = diag.drops;
    payload.afterExclude = diag.afterExclude;
    payload.sampleDropped = diag.sampleDropped;
    log.warn("wish-recall", "empty after hard filters", payload);
  } else {
    log.info("wish-recall", "ok", payload);
  }

  return result;
}

export async function prewarmWishRecallCache(
  mine: WishRecallOpts["mine"],
  hardFilters: WishRecallOpts["hardFilters"],
  buddyHardFilters: WishRecallOpts["buddyHardFilters"],
  understanding: UserUnderstanding,
): Promise<void> {
  await recallWishCandidatesServer({ mine, hardFilters, buddyHardFilters, understanding }, "zh-CN");
}
