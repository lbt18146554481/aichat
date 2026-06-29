import { useTranslation } from "react-i18next";
import { avatarUrl, getPersonById, localized } from "@/lib/people";
import type { Lang } from "@/lib/i18n";

interface Props {
  personId: string;
  saved?: boolean;
  dismissed?: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onFindSimilar: () => void;
}

export function CandidateDetail({
  personId,
  saved,
  dismissed,
  onSave,
  onDismiss,
  onFindSimilar,
}: Props) {
  const { t, i18n } = useTranslation();
  const person = getPersonById(personId);
  if (!person) return null;
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  const L = localized(person, lang);

  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <header className="flex items-start gap-4">
        <img
          src={avatarUrl(person.id)}
          alt=""
          className="w-16 h-16 rounded-full border border-border bg-secondary shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-mono">
            {L.occupation}
          </div>
          <h2 className="mt-0.5 text-[20px] font-semibold tracking-tight text-foreground truncate">
            {L.name}
          </h2>
          <p className="text-[12px] text-muted-foreground font-mono">
            {person.age} · {L.city}
          </p>
        </div>
      </header>

      <p className="mt-5 text-[14.5px] text-foreground leading-[1.75]">
        {L.portrait}
      </p>

      <div className="mt-5 pt-4 border-t border-border">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-mono">
          {t("profile.traits")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {person.signals.map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 rounded-md bg-secondary text-foreground text-[11px] font-mono border border-border"
            >
              {t(`signal.${s}`, { defaultValue: s })}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          disabled={saved || dismissed}
          onClick={onSave}
          className="px-3 py-2 rounded-md bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {saved ? `✓ ${t("card.save")}` : t("card.save")}
        </button>
        <button
          disabled={dismissed}
          onClick={onFindSimilar}
          className="px-3 py-2 rounded-md border border-border text-[13px] text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("card.find_similar")}
        </button>
        <button
          disabled={dismissed}
          onClick={onDismiss}
          className="px-3 py-2 rounded-md border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("card.dismiss")}
        </button>
      </div>
    </article>
  );
}
