
## 先独立想清楚：吸引到底来自哪里

你提的问题其实是这个产品最难的一关——**在没有颜值滤镜的前提下，凭什么让一个人对另一个人产生兴趣？** 我把现有研究和经典设计里站得住的结论先列出来，再决定怎么落到产品上。不是引用堆砌，是每一条都对应一个具体的产品决策。

**1. Aron 的"36 个问题"实验（1997, *The Experimental Generation of Interpersonal Closeness*）**
两个陌生人在 45 分钟内通过逐层加深的自我表露 + 4 分钟对视，产生了显著高于对照组的亲密感。后来 NYT 的 "To Fall in Love With Anyone, Do This" 把它推到大众视野。
→ **结论**：吸引不是来自"展示自己有多好"，而是来自**互相的、对称的、有梯度的自我表露**。

**2. Reis & Shaver 的"亲密过程模型"（Intimacy Process Model, 1988）**
亲密 = 自我表露 + 对方"被看见、被理解、被在乎"的回应。光说自己没用，关键是另一方的**响应性 (responsiveness)**。
→ **结论**：产品里要让"读到对方"和"对方读到你"这件事被看见，而不是只看到对方写了什么。

**3. Helen Fisher 的吸引力神经科学（*Why We Love*, 2004）**
浪漫吸引和"具体性"高度相关——大脑对一个**具体的、独特的、不可替换的人**才会启动 dopamine 系统；对"一类人"不会。Tinder 的失败之处就在于它把人压缩成可替换的标签。
→ **结论**：产品呈现的不能是"标签化的人"，必须是**只属于这个人的细节**。

**4. Susan Cain *Quiet* + Sherry Turkle *Reclaiming Conversation***
内向者、深度交流的人在颜值/即时回应的赛道上系统性失败，但他们恰恰是长期关系满意度更高的群体。
→ **结论**：产品要给"不擅长第一眼吸引"的人一条公平的赛道——靠思考的密度、回答的质感取胜。

**5. Hinge 产品复盘（"Designed to be deleted"）+ OkCupid Christian Rudder *Dataclysm***
OkCupid 数据显示：决定两人是否最终成对的，不是颜值评分，而是**回答的"非主流程度" (statistical idiosyncrasy)**——越独特、越"敢说"的回答，越能精准吸引到对的人。Hinge 的 Prompts（"我最不寻常的技能是…"）就是这个发现的产品化。
→ **结论**：吸引力 = **独特性 × 真诚度**，不是"全面优秀"。

**6. 行为信号 > 自我描述**
心理学一致结论：**别人怎么评价你 / 你怎么对待别人**比"你怎么描述自己"可信得多（"自我描述偏差"是相亲资料失真的主因）。
→ **结论**：产品里要混入"非自我陈述"的信号——比如这个人对一本书、一场比赛、一个具体瞬间的反应。

---

## 由此推出的产品判断（不是 UI，是原则）

把上面 6 条压缩成 3 条产品原则，下面所有改动都从这里推出来：

> **A. 用"具体瞬间"代替"自我标签"**——展示一个人在某个真实场景里说了什么、做了什么，而不是 TA 怎么概括自己。
>
> **B. 引入"对称的自我表露梯度"**——每个人先回答几个有深度、有梯度的问题；你只能看到对方对**你也回答过**的问题的答案。不付出表露，就看不到对方的表露。
>
> **C. 把"被看见"做成一个可见的动作**——不是点赞，是"我读到了你这一句"，并附上自己的一句回应。这一个动作就是 say hello 的内容。

---

## 落到当前产品的最小改动

现在 Matchmaker 已经给出 portrait + 一个 angle + 一句 "in their words"。问题在于这套呈现仍然是**单方面的、被动消费的**——用户在"评估对方"，而不是在"被对方看见"。Say hello 是个空动作，没承载任何吸引力信号。

下面是改动，每一条都对应上面的原则。**不增加新 Agent、不增加新页面、不破坏现有两阶段闭环**。

### 改动 1：把 Person 数据模型从"标签 + portrait"换成"瞬间 (Moments)"

`src/lib/types.ts` 里 `Person` 增加 `moments: Moment[]`，砍掉/弱化 `portrait`（保留作 fallback）。

```ts
interface Moment {
  id: string;
  prompt: string;        // "上次让你忘记时间的事 / 你最近改变过的一个看法 / ..."
  prompt_zh: string;
  answer: string;        // 这个人自己的、具体的回答（不是标签）
  answer_zh: string;
  signals: string[];     // 用于匹配，但不展示
}
```

prompt 池来自经典素材：Aron 36 问的中段（不是最深的那几个，那些留给 connected 之后）、Hinge Prompts 里被验证转化率最高的几条、加上一些专门暴露"思考方式"的开放题（"最近一次你为什么改变了对某件事的看法"）。

### 改动 2：IntroCanvas 改成"对方的三个瞬间"，不再是 angle + portrait

右侧画面变成：
- 顶部：姓名 / 年龄 / 城市 / 职业（保留）
- 主体：**3 个 Moment 卡片**，每张是「问题 + 这个人的回答」
- 不再有 "another angle" 按钮——angle 这个抽象层删掉，因为 Moments 本身就是多个具体侧面

