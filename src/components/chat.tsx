import { ArrowUp, Mail, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { LangSwitcher } from "./lang-switcher";
import { IntroductionPane } from "./introduction-pane";
import { UnderstandingPanel } from "./understanding-panel";
import { LetterComposer } from "./letter-composer";
import { InboxPane, LetterThreadView } from "./inbox-pane";
import {
  EMPTY_STATE,
  actAnotherAngle,
  actAnotherPerson,
  actRemoveNegative,
  actRemovePositive,
  loadState,
  resetState,
  saveState,
  startConversation,
  uid,
  userTurn,
  type AgentState,
  type Message,
} from "@/lib/agent";
import {
  applyReply,
  archiveThread,
  generateReply,
  loadLetters,
  markRead,
  saveLetters,
  sendLetter,
  unreadCount,
  type LetterStore,
} from "@/lib/letters";
import { getPersonById } from "@/lib/people";

type RightView =
  | { kind: "intro" }
  | { kind: "compose"; personId: string }
  | { kind: "inbox" }
  | { kind: "thread"; personId: string };

export function Chat() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";

  const [state, setState] = useState<AgentState>(EMPTY_STATE);
  const [letters, setLetters] = useState<LetterStore>({ threads: {}, sendsByDay: {} });
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [right, setRight] = useState<RightView>({ kind: "intro" });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyTimers = useRef<Map<string, number>>(new Map());

  // Initial load + first greeting.
  useEffect(() => {
    const loaded = loadState();
    if (loaded.messages.length === 0) {
      setState(startConversation(lang));
    } else {
      setState(loaded);
    }
    setLetters(loadLetters());
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (hydrated) saveState(state); }, [state, hydrated]);
  useEffect(() => { if (hydrated) saveLetters(letters); }, [letters, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, thinking]);

  useEffect(() => { if (!thinking) inputRef.current?.focus(); }, [thinking]);

  // When the introduced person changes, return the right pane to intro view.
  useEffect(() => {
    setRight((r) => (r.kind === "compose" || r.kind === "thread" ? r : { kind: "intro" }));
  }, [state.currentPersonId]);

  function submit(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      setState((s) => userTurn(s, text, lang));
      setThinking(false);
    }, 550);
  }

  function handleReset() {
    if (state.messages.length > 1 && !confirm(t("header.reset") + "?")) return;
    setState(startConversation(lang));
    setInput("");
    resetState();
  }

  function scheduleReply(personId: string) {
    if (replyTimers.current.has(personId)) return;
    const delay = 8000 + Math.random() * 12000; // 8–20s for demo
    const handle = window.setTimeout(() => {
      replyTimers.current.delete(personId);
      const reply = generateReply(personId, lang);
      if (!reply) return;
      setLetters((s) => applyReply(s, personId, reply));
      // Agent broadcasts in chat.
      const p = getPersonById(personId);
      if (p) {
        const name = lang === "zh-CN" ? p.name_zh : p.name;
        const text = lang === "zh-CN"
          ? `${name} 回信了。要不要现在读？`
          : `${name} wrote back. Want to read it?`;
        setState((st) => ({
          ...st,
          messages: [...st.messages, { id: uid(), role: "assistant", t: Date.now(), text }],
        }));
      }
    }, delay);
    replyTimers.current.set(personId, handle);
  }

  function handleSendLetter(personId: string, body: string) {
    setLetters((s) => sendLetter(s, personId, body));
    scheduleReply(personId);
    setRight({ kind: "thread", personId });
    // Agent acknowledges in main chat.
    const p = getPersonById(personId);
    const name = p ? (lang === "zh-CN" ? p.name_zh : p.name) : "";
    const ack = lang === "zh-CN"
      ? `寄出了。${name} 收到了你的信——给 TA 一点时间。`
      : `Sent. ${name} has it now — give them a little time.`;
    setState((st) => ({
      ...st,
      messages: [...st.messages, { id: uid(), role: "assistant", t: Date.now(), text: ack }],
    }));
  }

  function openThread(personId: string) {
    setLetters((s) => markRead(s, personId));
    setRight({ kind: "thread", personId });
  }

  if (!hydrated) return <div className="h-screen bg-background" />;

  const unread = unreadCount(letters);

  const rightPane = (() => {
    if (right.kind === "compose") {
      return (
        <LetterComposer
          personId={right.personId}
          store={letters}
          onCancel={() => setRight({ kind: "intro" })}
          onSend={(body) => handleSendLetter(right.personId, body)}
        />
      );
    }
    if (right.kind === "inbox") {
      return (
        <InboxPane
          store={letters}
          onClose={() => setRight({ kind: "intro" })}
          onOpenThread={openThread}
          onArchive={(id) => setLetters((s) => archiveThread(s, id))}
        />
      );
    }
    if (right.kind === "thread") {
      return (
        <LetterThreadView
          personId={right.personId}
          store={letters}
          onBack={() => setRight({ kind: "inbox" })}
          onReply={() => setRight({ kind: "compose", personId: right.personId })}
        />
      );
    }
    return (
      <IntroductionPane
        state={state}
        letters={letters}
        onAnotherAngle={() => {
          if (thinking) return;
          setThinking(true);
          window.setTimeout(() => { setState((s) => actAnotherAngle(s, lang)); setThinking(false); }, 450);
        }}
        onAnotherPerson={() => {
          if (thinking) return;
          setThinking(true);
          window.setTimeout(() => { setState((s) => actAnotherPerson(s, lang)); setThinking(false); }, 550);
        }}
        onFeedback={() => inputRef.current?.focus()}
        onWriteLetter={(id) => setRight({ kind: "compose", personId: id })}
        onOpenThread={openThread}
      />
    );
  })();

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header
        onReset={handleReset}
        canReset={state.messages.length > 1}
        unread={unread}
        threadsCount={Object.keys(letters.threads).length}
        onOpenInbox={() => setRight({ kind: "inbox" })}
      />

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-h-0">
        {/* LEFT — conversation */}
        <section className="flex flex-col min-h-0 border-r border-border">
          <UnderstandingPanel
            context={state.context}
            onRemovePositive={(s) => setState((st) => actRemovePositive(st, s))}
            onRemoveNegative={(s) => setState((st) => actRemoveNegative(st, s))}
          />
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto px-5 py-6">
              <ul className="space-y-4">
                {state.messages.map((m) => (
                  <li key={m.id}>
                    {m.role === "user" ? <UserBubble msg={m} /> : <AssistantBubble msg={m} />}
                  </li>
                ))}
                {thinking && <li><ThinkingRow /></li>}
              </ul>
            </div>
          </div>

          <div className="border-t border-border bg-background">
            <div className="max-w-xl mx-auto px-5 py-3">
              <Composer
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSend={() => submit()}
                disabled={thinking}
                placeholder={
                  state.phase === "clarifying"
                    ? t("chat.placeholder_first")
                    : t("chat.placeholder_followup")
                }
              />
              <p className="mt-2 text-[10.5px] text-muted-foreground text-center font-mono">
                {t("chat.disclaimer")}
              </p>
            </div>
          </div>
        </section>

        {/* RIGHT — intro / compose / inbox / thread */}
        <section className="hidden lg:block min-h-0">{rightPane}</section>
      </div>

      {/* Mobile */}
      <div className="lg:hidden border-t border-border max-h-[60vh] overflow-y-auto">
        {rightPane}
      </div>
    </div>
  );
}

