import { forwardRef } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Home-matched composer: rounded card, circular send. */
export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { value, onChange, onSend, disabled, placeholder },
  ref,
) {
  const { t } = useTranslation();

  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm-soft focus-within:border-foreground/30 transition-colors">
      <div className="px-4 md:px-5 pt-3 md:pt-4 pb-2">
        <textarea
          ref={(node) => {
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
            if (node) autosize(node);
          }}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          data-testid="agent-composer"
          placeholder={placeholder}
          disabled={disabled}
          className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed text-foreground placeholder:text-subtle-foreground disabled:opacity-50"
        />
      </div>
      <div className="px-2.5 md:px-3 pb-2.5 md:pb-3 pt-1 flex items-center justify-end">
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label={t("home.send")}
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 md:w-9 md:h-9 rounded-full bg-primary text-primary-foreground disabled:bg-input disabled:text-subtle-foreground disabled:cursor-not-allowed hover:bg-primary-hover transition-colors"
        >
          <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
});

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-8 rounded-2xl bg-secondary px-3.5 py-2.5 text-[14px] text-foreground leading-relaxed">
      {text}
    </div>
  );
}

export function AssistantBubble({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mr-8 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-[14px] text-foreground leading-relaxed whitespace-pre-wrap">
      {text}
    </div>
  );
}

export function ThinkingRow() {
  const { t } = useTranslation();
  return <p className="text-[13px] text-muted-foreground">{t("chat.starting")}</p>;
}

export interface ChipOption {
  id: string;
  label: string;
  action: unknown;
}

export function ChipRow({
  chips,
  disabled,
  onPick,
}: {
  chips: ChipOption[];
  disabled?: boolean;
  onPick: (action: unknown) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(c.action)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-40 transition-colors"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
