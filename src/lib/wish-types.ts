import type { ActivityKind } from "./types";
import type { LevelTier, WhenTier } from "./intents";
import type { BuddyHardFilters } from "./buddy-filters";
import { EMPTY_BUDDY_HARD_FILTERS } from "./buddy-filters";
import type { BuddyMatchQuery } from "./wish-match-profile";

export type { BuddyHardFilters } from "./buddy-filters";
export { EMPTY_BUDDY_HARD_FILTERS } from "./buddy-filters";

export type SideLang = "en" | "zh-CN";

/** In-progress wish before publish. */
export interface WishDraft {
  kind: ActivityKind | null;
  when?: WhenTier;
  level?: LevelTier;
  city?: string;
  city_zh?: string;
  /** Free-text place from the publish form; structured at publish time. */
  placeRaw?: string;
  /** Explicit online activity — no physical meetup. */
  placeOnline?: boolean;
  placeFlex?: boolean;
  place?: WishPlace;
  rawText: string;
  whenAny: boolean;
  levelAny: boolean;
  /** User said when is mandatory (e.g. 必须周末). */
  strictWhen?: boolean;
  /** User said level must match (e.g. 同级别). */
  strictLevel?: boolean;
  /** User ok with cross-city matches (e.g. 异地也行). */
  allowCrossCity?: boolean;
  /** Inclusive calendar start YYYY-MM-DD (from relative phrases like 这周末). */
  dateStart?: string;
  /** Inclusive calendar end YYYY-MM-DD; defaults to dateStart. */
  dateEnd?: string;
  /** Local start time HH:mm (Asia/Shanghai) on dateStart. */
  timeStart?: string;
  /** Local end time HH:mm on dateEnd or dateStart. */
  timeEnd?: string;
  /** Activity description (synced with rawText). */
  activityDescRaw?: string;
  /** Buddy preference free text — structured at publish. */
  buddyPrefRaw?: string;
  /** Other activity-related info — raw only. */
  otherReqRaw?: string;
  /** Structured buddy query — filled at publish or browse extract. */
  buddyMatchQuery?: BuddyMatchQuery;
}

export interface WishHardFilters {
  cities: string[];
  excludeCities: string[];
  kinds: ActivityKind[];
  allowCrossCity?: boolean;
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
    strictWhen: false,
    strictLevel: false,
    allowCrossCity: false,
  };
}
