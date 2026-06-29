import type { Person } from "./types";
import { ACTIVITIES, REFLECTIONS } from "./people-extras";

// The pool. Each Person carries everything all three Agents need:
//   - angles      → used by Matchmaker
//   - activities  → used by Side by Side
//   - reflections → used by Compass
// Activities & reflections are merged in from people-extras.ts to keep
// this file readable.

type PersonCore = Omit<Person, "activities" | "reflections">;
const CORE: PersonCore[] = [

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
    portrait: "Translator in Lisbon. Reads in three languages, cooks in one.",
    portrait_zh: "里斯本的翻译。用三种语言读书，用一种做饭。",
    signals: ["reading", "rain", "quiet", "funny", "travel"],
    angles: [
      {
        id: "quiet-reader",
        signals: ["reading", "quiet", "rain"],
        text: "Isa keeps a list of bookstores in every city she visits, and reads on rainy afternoons with the window cracked. You said you wanted someone quiet who reads — she's the first person I thought of.",
        text_zh: "Isa 在去过的每座城市都记下书店清单，下雨的午后会留一条窗缝读书。你说想找一个安静、爱读书的人——我第一个想到的就是她。",
      },
      {
        id: "warm-funny",
        signals: ["funny", "kind"],
        text: "She laughs at her own jokes before finishing them. People who meet Isa once tend to text her the next week — she has that effect. Quiet on the outside, warm underneath.",
        text_zh: "她讲笑话还没说完自己就先笑了。第一次见过 Isa 的人，下一周往往会再给她发消息——她有那种感染力。外表安静，内里很暖。",
      },
    ],
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
    portrait: "Architect in Brooklyn. Believes good buildings listen.",
    portrait_zh: "布鲁克林的建筑师。相信好的建筑会倾听。",
    signals: ["coffee", "city", "quiet", "kind", "art", "ambitious"],
    angles: [
      {
        id: "thoughtful-maker",
        signals: ["art", "ambitious", "city"],
        text: "June walks home the long way and notices things. She believes good buildings should feel like they're listening — and she works that way too. Ambitious without being loud about it.",
        text_zh: "June 回家总走远路，沿途留意各种东西。她相信好的建筑应该像在倾听——她做人也是这样。有野心，但从不张扬。",
      },
      {
        id: "shared-ritual",
        signals: ["coffee", "kind", "quiet"],
        text: "She makes coffee like it's a small ceremony, but is quick to share it. If you said you wanted someone who makes the everyday feel a little more cared-for, that's June.",
        text_zh: "她冲咖啡像一场小仪式，但很快会分给身边的人。如果你说想要一个能把日常过得更被照顾一些的人，那就是 June。",
      },
    ],
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
    portrait: "Composer in Berlin. Honest in a way that takes a minute.",
    portrait_zh: "柏林的作曲家。诚实得需要一点时间适应。",
    signals: ["music", "cooking", "brave", "quiet"],
    angles: [
      {
        id: "honest",
        signals: ["brave", "quiet"],
        text: "Theo is honest in a way that takes a minute to get used to. He won't perform a feeling he doesn't have. If you said you're tired of people who say the right thing — Theo doesn't.",
        text_zh: "Theo 的诚实需要一点时间习惯——他不会假装自己没有的感受。如果你说受够了那种'总说漂亮话'的人，Theo 不是这种。",
      },
      {
        id: "domestic",
        signals: ["music", "cooking"],
        text: "He writes piano pieces nobody asked for and cooks the same pasta every Tuesday, pretending to be surprised when it turns out good. Quiet pleasures, repeated.",
        text_zh: "他写没人点的钢琴曲，每周二做同一道意面，做好后假装惊讶。安静的小快乐，反复地做。",
      },
    ],
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
    portrait: "Ceramicist in Kyoto. Doesn't fill silences.",
    portrait_zh: "京都的陶艺师。不会去填补沉默。",
    signals: ["art", "outdoors", "quiet", "morning"],
    angles: [
      {
        id: "rooted",
        signals: ["quiet", "outdoors", "morning"],
        text: "Mira spends mornings at the wheel and afternoons in the woods. She doesn't fill silences — which sounds like a small thing until you sit across from her. People feel calm around her.",
        text_zh: "Mira 上午在拉坯机前，下午去林子里。她不会去填补沉默——听起来是件小事，直到你坐在她对面。和她在一起的人会自然地安静下来。",
      },
      {
        id: "tender",
        signals: ["art", "kind"],
        text: "She picks up smooth stones on her walks and gives them as gifts. The kind of person who notices what you said three weeks ago.",
        text_zh: "她散步时会捡光滑的石头，当礼物送人。是那种会记得你三周前说过什么的人。",
      },
    ],
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
    portrait: "Documentary editor in Mexico City. Dances badly, on purpose.",
    portrait_zh: "墨西哥城的纪录片剪辑。跳舞跳得很烂——故意的。",
    signals: ["film", "curious", "funny", "writing", "city"],
    angles: [
      {
        id: "curious",
        signals: ["curious", "city"],
        text: "Hugo is curious about strangers in the way that makes them open up to him. He keeps a notebook of overheard sentences. Conversations with him tend to go somewhere unexpected.",
        text_zh: "Hugo 对陌生人好奇，好奇到对方愿意对他敞开。他有个本子，专门记下偶然听到的句子。和他聊天，话题总会拐到你没预料到的方向。",
      },
      {
        id: "light",
        signals: ["funny"],
        text: "He dances badly and on purpose. Doesn't take himself too seriously, but takes the people he loves very seriously. Easy to be around.",
        text_zh: "他跳舞跳得很烂，而且故意的。对自己不太严肃，但对在乎的人非常认真。和他在一起会很轻松。",
      },
    ],
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
    portrait: "Pediatrician in Tel Aviv. Owns one excellent knife.",
    portrait_zh: "特拉维夫的儿科医生。只有一把真正好用的刀。",
    signals: ["kind", "reading", "cooking", "brave", "ambitious"],
    angles: [
      {
        id: "steady",
        signals: ["kind", "brave"],
        text: "Noa is patient with people, impatient with bad design. She cries at the end of good novels and doesn't try to hide it. Steady, warm, not soft.",
        text_zh: "Noa 对人很有耐心，但对粗糙的设计没耐心。读完一本好小说会哭，也不掩饰。沉稳，温暖，但不软。",
      },
      {
        id: "domestic-rich",
        signals: ["cooking", "reading"],
        text: "She owns one truly excellent knife and uses it for everything. Cooks the way she reads — slowly, attentively. The kind of evening she'd want is probably the kind you'd want.",
        text_zh: "她只有一把真正好用的刀，做什么都用它。她做饭和她读书一样——慢、专注。她想要的那种晚上，大概也是你想要的。",
      },
    ],
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
    portrait: "Bike-shop owner in Copenhagen. Reads Tranströmer between customers.",
    portrait_zh: "哥本哈根的自行车店主。在客人之间读特朗斯特罗姆。",
    signals: ["outdoors", "morning", "reading", "quiet"],
    angles: [
      {
        id: "morning",
        signals: ["morning", "outdoors"],
        text: "Søren rides at dawn — that hour when the city still belongs to a few people. If you said you wanted someone with their own rhythm, he has one, and it's earlier than most.",
        text_zh: "Søren 天没亮就骑车——一天里属于少数人的那个时段。如果你说想找一个有自己节奏的人，他有，而且比大多数人都早。",
      },
      {
        id: "craftsman",
        signals: ["quiet", "kind"],
        text: "He believes a good repair is a small love letter to whoever rides next. That's also how he treats people. Quiet, but present.",
        text_zh: "他相信一次好的修理，是写给下一个骑车人的小情书。他对人也是这样。安静，但在场。",
      },
    ],
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
    portrait: "Illustrator in Lagos. Hosts long dinners with too many candles.",
    portrait_zh: "拉各斯的插画师。请客吃饭点太多蜡烛。",
    signals: ["art", "curious", "city", "cooking", "funny"],
    angles: [
      {
        id: "vital",
        signals: ["funny", "city", "curious"],
        text: "Amara draws strangers on the train without them noticing. She hosts long dinners with too many candles. If you want someone who'll make life feel a bit bigger, that's her.",
        text_zh: "Amara 在地铁上偷偷画陌生人。她请客吃饭点太多蜡烛。如果你想找一个能让生活感觉更大一些的人，就是她。",
      },
      {
        id: "direct",
        signals: ["brave", "curious"],
        text: "She'll ask the question you weren't quite ready to answer — gently, but she'll ask. Not afraid of real conversations on the second date.",
        text_zh: "她会问那种你还没准备好回答的问题——很温和，但她真的会问。第二次见面就敢聊真实的话题。",
      },
    ],
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
    portrait: "Bookseller in Buenos Aires. Walks the dog under streetlamps.",
    portrait_zh: "布宜诺斯艾利斯的书店主。在路灯下遛狗。",
    signals: ["reading", "night", "animals", "city", "quiet"],
    angles: [
      {
        id: "nocturnal",
        signals: ["night", "quiet"],
        text: "Leo lights candles at midnight and walks the dog under streetlamps — he calls it thinking. If your good hours are late, his are too.",
        text_zh: "Leo 半夜点蜡烛，在路灯下遛狗——他把这叫做思考。如果你的好时光在深夜，他也是。",
      },
      {
        id: "generous",
        signals: ["reading", "kind"],
        text: "He recommends the book you didn't know you needed. Pays attention in a way that feels rare now. The kind of person you keep around.",
        text_zh: "他总能推荐你不知道自己需要的那本书。他用一种现在已经稀有的方式认真听人讲话。是那种你想长久留在身边的人。",
      },
    ],
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
    portrait: "Climate researcher in Edinburgh. Texts you the moon.",
    portrait_zh: "爱丁堡的气候研究员。月圆时会发月亮给你。",
    signals: ["outdoors", "kind", "ambitious", "curious"],
    angles: [
      {
        id: "earnest",
        signals: ["ambitious", "kind"],
        text: "Wren is earnest about the world without being heavy. Doing something that matters, in a field that mostly delivers bad news — she's figured out how to stay hopeful inside that.",
        text_zh: "Wren 认真对待这个世界，但并不沉重。她做的事很重要，而这个领域大多数时候只带来坏消息——她想明白了怎么在这之中继续抱有希望。",
      },
      {
        id: "wonder",
        signals: ["outdoors", "curious"],
        text: "She keeps a press of wildflowers on the kitchen wall and texts the moon when it's full. Pays attention to small things on purpose.",
        text_zh: "她厨房墙上挂着压制的野花，月圆时会发月亮的照片给朋友。她有意识地留意小事。",
      },
    ],
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
    portrait: "Photographer in Vancouver. Hikes alone, eats with company.",
    portrait_zh: "温哥华的摄影师。独自爬山，结伴吃饭。",
    signals: ["outdoors", "film", "quiet", "funny"],
    angles: [
      {
        id: "balanced",
        signals: ["outdoors", "quiet"],
        text: "Kai hikes alone and eats with company — he needs both, and knows it. If you want someone who's at home in their own head but glad you're around, that's him.",
        text_zh: "Kai 独自爬山，结伴吃饭——两样他都需要，而且他清楚。如果你想找一个既能自处又欢迎你在身边的人，是他。",
      },
      {
        id: "slow",
        signals: ["film", "quiet"],
        text: "He shoots film because it makes him slow down. Quiet by default, but briefly loud when something is funny — and it sticks.",
        text_zh: "他用胶片，是因为这逼他慢下来。平时安静，但遇到好笑的事会短暂地大声起来——而且那一瞬间你会记住。",
      },
    ],
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
    portrait: "Pastry chef in Rome. Wakes before the city does.",
    portrait_zh: "罗马的甜点师。比城市醒得更早。",
    signals: ["cooking", "morning", "reading", "art"],
    angles: [
      {
        id: "early",
        signals: ["morning", "cooking"],
        text: "Elena wakes before the city does. She thinks dessert is the most honest course — and she means it. Early mornings, real food, no performance.",
        text_zh: "Elena 比城市醒得更早。她觉得甜点是最诚实的一道菜——是认真的。早起、真实的食物，不表演。",
      },
      {
        id: "interior",
        signals: ["reading", "art"],
        text: "She reads poetry in the back of the bakery between batches. A practical life with a private interior — the kind that surprises you the more you know her.",
        text_zh: "两炉之间，她在面包房后头读诗。务实的生活背后有一个安静的内里——越认识她越会惊讶。",
      },
    ],
  },
];

export function getPersonById(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=F4F4F5,E5E5E5,EFEFEF,FAFAFA&radius=50`;
}

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

export function localizedAngle(angleText: string, angleTextZh: string, lang: Lang) {
  return lang === "zh-CN" ? angleTextZh : angleText;
}
