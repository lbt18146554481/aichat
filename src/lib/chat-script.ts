import type { UserProfile } from "./types";

export type FieldKey =
  | "nickname"
  | "age"
  | "gender"
  | "lookingFor"
  | "city"
  | "interests"
  | "personalityTags"
  | "preferences"
  | "bio";

export interface Step {
  field: FieldKey;
  ask: string;
  hint?: string;
  parse: (input: string, profile: UserProfile) => Partial<UserProfile> | null;
  ack: (input: string, profile: UserProfile) => string;
}

const COMMON_INTERESTS = [
  "旅行", "摄影", "美食", "电影", "音乐", "阅读", "瑜伽", "登山", "咖啡",
  "烘焙", "猫咪", "狗狗", "桌游", "剧本杀", "话剧", "美术馆", "骑行",
  "潜水", "露营", "滑雪",
];
const COMMON_TRAITS = [
  "温柔", "幽默", "理性", "感性", "外向", "内敛", "浪漫", "踏实", "好奇",
  "细腻", "果断", "佛系", "上进", "随和",
];

function extractTags(input: string, pool: string[]): string[] {
  const found = pool.filter((t) => input.includes(t));
  if (found.length > 0) return found;
  // 切分逗号/顿号/空格作为兜底
  return input
    .split(/[,，、\s/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 6)
    .slice(0, 5);
}

export const SCRIPT: Step[] = [
  {
    field: "nickname",
    ask: "你好呀～我是小荷，你的 AI 红娘 🌷\n先轻松一点，告诉我你希望我怎么称呼你吧？",
    parse: (input) => {
      const name = input.replace(/^(我叫|叫我|我是)/, "").trim().slice(0, 10);
      return name ? { nickname: name } : null;
    },
    ack: (_i, p) => `「${p.nickname}」这个名字很好听，先记下啦。`,
  },
  {
    field: "age",
    ask: "可以告诉我你今年多大呀？（直接告诉我数字就好）",
    parse: (input) => {
      const m = input.match(/\d{2}/);
      if (!m) return null;
      const age = Number(m[0]);
      if (age < 18 || age > 80) return null;
      return { age };
    },
    ack: (_i, p) => `${p.age} 岁，正是认真生活的好年纪。`,
  },
  {
    field: "gender",
    ask: "你的性别是？方便我帮你筛选合适的人 🌿",
    hint: "可以回答：男 / 女 / 其他",
    parse: (input) => {
      if (input.includes("女")) return { gender: "女" };
      if (input.includes("男")) return { gender: "男" };
      if (input.trim().length > 0) return { gender: "其他" };
      return null;
    },
    ack: () => "好的，我记住啦。",
  },
  {
    field: "lookingFor",
    ask: "你希望认识什么样性别的 TA 呢？",
    parse: (input) => {
      if (input.includes("女")) return { lookingFor: "女" };
      if (input.includes("男")) return { lookingFor: "男" };
      if (input.trim().length > 0) return { lookingFor: "不限" };
      return null;
    },
    ack: () => "好的，那我会重点帮你留意 ✨",
  },
  {
    field: "city",
    ask: "你现在生活在哪座城市呀？",
    parse: (input) => {
      const m = input.match(/(北京|上海|广州|深圳|杭州|成都|南京|武汉|西安|苏州|[\u4e00-\u9fa5]{2,4})/);
      return m ? { city: m[1] } : null;
    },
    ack: (_i, p) => `${p.city}～是个很有故事的城市。`,
  },
  {
    field: "interests",
    ask: "平时闲下来的时候，你最喜欢做些什么？\n可以一次告诉我几样，比如：摄影、咖啡、登山 ⛰️",
    parse: (input) => {
      const interests = extractTags(input, COMMON_INTERESTS);
      return interests.length > 0 ? { interests } : null;
    },
    ack: (_i, p) =>
      `${p.interests.slice(0, 3).join("、")}……听起来你的生活很有质感呢 🌿`,
  },
  {
    field: "personalityTags",
    ask: "如果让朋友形容你，TA 们会用哪些词呢？\n（比如：温柔、幽默、感性、踏实）",
    parse: (input) => {
      const tags = extractTags(input, COMMON_TRAITS);
      return tags.length > 0 ? { personalityTags: tags } : null;
    },
    ack: (_i, p) =>
      `「${p.personalityTags.join(" · ")}」，这样的人很难不被喜欢 🌷`,
  },
  {
    field: "preferences",
    ask: "最后聊聊期待——你希望对方大概几岁呢？\n可以告诉我一个范围，比如「28 到 35」。",
    parse: (input, profile) => {
      const nums = input.match(/\d{2}/g);
      if (!nums || nums.length === 0) return null;
      const [a, b] = nums.length >= 2 ? [Number(nums[0]), Number(nums[1])] : [Number(nums[0]) - 3, Number(nums[0]) + 3];
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      return {
        preferences: {
          ...profile.preferences,
          ageRange: [min, max] as [number, number],
        },
      };
    },
    ack: (_i, p) =>
      `了解，${p.preferences.ageRange[0]} - ${p.preferences.ageRange[1]} 岁之间，给你留意～`,
  },
  {
    field: "bio",
    ask: "最后一步啦——可以用一两句话介绍下自己吗？我会写进你的档案里 💌",
    parse: (input) => {
      const bio = input.trim().slice(0, 140);
      return bio.length >= 2 ? { bio } : null;
    },
    ack: () =>
      "完美！你的档案我已经整理好啦 🌸\n点下面的按钮，就能看到我为你挑的人选了～",
  },
];

export function findCurrentStepIndex(profile: UserProfile): number {
  for (let i = 0; i < SCRIPT.length; i++) {
    const step = SCRIPT[i];
    const v = profile[step.field as keyof UserProfile];
    if (step.field === "interests" || step.field === "personalityTags") {
      if ((v as string[]).length === 0) return i;
    } else if (step.field === "preferences") {
      // 默认值即未填，认为已 ask 后被设置即可——我们用 bio 判断后续步
      const pref = profile.preferences;
      // 标记：当 ageRange 不是默认值时算完成
      if (pref.ageRange[0] === 22 && pref.ageRange[1] === 40) return i;
    } else if (!v) {
      return i;
    }
  }
  return SCRIPT.length;
}

export function progressFromProfile(profile: UserProfile): number {
  const idx = findCurrentStepIndex(profile);
  return Math.round((idx / SCRIPT.length) * 100);
}
