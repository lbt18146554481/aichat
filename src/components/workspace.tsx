import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import {
  Composer,
  AssistantBubble,
  UserBubble,
  ThinkingRow,
  ChipRow,
  type ChipOption,
} from "./chat-primitives";
import { AppChromeHeader } from "./app-chrome-header";
import { AgentAskCard, AgentAskResolved, type AgentAsk } from "./agent-ask";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

export interface AgentMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  /** Optional chip choices attached to an assistant message. */
  chips?: ChipOption[];
  /** Inline "补充 / 确认" card. Only the last unresolved ask is interactive. */
  ask?: AgentAsk;
  /** Human-readable summary shown after an ask is resolved (collapsed pill). */
  askResolvedLabel?: string;
}

interface Props {
  /** @deprecated Kept for call-site compatibility; chrome no longer shows agent name. */
  agentNameKey?: string;
  /** @deprecated Kept for call-site compatibility. */
  agentSubtitleKey?: string;
  placeholderKey: string;
  messages: AgentMsg[];
  thinking: boolean;
  onSend: (text: string) => void;
  onReset?: () => void;
  /** What to render in the right pane (intro / meet / resonance / empty). */
  rightPane: ReactNode;
  /** When false, chat is full-width home-style; when true, split with result canvas. */
  hasCanvas?: boolean;
  /** Disable composer (e.g. when waiting on you to interact with the right pane). */
  composerDisabled?: boolean;
  /** Override placeholder. */
  placeholderOverride?: string;
  /** Called when the user taps a chip inside an assistant message. */
  onChipClick?: (action: unknown) => void;
  /** Called when the user resolves an inline Agent ask. value=null means cancel. */
  onAskResolve?: (askId: string, value: string | null) => void;
  /** Context-aware suggestion strings rendered above the composer; clicking one sends. */
  suggestions?: string[];
  lang?: Lang;
}

