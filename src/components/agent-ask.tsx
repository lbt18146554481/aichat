// AgentAsk — the Agent's inline "just-for-this" confirmation card.
//
// Renders inside the chat stream, attached to the last assistant message.
// This is a TEMPORARY, one-shot prompt. It never writes to Profile and is
// not remembered across actions — think Lovable's inline clarifications:
// the Agent needs one thing to keep going, the user answers, we move on.
//
// Presentation only — the caller owns state via `onResolve(value | null)`.
// value: string for text/select, "confirm" | "cancel" for confirm.
// null  = user pressed Cancel / dismissed.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

interface CommonFields {
  id: string;
  prompt?: string;
}

export type AgentAsk =
  | (CommonFields & {
      kind: "text";
      placeholder?: string;
      initial?: string;
      /** Multi-line textarea instead of single-line input. */
      multiline?: boolean;
      confirmLabel: string;
      /** Text of the secondary "cancel this ask" button. Defaults to i18n Cancel. */
      cancelLabel?: string;
    })
  | (CommonFields & {
      kind: "select";
      options: { value: string; label: string }[];
      cancelLabel?: string;
    })
  | (CommonFields & {
      kind: "confirm";
      confirmLabel: string;
      cancelLabel: string;
      tone?: "default" | "danger";
    });

interface Props {
  ask: AgentAsk;
  disabled?: boolean;
  /** value === null when the user cancelled the ask. */
  onResolve: (value: string | null) => void;
}

/** Small one-liner at the top of the card — signals "this is temporary,
 *  I'm only using it for the current action, and I'm not saving it anywhere". */
function EphemeralHint() {
  const { t } = useTranslation();
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-muted-foreground/80 mb-2">
      {t("ask.ephemeral_hint")}
    </div>
  );
}

export function AgentAskCard({ ask, disabled, onResolve }: Props) {
  const { t } = useTranslation();

  if (ask.kind === "text") {
    return <TextAsk ask={ask} disabled={disabled} onResolve={onResolve} t={t} />;
  }
  if (ask.kind === "select") {
    return (
      <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
        <EphemeralHint />
        {ask.prompt && (
          <p className="text-[13.5px] text-foreground leading-relaxed mb-2.5">
            {ask.prompt}
          </p>
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
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolve(null)}
            className="min-h-11 sm:min-h-9 px-3 py-1.5 rounded-full text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ask.cancelLabel ?? t("ask.cancel")}
          </button>
        </div>
      </div>
    );
  }
  // confirm
  return (
    <div
      className={[
        "mt-2 rounded-2xl border px-3.5 py-3",
        ask.tone === "danger" ? "border-destructive/25 bg-destructive/5" : "border-border bg-card",
      ].join(" ")}
    >
      <EphemeralHint />
      {ask.prompt && (
        <p className="text-[13.5px] text-foreground leading-relaxed mb-2.5">
          {ask.prompt}
        </p>
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
  t,
}: {
  ask: Extract<AgentAsk, { kind: "text" }>;
  disabled?: boolean;
  onResolve: (v: string | null) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const [value, setValue] = useState(ask.initial ?? "");
  const canSubmit = value.trim().length > 0 && !disabled;

  function submit() {
    if (!canSubmit) return;
    onResolve(value.trim());
  }

  return (
    <div className="mt-2 rounded-2xl border border-border bg-card px-3.5 py-3">
      <EphemeralHint />
      {ask.prompt && (
        <p className="text-[13.5px] text-foreground leading-relaxed mb-2.5">
          {ask.prompt}
        </p>
      )}
      {ask.multiline ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={ask.placeholder}
          disabled={disabled}
          autoFocus
          className="w-full min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 disabled:opacity-50 resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={ask.placeholder}
          disabled={disabled}
          autoFocus
          className="w-full h-11 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 disabled:opacity-50"
        />
      )}

      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {ask.confirmLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve(null)}
          className="min-h-11 sm:min-h-9 px-4 rounded-lg text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {ask.cancelLabel ?? t("ask.cancel")}
        </button>
      </div>
    </div>
  );
}

/** Collapsed pill shown after an ask has been resolved — reinforces the
 *  "used once, moved on" model. No edit affordance: the user simply
 *  cancels their current action and starts again if they want to change. */
export function AgentAskResolved({ label }: { label: string }) {
  return (
    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[12px] text-muted-foreground">
      <Check className="w-3 h-3 text-primary" />
      <span className="truncate max-w-[280px]">{label}</span>
    </div>
  );
}
