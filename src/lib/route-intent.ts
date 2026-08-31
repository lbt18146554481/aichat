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
  "做事",
  "活动",
];

/** Clear "introduce / meet someone" signals (even short replies like 一个人). */
const PERSON = [
  "一个人",
  "介绍",
  "认识",
  "找个人",
  "找人",
  "什么样的人",
  "介绍人",
  "matchmaker",
  "introduce",
  "someone",
  "meet someone",
  "a person",
];

function hits(text: string, list: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const w of list) if (lower.includes(w.toLowerCase())) n++;
  return n;
}

export function wantsPerson(text: string): boolean {
  return hits(text, PERSON) > 0;
}

export function wantsActivity(text: string): boolean {
  return hits(text, TOGETHER) > 0;
}

export function isGreeting(text: string): boolean {
  return /^(你好|您好|嗨|嘿|在吗|hi+|hello|hey|yo)[!！.。?？\s]*$/i.test(text.trim());
}

export function routeIntent(text: string): AgentId {
  const t = text.trim();
  if (!t) return "matchmaker";
  const person = wantsPerson(t);
  const activity = wantsActivity(t);
  if (activity && !person) return "sidebyside";
  if (person && !activity) return "matchmaker";
  if (activity) return "sidebyside";
  return "matchmaker";
}
