// Side-by-Side activity data, Compass reflections (used for matchmaker
// affinity scoring), Moments, and One Work refs — keyed by person.id.
// Merged into the Person objects by people.ts's loader.

import type { Activity, Moment, OneWorkRef, Reflection } from "./types";

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
    { kind: "exhibition", level: "intermediate", area: "Mitte", area_zh: "米特",
      slots: [{ day: "sat", window: "evening" }], venue: "Hamburger Bahnhof", venue_zh: "汉堡车站美术馆" },
  ],
  mira: [
    { kind: "run", level: "intermediate", area: "Higashiyama", area_zh: "东山",
      slots: [{ day: "sat", window: "morning" }, { day: "wed", window: "morning" }],
      venue: "Kamogawa riverside", venue_zh: "鸭川河岸" },
    { kind: "tennis", level: "beginner", area: "Sakyō", area_zh: "左京",
      slots: [{ day: "sun", window: "evening" }],
      venue: "Takano public courts", venue_zh: "高野公共球场" },
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
    { questionId: "home", answer: "Home is wherever I can cook dinner without checking my phone. Three apartments in Lisbon have qualified.", answer_zh: "家是任何一个我能不看手机做晚饭的地方。在里斯本有过三个这样的公寓。" },
    { questionId: "alone", answer: "I read out loud. In whichever language I'm trying not to lose that month.", answer_zh: "我会朗读。用那个月我正努力不让自己荒废的语言读。" },
    { questionId: "sunday", answer: "Wake up late. Walk somewhere with a bakery. Read something I don't have to translate. Talk to one person for two hours.", answer_zh: "睡到晚一点。走到某个有面包房的地方。读一些不需要我翻译的东西。和一个人聊两小时。" },
  ],
  june: [
    { questionId: "home", answer: "Home is two or three people I can be quiet with. Not a place. I've moved enough to know.", answer_zh: "家是两三个我可以一起安静的人。不是地点——我搬过够多次才懂。" },
    { questionId: "kids", answer: "A small kitchen. One partner. Maybe a kid old enough to have opinions about music. A friend dropping by uninvited.", answer_zh: "一个不大的厨房。一个伴侣。也许有一个已经对音乐有自己看法的孩子。一个不打招呼就来的朋友。" },
    { questionId: "tradeoff", answer: "Time. I'd take half the salary for an extra day. I have, twice.", answer_zh: "时间。我愿意用一半的工资换多一天。我已经这样换过两次。" },
  ],
  theo: [
    { questionId: "alone", answer: "I play the same three minutes of a piece over and over until I can't tell if it's good. Then I leave it for a week.", answer_zh: "我会把一段三分钟的曲子反复弹，直到分不清它到底好不好。然后放它一周。" },
    { questionId: "give-up", answer: "Honesty. I'd rather end something kindly than perform it.", answer_zh: "诚实。我宁愿好好结束一段关系，也不愿假装维持。" },
  ],
  mira: [
    { questionId: "home", answer: "A place I can hear the kettle from the next room. Two cups out, even when I'm alone.", answer_zh: "一个我能从隔壁房间听见水壶响的地方。哪怕一个人在，也摆两个杯子。" },
    { questionId: "alone", answer: "I walk to the river and don't take a phone. I count birds. It sounds precious but it isn't.", answer_zh: "我走到河边，不带手机。数鸟。听起来矫情，其实不是。" },
    { questionId: "sunday", answer: "Throw clay in the morning. Eat something I made. Read until the light goes. Don't speak much.", answer_zh: "上午拉坯。吃一些自己做的东西。读书读到天暗下去。不怎么说话。" },
  ],
  hugo: [
    { questionId: "free-month", answer: "I'd ride buses I don't know the route of and talk to whoever sits next to me.", answer_zh: "我会去坐不知道路线的公交车，跟邻座的人随便聊。" },
    { questionId: "fight", answer: "That being interesting was important. Now I want to be interested.", answer_zh: "我以前觉得'有意思'很重要。现在我只想'对事物感兴趣'。" },
  ],
  noa: [
    { questionId: "kids", answer: "A loud dinner. Two kids, maybe three. A partner who fixes things without being asked. Friends who let themselves in.", answer_zh: "热闹的晚餐。两个孩子，也许三个。一个不用提醒就会修东西的伴侣。会自己开门进来的朋友。" },
    { questionId: "tradeoff", answer: "Status. I left a famous hospital for a clinic where I know the kids' names.", answer_zh: "地位。我从一家有名的医院离开，去了一家我能叫得出每个孩子名字的诊所。" },
    { questionId: "give-up", answer: "My work. It's not all of me but I won't shrink it.", answer_zh: "我的工作。它不是我的全部，但我不会为谁缩小它。" },
  ],
  soren: [
    { questionId: "sunday", answer: "Ride at five. Coffee while the shop's still closed. Open up. Talk to whoever wanders in. Close early.", answer_zh: "五点出门骑车。店没开门时喝杯咖啡。开门。和走进来的人聊聊。早点关门。" },
    { questionId: "home", answer: "Wherever the bike fits in the hallway.", answer_zh: "走廊能放下自行车的地方。" },
  ],
  leo: [
    { questionId: "alone", answer: "I light a candle at midnight and walk the dog. I call it thinking. Mostly I'm just looking at streetlamps.", answer_zh: "我半夜点一支蜡烛，遛狗。我管这叫思考。其实大多时候只是在看路灯。" },
    { questionId: "fight", answer: "That bigger meant better. I write shorter poems now.", answer_zh: "我以前以为更大就是更好。现在我写更短的诗。" },
  ],
  wren: [
    { questionId: "kids", answer: "Honestly, undecided. I'd want the conversation, not the assumption.", answer_zh: "说实话还没决定。我希望是认真讨论的结果，不是默认。" },
    { questionId: "give-up", answer: "Hope. Sounds soft but in my field it isn't.", answer_zh: "希望。听起来软，在我这行不是。" },
  ],
  kai: [
    { questionId: "free-month", answer: "Drive north until the road runs out. Sleep in the truck. Come back when I'm bored, which takes a while.", answer_zh: "一路向北开到没有路。睡在车里。等无聊了再回来——而我无聊得慢。" },
    { questionId: "alone", answer: "I shoot a roll of film of nothing in particular and develop it the next week. Half the frames are mistakes I keep.", answer_zh: "我会拍一卷没主题的胶片，下周冲出来。一半是失误，我也留着。" },
  ],
  elena: [
    { questionId: "sunday", answer: "Up at four to bake. By noon I'm done. Long lunch, longer nap. A walk where someone holds my hand.", answer_zh: "四点起来烤东西。中午就忙完了。慢慢吃午饭，再慢慢睡个午觉。傍晚散步，有人牵着我的手。" },
    { questionId: "tradeoff", answer: "I'd take less money for mornings. I already have.", answer_zh: "我愿意拿钱去换早晨。我已经这样换了。" },
  ],
};

