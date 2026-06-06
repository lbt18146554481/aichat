import type { Candidate } from "./types";

const cities = ["北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "西安", "苏州"];
const interestsPool = [
  "旅行", "摄影", "美食", "电影", "音乐", "阅读", "瑜伽", "登山", "咖啡", "烘焙",
  "猫咪", "狗狗", "桌游", "剧本杀", "话剧", "美术馆", "骑行", "潜水", "露营", "滑雪",
];
const personalityPool = [
  "温柔", "幽默", "理性", "感性", "外向", "内敛", "浪漫", "踏实", "好奇", "细腻",
  "果断", "佛系", "上进", "随和",
];
const occupations = [
  "产品经理", "插画师", "心理咨询师", "中学教师", "建筑师", "医生", "记者",
  "前端工程师", "投资人", "舞蹈老师", "甜品店主", "咖啡师", "策展人", "翻译",
  "纪录片导演",
];
const namesF = ["梨花", "知夏", "小满", "若兰", "苏苏", "阿吟", "棉棉", "禾子", "小语", "阿茶", "栀栀", "可乐", "鹿野", "晚风", "桃子"];
const namesM = ["子衿", "三川", "之野", "南屿", "听澜", "向晚", "白舟", "无名", "山月", "竹生", "言溪", "亦凡", "野旷", "明野", "知秋"];

function pick<T>(arr: T[], n: number, seed: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  let s = seed;
  for (let i = 0; i < n && copy.length; i++) {
    s = (s * 9301 + 49297) % 233280;
    const idx = Math.floor((s / 233280) * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function bioFor(name: string, occupation: string, interests: string[]): string {
  const samples = [
    `${occupation}，喜欢在${interests[0]}里找灵感，也享受${interests[1] ?? "独处"}的午后。希望遇到能一起慢慢生活的人。`,
    `日常被${occupation}填满，周末留给${interests[0]}与${interests[1] ?? "发呆"}。相信小事里有大温柔。`,
    `做${occupation}的${name}，对世界保持好奇。如果你也热爱${interests[0]}，我们大概有聊不完的话。`,
  ];
  return samples[name.length % samples.length];
}

export const CANDIDATES: Candidate[] = Array.from({ length: 30 }, (_, i) => {
  const female = i % 2 === 0;
  const name = (female ? namesF : namesM)[i % namesF.length] + (i > 14 ? String.fromCharCode(0x4e00 + i) : "");
  const cleanName = (female ? namesF : namesM)[i % namesF.length];
  const interests = pick(interestsPool, 4, i + 7);
  const personalityTags = pick(personalityPool, 3, i + 23);
  const occupation = occupations[i % occupations.length];
  const city = cities[i % cities.length];
  return {
    id: `c-${i + 1}`,
    name: cleanName,
    age: 24 + (i % 14),
    city,
    gender: female ? "女" : "男",
    avatarSeed: `${cleanName}-${i}`,
    interests,
    personalityTags,
    bio: bioFor(cleanName, occupation, interests),
    occupation,
  };
});

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=fde4cf,ffd5dc,ffdfbf,d4f1c5,fef3c7`;
}
