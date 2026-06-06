import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Sparkles, Coffee } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "小荷 · 慢慢相遇 — 与 AI 红娘开启你的故事" },
      {
        name: "description",
        content: "不必滑卡片，先与 AI 红娘小荷聊聊。让懂你的人，慢慢出现。",
      },
      { property: "og:title", content: "小荷 · 慢慢相遇" },
      {
        property: "og:description",
        content: "AI 红娘陪你聊天，理解你之后，为你介绍真正合拍的人。",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-6 pt-16 md:pt-24 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-2xl mx-auto"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" /> 由 AI 红娘陪你开始
          </span>
          <h1 className="mt-6 text-5xl md:text-6xl font-display font-medium leading-[1.1]">
            慢一点，<br />
            <span className="text-gradient-warm">让懂你的人 出现</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            不必急着滑卡片，也不必费心写资料。
            <br className="hidden md:block" />
            先和 AI 红娘小荷聊聊，TA 会替你把心事整理好。
          </p>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-10 inline-block"
          >
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full gradient-warm text-white text-base font-medium shadow-soft"
            >
              <MessageCircle className="w-5 h-5" />
              和小荷聊聊
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-24 grid md:grid-cols-3 gap-5"
        >
          {[
            {
              icon: MessageCircle,
              title: "1. 轻松聊一聊",
              desc: "小荷会像朋友一样问你的喜好、性格、想要怎样的相遇。",
              color: "var(--peach)",
            },
            {
              icon: Coffee,
              title: "2. 生成你的档案",
              desc: "聊天结束，一份温柔贴切的个人画像自动整理完成。",
              color: "var(--sunset)",
            },
            {
              icon: Heart,
              title: "3. 遇见合拍的人",
              desc: "为你挑选契合度高的 TA，附上「为什么」的推荐理由。",
              color: "var(--sage)",
            },
          ].map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
              className="rounded-3xl bg-card/80 backdrop-blur p-6 border border-border/60 shadow-soft"
            >
              <div
                className="w-12 h-12 rounded-2xl grid place-items-center mb-4"
                style={{ background: `color-mix(in oklab, ${step.color} 25%, white)` }}
              >
                <step.icon className="w-5 h-5" style={{ color: `color-mix(in oklab, ${step.color} 70%, black)` }} />
              </div>
              <h3 className="text-xl font-display font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AppShell>
  );
}
