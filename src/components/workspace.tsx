import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Composer, AssistantBubble, UserBubble, ThinkingRow, ChipRow, type ChipOption } from "./chat-primitives";
import { WorkspaceHeader } from "./workspace-header";
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
  agentNameKey: string;
  agentSubtitleKey: string;
  placeholderKey: string;
  messages: AgentMsg[];
  thinking: boolean;
  onSend: (text: string) => void;
  onReset?: () => void;
  /** What to render in the right pane (intro / meet / resonance / empty). */
  rightPane: ReactNode;
  /** Disable composer (e.g. when waiting on you to interact with the right pane). */
  composerDisabled?: boolean;
  /** Override placeholder. */
  placeholderOverride?: string;
  /** Called when the user taps a chip inside an assistant message. */
  onChipClick?: (action: unknown) => void;
  /** Called when the user resolves an inline Agent ask. value=null means skip/cancel.
   *  `writeback` is only set for text asks with writebackToProfile: true. */
  onAskResolve?: (askId: string, value: string | null, writeback?: boolean) => void;
  /** Context-aware suggestion strings rendered above the composer; clicking one pre-fills the input. */
  suggestions?: string[];
  lang?: Lang; // kept for parity, not currently used internally
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
  composerDisabled,
  placeholderOverride,
  onChipClick,
  onAskResolve,
  
  suggestions,
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  // Mobile view toggle. On < lg we can't fit chat + canvas side by side, and
  // stacking a 55vh canvas below the chat leaves both surfaces cramped and
  // the composer floating with no keyboard-safe anchor. A segmented switch
  // gives each surface the full viewport, which matches how Kimi / Gemini
  // handle "chat vs. result" on phones.
  const [mobileTab, setMobileTab] = useState<"chat" | "canvas">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  const kbInset = useKeyboardInset();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  // When the software keyboard opens on iOS, keep the active ask card visible
  // above the composer (visualViewport shrinks; safe-area alone doesn't cover it).
  useEffect(() => {
    if (kbInset > 0 && askRef.current) {
      askRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (kbInset > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [kbInset]);

  // Autofocus is desktop-only — see Home for rationale.
  useEffect(() => {
    if (thinking || composerDisabled) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      inputRef.current?.focus();
    }
  }, [thinking, composerDisabled]);

  // When a new assistant message arrives on mobile while the user is on the
  // Chat tab, we leave them there. When the canvas content changes on the
  // Chat tab we surface a subtle indicator (dot) rather than force-switch.
  const [canvasDot, setCanvasDot] = useState(false);
  useEffect(() => {
    if (mobileTab === "chat") setCanvasDot(true);
  // rightPane changes when the canvas re-renders (new match, etc.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPane]);
  useEffect(() => { if (mobileTab === "canvas") setCanvasDot(false); }, [mobileTab]);


  function submit() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    onSend(text);
  }

  // Find the newest assistant message with an unresolved ask. When one is
  // active it takes precedence over chips (single call-to-action at a time).
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

  // When a new ask appears, (a) on mobile force-switch to the chat tab so
  // the user actually sees the required action, and (b) scroll the ask
  // card into view so it isn't hidden under the composer/keyboard.
  useEffect(() => {
    if (!activeAskId) return;
    setMobileTab("chat");
    // Wait for layout + tab swap.
    const id = window.setTimeout(() => {
      askRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [activeAskId]);


  // Only the last assistant message's chips are actionable — and only when
  // no ask is currently on screen.
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
    <section className="flex flex-col min-h-0 lg:border-r lg:border-border h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain-y">
        <div className="max-w-xl mx-auto px-4 md:px-5 py-5 md:py-6">
          <ul className="space-y-4">
            {messages.map((m, idx) => (
              <li key={m.id}>
                {m.role === "user" ? <UserBubble text={m.text} /> : <AssistantBubble text={m.text} />}
                {m.role === "assistant" && m.ask && idx === activeAskMsgIndex && (
                  <div ref={askRef}>
                    <AgentAskCard
                      ask={m.ask}
                      disabled={thinking || composerDisabled}
                      onResolve={(v, wb) => onAskResolve?.(m.ask!.id, v, wb)}
                      onOpenProfile={onOpenFullProfile}
                    />
                  </div>
                )}
                {m.role === "assistant" && m.askResolvedLabel && (
                  <AgentAskResolved label={m.askResolvedLabel} />
                )}
              </li>
            ))}
            {thinking && <li><ThinkingRow /></li>}
          </ul>
        </div>
      </div>


      <div
        className="border-t border-border bg-background transition-[padding] duration-150"
        style={{
          paddingBottom:
            kbInset > 0 ? `${kbInset + 8}px` : "max(env(safe-area-inset-bottom), 8px)",
        }}
      >
        <div className="max-w-xl mx-auto px-4 md:px-5 py-3">
          {activeChips && activeChips.length > 0 && (
            <div className="mb-2">
              <ChipRow
                chips={activeChips}
                disabled={thinking || composerDisabled}
                onPick={(a) => onChipClick?.(a)}
              />
            </div>
          )}
          {!activeChips && suggestions && suggestions.length > 0 && (
            <div className="mb-2 -mx-4 md:-mx-5 px-4 md:px-5 flex gap-1.5 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={thinking || composerDisabled}
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                  className="shrink-0 snap-start whitespace-nowrap px-3 py-1.5 rounded-full border border-border bg-card text-[12px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            placeholder={activeAsk ? t("ask.composer_locked") : (placeholderOverride ?? t(placeholderKey))}
          />
        </div>
      </div>
    </section>
  );

  return (
    <div className="h-dvh flex flex-col bg-background">
      <WorkspaceHeader
        agentNameKey={agentNameKey}
        agentSubtitleKey={agentSubtitleKey}
        onReset={onReset}
      />

      {/* Mobile segmented switch — visible only < lg. */}
      <div className="lg:hidden border-b border-border bg-background">
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

      {/* Desktop: side-by-side. Mobile: one pane at a time. */}
      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className={mobileTab === "chat" ? "flex flex-col min-h-0 h-full" : "hidden lg:flex lg:flex-col lg:min-h-0"}>
          {chatPane}
        </div>
        <section
          className={[
            "min-h-0 overflow-y-auto overscroll-contain-y bg-secondary/30",
            mobileTab === "canvas" ? "block pb-[max(env(safe-area-inset-bottom),8px)]" : "hidden lg:block",
          ].join(" ")}
        >
          {rightPane}
        </section>
      </div>
    </div>
  );
}

