import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CandidateCard } from "@/components/candidate-card";
import { IrisHeader } from "@/components/iris-header";
import {
  INITIAL_STATE,
  advance,
  loadState,
  react,
  resetState,
  saveState,
  uid,
  type IrisMessage,
  type IrisState,
  type MessageKind,
} from "@/lib/iris";

export function IrisChat() {
  const [state, setState] = useState<IrisState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.messages.length, thinking]);

  useEffect(() => {
    if (!thinking) inputRef.current?.focus();
  }, [thinking]);

  function streamReplies(replies: MessageKind[], base: IrisState) {
    if (replies.length === 0) return;
    setThinking(true);
    let cur = base;
    let delay = 600;
    replies.forEach((body, i) => {
      setTimeout(() => {
        cur = {
          ...cur,
          messages: [
            ...cur.messages,
            { id: uid(), role: "iris", t: Date.now(), body } as IrisMessage,
          ],
        };
        setState(cur);
        if (i === replies.length - 1) setThinking(false);
      }, delay);
      delay += body.kind === "introduce" ? 1000 : body.kind === "portrait" ? 1100 : 750;
    });
  }

  function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    const { next, replies } = advance(state, text);
    setState(next);
    streamReplies(replies, next);
  }

  function handleReact(personId: string, reaction: "like" | "pass") {
    if (thinking) return;
    const { next, replies } = react(state, personId, reaction);
    setState(next);
    streamReplies(replies, next);
  }

  function handleReset() {
    if (!confirm("重新开始一段和 Iris 的对话？")) return;
    setState(resetState());
    setInput("");
  }

  const awaitingPersonId =
    state.stage === "awaiting_feedback" ? state.pendingPersonId : null;

  return (
    <div className="h-screen flex flex-col bg-background">
      <IrisHeader onReset={state.messages.length > 1 ? handleReset : undefined} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-8 space-y-5">
          <AnimatePresence initial={false}>
            {state.messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={m.role === "you" ? "flex justify-end" : ""}
              >
                {m.role === "you" ? (
                  <div className="max-w-[82%] px-3.5 py-2 rounded-2xl bg-secondary text-foreground text-[14.5px] leading-relaxed whitespace-pre-wrap">
                    {m.body.kind === "say" ? m.body.text : ""}
                  </div>
                ) : (
                  <IrisBubble
                    body={m.body}
                    awaitingPersonId={awaitingPersonId}
                    thinking={thinking}
                    onReact={handleReact}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {thinking && (
            <div className="flex gap-1 py-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="max-w-2xl mx-auto px-5 py-3.5">
          <Composer
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={() => handleSend()}
            disabled={thinking}
            placeholder={
              state.stage === "meeting"
                ? "比如：一个安静但会突然让我笑出来的人……"
                : state.stage === "awaiting_feedback"
                  ? "告诉我你的感觉，或直接点上面的按钮"
                  : "继续告诉我"
            }
          />
          <p className="mt-2 text-[10.5px] text-muted-foreground text-center">
            Iris 还是一个 demo——你的话只留在这个浏览器里。
          </p>
        </div>
      </div>
    </div>
  );
}

function IrisBubble({
  body,
  awaitingPersonId,
  thinking,
  onReact,
}: {
  body: MessageKind;
  awaitingPersonId: string | null;
  thinking: boolean;
  onReact: (id: string, r: "like" | "pass") => void;
}) {
  if (body.kind === "say") {
    return (
      <div className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">
        {body.text}
      </div>
    );
  }
  if (body.kind === "portrait") {
    return (
      <div className="rounded-lg border border-border bg-secondary/50 p-4">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-1.5">
          我听到的画像
        </div>
        <p className="text-[14.5px] text-foreground leading-[1.7] whitespace-pre-wrap">
          {body.text}
        </p>
      </div>
    );
  }
  if (body.kind === "introduce") {
    const active = awaitingPersonId === body.personId && !thinking;
    return (
      <CandidateCard
        personId={body.personId}
        why={body.why}
        disabled={!active}
        onLike={() => onReact(body.personId, "like")}
        onPass={() => onReact(body.personId, "pass")}
      />
    );
  }
  if (body.kind === "exhausted") {
    return (
      <div className="text-[15px] text-foreground leading-relaxed">
        我手上目前就这些人了。要不要再描述得不一样一点——比如你怕的、你喜欢的、一个你最近想到的画面——我重新去看看？
      </div>
    );
  }
  return null;
}

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
        aria-label="发送"
        className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-foreground text-background grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
};
