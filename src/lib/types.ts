// One person in the curated pool. The same Person object is read by all
// three Agents (Matchmaker / Side by Side / Compass) — each Agent uses a
// different slice of it.

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

// A reflection: this person's free-text answer to one of Compass's
// open-ended life questions. Compass compares two people's answers to the
// SAME question, side by side, in their own voices.
export interface Reflection {
  questionId: string;
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
  portrait: string;
  portrait_zh: string;
  signals: string[];
  angles: Angle[];
  // For Side by Side. May be empty (then the person isn't reachable that way).
  activities: Activity[];
  // For Compass. Each entry is this person's own words on one question.
  reflections: Reflection[];
}
