import { ArrowUp, PanelRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "./app-header";
import { CanvasPane } from "./canvas-pane";
import { SavedDrawer } from "./saved-drawer";
import {
  EMPTY_STATE,
  actDismiss,
  actSave,
  actSelect,
  actUnsave,
  loadState,
  resetState,
  runQuery,
  saveState,
  userTurn,
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
  const [canvasOpen, setCanvasOpen] = useState(false);

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
    }, 700);
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

  const canvas = (
    <CanvasPane
      shortlistIds={state.shortlistIds}
      selectedId={state.selectedId}
      savedIds={state.savedIds}
      dismissedIds={state.dismissedIds}
      onSelect={(id) => setState((s) => actSelect(s, id))}
      onSave={(id) => setState((s) => actSave(s, id))}
      onDismiss={(id) => setState((s) => actDismiss(s, id))}
    />
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader
        savedCount={state.savedIds.length}
        onOpenSaved={() => setSavedOpen(true)}
        onReset={state.messages.length > 0 ? handleReset : undefined}
      />

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] min-h-0">
        {/* LEFT — Chat pane */}
        <section className="flex flex-col min-h-0 border-r border-border">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto px-5 py-7">
              {isEmpty ? (
                <EmptyState
                  examples={examples}
                  onPick={submit}
                  onOpenCanvas={() => setCanvasOpen(true)}
                />
              ) : (
                <ul className="space-y-4">
                  {state.messages.map((m) => (
                    <li key={m.id}>
                      {m.role === "user" ? (
                        <UserBubble text={m.text ?? ""} />
                      ) : (
                        <AssistantTurn message={m} />
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

          {/* Mobile shortlist toggle */}
          {!isEmpty && state.shortlistIds.length > 0 && (
            <button
              onClick={() => setCanvasOpen(true)}
              className="lg:hidden mx-5 mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-card text-[12.5px] text-foreground hover:bg-secondary transition-colors"
            >
              <span className="flex items-center gap-2 font-mono">
                <PanelRight className="w-3.5 h-3.5" />
                {t("canvas.title")}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {state.shortlistIds.length}
              </span>
            </button>
          )}

          <div className="border-t border-border bg-background">
            <div className="max-w-xl mx-auto px-5 py-3.5">
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
        </section>

        {/* RIGHT — Canvas (desktop) */}
        <section className="hidden lg:block min-h-0">{canvas}</section>
      </div>

      {/* RIGHT — Canvas (mobile sheet) */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity ${
          canvasOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!canvasOpen}
      >
        <div
          className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          onClick={() => setCanvasOpen(false)}
        />
        <aside
          className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col transition-transform ${
            canvasOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-11 px-4 flex items-center justify-between border-b border-border shrink-0">
            <span className="text-[11px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
              {t("canvas.title")}
            </span>
            <button
              onClick={() => setCanvasOpen(false)}
              aria-label={t("saved.close")}
              className="w-7 h-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">{canvas}</div>
        </aside>
      </div>

      <SavedDrawer
        open={savedOpen}
        savedIds={state.savedIds}
        onClose={() => setSavedOpen(false)}
        onRemove={(id) => setState((s) => actUnsave(s, id))}
        onSelect={(id) => {
          setState((s) => actSelect(s, id));
          setSavedOpen(false);
          setCanvasOpen(true);
        }}
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
  onOpenCanvas: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pt-10 sm:pt-16">
      <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
        {t("chat.empty_title")}
      </h1>
      <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">
        {t("chat.empty_hint")}
      </p>
      <div className="mt-7">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-mono mb-2">
          {t("chat.examples_label")}
        </div>
        <div className="flex flex-col gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => onPick(ex)}
              className="px-3 py-2 rounded-md border border-border bg-card text-[13px] text-foreground hover:border-foreground/40 hover:bg-secondary transition-colors text-left"
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
      <div className="max-w-[88%] px-3.5 py-2 rounded-2xl bg-secondary text-foreground text-[14px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({ message }: { message: Message }) {
  const parts = message.parts ?? [];
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => (
        <AssistantPartView key={i} part={part} />
      ))}
    </div>
  );
}

function AssistantPartView({ part }: { part: AssistantPart }) {
  const { t } = useTranslation();
  if (part.kind === "status") {
    const label =
      part.key === "results_one"
        ? t("agent.results_one")
        : part.key === "results_other"
          ? t("agent.results_other", { count: part.count ?? 0 })
          : t("agent.no_more");
    return (
      <p className="text-[13px] text-muted-foreground font-mono leading-relaxed">
        <span className="text-foreground/60 mr-1">›</span>
        {label}
      </p>
    );
  }
  if (part.kind === "ack") {
    return (
      <p className="text-[12px] text-muted-foreground font-mono">
        <span className="text-foreground/60 mr-1">›</span>
        {t(`agent.${part.key}`)}
      </p>
    );
  }
  return null;
}

function SearchingRow() {
  const { t } = useTranslation();
  return (
    <p className="text-[13px] text-muted-foreground font-mono leading-relaxed">
      <span className="text-foreground/60 mr-1">›</span>
      <span className="inline-block w-[7px] h-[12px] align-[-1px] bg-foreground/60 mr-1.5 animate-pulse" />
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
        className="flex-1 resize-none bg-transparent px-4 py-3 pr-12 text-[14.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none max-h-40"
      />
      <button
        onClick={onSend}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        className="absolute right-2 bottom-2 w-8 h-8 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
};
