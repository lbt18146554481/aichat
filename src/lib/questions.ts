// Two distinct question pools.
//
// QUESTIONS — legacy Compass questions, still used by Matchmaker for the
// text-affinity scoring bias.
//
// MOMENT_PROMPTS — drive the Profile's Moments surface: the user picks
// 3+ of these and answers in their own voice. Same prompts are answered
// by candidates and shown on the Matchmaker right pane. Each prompt
// carries an optional `hint` — a short example of the *direction* to
// think in, not a template answer (Hinge's anti-blank-page UX).

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

export type PromptTier = "behavior" | "change" | "preference";

export interface MomentPrompt {
  id: string;
  tier: PromptTier;
  text: string;
  text_zh: string;
  hint: string;       // a one-line nudge about direction, not content
  hint_zh: string;
}

export const MOMENT_PROMPTS: MomentPrompt[] = [
  // —— behavior (what you actually do) ——
  { id: "lose-time", tier: "behavior",
    text: "I lose track of time when…",
    text_zh: "我会忘记时间的事是……",
    hint: "Something concrete — a specific activity, not a category.",
    hint_zh: "写一件具体的事——一个动作，而不是一个类别。" },
  { id: "small-thing", tier: "behavior",
    text: "A small thing that's been disproportionately important to me.",
    text_zh: "一件小事，对我来说意义比看上去大得多。",
    hint: "An object, a ritual, a route — the kind of thing you'd skip in a normal intro.",
    hint_zh: "一件东西、一个习惯、一条路线——通常在自我介绍里不会提的那种。" },
  { id: "unusual-skill", tier: "behavior",
    text: "An unusual skill I have.",
    text_zh: "我有一个有点奇怪的本事。",
    hint: "Doesn't have to be impressive. Specific beats impressive.",
    hint_zh: "不用厉害。具体比厉害重要。" },
  { id: "unexpected-home", tier: "behavior",
    text: "The most unexpected place I felt at home.",
    text_zh: "我没想到会让自己有'家'感觉的地方。",
    hint: "A place that surprised you. One sentence about why.",
    hint_zh: "一个让你意外的地方。一句话说为什么。" },

  // —— change (what's moved in you) ——
  { id: "changed", tier: "change",
    text: "Something I changed my mind about recently.",
    text_zh: "最近我改变了看法的一件事。",
    hint: "What you used to think, what you think now. Skip the lesson.",
    hint_zh: "以前怎么想，现在怎么想。不用总结道理。" },
  { id: "remembered", tier: "change",
    text: "What I'd want to be remembered for, by the people who knew me well.",
    text_zh: "我希望真正了解我的人，会因为什么记得我。",
    hint: "Not your résumé — the thing close friends would actually say.",
    hint_zh: "不是简历——是亲近的人真的会说的那一句。" },
  { id: "compliment", tier: "change",
    text: "A compliment I've received that I still think about.",
    text_zh: "有一句别人对我说过的话，我到现在还在想。",
    hint: "Quote it. One line about why it stayed.",
    hint_zh: "原话引用。一句话写为什么它一直在。" },

  // —— preference (what you're for / against) ——
  { id: "defend", tier: "preference",
    text: "Something I'd defend even if everyone disagreed.",
    text_zh: "就算所有人都不同意，我也会坚持的一件事。",
    hint: "Not a hot take — something you've actually held when it cost you something.",
    hint_zh: "不是抖机灵——是你真的为它付过代价的那种。" },
  { id: "talk-forever", tier: "preference",
    text: "A topic I could talk about with a stranger until we both forgot the time.",
    text_zh: "我能和陌生人聊到忘记时间的一个话题。",
    hint: "Be specific. Not 'music' — which kind of music, or what about it.",
    hint_zh: "具体些。不是'音乐'——是哪一类音乐，或者音乐的哪一面。" },
  { id: "company", tier: "preference",
    text: "The kind of evening I'd choose, given the choice.",
    text_zh: "可以选的话，我会选的那种夜晚。",
    hint: "Who's there, where, and what's actually happening.",
    hint_zh: "有谁，在哪，到底在做什么。" },
];

export function getMomentPromptById(id: string): MomentPrompt | undefined {
  return MOMENT_PROMPTS.find((p) => p.id === id);
}

export function localizedMomentPrompt(p: MomentPrompt, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? p.text_zh : p.text;
}

export function localizedHint(p: MomentPrompt, lang: "en" | "zh-CN"): string {
  return lang === "zh-CN" ? p.hint_zh : p.hint;
}
