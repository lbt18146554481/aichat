// Lightweight intent routing for the homepage.
//
// Map free text the user typed at the entry point to one of the two
// Agents. Used only when the user did NOT manually select a chip.
// Conservative keyword rules; default = matchmaker (the more general one,
// since "describe who you want" is the catch-all path).

import type { AgentId } from "./seed";

const TOGETHER = [
  "together",
  "with me",
  "join me",
  "meet up",
  "meetup",
  "weekend",
  "saturday",
  "sunday",
  "tennis",
  "run",
  "running",
  "climb",
  "climbing",
  "hike",
  "hiking",
  "yoga",
  "cook",
  "cooking",
  "exhibition",
  "bookstore",
  "concert",
  "gig",
  "play",
  "game",
  "match",
  "court",
  "park",
  "一起",
  "周末",
  "周六",
  "周日",
  "网球",
  "跑步",
  "攀岩",
  "爬山",
  "瑜伽",
  "做饭",
  "看展",
  "书店",
  "演出",
  "演唱会",
  "运动",
  "见面",
  "约",
];

function hits(text: string, list: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const w of list) if (lower.includes(w.toLowerCase())) n++;
  return n;
}

export function routeIntent(text: string): AgentId {
  const t = text.trim();
  if (!t) return "matchmaker";
  return hits(t, TOGETHER) > 0 ? "sidebyside" : "matchmaker";
}
