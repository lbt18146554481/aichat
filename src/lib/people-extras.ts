// Side-by-Side activity data + Compass reflections, keyed by person.id.
// Kept in a separate file so people.ts stays readable. Merged into the
// Person objects by people.ts's loader.

import type { Activity, Reflection } from "./types";

export const ACTIVITIES: Record<string, Activity[]> = {
  isa: [
    { kind: "bookstore", level: "intermediate", area: "Chiado", area_zh: "希亚多",
      slots: [{ day: "sat", window: "morning" }], venue: "Livraria Bertrand", venue_zh: "贝特朗书店" },
    { kind: "run", level: "beginner", area: "Belém", area_zh: "贝伦",
      slots: [{ day: "tue", window: "evening" }], venue: "Tagus riverside", venue_zh: "塔霍河岸" },
  ],
  june: [
    { kind: "tennis", level: "intermediate", area: "Williamsburg", area_zh: "威廉斯堡",
      slots: [{ day: "sat", window: "morning" }, { day: "sun", window: "morning" }],
      venue: "McCarren Park Courts", venue_zh: "McCarren 公园球场" },
    { kind: "exhibition", level: "intermediate", area: "Lower Manhattan", area_zh: "曼哈顿下城",
      slots: [{ day: "thu", window: "evening" }], venue: "MoMA PS1", venue_zh: "MoMA PS1" },
  ],
  theo: [
    { kind: "cook", level: "advanced", area: "Kreuzberg", area_zh: "克罗伊茨贝格",
      slots: [{ day: "tue", window: "evening" }], venue: "Markthalle Neun", venue_zh: "九号市场" },
  ],
  mira: [
    { kind: "run", level: "intermediate", area: "Higashiyama", area_zh: "东山",
      slots: [{ day: "sat", window: "morning" }, { day: "wed", window: "morning" }],
      venue: "Kamogawa riverside", venue_zh: "鸭川河岸" },
  ],
  hugo: [
    { kind: "exhibition", level: "intermediate", area: "Roma Norte", area_zh: "罗马北区",
      slots: [{ day: "fri", window: "evening" }], venue: "Casa del Lago", venue_zh: "湖畔之屋" },
    { kind: "climb", level: "beginner", area: "Condesa", area_zh: "孔德萨",
      slots: [{ day: "wed", window: "evening" }], venue: "Boulder DF", venue_zh: "Boulder DF" },
  ],
  noa: [
    { kind: "cook", level: "intermediate", area: "Florentin", area_zh: "弗洛伦廷",
      slots: [{ day: "sun", window: "evening" }], venue: "Carmel Market", venue_zh: "卡梅尔市场" },
    { kind: "run", level: "intermediate", area: "Park HaYarkon", area_zh: "亚尔孔公园",
      slots: [{ day: "sat", window: "morning" }], venue: "Yarkon Park loop", venue_zh: "亚尔孔公园环线" },
  ],
  soren: [
    { kind: "run", level: "advanced", area: "Nørrebro", area_zh: "诺雷布罗",
      slots: [{ day: "tue", window: "morning" }, { day: "thu", window: "morning" }],
      venue: "Lakes loop", venue_zh: "湖滨环线" },
  ],
  leo: [
    { kind: "bookstore", level: "intermediate", area: "Palermo", area_zh: "巴勒莫",
      slots: [{ day: "sat", window: "evening" }], venue: "Eterna Cadencia", venue_zh: "永恒韵律书店" },
  ],
  wren: [
    { kind: "climb", level: "intermediate", area: "Old Town", area_zh: "老城",
      slots: [{ day: "wed", window: "evening" }], venue: "Alien Rock", venue_zh: "Alien Rock 攀岩馆" },
  ],
  kai: [
    { kind: "climb", level: "advanced", area: "North Shore", area_zh: "北岸",
      slots: [{ day: "sat", window: "morning" }, { day: "sun", window: "morning" }],
      venue: "The Hive Bouldering", venue_zh: "The Hive 抱石馆" },
  ],
  elena: [
    { kind: "cook", level: "advanced", area: "Trastevere", area_zh: "特拉斯泰韦雷",
      slots: [{ day: "sun", window: "evening" }], venue: "Mercato di Testaccio", venue_zh: "特斯塔乔市场" },
    { kind: "bookstore", level: "intermediate", area: "Monti", area_zh: "蒙提",
      slots: [{ day: "thu", window: "evening" }], venue: "Libreria Altroquando", venue_zh: "Altroquando 书店" },
  ],
};

