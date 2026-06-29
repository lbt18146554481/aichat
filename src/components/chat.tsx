import { ArrowUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "./app-header";
import { ProfileCard } from "./profile-card";
import { SavedDrawer } from "./saved-drawer";
import {
  EMPTY_STATE,
  actDismiss,
  actSave,
  actUnsave,
  loadState,
  resetState,
  runQuery,
  saveState,
  userTurn,
  uid,
  type AgentState,
  type AssistantPart,
  type Message,
} from "@/lib/agent";

export function Chat() {
  const { t } = useTranslation();
  const [state, setState] = useState<AgentState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

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
  }, [state.messages.length, searching]);

  useEffect(() => {
    if (!searching) inputRef.current?.focus();
  }, [searching]);

  function submit(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || searching) return;
    setInput("");
    const afterUser = userTurn(state, text);
    setState(afterUser);
    setSearching(true);
    window.setTimeout(() => {
      const { state: afterQuery } = runQuery(afterUser);
      setState(afterQuery);
      setSearching(false);
    }, 750);
  }

  function handleSave(id: string) {
    setState((s) => actSave(s, id));
  }

  function handleDismiss(id: string) {
    setState((s) => actDismiss(s, id));
  }

  function handleReset() {
    if (state.messages.length > 0 && !confirm(t("header.reset") + "?")) return;
    setState(resetState());
    setInput("");
  }

  const isEmpty = state.messages.length === 0;
  const examples = useMemo(
    () => t("chat.examples", { returnObjects: true }) as string[],
    [t],
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        savedCount={state.savedIds.length}
        onOpenSaved={() => setSavedOpen(true)}
        onReset={state.messages.length > 0 ? handleReset : undefined}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-8">
          {isEmpty ? (
            <EmptyState examples={examples} onPick={submit} />
          ) : (
            <ul className="space-y-5">
              {state.messages.map((m) => (
                <li key={m.id}>
                  {m.role === "user" ? (
                    <UserBubble text={m.text ?? ""} />
                  ) : (
                    <AssistantTurn
                      message={m}
                      savedIds={state.savedIds}
                      dismissedIds={state.dismissedIds}
                      onSave={handleSave}
                      onDismiss={handleDismiss}
                    />
                  )}
                </li>
              ))}
              {searching && (
                <li>
                  <SearchingRow />
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="max-w-3xl mx-auto px-5 py-3.5">
          <Composer
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={() => submit()}
            disabled={searching}
            placeholder={
              isEmpty ? t("chat.placeholder_first") : t("chat.placeholder_followup")
            }
          />
          <p className="mt-2 text-[10.5px] text-muted-foreground text-center font-mono">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>

      <SavedDrawer
        open={savedOpen}
        savedIds={state.savedIds}
        onClose={() => setSavedOpen(false)}
        onRemove={(id) => setState((s) => actUnsave(s, id))}
      />
    </div>
  );
}

function EmptyState({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (text: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pt-16 sm:pt-24">
      <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-foreground leading-tight">
        {t("chat.empty_title")}
      </h1>
      <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed max-w-xl">
        {t("chat.empty_hint")}
      </p>
      <div className="mt-8">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-mono mb-2">
          {t("chat.examples_label")}
        </div>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => onPick(ex)}
              className="px-3 py-1.5 rounded-full border border-border bg-card text-[13px] text-foreground hover:border-foreground/40 hover:bg-secondary transition-colors text-left"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] px-3.5 py-2 rounded-2xl bg-secondary text-foreground text-[14.5px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({
  message,
  savedIds,
  dismissedIds,
  onSave,
  onDismiss,
}: {
  message: Message;
  savedIds: string[];
  dismissedIds: string[];
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const parts = message.parts ?? [];

  return (
    <div className="space-y-3">
      {parts.map((part, i) => (
        <AssistantPartView
          key={i}
          part={part}
          savedIds={savedIds}
          dismissedIds={dismissedIds}
          onSave={onSave}
          onDismiss={onDismiss}
          t={t}
        />
      ))}
    </div>
  );
}

function AssistantPartView({
  part,
  savedIds,
  dismissedIds,
  onSave,
  onDismiss,
  t,
}: {
  part: AssistantPart;
  savedIds: string[];
  dismissedIds: string[];
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  if (part.kind === "status") {
    const label =
      part.key === "results_one"
        ? t("agent.results_one")
        : part.key === "results_other"
          ? t("agent.results_other", { count: part.count ?? 0 })
          : t("agent.no_more");
    return (
      <p className="text-[13.5px] text-muted-foreground font-mono leading-relaxed">
        {label}
      </p>
    );
  }
  if (part.kind === "ack") {
    return (
      <p className="text-[12.5px] text-muted-foreground font-mono">
        {t(`agent.${part.key}`)}
      </p>
    );
  }
  if (part.kind === "cards") {
    return (
      <div className="grid gap-2.5">
        {part.personIds.map((id) => (
          <ProfileCard
            key={id}
            personId={id}
            saved={savedIds.includes(id)}
            dismissed={dismissedIds.includes(id)}
            onSave={() => onSave(id)}
            onDismiss={() => onDismiss(id)}
          />
        ))}
      </div>
    );
  }
  return null;
}

function SearchingRow() {
  const { t } = useTranslation();
  return (
    <p className="text-[13.5px] text-muted-foreground font-mono leading-relaxed">
      <span className="inline-block w-[8px] h-[14px] align-[-2px] bg-foreground/70 mr-1.5 animate-pulse" />
      {t("agent.searching")}
    </p>
  );
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
        aria-label="Send"
        className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-foreground text-background grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
};
