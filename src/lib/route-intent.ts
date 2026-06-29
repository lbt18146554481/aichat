// Lightweight intent routing for the homepage.
//
// Map free text the user typed at the entry point to one of the three
// Agents. Used only when the user did NOT manually select a chip.
// Conservative keyword rules; default = matchmaker (the most general).

import type { AgentId } from "./seed";

const TOGETHER = [
  "together", "with me", "join me", "meet up", "meetup", "weekend",
  "saturday", "sunday", "tennis", "run", "running", "climb", "climbing",
  "hike", "hiking", "yoga", "cook", "cooking", "exhibition", "bookstore",
  "concert", "gig", "play", "game", "match", "court", "park",
  "一起", "周末", "周六", "周日", "网球", "跑步", "攀岩", "爬山", "瑜伽",
  "做饭", "看展", "书店", "演出", "演唱会", "运动", "见面", "约",
];

const TALK = [
  "think", "thinks", "thinking", "believe", "values", "value", "meaning",
  "purpose", "life", "soul", "deep", "talk about", "philosophy", "honest",
  "question", "answer", "reflect",
  "想法", "价值观", "意义", "灵魂", "聊聊", "聊一聊", "深聊", "人生",
  "想清楚", "真诚", "诚实", "答案", "问题",
];

const INTRO = [
  "introduce", "introduction", "meet someone", "kind of person", "looking for",
  "single", "find someone", "match", "recommend", "suggest",
  "介绍", "认识", "推荐", "想找", "找一个", "找个", "类型", "什么样的人",
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

  const a = hits(t, TOGETHER);
  const b = hits(t, TALK);
  const c = hits(t, INTRO);

  // Tie-break order favors the more specific signals; intro is the catch-all.
  const max = Math.max(a, b, c);
  if (max === 0) return "matchmaker";
  if (a === max) return "sidebyside";
  if (b === max) return "compass";
  return "matchmaker";
}
