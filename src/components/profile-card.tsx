import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  personId: string;
  saved?: boolean;
  dismissed?: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

export function ProfileCard({ personId, saved, dismissed, onSave, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const person = getPersonById(personId);
  if (!person) return null;

  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const L = localized(person, lang);
  const handled = saved || dismissed;

  return (
    <div
      className={`rounded-lg border bg-card transition-colors ${
        dismissed ? "opacity-50 border-border" : "border-border hover:border-foreground/30"
      }`}
    >
      <div className="p-4 flex items-start gap-3.5">
        <img
          src={avatarUrl(person.id)}
          alt=""
          className="w-11 h-11 rounded-full border border-border bg-secondary shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <div className="text-[15px] font-semibold text-foreground truncate">
              {L.name}
            </div>
            <div className="text-[11.5px] text-muted-foreground truncate font-mono">
              {person.age} · {L.city} · {L.occupation}
            </div>
          </div>
          <p className="mt-1.5 text-[13.5px] text-foreground/85 leading-relaxed">
            {L.portrait}
          </p>
        </div>
      </div>
      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        <Link
          to="/profile/$id"
          params={{ id: person.id }}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {t("card.view")} →
        </Link>
        <div className="flex gap-1.5">
          <button
            disabled={handled}
            onClick={onDismiss}
            className="px-2.5 py-1 rounded-md border border-border text-xs text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("card.dismiss")}
          </button>
          <button
            disabled={handled}
            onClick={onSave}
            className="px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {saved ? "✓ " : ""}{t("card.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
