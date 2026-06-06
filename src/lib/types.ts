export interface Seeker {
  rawDescription: string;
  followUps: { q: string; a: string }[];
  portrait: string;
  signals: string[];
}

export interface Turn {
  id: string;
  role: "you" | "muse";
  text: string;
  t: number;
}

export interface Person {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation: string;
  portrait: string;
  signals: string[];
}

export const EMPTY_SEEKER: Seeker = {
  rawDescription: "",
  followUps: [],
  portrait: "",
  signals: [],
};
