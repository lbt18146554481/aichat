import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UserContext } from "@/lib/agent";

interface Props {
  context: UserContext;
  onRemovePositive: (s: string) => void;
  onRemoveNegative: (s: string) => void;
}

export function UnderstandingPanel({ context, onRemovePositive, onRemoveNegative }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const isEmpty =
    context.positive.length === 0 && context.negative.length === 0 && context.notes.length === 0;

  const summary = [
    ...context.positive.slice(0, 3).map((s) => t(`signal.${s}`, { defaultValue: s })),
  ].join(" · ");

  return (
    <div className="border-b border-border bg-secondary/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-left hover:bg-secondary/70 transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-[10.5px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
          {t("understanding.title")}
        </span>
        {!open && summary && (
          <span className="text-[12px] text-muted-foreground truncate ml-1">— {summary}</span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1">
          {isEmpty ? (
            <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-xl">
              {t("understanding.empty")}
            </p>
          ) : (
            <div className="space-y-3 max-w-xl">
              {context.positive.length > 0 && (
                <Group
                  label={t("understanding.wants")}
                  items={context.positive}
                  onRemove={onRemovePositive}
                  tone="positive"
                />
              )}
              {context.negative.length > 0 && (
                <Group
                  label={t("understanding.avoids")}
                  items={context.negative}
                  onRemove={onRemoveNegative}
                  tone="negative"
                />
              )}
              {context.notes.length > 0 && (
                <div>
                  <div className="text-[9.5px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-1.5">
                    {t("understanding.notes")}
                  </div>
                  <ul className="space-y-1">
                    {context.notes.map((n, i) => (
                      <li
                        key={i}
                        className="text-[12px] text-muted-foreground leading-relaxed border-l border-border pl-2 italic"
                      >
                        "{n}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  items,
  onRemove,
  tone,
}: {
  label: string;
  items: string[];
  onRemove: (s: string) => void;
  tone: "positive" | "negative";
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.16em] font-mono text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onRemove(s)}
            className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11.5px] font-mono transition-colors ${
              tone === "positive"
                ? "border-border bg-card text-foreground hover:border-foreground/50"
                : "border-border bg-card text-muted-foreground hover:border-foreground/50 line-through decoration-muted-foreground/60"
            }`}
            aria-label={`${t("understanding.remove")} ${s}`}
          >
            {t(`signal.${s}`, { defaultValue: s })}
            <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}
