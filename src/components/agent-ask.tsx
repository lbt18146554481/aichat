// AgentAsk — the Agent's inline "补充 / 确认" card.
//
// Renders inside the chat stream, attached to the last assistant message.
// One question at a time. Three kinds: text input, single-select, confirm.
// Presentation only — the caller owns state via `onResolve(value | null)`.
// value: string for text/select, "confirm" | "cancel" for confirm.

import { useState } from "react";
import { useTranslation } from "react-i18next";

export type AgentAsk =
  | {
      kind: "text";
      id: string;
      prompt?: string;
      placeholder?: string;
      initial?: string;
      confirmLabel: string;
      skipLabel?: string;
      /** When set, the skip button links to /profile via return-URL. */
      skipToProfile?: boolean;
    }
  | {
      kind: "select";
      id: string;
      prompt?: string;
      options: { value: string; label: string }[];
      skipLabel?: string;
    }
  | {
      kind: "confirm";
      id: string;
      prompt?: string;
      confirmLabel: string;
      cancelLabel: string;
      tone?: "default" | "danger";
    };

interface Props {
  ask: AgentAsk;
  disabled?: boolean;
  /** value === null when the user skipped / cancelled. */
  onResolve: (value: string | null) => void;
  /** For text asks with skipToProfile — the caller wires the return URL. */
  onOpenProfile?: () => void;
}

export function AgentAskCard({ ask, disabled, onResolve, onOpenProfile }: Props) {
  const { t } = useTranslation();

  if (ask.kind === "text") {
    return <TextAsk ask={ask} disabled={disabled} onResolve={onResolve} onOpenProfile={onOpenProfile} t={t} />;
  }
  if (ask.kind === "select") {
    return (
      <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
        {ask.prompt && (
          <p className="text-[13px] text-foreground/85 mb-2.5 leading-relaxed">{ask.prompt}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {ask.options.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onResolve(o.value)}
              className="min-h-11 sm:min-h-9 px-3.5 py-1.5 rounded-full border border-border bg-background text-[13px] text-foreground/85 hover:border-primary/50 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {o.label}
            </button>
          ))}
          {ask.skipLabel && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onResolve(null)}
              className="min-h-11 sm:min-h-9 px-3 py-1.5 rounded-full text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ask.skipLabel}
            </button>
          )}
        </div>
      </div>
    );
  }
  // confirm
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
      {ask.prompt && (
        <p className="text-[13px] text-foreground/85 mb-2.5 leading-relaxed">{ask.prompt}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve("confirm")}
          className={[
            "min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            ask.tone === "danger"
              ? "bg-destructive text-destructive-foreground hover:opacity-90"
              : "bg-primary text-primary-foreground hover:opacity-90",
          ].join(" ")}
        >
          {ask.confirmLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve(null)}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-foreground/80 border border-border hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {ask.cancelLabel}
        </button>
      </div>
    </div>
  );
}

function TextAsk({
  ask,
  disabled,
  onResolve,
  onOpenProfile,
  t,
}: {
  ask: Extract<AgentAsk, { kind: "text" }>;
  disabled?: boolean;
  onResolve: (v: string | null) => void;
  onOpenProfile?: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [value, setValue] = useState(ask.initial ?? "");
  const canSubmit = value.trim().length > 0 && !disabled;
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
      {ask.prompt && (
        <p className="text-[13px] text-foreground/85 mb-2.5 leading-relaxed">{ask.prompt}</p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onResolve(value.trim());
          }
        }}
        placeholder={ask.placeholder}
        disabled={disabled}
        autoFocus
        className="w-full h-11 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 disabled:opacity-50"
      />
      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onResolve(value.trim())}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {ask.confirmLabel}
        </button>
        {ask.skipToProfile && onOpenProfile ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onOpenProfile}
            className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-foreground/80 border border-border hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ask.skipLabel ?? t("ask.open_full_profile")}
          </button>
        ) : ask.skipLabel ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve(null)}
            className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ask.skipLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Collapsed pill shown after the user resolved an ask — feeds a sense
 *  of "the Agent noted it and moved on". Rendered inline in place of the
 *  original card. */
export function AgentAskResolved({ label }: { label: string }) {
  return (
    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[12px] text-muted-foreground">
      <span className="text-primary">✓</span>
      <span className="truncate max-w-[240px]">{label}</span>
    </div>
  );
}
