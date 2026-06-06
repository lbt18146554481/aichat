import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
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

export const Route = createFileRoute("/describe")({
  head: () => ({
    meta: [
      { title: "Describe — Muse" },
      {
        name: "description",
        content:
          "Describe, in your own words, the person you hope to meet. Muse listens and gathers them into a portrait.",
      },
    ],
  }),
  component: DescribePage,
});

const uid = () => Math.random().toString(36).slice(2, 10);

type Phase = "intro" | "followups" | "closing" | "done";

function DescribePage() {
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
    if (turns.length === 0) {
      pushMuse(OPENING.intro);
    }
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

  useEffect(() => {
    if (!listening) inputRef.current?.focus();
  }, [listening]);

  // Determine current phase from seeker state
  const phase: Phase = (() => {
    if (!seeker.rawDescription) return "intro";
    if (seeker.followUps.length < FOLLOW_UPS.length) return "followups";
    if (!seeker.portrait) return "closing";
    return "done";
  })();

  function pushMuse(text: string, delay = 900) {
    setListening(true);
    const wait = Math.min(2200, delay + text.length * 18);
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
    const youTurn: Turn = { id: uid(), role: "you", text, t: Date.now() };
    setTurns((prev) => [...prev, youTurn]);

    if (phase === "intro") {
      const next: Seeker = { ...seeker, rawDescription: text };
      setSeeker(next);
      const followUp = FOLLOW_UPS[0];
      setTimeout(() => pushMuse(followUp.q), 700);
      return;
    }

    if (phase === "followups") {
      const idx = seeker.followUps.length;
      const q = FOLLOW_UPS[idx].q;
      const nextFollowUps = [...seeker.followUps, { q, a: text }];
      const next: Seeker = { ...seeker, followUps: nextFollowUps };

      if (nextFollowUps.length < FOLLOW_UPS.length) {
        setSeeker(next);
        const nq = FOLLOW_UPS[nextFollowUps.length].q;
        setTimeout(() => pushMuse(nq), 700);
      } else {
        // closing: compose portrait
        const signals = collectSignals(next);
        const portrait = composePortrait(next);
        const finished: Seeker = { ...next, signals, portrait };
        setSeeker(finished);
        setTimeout(() => pushMuse(CLOSING, 600), 600);
        setTimeout(() => {
          pushMuse(
            `Here is what I gathered:\n\n${portrait}\n\nWhen you're ready, see the people who feel close to them.`,
            1400,
          );
        }, 2400);
      }
    }
  }

  function handleReset() {
    if (!confirm("Start over? Your portrait will be cleared.")) return;
    resetAll();
    setSeeker({ ...EMPTY_SEEKER });
    setTurns([]);
    setTimeout(() => pushMuse(OPENING.intro), 200);
  }

  const progress = (() => {
    if (phase === "intro") return 0;
    const answered = seeker.followUps.length;
    return Math.round(((1 + answered) / (1 + FOLLOW_UPS.length)) * 100);
  })();

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <div className="border border-border bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-[11px] tracking-[0.28em] uppercase text-gold">
                The Conversation
              </div>
              <div className="mt-1 font-display text-xl text-foreground">
                {phase === "done"
                  ? "Your portrait is ready."
                  : "Muse is listening."}
              </div>
            </div>
            {turns.length > 1 && (
              <button
                onClick={handleReset}
                className="text-[11px] tracking-[0.2em] uppercase text-whisper hover:text-foreground"
              >
                Start over
              </button>
            )}
          </div>

          <div className="h-px bg-border" />
          <motion.div
            className="h-px bg-gold origin-left"
            initial={false}
            animate={{ scaleX: progress / 100 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-5 md:px-8 py-8 space-y-7"
          >
            <AnimatePresence initial={false}>
              {turns.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className={m.role === "you" ? "flex justify-end" : ""}
                >
                  {m.role === "muse" ? (
                    <div className="max-w-[88%]">
                      <div className="text-[10px] tracking-[0.32em] uppercase text-gold mb-2">
                        Muse
                      </div>
                      <div className="font-display text-xl md:text-2xl text-foreground leading-snug whitespace-pre-wrap">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[80%] border-l border-gold/60 pl-4 py-1">
                      <div className="text-[10px] tracking-[0.32em] uppercase text-whisper mb-1">
                        You
                      </div>
                      <div className="text-sm md:text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {m.text}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {listening && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <span className="text-[10px] tracking-[0.32em] uppercase text-gold">
                  Muse is listening
                </span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1 h-1 rounded-full bg-gold"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                    />
                  ))}
                </span>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          {phase === "done" ? (
            <div className="p-6 border-t border-border bg-secondary/30 flex flex-col md:flex-row gap-4 items-center justify-between">
              <p className="font-display-italic text-whisper">
                A shape of a person, made of your words.
              </p>
              <div className="flex gap-3">
                <Link
                  to="/portrait"
                  className="border border-border px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase text-whisper hover:text-foreground"
                >
                  Read portrait
                </Link>
                <button
                  onClick={() => navigate({ to: "/people" })}
                  className="border border-gold/70 bg-gold text-primary-foreground px-5 py-2.5 text-[11px] tracking-[0.22em] uppercase hover:bg-gold-soft transition-colors"
                >
                  Meet them →
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-5 border-t border-border bg-card/60">
              <div className="flex items-end gap-3">
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
                  className="flex-1 resize-none bg-transparent border border-border focus:border-gold/60 px-4 py-3 text-base outline-none transition-colors max-h-40 placeholder:text-whisper/70 placeholder:italic"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || listening}
                  className="shrink-0 border border-gold/70 text-gold px-5 py-3 text-[11px] tracking-[0.22em] uppercase hover:bg-gold hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
