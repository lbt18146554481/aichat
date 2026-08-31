// One person in the curated pool. The same Person object is read by both
// Agents (Matchmaker / Side by Side) — each uses a different slice.

export interface Angle {
  id: string;
  signals: string[];
  text: string;
  text_zh: string;
}

// A real-life recurring activity. Side by Side uses these to find people
// whose actual weekly rhythm overlaps with yours.
export interface Activity {
  kind: ActivityKind;
  level: "beginner" | "intermediate" | "advanced";
  area: string; // a neighborhood / district label
  area_zh: string;
  slots: Array<{ day: Weekday; window: "morning" | "midday" | "evening" }>;
  venue: string;
  venue_zh: string;
}

export type ActivityKind =
  | "tennis"
  | "run"
  | "climb"
  | "cook"
  | "exhibition"
  | "bookstore"
  | "other";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Reflection {
  questionId: string;
  answer: string;
  answer_zh: string;
}

// A Moment is the atomic unit of how a person becomes interesting to
// another person inside the product: prompt + this person's own concrete
// answer. Used for the Matchmaker right pane and as the quotable unit
// inside the "say hello" gesture.
export interface Moment {
  id: string;
  promptId: string;
  answer: string;
  answer_zh: string;
}

// One work — a single book / film / album / exhibition / food the person
// considers important to them right now, with one sentence of why.
// Shared-taste signal in addition to Moments.
export interface OneWorkRef {
  kind: "book" | "film" | "music" | "exhibition" | "food" | "other";
  title: string;
  title_zh?: string;
  why: string;
  why_zh: string;
}

/** Normalized education level for hard filtering. */
export type EducationLevel =
  | "high_school"
  | "associate"
  | "bachelor"
  | "master"
  | "doctorate";

export interface Person {
  id: string;
  name: string;
  name_zh: string;
  age: number;
  city: string;
  city_zh: string;
  occupation: string;
  occupation_zh: string;
  /** Display label, e.g. "Master's" / "硕士" */
  education: string;
  education_zh: string;
  /** Normalized level for hard filters */
  educationLevel: EducationLevel;
  portrait: string;
  portrait_zh: string;
  /** One-sentence self-introduction — the public "bio" field. */
  bio?: string;
  bio_zh?: string;
  signals: string[];
  angles: Angle[];
  activities: Activity[];
  reflections: Reflection[];
  moments: Moment[];
  favorites?: OneWorkRef[];
  /** One-sentence "why is TA" line for the side-by-side match card. Demo copy. */
  whyPersonLine?: { en: string; zh: string };
  /** 2-3 sentence "who is TA" line the Agent reads out when asked. Demo copy. */
  personBrief?: { en: string; zh: string };
  /** One-line suggested opener when the user asks Agent to draft one. Demo copy. */
  openerSuggestion?: { en: string; zh: string };
  /** A few short reply suggestions during a chat. Demo copy. */
  replyHints?: { en: string[]; zh: string[] };
}
