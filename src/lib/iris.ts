// Iris — 红娘对话状态机（纯本地 mock，无 LLM）
//
// 整个产品只围绕一条主线：
//   meeting → listening → introducing → awaiting_feedback → introducing → ...
//
// 状态全部由 reducer 风格的 advance(state, input) 推进；UI 只负责渲染。
// 后续接真 LLM 时整个文件可以替换为后端调用。

import { extractSignals } from "./conversation";
import { PEOPLE, getPersonById } from "./people";
import { findResonant } from "./resonance";
import { composePortrait } from "./portrait";
import type { Person } from "./types";

export type Stage =
  | "meeting" // 初次见面，等用户第一次描述
  | "listening" // 追问中
  | "introducing" // 准备介绍下一个人
  | "awaiting_feedback" // 已介绍一个人，等用户反馈
  | "exhausted"; // 池子见底，等用户重新描述

export type MessageKind =
  | { kind: "say"; text: string }
  | { kind: "portrait"; text: string }
  | { kind: "introduce"; personId: string; why: string }
  | { kind: "exhausted" };

export interface IrisMessage {
  id: string;
  role: "iris" | "you";
  t: number;
  body: MessageKind;
}

export interface IrisState {
  messages: IrisMessage[];
  stage: Stage;
  rawDescription: string;
  followUpsAsked: number;
  followUpAnswers: string[];
  signals: string[];
  introducedIds: string[];
  liked: string[];
  passed: string[];
  pendingPersonId: string | null;
}

const FOLLOW_UPS = [
  "懂了。再问你一件小事——周日下午你们俩在一起，最理想的画面是什么？",
  "嗯。那他/她身上哪一个小细节，会让你在很糟的一天里还是想起来就笑？",
  "最后一个——你希望他/她不要怕什么？",
];

const TRANSITIONS = [
  "顺着这个感觉，我再想一个人——",
  "那我换个方向。",
  "好。让我再翻翻——",
  "懂。那我介绍下一个——",
];

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function msg(role: "iris" | "you", body: MessageKind): IrisMessage {
  return { id: uid(), role, t: Date.now(), body };
}

// 「为什么想到这个人」——根据共同信号挑模板
function whyLine(person: Person, shared: string[]): string {
  const name = person.name;
  if (shared.length === 0) {
    return `直觉告诉我，${name} 身上有你描述的那种气质。`;
  }
  const tag = shared[0];
  const map: Record<string, string> = {
    reading: `你说想要一个会安静读书的人——${name} 就是那种人，包里永远有一本看了一半的书。`,
    quiet: `你说想要一个不需要一直说话的人——${name} 不填补沉默，这一点很难得。`,
    funny: `你说想要一个会让你笑的人——${name} 总在自己讲完笑话之前先笑出来。`,
    kind: `你说想要一个温柔的人——${name} 对人有耐心，对粗糙的事情不耐烦。`,
    curious: `你说想要一个好奇的人——${name} 会问你那种你还没准备好回答的问题。`,
    outdoors: `你说想要一个不怕走远的人——${name} 在离公路几英里的地方最像自己。`,
    cooking: `你说在意一起吃饭这件事——${name} 把做晚饭当成一封可以吃的小情书。`,
    coffee: `你说喜欢早晨的人——${name} 把早晨的咖啡当成一个小小仪式，但很愿意分享。`,
    music: `你说音乐很重要——${name} 写没人点的曲子，但每个音符都认真。`,
    art: `你说想要一个会做东西的人——${name} 用手做东西，大多数都没发出来。`,
    brave: `你说想要一个诚实的人——${name} 的那种诚实，需要一点时间习惯。`,
    morning: `你说喜欢清晨——${name} 比城市醒得还早。`,
    night: `你说喜欢夜——${name} 会在午夜点蜡烛，不为什么。`,
    rain: `你说喜欢下雨——${name} 下雨天会把窗户留一条缝。`,
    city: `你说喜欢城市——${name} 走回家时常常绕远路。`,
    travel: `你说喜欢走来走去——${name} 用书店和面包房来记住一个城市。`,
    animals: `你说想要一个会和小动物说话的人——${name} 和狗说话的时候，狗大多数时候听得懂。`,
    writing: `你说在意文字——${name} 有一个本子，写下别人不小心说出口的句子。`,
    film: `你说喜欢电影——${name} 看电影像别人读诗。`,
    ambitious: `你说想要一个在意世界的人——${name} 在意，但不把这种在意变成负担。`,
  };
  return map[tag] ?? `因为你说的那种感觉，${name} 身上有。`;
}

// 工具：从已积累的信号里找下一个还没介绍过的人
function pickNext(state: IrisState): { person: Person; shared: string[] } | null {
  const candidates = state.signals.length > 0
    ? findResonant(state.signals)
    : PEOPLE.slice(0, 8).map((p) => ({ person: p, shared: [] as string[], line: "" }));
  for (const c of candidates) {
    if (!state.introducedIds.includes(c.person.id)) {
      return { person: c.person, shared: c.shared };
    }
  }
  return null;
}

export const INITIAL_STATE: IrisState = {
  messages: [
    msg("iris", {
      kind: "say",
      text:
        "我是 Iris，你的红娘。在我帮你介绍人之前，先告诉我——你希望遇到一个什么样的人？不用列条件，随便讲讲就好。",
    }),
  ],
  stage: "meeting",
  rawDescription: "",
  followUpsAsked: 0,
  followUpAnswers: [],
  signals: [],
  introducedIds: [],
  liked: [],
  passed: [],
  pendingPersonId: null,
};

