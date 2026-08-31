import type { EducationLevel } from "./types";
import type { UserUnderstanding } from "./understanding";

export type MatchmakerLang = "en" | "zh-CN";

/** Hard constraints extracted from conversation — used for filtering only. */
export interface MatchHardFilters {
  ageMin: number | null;
  ageMax: number | null;
  /** Person must be in one of these cities (normalized keys). Empty = no city filter. */
  cities: string[];
  excludeCities: string[];
  /** Minimum education level (inclusive). null = no minimum. */
  educationMin: EducationLevel | null;
  /** If non-empty, person must match one of these levels exactly. */
  educationLevels: EducationLevel[];
  excludeEducationLevels: EducationLevel[];
}

export const EMPTY_HARD_FILTERS: MatchHardFilters = {
  ageMin: null,
  ageMax: null,
  cities: [],
  excludeCities: [],
  educationMin: null,
  educationLevels: [],
  excludeEducationLevels: [],
};

export interface RecallOpts {
  understanding: UserUnderstanding;
  hardFilters: MatchHardFilters;
  blockedIds: string[];
  shownIds: string[];
  passedIds: string[];
  limit?: number;
}

export interface RecalledCandidate {
  id: string;
  score: number;
}

export interface RecallResult {
  candidates: RecalledCandidate[];
  /** Total after hard filter, before limit */
  filteredCount: number;
  /** Hard filter removed everyone */
  emptyAfterHardFilter: boolean;
}
