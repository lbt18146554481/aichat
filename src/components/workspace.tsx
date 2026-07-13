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
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  useEffect(() => { if (!thinking && !composerDisabled) inputRef.current?.focus(); }, [thinking, composerDisabled]);

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


  return (
    <div className="h-screen flex flex-col bg-background">
      <WorkspaceHeader
        agentNameKey={agentNameKey}
        agentSubtitleKey={agentSubtitleKey}
        onReset={onReset}
      />

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] min-h-0">
        {/* LEFT — conversation */}
        <section className="flex flex-col min-h-0 border-r border-border">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto px-5 py-6">
              <ul className="space-y-4">
                {messages.map((m, i) => (
                  <li key={m.id}>
                    {m.role === "user" ? (
                      <UserBubble text={m.text} />
                    ) : (
                      <>
                        <AssistantBubble text={m.text} />
                        {m.chips && m.chips.length > 0 && (
                          <ChipRow
                            chips={m.chips}
                            disabled={i !== lastChipMsgIdx || thinking}
                            onPick={(a) => onChipClick?.(a)}
                          />
                        )}
                      </>
                    )}
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

        {/* RIGHT — canvas */}
        <section className="hidden lg:block min-h-0 overflow-y-auto bg-secondary/30">{rightPane}</section>
      </div>

      {/* Mobile right pane */}
      <div className="lg:hidden border-t border-border max-h-[55vh] overflow-y-auto bg-secondary/30">
        {rightPane}
      </div>
    </div>
  );
}
