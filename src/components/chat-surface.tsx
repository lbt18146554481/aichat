import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AgentTagRow } from "@/components/agent-tag-row";
import { CLOSING, FOLLOW_UPS, OPENING, extractSignals } from "@/lib/conversation";
import { loadAgents, type CustomAgent } from "@/lib/custom-agents";
import {
  loadChat,
  newChat,
  titleFromMessage,
  uid,
  upsertChat,
  type Chat,
  type ChatMessage,
} from "@/lib/chats";
import { avatarUrl } from "@/lib/people";
import { composePortrait } from "@/lib/portrait";
import { findResonant } from "@/lib/resonance";

const SUGGESTIONS = [
  "Describe my ideal Sunday partner",
  "Help me put words to a feeling",
  "Someone who fits a quiet life",
  "I want someone curious",
];

interface Props {
  chatId?: string;
}

export function ChatSurface({ chatId }: Props) {
  const navigate = useNavigate();
  const [chat, setChat] = useState<Chat | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [agentTick, setAgentTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate or initialize chat
  useEffect(() => {
    if (chatId) {
      const c = loadChat(chatId);
      setChat(c);
    } else {
      setChat(null);
    }
    setAgents(loadAgents());
    setHydrated(true);
  }, [chatId]);

  useEffect(() => {
    setAgents(loadAgents());
  }, [agentTick]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat?.messages.length, thinking]);

  useEffect(() => {
    if (!thinking) inputRef.current?.focus();
  }, [thinking, chatId]);

  function persist(next: Chat) {
    upsertChat(next);
    setChat(next);
  }

  function pushAI(c: Chat, text: string, cards?: string[]): Chat {
    const msg: ChatMessage = {
      id: uid(),
      role: "ai",
      text,
      t: Date.now(),
      cards,
    };
    return { ...c, messages: [...c.messages, msg], updatedAt: Date.now() };
  }

  function pushUser(c: Chat, text: string): Chat {
    const msg: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      t: Date.now(),
    };
    const title = c.messages.length === 0 ? titleFromMessage(text) : c.title;
    return {
      ...c,
      title,
      messages: [...c.messages, msg],
      updatedAt: Date.now(),
    };
  }

  function delayed(fn: () => void, ms = 800) {
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      fn();
    }, ms);
  }

  function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || thinking) return;
    setInput("");

    // Initialize chat if needed
    let c: Chat = chat ?? newChat();
    const creating = !chat;

    c = pushUser(c, text);

    // Drive stage machine
    if (c.stage === "intro") {
      c = { ...c, stage: "followups", followUpsAnswered: 0 };
      persist(c);
      delayed(() => persist(pushAI(loadChat(c.id) ?? c, FOLLOW_UPS[0].q)));
    } else if (c.stage === "followups") {
      const n = c.followUpsAnswered + 1;
      const signals = Array.from(
        new Set([...c.signals, ...extractSignals(text)]),
      );
      if (n < FOLLOW_UPS.length) {
        c = { ...c, followUpsAnswered: n, signals };
        persist(c);
        delayed(() =>
          persist(pushAI(loadChat(c.id) ?? c, FOLLOW_UPS[n].q)),
        );
      } else {
        // Closing — generate portrait + candidates
        c = { ...c, followUpsAnswered: n, signals, stage: "closing" };
        persist(c);
        delayed(() => {
          const seekerLike = {
            rawDescription: c.messages.find((m) => m.role === "user")?.text ?? "",
            followUps: FOLLOW_UPS.map((f, i) => ({
              q: f.q,
              a:
                c.messages.filter((m) => m.role === "user")[i + 1]?.text ?? "",
            })),
            portrait: "",
            signals,
          };
          const portrait = composePortrait(seekerLike);
          const matches = findResonant(signals).slice(0, 4);
          const ids = matches.map((m) => m.person.id);

          let next = loadChat(c.id) ?? c;
          next = pushAI(
            next,
            `Here's the portrait I gathered from your words:\n\n${portrait}`,
          );
          next = pushAI(
            next,
            `I found ${ids.length} people who resonate. Tap any of them to read more.`,
            ids,
          );
          next = { ...next, portrait, stage: "done" };
          persist(next);
        }, 1200);
      }
    } else if (c.stage === "done") {
      // Follow-up free chat after done — give a gentle echo
      persist(c);
      delayed(() =>
        persist(
          pushAI(
            loadChat(c.id) ?? c,
            "I'm here. Tell me more, or start a new chat to describe someone else.",
          ),
        ),
      );
    }

    if (creating) {
      // Navigate to the new chat URL
      navigate({ to: "/c/$chatId", params: { chatId: c.id } });
    }
  }

  // Empty welcome screen (no chat yet, no chatId in URL)
  if (hydrated && !chat) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground text-center">
            Find your person.
          </h1>
          <p className="mt-3 text-sm md:text-base text-muted-foreground text-center max-w-md">
            Describe the partner you hope to meet. I'll listen, draft a portrait,
            and find people who resonate.
          </p>

          <div className="mt-8 w-full max-w-2xl">
            <Composer
              ref={inputRef}
              value={input}
              onChange={setInput}
              onSend={() => handleSend()}
              disabled={thinking}
              placeholder={OPENING.placeholder}
            />
            <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="px-3 py-1.5 rounded-full border border-border text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <AgentTagRow
                agents={agents}
                onChange={() => setAgentTick((t) => t + 1)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!chat) return null;

  // Active chat: render the opening message inline if no AI messages yet
  const messages =
    chat.messages.length > 0
      ? chat.messages
      : [
          {
            id: "opening",
            role: "ai" as const,
            text: OPENING.intro,
            t: Date.now(),
          },
        ];

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={m.role === "user" ? "flex justify-end" : ""}
              >
                {m.role === "user" ? (
                  <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-secondary text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                    {m.text}
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground mb-1">
                      Bloom
                    </div>
                    <div className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">
                      {m.text}
                    </div>
                    {m.cards && m.cards.length > 0 && (
                      <PersonCards ids={m.cards} />
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {thinking && (
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">
                Bloom
              </div>
              <div className="flex gap-1 py-1.5">
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
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <Composer
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={() => handleSend()}
            disabled={thinking}
            placeholder="Reply..."
          />
          <div className="mt-2">
            <AgentTagRow
              agents={agents}
              onChange={() => setAgentTick((t) => t + 1)}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Bloom is a sketch — your words stay in this browser.
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Composer ---

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const Composer = ({
  ref,
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: ComposerProps & { ref?: React.Ref<HTMLTextAreaElement> }) => {
  return (
    <div className="relative flex items-end rounded-2xl border border-border bg-background shadow-sm focus-within:border-foreground/40 transition-colors">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        autoFocus
        placeholder={placeholder}
        className="flex-1 resize-none bg-transparent px-4 py-3.5 pr-12 text-[15px] outline-none max-h-48 placeholder:text-muted-foreground"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-foreground text-background grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
};

// --- Inline person cards ---

import { getPersonById } from "@/lib/people";

function PersonCards({ ids }: { ids: string[] }) {
  const people = ids.map(getPersonById).filter(Boolean);
  return (
    <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
      {people.map((p) => {
        if (!p) return null;
        return (
          <Link
            key={p.id}
            to="/people/$id"
            params={{ id: p.id }}
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background hover:border-foreground/30 hover:shadow-sm transition-all"
          >
            <img
              src={avatarUrl(p.name)}
              alt=""
              className="w-10 h-10 rounded-full border border-border bg-secondary shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {p.name}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {p.age} · {p.city} · {p.occupation}
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {p.portrait}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