// Moments — what shows up on the Matchmaker right pane, and what the user
// quotes from when saying hello.
function m(id: string, promptId: string, answer: string, answer_zh: string): Moment {
  return { id, promptId, answer, answer_zh };
}

export const MOMENTS: Record<string, Moment[]> = {
  isa: [
    m("isa-1", "lose-time", "Bookstores in cities I don't live in. I'll lose a whole afternoon to a shelf in a language I barely read.", "在我不住的城市里逛书店。能在一架我几乎读不懂的语言的书前耗掉整个下午。"),
    m("isa-2", "small-thing", "The crack in the window when it rains. I won't close it, even when I'm cold.", "下雨时窗户留一条缝。哪怕冷，我也不会关。"),
    m("isa-3", "changed", "I used to think being fluent meant thinking in the language. Now I think it means being willing to be wrong out loud.", "我曾以为流利就是能用那种语言思考。现在我觉得，流利是愿意大声说错。"),
  ],
  june: [
    m("june-1", "small-thing", "Walking home the long way. It adds twenty minutes and rearranges the whole day.", "回家走远的那条路。多花二十分钟，整天的感觉都不一样。"),
    m("june-2", "remembered", "That she made the room a little easier to be in. That's enough for me.", "她让那个房间更容易待下去。对我来说就够了。"),
    m("june-3", "compliment", "Someone once said I'm hard to lie to. I think about it more than I should.", "有人对我说过，对我撒谎很难。我想这句话想得比应该的多。"),
  ],
  theo: [
    m("theo-1", "defend", "Silence in conversation. Most people fill it because they're scared. I'd rather know what we both actually mean.", "对话里的沉默。大多数人填它是因为害怕。我宁愿真的弄明白两个人在说什么。"),
    m("theo-2", "lose-time", "Three minutes of a piece, played over until I can't tell if it's good anymore.", "一段三分钟的曲子，弹到自己分不清它好不好为止。"),
    m("theo-3", "unexpected-home", "A friend's kitchen in Lisbon. Stayed two days. Felt more at home than my own flat for a long time.", "里斯本一个朋友的厨房。住了两天。比我自己住的公寓更像家，持续了很久。"),
  ],
  mira: [
    m("mira-1", "small-thing", "Setting two cups out in the morning, even when I'm alone.", "早晨摆两个杯子，哪怕只有我一个人。"),
    m("mira-2", "lose-time", "At the wheel. I look up and three hours are gone and the light is different.", "在拉坯机前。一抬头三个小时过去了，光也不一样了。"),
    m("mira-3", "defend", "Not filling silences. People mistake it for distance — it isn't.", "不去填补沉默。常被误会成疏远——其实不是。"),
  ],
  hugo: [
    m("hugo-1", "lose-time", "Long bus rides I don't know the route of. Whoever sits next to me usually has the better story.", "坐不熟悉路线的长途公交车。坐我旁边的人，故事往往比我的好。"),
    m("hugo-2", "changed", "I used to think being interesting mattered. Now I just want to be interested.", "我曾以为'有意思'很重要。现在我只想'对事物感兴趣'。"),
    m("hugo-3", "unusual-skill", "I can remember strangers' sentences for years. I keep a notebook of them.", "我能记住陌生人说过的句子，记很多年。专门有个本子。"),
  ],
  noa: [
    m("noa-1", "remembered", "That when she said she'd be there, she was. That's the one I want.", "她说她在，她就真的在。我想被这样记得。"),
    m("noa-2", "small-thing", "One excellent knife. I use it for everything. People think I'm joking. I'm not.", "一把真正好的刀。做什么都用它。别人以为我开玩笑——我不是。"),
    m("noa-3", "defend", "Crying at the end of good novels, in public, without explaining.", "读完一本好小说在公共场合哭，并且不解释。"),
  ],
  soren: [
    m("soren-1", "lose-time", "Fixing a bike. I look up and the shop is dark and I forgot to turn the lights on.", "修自行车。等回过神，店里黑了，我忘了开灯。"),
    m("soren-2", "small-thing", "Riding before sunrise. The city belongs to a different few people at that hour.", "天亮前骑车。那个时段的城市，属于另外一小群人。"),
    m("soren-3", "unexpected-home", "A repair stand. I think more clearly with my hands on a wrench than anywhere else.", "一个修车架。手里握着扳手时，我比在任何地方都想得清楚。"),
  ],
  leo: [
    m("leo-1", "lose-time", "Recommending books. I'll spend an hour on one customer if the right book is in the room.", "给人推荐书。如果那本对的书就在店里，我能为一个客人花一个小时。"),
    m("leo-2", "changed", "I used to think bigger meant better. I write shorter poems now.", "我曾以为更大就是更好。现在我写更短的诗。"),
    m("leo-3", "small-thing", "Walking the dog under streetlamps at midnight. I call it thinking.", "半夜在路灯下遛狗。我管这叫思考。"),
  ],
  wren: [
    m("wren-1", "defend", "Hope, in a field that mostly delivers bad news. It's not soft — it's the work.", "在这个大多数时候只带来坏消息的领域里抱有希望。它不软——它就是工作本身。"),
    m("wren-2", "small-thing", "Pressed wildflowers on the kitchen wall. I started in grad school and haven't stopped.", "厨房墙上压制的野花。读研时开始的，没停过。"),
    m("wren-3", "compliment", "A professor once said I notice what most people walk past. I've tried to keep that true.", "一位教授说过，我会注意到大多数人会走过去不看的东西。我一直尽量让这句话还成立。"),
  ],
  kai: [
    m("kai-1", "lose-time", "Driving north until the road runs out. I sleep in the truck. I'm bored slowly.", "一路向北开到没有路。睡在车里。我无聊得很慢。"),
    m("kai-2", "small-thing", "Shooting film of nothing in particular. Half the frames are mistakes I keep on purpose.", "拍一些没什么主题的胶片。一半是失误，我故意留下。"),
    m("kai-3", "defend", "Eating with company. I hike alone, but I won't eat alone if I can help it.", "结伴吃饭。我可以独自爬山，但能不一个人吃饭，就不一个人吃。"),
  ],
  elena: [
    m("elena-1", "lose-time", "Pulling something from the oven at the exact right minute. I don't notice the four hours before it.", "在恰好那一分钟把东西从烤箱里拿出来。之前的四个小时我都没察觉。"),
    m("elena-2", "defend", "Dessert is the most honest course. I mean it.", "甜点是最诚实的一道菜。我是认真的。"),
    m("elena-3", "small-thing", "Reading poetry between batches. The bakery doesn't know.", "两炉之间读诗。面包房不知道这件事。"),
  ],
};

