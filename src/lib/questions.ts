// Compass — the open-ended life questions.
//
// These are the ONLY input Compass needs. The Agent asks one at a time in
// the main conversation, the user answers in free text, and the Agent then
// searches the pool for someone whose answer to the SAME question resonates.
//
// Questions are intentionally:
//   - open (no options, no scale)
//   - small (answerable in 1–3 sentences)
//   - about how a person actually lives, not what they consume
//
// Themes follow the categories that marriage research consistently shows
// matter for long-term compatibility: home, time, money, family, solitude,
// change. (Gottman, Doherty, etc.)

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
