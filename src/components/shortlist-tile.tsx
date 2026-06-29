import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  personId: string;
  selected?: boolean;
  saved?: boolean;
  dismissed?: boolean;
  onSelect: () => void;
  onSave: () => void;
  onDismiss: () => void;
}

export function ShortlistTile({
  personId,
  selected,
  saved,
  dismissed,
  onSelect,
  onSave,
  onDismiss,
}: Props) {
  const { i18n, t } = useTranslation();
  const person = getPersonById(personId);
  if (!person) return null;
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const L = localized(person, lang);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group text-left rounded-lg border bg-card transition-colors p-3 flex flex-col gap-2.5 ${
        selected
          ? "border-foreground bg-secondary/60"
          : "border-border hover:border-foreground/30"
      } ${dismissed ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src={avatarUrl(person.id)}
          alt=""
          className="w-9 h-9 rounded-full border border-border bg-secondary shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-foreground truncate">
            {L.name}
          </div>
          <div className="text-[10.5px] text-muted-foreground font-mono truncate">
            {person.age} · {L.city}
          </div>
        </div>
        {saved && (
          <Check className="w-3.5 h-3.5 text-foreground shrink-0" aria-hidden />
        )}
      </div>
      <p className="text-[12px] text-foreground/75 leading-snug line-clamp-2">
        {L.portrait}
      </p>
      <div className="flex items-center gap-1.5 pt-0.5">
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            if (!saved && !dismissed) onSave();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              if (!saved && !dismissed) onSave();
            }
          }}
          aria-disabled={saved || dismissed}
          className={`flex-1 text-center px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            saved || dismissed
              ? "bg-secondary text-muted-foreground cursor-default"
              : "bg-foreground text-background hover:opacity-90 cursor-pointer"
          }`}
        >
          {saved ? `✓ ${t("card.save")}` : t("card.save")}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            if (!dismissed) onDismiss();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              if (!dismissed) onDismiss();
            }
          }}
          aria-label={t("card.dismiss")}
          className="px-1.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}