// One Work — a single book / film / album / exhibition / food this person
// has cared about lately. Shared-taste signal that Moments alone can't
// carry, and a natural conversation seed.
export const ONE_WORKS: Record<string, OneWorkRef> = {
  isa: { kind: "book", title: "The Years — Annie Ernaux",
    why: "She wrote a whole life in the third person and I still cried at my own.",
    why_zh: "她用第三人称写完了一整个人生——我却为自己的人生哭了。" },
  june: { kind: "book", title: "A Pattern Language — Christopher Alexander",
    why: "It's a book about buildings that taught me how to be with people.",
    why_zh: "一本讲建筑的书，教会了我怎么和人在一起。" },
  theo: { kind: "music", title: "Music for Airports — Brian Eno",
    why: "Music you don't have to listen to is the kind I trust most.",
    why_zh: "不必专注去听的音乐，是我最信任的那种音乐。" },
  mira: { kind: "exhibition", title: "Lucie Rie at the V&A",
    title_zh: "Lucie Rie 在 V&A 的展",
    why: "Half a century of bowls in one room. You leave wanting to make less and notice more.",
    why_zh: "半个世纪的碗在同一个房间里。看完想做得更少、看得更多。" },
  hugo: { kind: "film", title: "Stories We Tell — Sarah Polley",
    why: "She makes a documentary out of the holes in her own family. I rewatch it like a how-to.",
    why_zh: "她把自家故事里的空白处拍成了纪录片。我把它当说明书反复看。" },
  noa: { kind: "book", title: "Being Mortal — Atul Gawande",
    why: "Changed how I talk to families on hard days. The book I press into colleagues' hands.",
    why_zh: "改变了我在难的那一天怎么和家属说话。我会塞到同事手里的那本书。" },
  soren: { kind: "book", title: "Selected Poems — Tomas Tranströmer",
    why: "Short poems I read between customers. Each one is the right length for one repair.",
    why_zh: "客人之间读的短诗。每一首正好够修一辆车的时间。" },
  leo: { kind: "book", title: "Kitchen — Banana Yoshimoto",
    why: "Small book about grief and a refrigerator. I've sold thirty copies and kept one for myself.",
    why_zh: "一本关于悲伤和冰箱的小书。卖出去三十本，自己留了一本。" },
  wren: { kind: "book", title: "Braiding Sweetgrass — Robin Wall Kimmerer",
    why: "Hope you can act on, not the kind that just feels nice.",
    why_zh: "能拿来做事的希望，而不是那种听着舒服的。" },
  kai: { kind: "film", title: "Paterson — Jim Jarmusch",
    why: "A whole movie about a man writing small poems on a bus route. Felt seen.",
    why_zh: "一整部电影就是一个男人在公交线路上写小诗。被看见了。" },
  elena: { kind: "food", title: "Maritozzi at Roscioli, 6am",
    title_zh: "Roscioli 清晨六点的 Maritozzi",
    why: "The exact moment the cream goes in. I once walked an hour to be there for it.",
    why_zh: "奶油挤进去的那一刻。我曾经走一个小时路，就为了赶上。" },
  amara: { kind: "music", title: "Mama Africa — Miriam Makeba",
    why: "Music I'd put on at the start of any dinner I host.",
    why_zh: "请客吃饭一开场我会放的音乐。" },
};