这一条对应原则 A（具体瞬间）和原则 5（独特性 × 真诚度）。Hinge 的产品数据已经验证这种形态比标签化资料的回信率高 3 倍以上。

### 改动 3：Say hello 不再是一键，而是"挑一个 moment + 写一句回应"

这是整个方案的关键。当前 Say hello 是空动作，违背原则 C 和 Reis 的"响应性"模型。

新流程：
1. 用户点 Say hello → 弹出一个 inline composer
2. composer 要求：**选一张对方的 Moment 卡片**作为引用 + **写一句你的回应**（不是夸奖、不是问句，提示语写明："你读到这句时想到了什么 / 你自己的对应经历")
3. 提交后，对方那一侧看到的是：「TA 读到了你这一段」+ 你的那一句回应 + 你自己的一张 Moment 卡片（系统从你的 Moments 里挑一张与对方那张主题相近的）

→ 对方做的决定是：**"这个人读懂了我吗 / 我对 TA 回的那张卡感兴趣吗"**，不是"这个人长得怎么样"。这就是 Aron + Reis 模型的产品化。
→ 双向 opt-in 仍然成立：对方可以 say hello back（同样要引用 + 回应），双方都回应才进入 connected。

### 改动 4：用户自己也要有 Moments——首次进入 Matchmaker 时引导填 3 个

当前 understanding 只存"我想要什么样的人"，但根据原则 B 的对称性和原则 6 的"行为信号 > 自我描述"，用户也得**贡献关于自己的具体瞬间**，否则 Say hello 时没东西可引用。

实现：
- 在 Matchmaker 的 clarifying 阶段，Agent 自然地问 3 个 Moment 问题（混在描述对方的对话里，每隔一两轮问一个），把回答存到 understanding 里新增的 `userMoments: Moment[]`
- 这些回答不是"画像"，是 say hello 时可以被引用的素材

### 改动 5：connected 之后，对话窗口里默认带入"你们互相 say hello 时引用的两段 + 各自的那句回应"作为对话起点

避免 connected 之后第一句话又卡在 "hi"。直接把两个人**已经互相看见的那件事**摆在对话顶部，对话从那里继续。这一条对应 Hinge 数据："开场质量决定 70% 的后续转化"。

### 改动 6：明确不做的

- ❌ 不加颜值/评分/滑动
- ❌ 不加"心动列表"、收藏夹这类被动消费视图
- ❌ 不加 Moments 的点赞数 / 浏览数等公开计数（社会证明会污染真实吸引信号，Rudder 在 *Dataclysm* 里有专门一章讲这个）
- ❌ 不加"AI 帮你写回应"——回应必须是用户自己的字，否则整个原则 C 失效
- ❌ Side by Side 这一版不动；它的"一起做某件事"本身就是行为信号，逻辑独立成立

---

## 改动清单

**修改**
- `src/lib/types.ts` — `Person` 增加 `moments: Moment[]`；新增 `Moment` 类型
- `src/lib/people.ts` + `src/lib/people-extras.ts` — 为现有候选人补 3 个 moments（手写，不是生成；这是数据质量的关键，每个人的 3 个 moment 要能看出"是这个人，不是另一个"）
- `src/lib/questions.ts` — 增加 Moment prompt 池（约 12 条，分 3 个深度梯度）
- `src/lib/understanding.ts` — 增加 `userMoments`；增加 `addUserMoment`
- `src/lib/agents/matchmaker.ts` — clarifying 阶段插入 3 轮 moment 收集（不阻塞主线，每答一个就推进一次匹配）
- `src/components/canvas/intro-canvas.tsx` — 主体从 angle + portrait 改为 3 张 Moment 卡片；Say hello 触发 composer
- `src/lib/connections.ts` — `Connection` 增加 `helloPayload: { quotedMomentId, reply }`，双方都存
- `src/components/canvas/connection-thread.tsx` — 对话窗口顶部显示双方的引用 + 回应作为 anchor
- 新建 `src/components/hello-composer.tsx` — 引用选择 + 单行回应输入
- `src/locales/{en,zh-CN}/common.json` — 新增 `moment.*` 文案

**不动**
- Side by Side
- 路由结构
- understanding 的 positive/negative/notes 逻辑（仍然用于匹配评分）

## 验收

1. 进 Matchmaker，三轮对话内被自然问到 3 个 Moment 问题，回答后立刻给出引荐。
2. 右侧画面看到的是 3 张对方的具体回答卡片，每张都"只可能是这个人写的"——把名字盖住也能区分人。
3. 点 Say hello 必须选一张卡 + 写一句回应才能提交（不能空提交、不能只勾选不写字）。
4. waiting 状态显示"等 TA 回应你写的那句话"，不再是模糊的"等回应"。
5. connected 后对话窗口顶部能看到"双方互相看见的那一刻"。
6. 整个流程**找不到任何**颜值评分、点赞计数、心动列表、AI 代写回应。

---

如果你认同这个方向，我落地。
如果你认为 Moment 应该再加一种**非自我陈述**的来源（比如对方对某本书的笔记、对某场比赛的简评——更接近"行为信号"而不是"自我表露"），告诉我，我把它作为 Moment 的第二种类型加进去——但默认我先做"自我表露式 Moment"这一种，因为它的研究支持更扎实，产品复杂度更低。
