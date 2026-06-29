import type { Person } from "./types";

export const PEOPLE: Person[] = [
  {
    id: "isa",
    name: "Isa",
    name_zh: "伊莎",
    age: 29,
    city: "Lisbon",
    city_zh: "里斯本",
    occupation: "Translator",
    occupation_zh: "翻译",
    portrait:
      "Keeps a list of bookstores in every city she visits. Reads on rainy afternoons with the window cracked, even in winter. Laughs at her own jokes before finishing them.",
    portrait_zh:
      "在去过的每座城市都记下书店清单。下雨的午后留一条窗缝读书，冬天也一样。讲笑话还没说完自己就先笑了。",
    signals: ["reading", "rain", "quiet", "funny", "travel"],
  },
  {
    id: "june",
    name: "June",
    name_zh: "June",
    age: 31,
    city: "Brooklyn",
    city_zh: "布鲁克林",
    occupation: "Architect",
    occupation_zh: "建筑师",
    portrait:
      "Walks home the long way. Believes good buildings should feel like they're listening. Makes coffee like it's a small ceremony — but quick to share it.",
    portrait_zh:
      "回家总走远路。她相信好的建筑像在倾听。冲咖啡像一场小仪式——但很快会分给身边的人。",
    signals: ["coffee", "city", "quiet", "kind", "art"],
  },
  {
    id: "theo",
    name: "Theo",
    name_zh: "Theo",
    age: 33,
    city: "Berlin",
    city_zh: "柏林",
    occupation: "Composer",
    occupation_zh: "作曲家",
    portrait:
      "Writes piano pieces nobody asked for. Cooks the same pasta every Tuesday and pretends to be surprised when it's good. Honest in a way that takes a minute to get used to.",
    portrait_zh:
      "写没人点的钢琴曲。每周二做同一道意面，做好后假装惊讶。诚实得需要一点时间习惯。",
    signals: ["music", "cooking", "brave", "quiet"],
  },
  {
    id: "mira",
    name: "Mira",
    name_zh: "Mira",
    age: 28,
    city: "Kyoto",
    city_zh: "京都",
    occupation: "Ceramicist",
    occupation_zh: "陶艺师",
    portrait:
      "Spends mornings at the wheel and afternoons in the woods. Picks up smooth stones and gives them as gifts. Doesn't fill silences.",
    portrait_zh:
      "上午在拉坯机前，下午在林子里。把捡来的光滑石头当礼物送人。不会去填补沉默。",
    signals: ["art", "outdoors", "quiet", "morning"],
  },
  {
    id: "hugo",
    name: "Hugo",
    name_zh: "Hugo",
    age: 34,
    city: "Mexico City",
    city_zh: "墨西哥城",
    occupation: "Documentary editor",
    occupation_zh: "纪录片剪辑",
    portrait:
      "Curious about strangers in the way that makes them tell him things. Keeps a notebook of overheard sentences. Dances badly and on purpose.",
    portrait_zh:
      "对陌生人好奇，好奇到对方愿意告诉他事情。有一个本子，记下偶然听到的句子。跳舞跳得很烂，而且故意。",
    signals: ["film", "curious", "funny", "writing", "city"],
  },
  {
    id: "noa",
    name: "Noa",
    name_zh: "Noa",
    age: 30,
    city: "Tel Aviv",
    city_zh: "特拉维夫",
    occupation: "Pediatrician",
    occupation_zh: "儿科医生",
    portrait:
      "Patient with people, impatient with bad design. Cries at the end of good novels. Owns one truly excellent knife and uses it for everything.",
    portrait_zh:
      "对人有耐心，对粗糙的设计没耐心。读完一本好小说会哭。只有一把真正好用的刀，做什么都用它。",
    signals: ["kind", "reading", "cooking", "brave"],
  },
  {
    id: "soren",
    name: "Søren",
    name_zh: "Søren",
    age: 32,
    city: "Copenhagen",
    city_zh: "哥本哈根",
    occupation: "Bike-shop owner",
    occupation_zh: "自行车店主",
    portrait:
      "Rides at dawn. Believes a good repair is a small love letter to whoever rides next. Reads Tranströmer between customers.",
    portrait_zh:
      "天没亮就骑车。他相信一次好的修理，是写给下一位骑车人的小情书。客人间隙读特朗斯特罗姆。",
    signals: ["outdoors", "morning", "reading", "quiet"],
  },
  {
    id: "amara",
    name: "Amara",
    name_zh: "Amara",
    age: 27,
    city: "Lagos",
    city_zh: "拉各斯",
    occupation: "Illustrator",
    occupation_zh: "插画师",
    portrait:
      "Draws people on the train without them noticing. Hosts long dinners with too many candles. Asks the question you weren't quite ready to answer.",
    portrait_zh:
      "在地铁上偷偷画陌生人。请客吃饭点太多蜡烛。会问那种你还没准备好回答的问题。",
    signals: ["art", "curious", "city", "cooking"],
  },
  {
    id: "leo",
    name: "Leo",
    name_zh: "Leo",
    age: 35,
    city: "Buenos Aires",
    city_zh: "布宜诺斯艾利斯",
    occupation: "Bookseller",
    occupation_zh: "书店主",
    portrait:
      "Recommends the book you didn't know you needed. Lights candles at midnight. Walks the dog under streetlamps and calls it thinking.",
    portrait_zh:
      "总能推荐你不知道自己需要的那本书。午夜点蜡烛。在路灯下遛狗，并把它叫作思考。",
    signals: ["reading", "night", "animals", "city", "quiet"],
  },
  {
    id: "wren",
    name: "Wren",
    name_zh: "Wren",
    age: 30,
    city: "Edinburgh",
    city_zh: "爱丁堡",
    occupation: "Climate researcher",
    occupation_zh: "气候研究员",
    portrait:
      "Earnest about the world without being heavy. Keeps a press of wildflowers on the kitchen wall. Texts you the moon when it's full.",
    portrait_zh:
      "认真对待世界，但不沉重。厨房墙上挂着压制的野花。月圆时会发月亮给你。",
    signals: ["outdoors", "kind", "ambitious", "curious"],
  },
  {
    id: "kai",
    name: "Kai",
    name_zh: "Kai",
    age: 32,
    city: "Vancouver",
    city_zh: "温哥华",
    occupation: "Photographer",
    occupation_zh: "摄影师",
    portrait:
      "Hikes alone, eats with company. Shoots film because it makes him slow down. Quiet until something is funny — then loud, briefly.",
    portrait_zh:
      "独自爬山，结伴吃饭。用胶片是因为它逼他慢下来。平时很安静——遇到好笑的事，会短暂地大声起来。",
    signals: ["outdoors", "film", "quiet", "funny"],
  },
  {
    id: "elena",
    name: "Elena",
    name_zh: "Elena",
    age: 29,
    city: "Rome",
    city_zh: "罗马",
    occupation: "Pastry chef",
    occupation_zh: "甜点师",
    portrait:
      "Wakes before the city does. Thinks dessert is the most honest course. Reads poetry in the back of the bakery between batches.",
    portrait_zh:
      "比城市醒得更早。她觉得甜点是最诚实的一道菜。两炉之间在面包房后头读诗。",
    signals: ["cooking", "morning", "reading", "art"],
  },
];

export function getPersonById(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=F4F4F5,E5E5E5,EFEFEF,FAFAFA&radius=50`;
}

// Localized field accessors — keep the call sites simple and consistent.
type Lang = "en" | "zh-CN";

export function localized(person: Person, lang: Lang) {
  const isZh = lang === "zh-CN";
  return {
    name: isZh ? person.name_zh : person.name,
    city: isZh ? person.city_zh : person.city,
    occupation: isZh ? person.occupation_zh : person.occupation,
    portrait: isZh ? person.portrait_zh : person.portrait,
  };
}
