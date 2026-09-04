import type { EducationLevel, Person, PersonGender } from "./types";
import type { UserUnderstanding } from "./understanding";

export type MatchmakerLang = "en" | "zh-CN";

/** Hard constraints extracted from conversation — used for filtering only. */
export interface MatchHardFilters {
  ageMin: number | null;
  ageMax: number | null;
  /** If non-empty, person must match one of these genders. */
  genders: PersonGender[];
  excludeGenders: PersonGender[];
  /** Location phrases (country / admin1 / city; CN/EN aliases ok). Empty = no location filter. */
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
  genders: [],
  excludeGenders: [],
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
  /** Server/tests: candidate pool from DB or explicit fixture. */
  pool?: Person[];
}

export interface RecalledCandidate {
  id: string;
  score: number;
  /** Semantic similarity component (0..1) when preference query present. */
  vectorScore?: number;
}

export interface RecallResult {
  candidates: RecalledCandidate[];
  /** Total after hard filter, before limit */
  filteredCount: number;
  /** Hard filter removed everyone */
  emptyAfterHardFilter: boolean;
}