export function Workspace({
  placeholderKey,
  messages,
  thinking,
  onSend,
  rightPane,
  hasCanvas = true,
  composerDisabled,
  placeholderOverride,
  onChipClick,
  onAskResolve,
  suggestions,
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [mobileTab, setMobileTab] = useState<"chat" | "canvas">("chat");
  const [canvasDot, setCanvasDot] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  const kbInset = useKeyboardInset();
  const hadCanvasRef = useRef(false);

  // Home-width column until a result opens the split layout.
  const chatMax = hasCanvas ? "max-w-xl" : "max-w-3xl";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking, suggestions]);

  useEffect(() => {
    if (hasCanvas && !hadCanvasRef.current) {
      setMobileTab("canvas");
      setCanvasDot(false);
    }
    if (!hasCanvas) {
      setMobileTab("chat");
    }
    hadCanvasRef.current = hasCanvas;
  }, [hasCanvas]);

  useEffect(() => {
    if (kbInset > 0 && askRef.current) {
      askRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (kbInset > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [kbInset]);

  useEffect(() => {
    if (thinking || composerDisabled) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      inputRef.current?.focus();
    }
  }, [thinking, composerDisabled]);

  useEffect(() => {
    if (!hasCanvas) return;
    if (mobileTab === "chat") setCanvasDot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPane, hasCanvas]);
  useEffect(() => {
    if (mobileTab === "canvas") setCanvasDot(false);
  }, [mobileTab]);

  function submit() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    onSend(text);
  }

  let activeAskMsgIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.ask && !m.askResolvedLabel) {
      activeAskMsgIndex = i;
      break;
    }
  }
  const activeAsk = activeAskMsgIndex >= 0 ? messages[activeAskMsgIndex].ask : undefined;
  const activeAskId = activeAsk?.id;

  useEffect(() => {
    if (!activeAskId) return;
    setMobileTab("chat");
    const id = window.setTimeout(() => {
      askRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [activeAskId]);

  let activeChips: ChipOption[] | undefined;
  if (!activeAsk) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].chips && messages[i].chips!.length > 0) {
        activeChips = messages[i].chips;
        break;
      }
    }
  }

  const chatPane = (
    <section
      className={[
        "flex flex-col min-h-0 h-full",
        hasCanvas ? "lg:border-r lg:border-border" : "",
      ].join(" ")}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain-y px-5 md:px-6">
        <div className={`w-full ${chatMax} mx-auto py-4 space-y-3`}>
          <ul className="space-y-3" data-testid="agent-messages">
            {messages.map((m, idx) => (
              <li key={m.id} data-testid={`agent-msg-${m.role}`}>
                {m.role === "user" ? (
                  <UserBubble text={m.text} />
                ) : (
                  <AssistantBubble text={m.text} />
                )}
                {m.role === "assistant" && m.ask && idx === activeAskMsgIndex && (
                  <div ref={askRef}>
                    <AgentAskCard
                      ask={m.ask}
                      disabled={thinking || composerDisabled}
                      onResolve={(v) => onAskResolve?.(m.ask!.id, v)}
                    />
                  </div>
                )}
                {m.role === "assistant" && m.askResolvedLabel && (
                  <AgentAskResolved label={m.askResolvedLabel} />
                )}
              </li>
            ))}
            {thinking && (
              <li data-testid="agent-thinking">
                <ThinkingRow />
              </li>
            )}
          </ul>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-border/60 bg-background px-5 md:px-6 pt-3 transition-[padding] duration-150"
        style={{
          paddingBottom:
            kbInset > 0
              ? `${kbInset + 12}px`
              : "max(env(safe-area-inset-bottom), 12px)",
        }}
      >
        <div className={`w-full ${chatMax} mx-auto`}>
          {activeChips && activeChips.length > 0 && (
            <div className="mb-2">
              <ChipRow
                chips={activeChips}
                disabled={thinking || composerDisabled}
                onPick={(a) => onChipClick?.(a)}
              />
            </div>
          )}
          {suggestions && suggestions.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  data-testid="agent-suggestion"
                  type="button"
                  disabled={thinking || composerDisabled || !!activeAsk}
                  onClick={() => {
                    if (thinking || composerDisabled || activeAsk) return;
                    setInput("");
                    onSend(s);
                  }}
                  className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <Composer
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={submit}
            disabled={thinking || composerDisabled || !!activeAsk}
            placeholder={
              activeAsk ? t("ask.composer_locked") : (placeholderOverride ?? t(placeholderKey))
            }
          />
        </div>
      </div>
    </section>
  );

  return (
    <div className="h-dvh bg-background flex flex-col pb-tabbar overflow-hidden">
      <AppChromeHeader />

      {/* Mobile chat / result switch — only once a match canvas exists. */}
      {hasCanvas && (
        <div className="lg:hidden border-b border-border/60 bg-background shrink-0">
          <div className="max-w-md mx-auto grid grid-cols-2 px-4 py-2 gap-1">
            {(["chat", "canvas"] as const).map((tab) => {
              const active = mobileTab === tab;
              const label = tab === "chat" ? t("workspace.tab_chat") : t("workspace.tab_result");
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMobileTab(tab)}
                  aria-pressed={active}
                  className={[
                    "relative h-9 rounded-full text-[13px] transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                  {tab === "canvas" && canvasDot && !active && (
                    <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className={[
          "flex-1 min-h-0",
          hasCanvas ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" : "",
        ].join(" ")}
      >
        <div
          className={
            !hasCanvas || mobileTab === "chat"
              ? "flex flex-col min-h-0 h-full"
              : "hidden lg:flex lg:flex-col lg:min-h-0"
          }
        >
          {chatPane}
        </div>
        {hasCanvas && (
          <section
            className={[
              "min-h-0 overflow-y-auto overscroll-contain-y bg-secondary/30",
              mobileTab === "canvas"
                ? "block pb-[max(env(safe-area-inset-bottom),1rem)]"
                : "hidden lg:block",
            ].join(" ")}
            data-testid="agent-canvas"
          >
            {rightPane}
          </section>
        )}
      </div>
    </div>
  );
}
