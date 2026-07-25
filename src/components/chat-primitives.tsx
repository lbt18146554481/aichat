import { forwardRef } from "react";
import { ArrowUp } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { value, onChange, onSend, disabled, placeholder },
  ref,
) {
  return (
    <div className="relative">
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
        rows={2}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 pr-12 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/30 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="absolute right-2 bottom-2 w-8 h-8 grid place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-25 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
});

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-[14px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

export function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="text-[14px] leading-[1.7] text-foreground whitespace-pre-wrap">{text}</div>
  );
}

export interface ChipOption {
  id: string;
  label: string;
  /** Route-defined payload; Workspace treats it as opaque. */
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
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(c.action)}
          className="px-3 py-1.5 rounded-full border border-border bg-card text-[12.5px] text-foreground/85 hover:border-foreground/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function ThinkingRow() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
    </div>
  );
}
