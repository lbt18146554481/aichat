/**
 * Structured wish match profile: fields + descriptions + buddy query for recall.
 */

import type { PersonGender } from "./types";
import type { WishPlace } from "./wish-place";
import type { BuddyMatchQuery } from "./wish-match-profile";

export type MatchMode = "strict" | "soft" | null;

/** What the searcher wants in an activity buddy (matched against publisher profile). */
export interface BuddyMatchQuery {
  genders: PersonGender[];
  genderMode: MatchMode;
  ageMin: number | null;
  ageMax: number | null;
  ageMode: MatchMode;
  /** LLM free-form personality / vibe tags the user wants in a buddy. */
  personalityTags: string[];
  /** Text used for semantic similarity (tags + key phrases). */
  personalityQueryText: string;
}

export const EMPTY_BUDDY_MATCH_QUERY: BuddyMatchQuery = {
  genders: [],
  genderMode: null,
  ageMin: null,
  ageMax: null,
  ageMode: null,
  personalityTags: [],
  personalityQueryText: "",
};

export function buddyMatchQueryActive(q: BuddyMatchQuery | null | undefined): boolean {
  if (!q) return false;
  return (
    q.genderMode != null ||
    q.ageMode != null ||
    q.personalityTags.length > 0 ||
    Boolean(q.personalityQueryText.trim())
  );
}

export function normalizeBuddyMatchQuery(
  raw: Partial<BuddyMatchQuery> | null | undefined,
): BuddyMatchQuery {
  if (!raw) return { ...EMPTY_BUDDY_MATCH_QUERY };
  const personalityTags = (raw.personalityTags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 16);
  const personalityQueryText =
    raw.personalityQueryText?.trim() ||
    personalityTags.join("、") ||
    "";
  return {
    genders: raw.genders ?? [],
    genderMode: raw.genderMode ?? null,
    ageMin: raw.ageMin ?? null,
    ageMax: raw.ageMax ?? null,
    ageMode: raw.ageMode ?? null,
    personalityTags,
    personalityQueryText,
  };
}

/** Three free-text descriptions on the wish form. */
export interface WishDescriptions {
  /** Activity details (field `kind` wins on conflict). */
  activityDescRaw: string;
  /** Buddy preference — extracted at publish into BuddyMatchQuery. */
  buddyPrefRaw: string;
  /** Other activity-related info — raw only, similarity at match time. */
  otherReqRaw: string;
}

export function wishDescriptionsFromDraft(draft: {
  activityDescRaw?: string;
  rawText?: string;
  buddyPrefRaw?: string;
  otherReqRaw?: string;
}): WishDescriptions {
  const activityDescRaw = draft.activityDescRaw?.trim() || draft.rawText?.trim() || "";
  return {
    activityDescRaw,
    buddyPrefRaw: draft.buddyPrefRaw?.trim() || "",
    otherReqRaw: draft.otherReqRaw?.trim() || "",
  };
}

export function syncDraftDescriptions<T extends { rawText?: string; activityDescRaw?: string }>(
  draft: T,
): T {
  const activityDescRaw = draft.activityDescRaw?.trim() || draft.rawText?.trim() || "";
  return {
    ...draft,
    activityDescRaw,
    rawText: activityDescRaw,
  };
}
