// Two distinct question pools.
//
// QUESTIONS — legacy Compass questions, still used by Matchmaker for the
// text-affinity scoring bias (a person whose reflection resonates with what
// the user has been saying gets a small score bump).
//
// MOMENT_PROMPTS — the prompts that drive the new "moments" surface: each
// person answers a few of these in their own voice, and these answers are
// what the Matchmaker right pane shows + what the user quotes from when
// saying hello. Sourced from Hinge's highest-converting prompts plus the
// mid-tier of Aron's 36 closeness questions (the deep ones are saved for
// after two people are actually talking).

export interface Question {
  id: string;
  theme: "home" | "time" | "money" | "family" | "solitude" | "change";
  text: string;
  text_zh: string;
}

export const QUESTIONS: Question[] = [
  { id: "home", theme: "home", text: "What does home mean to you — a place, or some people?", text_zh: "家对你来说是什么？是一个地点，还是某些人？" },
  { id: "free-month", theme: "time", text: "If you didn't have to work next month, how would you actually spend it?", text_zh: "如果下个月你都不用工作，你会真的怎么度过？" },
  { id: "sunday", theme: "time", text: "Describe a Sunday you'd want to repeat for the rest of your life.", text_zh: "描述一个你愿意余生不断重复的星期天。" },
  { id: "tradeoff", theme: "money", text: "What would you trade money for, that most people wouldn't?", text_zh: "你愿意拿钱去换什么——是大多数人不会换的？" },
  { id: "kids", theme: "family", text: "When you picture your life in ten years, who's in the room with you?", text_zh: "你想象十年后的生活时，房间里都有谁？" },
  { id: "alone", theme: "solitude", text: "What do you do when you're alone and no one would know either way?", text_zh: "当你独处、没人知道你做什么的时候，你会做什么？" },
  { id: "fight", theme: "change", text: "What's something you used to believe, that you don't anymore?", text_zh: "有什么是你过去相信、现在不再相信的？" },
  { id: "give-up", theme: "change", text: "What would you not give up for love, no matter who it was?", text_zh: "无论对方是谁，有什么是你不会为爱情让步的？" },
];

export function getQuestionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

export function localizedQuestion(q: Question, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? q.text_zh : q.text;
}

// ----- Moment prompts -----------------------------------------------------

export interface MomentPrompt {
  id: string;
  text: string;
  text_zh: string;
}

export const MOMENT_PROMPTS: MomentPrompt[] = [
  { id: "changed",
    text: "Something I changed my mind about recently.",
    text_zh: "最近我改变了看法的一件事。" },
  { id: "lose-time",
    text: "I lose track of time when…",
    text_zh: "我会忘记时间的事是……" },
  { id: "small-thing",
    text: "A small thing that's been disproportionately important to me.",
    text_zh: "一件小事，对我来说意义比看上去大得多。" },
  { id: "unusual-skill",
    text: "An unusual skill I have.",
    text_zh: "我有一个有点奇怪的本事。" },
  { id: "unexpected-home",
    text: "The most unexpected place I felt at home.",
    text_zh: "我没想到会让自己有'家'感觉的地方。" },
  { id: "defend",
    text: "Something I'd defend even if everyone disagreed.",
    text_zh: "就算所有人都不同意，我也会坚持的一件事。" },
  { id: "remembered",
    text: "What I'd want to be remembered for, by the people who knew me well.",
    text_zh: "我希望真正了解我的人，会因为什么记得我。" },
  { id: "compliment",
    text: "A compliment I've received that I still think about.",
    text_zh: "有一句别人对我说过的话，我到现在还在想。" },
];

export function getMomentPromptById(id: string): MomentPrompt | undefined {
  return MOMENT_PROMPTS.find((p) => p.id === id);
}

export function localizedMomentPrompt(p: MomentPrompt, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? p.text_zh : p.text;
}
