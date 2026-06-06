import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Flower2, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
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
      { title: "Bloom — Tell us who you'd bloom with" },
      {
        name: "description",
        content:
          "Describe the person you hope to meet. Bloom will help you find them.",
      },
      { property: "og:title", content: "Bloom" },
      {
        property: "og:description",
        content: "Tell us who you'd bloom with.",
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
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSeeker(loadSeeker());
    setTurns(loadConversation());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (turns.length === 0) pushBloom(OPENING.intro, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (hydrated) saveConversation(turns);
  }, [turns, hydrated]);
  useEffect(() => {
    if (hydrated) saveSeeker(seeker);
  }, [seeker, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, listening]);

  // keep textarea focused
  useEffect(() => {
    if (!listening) inputRef.current?.focus();
  }, [listening, turns.length]);

  const phase: Phase = (() => {
    if (!seeker.rawDescription) return "intro";
    if (seeker.followUps.length < FOLLOW_UPS.length) return "followups";
    if (!seeker.portrait) return "closing";
    return "done";
  })();

  function pushBloom(text: string, delay = 800) {
    setListening(true);
    const wait = Math.min(1800, delay + text.length * 14);
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
      setTimeout(() => pushBloom(FOLLOW_UPS[0].q), 600);
      return;
    }

    if (phase === "followups") {
      const idx = seeker.followUps.length;
      const q = FOLLOW_UPS[idx].q;
      const nextFollowUps = [...seeker.followUps, { q, a: text }];
      const next: Seeker = { ...seeker, followUps: nextFollowUps };

      if (nextFollowUps.length < FOLLOW_UPS.length) {
        setSeeker(next);
        setTimeout(() => pushBloom(FOLLOW_UPS[nextFollowUps.length].q), 600);
      } else {
        const signals = collectSignals(next);
        const portrait = composePortrait(next);
        const finished: Seeker = { ...next, signals, portrait };
        setSeeker(finished);
        setTimeout(() => pushBloom(CLOSING, 500), 500);
        setTimeout(() => {
          pushBloom(
            `Here's the portrait I gathered from your words:\n\n${portrait}\n\nWhen you're ready, I'll show you the people who feel a little like them. 🌷`,
            1200,
          );
        }, 2200);
      }
    }
  }

  function handleReset() {
    if (!confirm("Start over? Your portrait will be cleared.")) return;
    resetAll();
    setSeeker({ ...EMPTY_SEEKER });
    setTurns([]);
    setTimeout(() => pushBloom(OPENING.intro, 300), 200);
  }

  const progress = (() => {
    if (phase === "intro") return 0;
    return Math.round(
      ((1 + seeker.followUps.length) / (1 + FOLLOW_UPS.length)) * 100,
    );
  })();

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-3 md:px-6 pt-4 md:pt-6 pb-4">
        {/* Title strip */}
        <div className="text-center mb-4 md:mb-6">
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="font-display text-4xl md:text-5xl text-foreground leading-tight"
          >
            Tell us who you'd{" "}
            <span className="font-display-italic text-gradient-bloom">
              bloom with
            </span>
            .
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-2 text-sm md:text-base text-muted-foreground"
          >
            No checklist. Just the shape of the person you imagine.
          </motion.p>
        </div>

        {/* Chat surface */}
        <div className="rounded-3xl bg-card/85 backdrop-blur-md border border-border shadow-bloom overflow-hidden flex flex-col h-[calc(100vh-15rem)] md:h-[calc(100vh-13rem)]">
          {/* Progress + reset */}
          <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Flower2 className="w-3.5 h-3.5 text-primary" />
              {phase === "done"
                ? "Portrait ready"
                : `${progress}% — a few more gentle questions`}
            </div>
            {turns.length > 1 && (
              <button
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-muted"
                title="Start over"
              >
                <RotateCcw className="w-3 h-3" /> Restart
              </button>
            )}
          </div>
          <div className="h-1 bg-muted">
            <motion.div
              className="h-full gradient-coral"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className={m.role === "you" ? "flex justify-end" : "flex justify-start gap-2"}
                >
                  {m.role === "muse" && (
                    <div className="w-8 h-8 rounded-full gradient-coral grid place-items-center text-white shrink-0 mt-1 shadow-petal">
                      <Flower2 className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={[
                      "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "you"
                        ? "bg-primary text-primary-foreground rounded-br-md shadow-petal"
                        : "bg-secondary text-secondary-foreground rounded-bl-md",
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
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full gradient-coral grid place-items-center text-white shadow-petal">
                  <Flower2 className="w-3.5 h-3.5" />
                </div>
                <div className="bg-secondary px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-primary"
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                  <span className="text-xs italic text-muted-foreground">
                    Bloom is listening...
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          {phase === "done" ? (
            <div className="p-4 md:p-5 border-t border-border bg-secondary/40 flex flex-col md:flex-row gap-3 items-center justify-between">
              <p className="text-sm text-secondary-foreground">
                Your portrait is ready. Want to meet them? 🌷
              </p>
              <div className="flex gap-2">
                <Link
                  to="/portrait"
                  className="px-5 py-2.5 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-muted"
                >
                  Read portrait
                </Link>
                <button
                  onClick={() => navigate({ to: "/people" })}
                  className="px-5 py-2.5 rounded-full gradient-coral text-white text-sm font-medium shadow-petal flex items-center gap-1.5"
                >
                  Meet them <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 md:p-4 border-t border-border bg-card/50">
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
                  className="flex-1 resize-none bg-muted/70 rounded-2xl px-4 py-3 text-sm outline-none focus:bg-muted focus:ring-2 focus:ring-primary/40 transition-all max-h-40 placeholder:text-muted-foreground/70"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || listening}
                  className="w-11 h-11 shrink-0 rounded-full gradient-coral text-white grid place-items-center shadow-petal disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 transition-transform"
                  aria-label="Send"
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
