import type { WishRecallResult } from "./wish-recall";

const cache = new Map<string, { at: number; result: WishRecallResult }>();
const CACHE_TTL_MS = 5 * 60_000;

export function getCachedWishRecall(key: string): WishRecallResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

export function setCachedWishRecall(key: string, result: WishRecallResult): void {
  cache.set(key, { at: Date.now(), result });
}

export function invalidateWishRecallCache(): void {
  cache.clear();
}
