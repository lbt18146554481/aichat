import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AgentPanel } from "@/components/agent-panel";
import {
  INITIAL_AGENT_STATE,
  loadAgents,
  saveAgents,
  type AgentState,
} from "@/lib/agents";
import { CLOSING, FOLLOW_UPS, OPENING, collectSignals } from "@/lib/conversation";
import { composePortrait } from "@/lib/portrait";
import {
  loadConversation,
  loadSeeker,
  resetAll,
  saveConversation,
  saveSeeker,
} from "@/lib/store";
import { EMPTY_SEEKER, type Seeker, type Turn } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bloom — Your AI team for finding the one" },
      {
        name: "description",
        content:
          "A small team of AI agents that listens, drafts your portrait, and finds people who resonate.",
      },
      { property: "og:title", content: "Bloom" },
      {
        property: "og:description",
        content: "Your AI team for finding the one.",
      },
    ],
  }),
  component: HomeChat,
});

const uid = () => Math.random().toString(36).slice(2, 10);
type Phase = "intro" | "followups" | "closing" | "done";

function HomeChat() {
  const navigate = useNavigate();
  const [seeker, setSeeker] = useState<Seeker>(() => ({ ...EMPTY_SEEKER }));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [agents, setAgents] = useState<AgentState>(() => ({ ...INITIAL_AGENT_STATE }));
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSeeker(loadSeeker());
    setTurns(loadConversation());
    setAgents(loadAgents());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (turns.length === 0) pushBloom(OPENING.intro, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (hydrated) saveConversation(turns);
  }, [turns, hydrated]);
  useEffect(() => {
    if (hydrated) saveSeeker(seeker);
  }, [seeker, hydrated]);
  useEffect(() => {
    if (hydrated) saveAgents(agents);
  }, [agents, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, listening]);

  useEffect(() => {
    if (!listening) inputRef.current?.focus();
  }, [listening, turns.length]);

  const phase: Phase = (() => {
    if (!seeker.rawDescription) return "intro";
    if (seeker.followUps.length < FOLLOW_UPS.length) return "followups";
    if (!seeker.portrait) return "closing";
    return "done";
  })();

  function pushBloom(text: string, delay = 700) {
    setListening(true);
    const wait = Math.min(1600, delay + text.length * 12);
    setTimeout(() => {
      setTurns((prev) => [
        ...prev,
        { id: uid(), role: "muse", text, t: Date.now() },
      ]);
      setListening(false);
    }, wait);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || listening || phase === "done") return;
    setInput("");
    setTurns((prev) => [
      ...prev,
      { id: uid(), role: "you", text, t: Date.now() },
    ]);

    if (phase === "intro") {
      const next: Seeker = { ...seeker, rawDescription: text };
      setSeeker(next);
      setTimeout(() => pushBloom(FOLLOW_UPS[0].q), 500);
      return;
    }

    if (phase === "followups") {
      const idx = seeker.followUps.length;
      const q = FOLLOW_UPS[idx].q;
      const nextFollowUps = [...seeker.followUps, { q, a: text }];
      const next: Seeker = { ...seeker, followUps: nextFollowUps };

      if (nextFollowUps.length < FOLLOW_UPS.length) {
        setSeeker(next);
        setTimeout(() => pushBloom(FOLLOW_UPS[nextFollowUps.length].q), 500);
      } else {
        // Portrait agent kicks in
        setAgents((a) => ({ ...a, portrait: "working" }));
        setTimeout(() => pushBloom(CLOSING, 300), 400);
        setTimeout(() => {
          const signals = collectSignals(next);
          const portrait = composePortrait(next);
          const finished: Seeker = { ...next, signals, portrait };
          setSeeker(finished);
          setAgents((a) => ({ ...a, portrait: "done", scout: "working" }));
          pushBloom(
            `Portrait is done. Here's what it gathered:\n\n${portrait}\n\nScout is now looking for people who resonate.`,
            1000,
          );
          setTimeout(() => {
            setAgents((a) => ({ ...a, scout: "done" }));
          }, 1800);
        }, 1800);
      }
    }
  }

  function handleReset() {
    if (!confirm("Start over? Your portrait and team progress will be cleared.")) return;
    resetAll();
    saveAgents({ ...INITIAL_AGENT_STATE });
    setSeeker({ ...EMPTY_SEEKER });
    setAgents({ ...INITIAL_AGENT_STATE });
    setTurns([]);
    setTimeout(() => pushBloom(OPENING.intro, 200), 100);
  }

  const progress = (() => {
    if (phase === "intro") return 0;
    return Math.round(
      ((1 + seeker.followUps.length) / (1 + FOLLOW_UPS.length)) * 100,
    );
  })();

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <div className="grid md:grid-cols-[260px_1fr] gap-4 md:gap-6">
          {/* Agent panel */}
          <AgentPanel
            state={agents}
            className="hidden md:flex md:sticky md:top-20 md:self-start"
          />

          {/* Chat surface */}
          <div className="rounded-xl bg-card border border-border shadow-soft overflow-hidden flex flex-col h-[calc(100vh-9rem)] md:h-[calc(100vh-7rem)]">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5" />
                {phase === "done"
                  ? "Portrait ready"
                  : `${progress}% — a few quiet questions`}
              </div>
              {turns.length > 1 && (
                <button
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary"
                >
                  <RotateCcw className="w-3 h-3" /> Restart
                </button>
              )}
            </div>
            <div className="h-px bg-border" />
            <div className="h-0.5 bg-secondary">
              <motion.div
                className="h-full bg-foreground"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
            >
              <AnimatePresence initial={false}>
                {turns.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className={m.role === "you" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={[
                        "max-w-[80%] px-4 py-2.5 rounded-lg text-sm leading-relaxed whitespace-pre-wrap",
                        m.role === "you"
                          ? "bg-foreground text-background"
                          : "bg-secondary text-foreground border border-border",
                      ].join(" ")}
                    >
                      {m.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {listening && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-secondary border border-border px-4 py-2.5 rounded-lg flex items-center gap-2">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{
                            duration: 1.1,
                            repeat: Infinity,
                            delay: i * 0.15,
                          }}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Bloom is thinking
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {phase === "done" ? (
              <div className="p-4 md:p-5 border-t border-border bg-secondary/50 flex flex-col md:flex-row gap-3 items-center justify-between">
                <p className="text-sm text-foreground">
                  Your portrait is ready. Meet who Scout found.
                </p>
                <div className="flex gap-2">
                  <Link
                    to="/portrait"
                    className="px-4 py-2 rounded-md bg-card border border-border text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    Read portrait
                  </Link>
                  <button
                    onClick={() => navigate({ to: "/people" })}
                    className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium flex items-center gap-1.5 hover:opacity-90"
                  >
                    Meet them <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 md:p-4 border-t border-border bg-card">
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
                    placeholder={
                      phase === "intro" ? OPENING.placeholder : "In your own words..."
                    }
                    rows={2}
                    autoFocus
                    className="flex-1 resize-none bg-secondary rounded-md px-3 py-2.5 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-foreground/15 border border-border transition-all max-h-40 placeholder:text-muted-foreground/70"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || listening}
                    className="w-10 h-10 shrink-0 rounded-md bg-foreground text-background grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                    aria-label="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile agent panel below chat */}
          <div className="md:hidden">
            <AgentPanel state={agents} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