export const REFLECTIONS: Record<string, Reflection[]> = {
  isa: [
    { questionId: "home",
      answer: "Home is wherever I can cook dinner without checking my phone. Three apartments in Lisbon have qualified.",
      answer_zh: "家是任何一个我能不看手机做晚饭的地方。在里斯本有过三个这样的公寓。" },
    { questionId: "alone",
      answer: "I read out loud. In whichever language I'm trying not to lose that month.",
      answer_zh: "我会朗读。用那个月我正努力不让自己荒废的语言读。" },
    { questionId: "sunday",
      answer: "Wake up late. Walk somewhere with a bakery. Read something I don't have to translate. Talk to one person for two hours.",
      answer_zh: "睡到晚一点。走到某个有面包房的地方。读一些不需要我翻译的东西。和一个人聊两小时。" },
  ],
  june: [
    { questionId: "home",
      answer: "Home is two or three people I can be quiet with. Not a place. I've moved enough to know.",
      answer_zh: "家是两三个我可以一起安静的人。不是地点——我搬过够多次才懂。" },
    { questionId: "kids",
      answer: "A small kitchen. One partner. Maybe a kid old enough to have opinions about music. A friend dropping by uninvited.",
      answer_zh: "一个不大的厨房。一个伴侣。也许有一个已经对音乐有自己看法的孩子。一个不打招呼就来的朋友。" },
    { questionId: "tradeoff",
      answer: "Time. I'd take half the salary for an extra day. I have, twice.",
      answer_zh: "时间。我愿意用一半的工资换多一天。我已经这样换过两次。" },
  ],
  theo: [
    { questionId: "alone",
      answer: "I play the same three minutes of a piece over and over until I can't tell if it's good. Then I leave it for a week.",
      answer_zh: "我会把一段三分钟的曲子反复弹，直到分不清它到底好不好。然后放它一周。" },
    { questionId: "give-up",
      answer: "Honesty. I'd rather end something kindly than perform it.",
      answer_zh: "诚实。我宁愿好好结束一段关系，也不愿假装维持。" },
  ],
  mira: [
    { questionId: "home",
      answer: "A place I can hear the kettle from the next room. Two cups out, even when I'm alone.",
      answer_zh: "一个我能从隔壁房间听见水壶响的地方。哪怕一个人在，也摆两个杯子。" },
    { questionId: "alone",
      answer: "I walk to the river and don't take a phone. I count birds. It sounds precious but it isn't.",
      answer_zh: "我走到河边，不带手机。数鸟。听起来矫情，其实不是。" },
    { questionId: "sunday",
      answer: "Throw clay in the morning. Eat something I made. Read until the light goes. Don't speak much.",
      answer_zh: "上午拉坯。吃一些自己做的东西。读书读到天暗下去。不怎么说话。" },
  ],
  hugo: [
    { questionId: "free-month",
      answer: "I'd ride buses I don't know the route of and talk to whoever sits next to me. I've done a week of this. A month would be excessive in the best way.",
      answer_zh: "我会去坐不知道路线的公交车，跟邻座的人随便聊。我试过一周，一个月会是好的那种过分。" },
    { questionId: "fight",
      answer: "That being interesting was important. Now I want to be interested.",
      answer_zh: "我以前觉得'有意思'很重要。现在我只想'对事物感兴趣'。" },
  ],
  noa: [
    { questionId: "kids",
      answer: "A loud dinner. Two kids, maybe three. A partner who fixes things without being asked. Friends who let themselves in.",
      answer_zh: "热闹的晚餐。两个孩子，也许三个。一个不用提醒就会修东西的伴侣。会自己开门进来的朋友。" },
    { questionId: "tradeoff",
      answer: "Status. I left a famous hospital for a clinic where I know the kids' names.",
      answer_zh: "地位。我从一家有名的医院离开，去了一家我能叫得出每个孩子名字的诊所。" },
    { questionId: "give-up",
      answer: "My work. It's not all of me but I won't shrink it.",
      answer_zh: "我的工作。它不是我的全部，但我不会为谁缩小它。" },
  ],
  soren: [
    { questionId: "sunday",
      answer: "Ride at five. Coffee while the shop's still closed. Open up. Talk to whoever wanders in. Close early.",
      answer_zh: "五点出门骑车。店没开门时喝杯咖啡。开门。和走进来的人聊聊。早点关门。" },
    { questionId: "home",
      answer: "Wherever the bike fits in the hallway.",
      answer_zh: "走廊能放下自行车的地方。" },
  ],
  leo: [
    { questionId: "alone",
      answer: "I light a candle at midnight and walk the dog. I call it thinking. Mostly I'm just looking at streetlamps.",
      answer_zh: "我半夜点一支蜡烛，遛狗。我管这叫思考。其实大多时候只是在看路灯。" },
    { questionId: "fight",
      answer: "That bigger meant better. I write shorter poems now.",
      answer_zh: "我以前以为更大就是更好。现在我写更短的诗。" },
  ],
  wren: [
    { questionId: "kids",
      answer: "Honestly, undecided. I'd want the conversation, not the assumption.",
      answer_zh: "说实话还没决定。我希望是认真讨论的结果，不是默认。" },
    { questionId: "give-up",
      answer: "Hope. Sounds soft but in my field it isn't.",
      answer_zh: "希望。听起来软，在我这行不是。" },
  ],
  kai: [
    { questionId: "free-month",
      answer: "Drive north until the road runs out. Sleep in the truck. Come back when I'm bored, which takes a while.",
      answer_zh: "一路向北开到没有路。睡在车里。等无聊了再回来——而我无聊得慢。" },
    { questionId: "alone",
      answer: "I shoot a roll of film of nothing in particular and develop it the next week. Half the frames are mistakes I keep.",
      answer_zh: "我会拍一卷没主题的胶片，下周冲出来。一半是失误，我也留着。" },
  ],
  elena: [
    { questionId: "sunday",
      answer: "Up at four to bake. By noon I'm done. Long lunch, longer nap. A walk where someone holds my hand.",
      answer_zh: "四点起来烤东西。中午就忙完了。慢慢吃午饭，再慢慢睡个午觉。傍晚散步，有人牵着我的手。" },
    { questionId: "tradeoff",
      answer: "I'd take less money for mornings. I already have.",
      answer_zh: "我愿意拿钱去换早晨。我已经这样换了。" },
  ],
};
