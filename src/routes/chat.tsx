import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { findCurrentStepIndex, progressFromProfile, SCRIPT } from "@/lib/chat-script";
import { loadChat, loadProfile, resetAll, saveChat, saveProfile } from "@/lib/store";
import { EMPTY_PROFILE, type ChatMessage, type UserProfile } from "@/lib/types";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "和小荷聊聊 — 小荷 · 慢慢相遇" },
      { name: "description", content: "AI 红娘小荷会陪你聊聊，慢慢整理出你的画像。" },
    ],
  }),
  component: ChatPage,
});

const uid = () => Math.random().toString(36).slice(2, 10);

function ChatPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile>(() => ({ ...EMPTY_PROFILE }));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate from localStorage
  useEffect(() => {
    const p = loadProfile();
    const m = loadChat();
    setProfile(p);
    setMessages(m);
    setHydrated(true);
  }, []);

  // 首条消息
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0) {
      const idx = findCurrentStepIndex(profile);
      const step = SCRIPT[Math.min(idx, SCRIPT.length - 1)];
      pushAssistant(step.ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // 持久化
  useEffect(() => {
    if (hydrated) saveChat(messages);
  }, [messages, hydrated]);
  useEffect(() => {
    if (hydrated) saveProfile(profile);
  }, [profile, hydrated]);

  // 自动滚动 & 聚焦
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [typing]);

  const stepIdx = findCurrentStepIndex(profile);
  const progress = progressFromProfile(profile);
  const completed = stepIdx >= SCRIPT.length;

  function pushAssistant(text: string) {
    setTyping(true);
    const delay = Math.min(1400, 400 + text.length * 25);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text, timestamp: Date.now() },
      ]);
      setTyping(false);
    }, delay);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || typing || completed) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    const currentIdx = findCurrentStepIndex(profile);
    const step = SCRIPT[currentIdx];
    if (!step) return;

    const parsed = step.parse(text, profile);
    if (!parsed) {
      pushAssistant("嗯～我没太理解，能再换种方式告诉我吗？" + (step.hint ? `\n${step.hint}` : ""));
      return;
    }

    const nextProfile = { ...profile, ...parsed };
    setProfile(nextProfile);

    // 回应
    const ackText = step.ack(text, nextProfile);
    const nextIdx = currentIdx + 1;
    const nextStep = SCRIPT[nextIdx];
    pushAssistant(ackText);
    if (nextStep) {
      setTimeout(() => pushAssistant(nextStep.ask), 1200);
    }
  }

  function handleReset() {
    if (!confirm("确定要重新开始这场对话吗？")) return;
    resetAll();
    setProfile({ ...EMPTY_PROFILE });
    setMessages([]);
    setTimeout(() => {
      pushAssistant(SCRIPT[0].ask);
    }, 200);
  }

  const headerLabel = useMemo(() => {
    if (completed) return "对话完成 · 你的档案已生成";
    return `进度 ${progress}% · 还有 ${SCRIPT.length - stepIdx} 个小问题`;
  }, [completed, progress, stepIdx]);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
        <div className="rounded-3xl bg-card/80 backdrop-blur border border-border/60 shadow-soft overflow-hidden flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-9rem)]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full gradient-warm grid place-items-center text-white shadow-soft shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-lg leading-tight">小荷</div>
                <div className="text-xs text-muted-foreground truncate">{headerLabel}</div>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-muted"
              title="重新开始"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 重来
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <motion.div
              className="h-full gradient-warm"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start gap-2"}
                >
                  {m.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full gradient-warm grid place-items-center text-white shrink-0 mt-1">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={[
                      "max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm shadow-soft"
                        : "bg-secondary/70 text-foreground rounded-bl-sm",
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {typing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full gradient-warm grid place-items-center text-white">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="bg-secondary/70 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-foreground/50"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer: input 或 完成 CTA */}
          {completed ? (
            <div className="p-5 border-t border-border/60 bg-secondary/40 flex flex-col md:flex-row gap-3 items-center justify-between">
              <p className="text-sm text-muted-foreground">
                你的档案准备好啦，去看看 TA 们吧 🌷
              </p>
              <div className="flex gap-2">
                <Link
                  to="/profile"
                  className="px-5 py-2.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
                >
                  我的档案
                </Link>
                <button
                  onClick={() => navigate({ to: "/matches" })}
                  className="px-5 py-2.5 rounded-full gradient-warm text-white text-sm font-medium shadow-soft flex items-center gap-1.5"
                >
                  查看匹配 <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 md:p-4 border-t border-border/60 bg-card/50">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={typing ? "小荷正在输入..." : "告诉小荷..."}
                  rows={1}
                  className="flex-1 resize-none bg-muted/60 rounded-2xl px-4 py-3 text-sm outline-none focus:bg-muted/80 transition-colors max-h-32"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || typing}
                  className="w-11 h-11 shrink-0 rounded-full gradient-warm text-white grid place-items-center shadow-soft disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
