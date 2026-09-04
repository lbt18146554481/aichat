import type { SideLang } from "./wish-types";
import type { UserUnderstanding } from "./understanding";
import { queryRecallIntentPool } from "./intent-store.server";
import {
  getCachedWishRecall,
  setCachedWishRecall,
  invalidateWishRecallCache,
} from "./wish-recall-cache.server";
import {
  recallWishWithRelaxation,
  wishRecallFingerprint,
  type WishRecallOpts,
  type WishRecallResult,
} from "./wish-recall";

export { invalidateWishRecallCache };

export async function recallWishCandidatesServer(
  opts: WishRecallOpts,
  lang: SideLang = "zh-CN",
): Promise<WishRecallResult> {
  const pool = opts.pool ?? (await queryRecallIntentPool(opts.mine));
  const recallOpts = { ...opts, pool };
  const fp = wishRecallFingerprint(
    { mine: opts.mine, hardFilters: opts.hardFilters },
    opts.understanding,
    [...(opts.exclude ?? []), ...(opts.passedIds ?? [])],
    Boolean(opts.browseStrict),
  );
  const cached = getCachedWishRecall(fp);
  if (cached) return cached;
  const result = recallWishWithRelaxation(recallOpts, lang);
  setCachedWishRecall(fp, result);
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
