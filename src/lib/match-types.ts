import type { EducationLevel, Person, PersonGender } from "./types";
import type { UserUnderstanding } from "./understanding";

export type MatchmakerLang = "en" | "zh-CN";

/** Hard constraints extracted from conversation — used for filtering only. */
export interface MatchHardFilters {
  ageMin: number | null;
  ageMax: number | null;
  /** hard = must age range; flex = preferred range (soft score). Default hard when age set. */
  ageStrength?: import("./field-constraint").ConstraintStrength | null;
  /** If non-empty, person must match one of these genders. */
  genders: PersonGender[];
  excludeGenders: PersonGender[];
  /** hard = must; flex = 最好是. Default hard when genders set. */
  genderStrength?: import("./field-constraint").ConstraintStrength | null;
  /** Location phrases (country / admin1 / city; CN/EN aliases ok). Empty = no location filter. */
  cities: string[];
  excludeCities: string[];
  /** hard = must city; flex = preferred city. Default hard. */
  cityStrength?: import("./field-constraint").ConstraintStrength | null;
  /** Minimum education level (inclusive). null = no minimum. */
  educationMin: EducationLevel | null;
  /** If non-empty, person must match one of these levels exactly. */
  educationLevels: EducationLevel[];
  excludeEducationLevels: EducationLevel[];
  /** hard = must education; flex = preferred. Default hard when education set. */
  educationStrength?: import("./field-constraint").ConstraintStrength | null;
}

export const EMPTY_HARD_FILTERS: MatchHardFilters = {
  ageMin: null,
  ageMax: null,
  ageStrength: null,
  genders: [],
  excludeGenders: [],
  genderStrength: null,
  cities: [],
  excludeCities: [],
  cityStrength: null,
  educationMin: null,
  educationLevels: [],
  excludeEducationLevels: [],
  educationStrength: null,
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
