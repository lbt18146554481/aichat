import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Lang } from "@/lib/i18n";
import {
  Composer,
  AssistantBubble,
  UserBubble,
  ThinkingRow,
  type ChipOption,
  HandoffDivider,
} from "./chat-primitives";
import { AppChromeHeader } from "./app-chrome-header";
import { WorkspaceHeader } from "./workspace-header";
import { AgentAskCard, AgentAskResolved, type AgentAsk } from "./agent-ask";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useLargeScreen } from "@/hooks/use-large-screen";
import { useResizableSplit } from "@/hooks/use-resizable-split";

const PANEL_EASE = [0.16, 1, 0.3, 1] as const;
/** Right canvas enter/exit — keep slow enough to read as a deliberate panel open. */
const CANVAS_ENTER_MS = 0.55;
const CANVAS_EXIT_MS = 0.45;
const PANEL_CROSSFADE_MS = 0.45;

export interface AgentMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  kind?: "handoff";
  handoffAgent?: "matchmaker" | "sidebyside";
  /** Optional chip choices attached to an assistant message. */
  chips?: ChipOption[];
  /** Inline "补充 / 确认" card. Only the last unresolved ask is interactive. */
  ask?: AgentAsk;
  /** Human-readable summary shown after an ask is resolved (collapsed pill). */
  askResolvedLabel?: string;
}

interface Props {
  agentNameKey?: string;
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
  /** LLM-generated phrases above the composer; tap to prefill input (user sends manually). */
  suggestions?: string[];
  lang?: Lang;
}

export function Workspace({
  agentNameKey,
  agentSubtitleKey,
  placeholderKey,
  messages,
  thinking,
  onSend,
  onReset,
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
  const reduceMotion = useReducedMotion();
  const isLargeScreen = useLargeScreen();
  const split = useResizableSplit(hasCanvas && isLargeScreen);

  // Home-width column until a result opens the split layout.
  const chatMax = hasCanvas ? "max-w-xl" : "max-w-3xl";
  const chatVisible = !hasCanvas || mobileTab === "chat" || isLargeScreen;
  const canvasVisible = hasCanvas && (mobileTab === "canvas" || isLargeScreen);

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

  const quickReplies = useMemo(
    () => (suggestions ?? []).slice(0, 4).map((label) => ({ key: label, label })),
    [suggestions],
  );

  const chatPane = (
    <section className="flex flex-col min-h-0 h-full min-w-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain-y px-5 md:px-6">
        <div className={`w-full ${chatMax} mx-auto py-4 space-y-3 transition-[max-width] duration-500 ease-out`}>
          <ul className="space-y-3" data-testid="agent-messages">
            {messages.map((m, idx) => (
              <li key={m.id} data-testid={`agent-msg-${m.kind === "handoff" ? "handoff" : m.role}`}>
                {m.kind === "handoff" && m.handoffAgent ? (
                  <HandoffDivider agent={m.handoffAgent} />
                ) : m.role === "user" ? (
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
        <div className={`w-full ${chatMax} mx-auto transition-[max-width] duration-500 ease-out`}>
          {quickReplies.length > 0 && (
            <div className="mb-2 flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {quickReplies.map((q) => (
                <button
                  key={q.key}
                  data-testid="agent-suggestion"
                  type="button"
                  disabled={thinking || composerDisabled || !!activeAsk}
                  onClick={(e) => {
                    e.preventDefault();
                    if (thinking || composerDisabled || activeAsk) return;
                    setInput(q.label);
                    requestAnimationFrame(() => {
                      const el = inputRef.current;
                      if (!el) return;
                      el.focus();
                      const len = q.label.length;
                      el.setSelectionRange(len, len);
                    });
                  }}
                  className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {q.label}
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
      {agentNameKey && agentSubtitleKey ? (
        <WorkspaceHeader
          agentNameKey={agentNameKey}
          agentSubtitleKey={agentSubtitleKey}
          onReset={onReset}
        />
      ) : (
        <AppChromeHeader />
      )}

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
        ref={split.splitEnabled ? split.containerRef : undefined}
        className={[
          "flex-1 min-h-0 relative",
          hasCanvas && split.splitEnabled ? "flex flex-row" : "",
        ].join(" ")}
      >
        <motion.div
          className={[
            "flex flex-col min-h-0 h-full min-w-0",
            hasCanvas && !split.splitEnabled ? "max-lg:absolute max-lg:inset-0" : "",
          ].join(" ")}
          style={
            hasCanvas && split.splitEnabled
              ? { width: `${split.leftPercent}%`, flexShrink: 0 }
              : hasCanvas
                ? undefined
                : undefined
          }
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: chatVisible ? 1 : 0,
                  pointerEvents: chatVisible ? "auto" : "none",
                }
          }
          transition={{ duration: PANEL_CROSSFADE_MS, ease: PANEL_EASE }}
        >
          {chatPane}
        </motion.div>

        {hasCanvas && split.splitEnabled && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(split.leftPercent)}
            aria-valuemin={28}
            aria-valuemax={72}
            aria-label={t("workspace.resize_split")}
            onPointerDown={split.onSplitterPointerDown}
            className="group relative z-10 w-2 shrink-0 cursor-col-resize touch-none select-none"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
          </div>
        )}

        <AnimatePresence initial={false}>
          {hasCanvas && (
            <motion.section
              key="agent-canvas"
              data-testid="agent-canvas"
              className={[
                "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain-y bg-secondary/30",
                !split.splitEnabled ? "max-lg:absolute max-lg:inset-0" : "",
                mobileTab === "canvas"
                  ? "pb-[max(env(safe-area-inset-bottom),1rem)]"
                  : "",
              ].join(" ")}
              initial={reduceMotion ? false : { opacity: 0, x: 32 }}
              animate={
                reduceMotion
                  ? { opacity: 1, x: 0 }
                  : {
                      opacity: canvasVisible ? 1 : 0,
                      x: canvasVisible ? 0 : 8,
                      pointerEvents: canvasVisible ? "auto" : "none",
                    }
              }
              exit={
                reduceMotion
                  ? undefined
                  : {
                      opacity: 0,
                      x: 24,
                      transition: { duration: CANVAS_EXIT_MS, ease: [0.4, 0, 1, 1] },
                    }
              }
              transition={{ duration: CANVAS_ENTER_MS, ease: PANEL_EASE }}
            >
              {rightPane}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