// 推进对话：把用户输入并入 state，并产出 Iris 的下一条/几条回复。
// 返回新的 state（含已 append 的用户消息），以及一个"延迟回复"数组：调用方
// 应按顺序、带打字延迟地把这些回复 append 进 state。
export function advance(
  state: IrisState,
  userText: string,
): { next: IrisState; replies: MessageKind[] } {
  const text = userText.trim();
  if (!text) return { next: state, replies: [] };

  const youMsg = msg("you", { kind: "say", text });
  const newSignals = Array.from(new Set([...state.signals, ...extractSignals(text)]));

  // 阶段机
  if (state.stage === "meeting") {
    const next: IrisState = {
      ...state,
      messages: [...state.messages, youMsg],
      rawDescription: text,
      signals: newSignals,
      stage: "listening",
      followUpsAsked: 1,
    };
    return { next, replies: [{ kind: "say", text: FOLLOW_UPS[0] }] };
  }

  if (state.stage === "listening") {
    const followUpAnswers = [...state.followUpAnswers, text];
    const asked = state.followUpsAsked;
    // 已问过 asked 个问题，asked 等于 followUpsAsked。问到第 2 个就够了。
    if (asked < 2) {
      const next: IrisState = {
        ...state,
        messages: [...state.messages, youMsg],
        followUpAnswers,
        signals: newSignals,
        followUpsAsked: asked + 1,
      };
      return { next, replies: [{ kind: "say", text: FOLLOW_UPS[asked] }] };
    }
    // 追问够了 → 给画像 → 介绍第一个人
    const portrait = composePortrait({
      rawDescription: state.rawDescription,
      followUps: followUpAnswers.map((a, i) => ({ q: FOLLOW_UPS[i], a })),
      portrait: "",
      signals: newSignals,
    });
    const pick = pickNext({
      ...state,
      signals: newSignals,
    });
    const replies: MessageKind[] = [
      { kind: "say", text: "我大概知道你想要的人长什么样了。" },
      { kind: "portrait", text: portrait },
    ];
    if (pick) {
      replies.push({
        kind: "say",
        text: "让我看看我手上有没有合适的——",
      });
      replies.push({
        kind: "introduce",
        personId: pick.person.id,
        why: whyLine(pick.person, pick.shared),
      });
      const next: IrisState = {
        ...state,
        messages: [...state.messages, youMsg],
        followUpAnswers,
        signals: newSignals,
        stage: "awaiting_feedback",
        introducedIds: [...state.introducedIds, pick.person.id],
        pendingPersonId: pick.person.id,
      };
      return { next, replies };
    }
    replies.push({ kind: "exhausted" });
    const next: IrisState = {
      ...state,
      messages: [...state.messages, youMsg],
      followUpAnswers,
      signals: newSignals,
      stage: "exhausted",
    };
    return { next, replies };
  }

  if (state.stage === "awaiting_feedback" || state.stage === "exhausted") {
    // 用户自由输入——并入信号，重新进入介绍
    const next: IrisState = {
      ...state,
      messages: [...state.messages, youMsg],
      signals: newSignals,
      stage: "introducing",
    };
    return introduceNext(next);
  }

  // introducing 兜底
  const next: IrisState = {
    ...state,
    messages: [...state.messages, youMsg],
    signals: newSignals,
  };
  return introduceNext(next);
}

// 用户对某个候选人按了反馈按钮后，由 UI 调用本函数。
export function react(
  state: IrisState,
  personId: string,
  reaction: "like" | "pass",
): { next: IrisState; replies: MessageKind[] } {
  const person = getPersonById(personId);
  const youText =
    reaction === "like"
      ? `我想多了解 ${person?.name ?? "TA"}。`
      : `${person?.name ?? "TA"} 不是我的菜。`;
  const youMsg = msg("you", { kind: "say", text: youText });
  const liked = reaction === "like" ? [...state.liked, personId] : state.liked;
  const passed = reaction === "pass" ? [...state.passed, personId] : state.passed;
  const ack =
    reaction === "like"
      ? "好。我把 TA 记在你愿意多看一眼的那一栏了。"
      : "明白。不浪费你时间。";

  const between: IrisState = {
    ...state,
    messages: [...state.messages, youMsg],
    liked,
    passed,
    pendingPersonId: null,
    stage: "introducing",
  };
  const { next, replies } = introduceNext(between);
  return { next, replies: [{ kind: "say", text: ack }, ...replies] };
}

function introduceNext(state: IrisState): { next: IrisState; replies: MessageKind[] } {
  const pick = pickNext(state);
  if (!pick) {
    return {
      next: { ...state, stage: "exhausted", pendingPersonId: null },
      replies: [{ kind: "exhausted" }],
    };
  }
  const transition = TRANSITIONS[state.introducedIds.length % TRANSITIONS.length];
  const replies: MessageKind[] = [
    { kind: "say", text: transition },
    {
      kind: "introduce",
      personId: pick.person.id,
      why: whyLine(pick.person, pick.shared),
    },
  ];
  const next: IrisState = {
    ...state,
    stage: "awaiting_feedback",
    introducedIds: [...state.introducedIds, pick.person.id],
    pendingPersonId: pick.person.id,
  };
  return { next, replies };
}

// ---- 本地持久化 ----

const KEY = "iris:conversation";

export function loadState(): IrisState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as IrisState;
    if (!parsed.messages || parsed.messages.length === 0) return INITIAL_STATE;
    return parsed;
  } catch {
    return INITIAL_STATE;
  }
}

export function saveState(state: IrisState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function resetState(): IrisState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  return INITIAL_STATE;
}
