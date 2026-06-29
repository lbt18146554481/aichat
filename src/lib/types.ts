// One person in the curated pool the Agent introduces from.
//
// The Agent never dumps a list. It picks ONE person at a time, and picks
// one of several pre-written "angles" — short prose introductions written
// from a particular perspective (independence, warmth, ambition, etc.).
// Each angle is tagged with the user signals it speaks to, so the Agent
// can choose the angle that best matches what the user just said.

export interface Angle {
  id: string;
  signals: string[];
  text: string;
  text_zh: string;
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
  // A neutral one-liner shown under the name. Not the intro itself.
  portrait: string;
  portrait_zh: string;
  // All signals this person genuinely embodies (used for ranking).
  signals: string[];
  // 2-3 different ways the Agent can introduce this person.
  angles: Angle[];
}
