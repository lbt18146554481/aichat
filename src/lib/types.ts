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
  area: string;          // a neighborhood / district label
  area_zh: string;
  // Day + rough time-of-window. The matcher looks for intersection.
  slots: Array<{ day: Weekday; window: "morning" | "midday" | "evening" }>;
  // Where they usually do it (a venue/park name). Doubles as a meeting spot.
  venue: string;
  venue_zh: string;
}

export type ActivityKind = "tennis" | "run" | "climb" | "cook" | "exhibition" | "bookstore";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// Legacy: per-person free-text answer to a Compass open-ended question.
// Kept for the affinity scoring inside Matchmaker (token-similarity bias).
export interface Reflection {
  questionId: string;
  answer: string;
  answer_zh: string;
}

// A Moment is the atomic unit of how a person becomes interesting to
// another person inside the product: prompt + this person's own concrete
// answer. Inspired by Hinge Prompts + Aron's mid-tier closeness questions.
// Used for: the Matchmaker right pane (3 of a person's moments), and as
// the quotable unit inside the "say hello" gesture.
export interface Moment {
  id: string;
  promptId: string;        // → MOMENT_PROMPTS
  answer: string;
  answer_zh: string;
}

export interface Person {
  id: string;
  name: string;
  name_zh: string;
  age: number;
  city: string;
  city_zh: string;
  occupation: string;
  occupation_zh: string;
  portrait: string;        // fallback / one-line subtitle
  portrait_zh: string;
  signals: string[];
  angles: Angle[];         // legacy — no longer rendered, kept for scoring
  activities: Activity[];  // Side by Side
  reflections: Reflection[]; // text-affinity scoring bias
  moments: Moment[];       // Matchmaker right pane + Say hello quoting
}
