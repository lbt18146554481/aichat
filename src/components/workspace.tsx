import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/lib/i18n";
import { Composer, AssistantBubble, UserBubble, ThinkingRow, ChipRow, type ChipOption } from "./chat-primitives";
import { WorkspaceHeader } from "./workspace-header";

export interface AgentMsg {
  id: string;
  role: "user" | "assistant";
  t: number;
  text: string;
  /** Optional chip choices attached to an assistant message. */
  chips?: ChipOption[];
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

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

  // Only the last assistant message's chips are actionable.
  let activeChips: ChipOption[] | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].chips && messages[i].chips!.length > 0) {
      activeChips = messages[i].chips;
      break;
    }
  }

  const chatPane = (
    <section className="flex flex-col min-h-0 lg:border-r lg:border-border h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain-y">
        <div className="max-w-xl mx-auto px-4 md:px-5 py-5 md:py-6">
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id}>
                {m.role === "user" ? <UserBubble text={m.text} /> : <AssistantBubble text={m.text} />}
              </li>
            ))}
            {thinking && <li><ThinkingRow /></li>}
          </ul>
        </div>
      </div>

      <div className="border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),8px)]">
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
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={thinking || composerDisabled}
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-full border border-border bg-card text-[11.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            disabled={thinking || composerDisabled}
            placeholder={placeholderOverride ?? t(placeholderKey)}
          />
          <p className="mt-2 text-[10.5px] text-muted-foreground text-center font-mono">
            {t("chat.disclaimer")}
          </p>
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
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
                {tab === "canvas" && canvasDot && !active && (
                  <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-foreground" />
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

