// Two distinct question pools.
//
// QUESTIONS — legacy Compass questions, still used by Matchmaker for the
// text-affinity scoring bias.
//
// MOMENT_PROMPTS — drive the Profile's Moments surface: the user picks
// 3+ of these and answers in their own voice. Same prompts are answered
// by candidates and shown on the Matchmaker right pane. These prompts
// aim at concrete, resonance-inviting territory: how you live, what
// you're building, where in this city you'd take someone. Not clever
// abstractions.

export interface Question {
  id: string;
  theme: "home" | "time" | "money" | "family" | "solitude" | "change";
  text: string;
  text_zh: string;
}

export const QUESTIONS: Question[] = [
  {
    id: "home",
    theme: "home",
    text: "What does home mean to you — a place, or some people?",
    text_zh: "家对你来说是什么？是一个地点，还是某些人？",
  },
  {
    id: "free-month",
    theme: "time",
    text: "If you didn't have to work next month, how would you actually spend it?",
    text_zh: "如果下个月你都不用工作，你会真的怎么度过？",
  },
  {
    id: "sunday",
    theme: "time",
    text: "Describe a Sunday you'd want to repeat for the rest of your life.",
    text_zh: "描述一个你愿意余生不断重复的星期天。",
  },
  {
    id: "tradeoff",
    theme: "money",
    text: "What would you trade money for, that most people wouldn't?",
    text_zh: "你愿意拿钱去换什么——是大多数人不会换的？",
  },
  {
    id: "kids",
    theme: "family",
    text: "When you picture your life in ten years, who's in the room with you?",
    text_zh: "你想象十年后的生活时，房间里都有谁？",
  },
  {
    id: "alone",
    theme: "solitude",
    text: "What do you do when you're alone and no one would know either way?",
    text_zh: "当你独处、没人知道你做什么的时候，你会做什么？",
  },
  {
    id: "fight",
    theme: "change",
    text: "What's something you used to believe, that you don't anymore?",
    text_zh: "有什么是你过去相信、现在不再相信的？",
  },
  {
    id: "give-up",
    theme: "change",
    text: "What would you not give up for love, no matter who it was?",
    text_zh: "无论对方是谁，有什么是你不会为爱情让步的？",
  },
];

export function getQuestionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

export function localizedQuestion(q: Question, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? q.text_zh : q.text;
}

// ----- Moment prompts -----------------------------------------------------

export type PromptTier = "life" | "current" | "values";

export interface MomentPrompt {
  id: string;
  tier: PromptTier;
  text: string;
  text_zh: string;
  hint: string; // a one-line nudge about direction, not content
  hint_zh: string;
}

export const MOMENT_PROMPTS: MomentPrompt[] = [
  // —— life: concrete pictures of how you spend time ——
  {
    id: "ideal-saturday",
    tier: "life",
    text: "How you'd spend an ideal Saturday.",
    text_zh: "一个理想的周六，你会怎么过？",
    hint: "Walk through it — where you'd be, what you'd eat, who's with you.",
    hint_zh: "顺着一天写——你会在哪、吃什么、和谁在一起。",
  },
  {
    id: "city-spot",
    tier: "life",
    text: "A place in this city you'd take someone you actually like.",
    text_zh: "在这座城市里，你会带真正喜欢的人去的一个地方。",
    hint: "Somewhere specific — not 'a coffee shop', but which one, and why there.",
    hint_zh: "具体一点——不是「一家咖啡馆」，而是哪一家，为什么是那儿。",
  },
  {
    id: "weeknight",
    tier: "life",
    text: "What a good weeknight looks like for you.",
    text_zh: "对你来说，一个不错的工作日晚上是什么样。",
    hint: "The evening you'd actually want back — not the one you feel you should have.",
    hint_zh: "你真的想要的那种夜晚，而不是「应该过」的那种。",
  },

  // —— current: what you're inside right now ——
  {
    id: "obsessed",
    tier: "current",
    text: "Something I'm a little obsessed with right now.",
    text_zh: "最近我有点着迷的一件事。",
    hint: "A book, a topic, a project, a game — anything you keep coming back to this month.",
    hint_zh: "一本书、一个话题、一个项目、一款游戏——这个月你反复回到的东西。",
  },
  {
    id: "learning",
    tier: "current",
    text: "Something I'm actively trying to get better at.",
    text_zh: "最近我在认真练一件事。",
    hint: "The skill or habit you're deliberately working on, however small.",
    hint_zh: "你有意识在练的技能或习惯，再小也算。",
  },
  {
    id: "talk-forever",
    tier: "current",
    text: "The kind of conversation I never want to end.",
    text_zh: "一种我永远不想结束的聊天。",
    hint: "What is it about — and who are you when it's happening?",
    hint_zh: "在聊什么？聊起来的你是什么样？",
  },

  // —— values: what you stand on ——
  {
    id: "defend",
    tier: "values",
    text: "One belief or taste I'll go to bat for.",
    text_zh: "有一件事/一种偏好，我会为它站出来。",
    hint: "Not a hot take — something you've actually held when it cost you something.",
    hint_zh: "不是抖机灵——是你真的为它付过代价的那种。",
  },
  {
    id: "remembered",
    tier: "values",
    text: "What people close to me would say I'm actually like.",
    text_zh: "真的了解我的人，会怎么形容我。",
    hint: "Not your résumé — the sentence a close friend would use.",
    hint_zh: "不是简历里的话——是亲近的朋友真的会说的那句。",
  },
];

// Older prompt ids still present in the demo pool's answers. They map onto
// the current, shorter prompt set so every quoted answer can show the
// question it was answering.
const PROMPT_ALIASES: Record<string, string> = {
  "lose-time": "obsessed",
  "small-thing": "weeknight",
  "unexpected-home": "city-spot",
  "unusual-skill": "learning",
  changed: "defend",
  compliment: "remembered",
};

export function getMomentPromptById(id: string): MomentPrompt | undefined {
  const key = PROMPT_ALIASES[id] ?? id;
  return MOMENT_PROMPTS.find((p) => p.id === key);
}

export function localizedMomentPrompt(p: MomentPrompt, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? p.text_zh : p.text;
}

export function localizedHint(p: MomentPrompt, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? p.hint_zh : p.hint;
}
