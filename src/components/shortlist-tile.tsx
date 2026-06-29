import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  personId: string;
  selected?: boolean;
  saved?: boolean;
  dismissed?: boolean;
  onSelect: () => void;
  onTellMore: () => void;
  onDismiss: () => void;
}

export function ShortlistTile({
  personId,
  selected,
  saved,
  dismissed,
  onSelect,
  onTellMore,
  onDismiss,
}: Props) {
  const { i18n, t } = useTranslation();
  const person = getPersonById(personId);
  if (!person) return null;
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const L = localized(person, lang);

  return (
    <div
      className={`group relative rounded-lg border bg-card transition-colors p-3 flex flex-col gap-2.5 ${
        selected
          ? "border-foreground bg-secondary/60"
          : "border-border hover:border-foreground/30"
      } ${dismissed ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="text-left flex items-center gap-2.5 min-w-0"
      >
        <img
          src={avatarUrl(person.id)}
          alt=""
          className="w-9 h-9 rounded-full border border-border bg-secondary shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-foreground truncate">
            {L.name}
            {saved && <span className="ml-1 text-foreground/60">✓</span>}
          </div>
          <div className="text-[10.5px] text-muted-foreground font-mono truncate">
            {person.age} · {L.city}
          </div>
        </div>
      </button>
      <p className="text-[12px] text-foreground/75 leading-snug line-clamp-2">
        {L.portrait}
      </p>
      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!dismissed) onTellMore();
          }}
          disabled={dismissed}
          className="flex-1 text-center px-2 py-1 rounded-md text-[11px] font-medium border border-border bg-background text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("card.tell_more")}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!dismissed) onDismiss();
          }}
          disabled={dismissed}
          aria-label={t("card.dismiss")}
          className="px-1.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
