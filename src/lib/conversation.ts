// Lightweight signal extractor used by the agent's mock retrieval layer.
//
// The vocabulary is intentionally bilingual — keys are stable signal names,
// values are substring triggers in either English or Chinese. We lowercase
// before matching for the EN side; CJK is matched as-is.

const SIGNAL_VOCAB: Record<string, string[]> = {
  reading: ["read", "book", "novel", "library", "bookstore", "读", "书", "小说"],
  music: ["music", "vinyl", "concert", "song", "guitar", "piano", "音乐", "唱片", "钢琴"],
  film: ["film", "movie", "cinema", "director", "电影", "导演"],
  art: ["art", "museum", "gallery", "painting", "draw", "艺术", "画", "美术馆"],
  writing: ["write", "writing", "poem", "journal", "写作", "诗"],
  travel: ["travel", "trip", "abroad", "wander", "road", "旅行", "旅游"],
  outdoors: [
    "hike", "mountain", "trail", "forest", "ocean", "sea", "river",
    "户外", "爬山", "山", "海", "森林",
  ],
  cooking: ["cook", "kitchen", "food", "bake", "dinner", "做饭", "厨房", "烘焙", "晚餐"],
  coffee: ["coffee", "espresso", "cafe", "café", "咖啡"],
  quiet: ["quiet", "silence", "calm", "still", "soft", "安静", "沉默", "温柔"],
  curious: ["curious", "question", "wonder", "learn", "好奇", "学习"],
  funny: ["funny", "humor", "humour", "laugh", "joke", "幽默", "好笑", "搞笑"],
  kind: ["kind", "warm", "gentle", "care", "caring", "善良", "温暖", "体贴"],
  brave: ["brave", "honest", "open", "vulnerable", "诚实", "勇敢", "坦诚"],
  ambitious: ["ambitious", "driven", "career", "上进", "事业"],
  city: ["city", "subway", "neighborhood", "street", "城市", "地铁", "街区"],
  animals: ["dog", "cat", "animal", "狗", "猫", "动物"],
  rain: ["rain", "rainy", "storm", "下雨", "雨"],
  morning: ["morning", "sunrise", "early", "早晨", "清晨", "日出"],
  night: ["night", "midnight", "late", "夜", "深夜", "晚上"],
};

export function extractSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [signal, keywords] of Object.entries(SIGNAL_VOCAB)) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) found.add(signal);
  }
  return Array.from(found);
}