function Header({
  onReset, canReset, unread, threadsCount, onOpenInbox,
}: { onReset: () => void; canReset: boolean; unread: number; threadsCount: number; onOpenInbox: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="w-full border-b border-border bg-background/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-foreground text-background grid place-items-center font-mono text-[11px] font-bold">K</div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13.5px] font-semibold tracking-tight text-foreground">{t("app.name")}</span>
            <span className="text-[10px] font-mono tracking-wide text-muted-foreground uppercase">{t("header.subtitle")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {threadsCount > 0 && (
            <button
              onClick={onOpenInbox}
              className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Mail className="w-3 h-3" />
              {t("header.letters")}
              {unread > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-foreground text-background text-[9.5px] font-mono">
                  {unread}
                </span>
              )}
            </button>
          )}
          {canReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t("header.reset")}
            </button>
          )}
          <LangSwitcher />
        </div>
      </div>
    </header>
  );
}

function UserBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] px-3.5 py-2 rounded-2xl bg-secondary text-foreground text-[14px] leading-relaxed whitespace-pre-wrap">
        {msg.text}
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: Message }) {
  return (
    <p className="text-[14px] text-foreground leading-relaxed">
      <span className="text-foreground/40 mr-1 font-mono">›</span>
      {msg.text}
    </p>
  );
}

function ThinkingRow() {
  const { t } = useTranslation();
  return (
    <p className="text-[13px] text-muted-foreground font-mono leading-relaxed">
      <span className="text-foreground/60 mr-1">›</span>
      <span className="inline-block w-[7px] h-[12px] align-[-1px] bg-foreground/60 mr-1.5 animate-pulse" />
      {t("chat.starting")}
    </p>
  );
}

interface ComposerProps {
  ref?: React.Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

function Composer({ ref, value, onChange, onSend, disabled, placeholder }: ComposerProps) {
  return (
    <div className="relative flex items-end gap-1.5 rounded-2xl border border-border bg-card px-3 py-2 focus-within:border-foreground/45 transition-colors">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent text-[14px] leading-[1.55] text-foreground placeholder:text-muted-foreground outline-none max-h-40 py-1"
      />
      <button
        onClick={onSend}
        disabled={disabled || value.trim().length === 0}
        className="shrink-0 w-7 h-7 rounded-full bg-foreground text-background grid place-items-center hover:opacity-90 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity"
        aria-label="Send"
      >
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
