import type { ActivityKind } from "./types";
import type { LevelTier, WhenTier } from "./intents";

export type SideLang = "en" | "zh-CN";

/** In-progress wish before publish. */
export interface WishDraft {
  kind: ActivityKind | null;
  when?: WhenTier;
  level?: LevelTier;
  city?: string;
  city_zh?: string;
  rawText: string;
  whenAny: boolean;
  levelAny: boolean;
}

export interface WishHardFilters {
  cities: string[];
  excludeCities: string[];
  kinds: ActivityKind[];
}

export const EMPTY_WISH_HARD_FILTERS: WishHardFilters = {
  cities: [],
  excludeCities: [],
  kinds: [],
};

export function emptyWishDraft(rawText = ""): WishDraft {
  return {
    kind: null,
    rawText,
    whenAny: true,
    levelAny: true,
  };
}
