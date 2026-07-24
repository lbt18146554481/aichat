import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { avatarUrl, localized } from "@/lib/people";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import type { Lang } from "@/lib/i18n";
import type { Person } from "@/lib/types";

interface Props {
  person: Person | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublicProfileSheet({ person, open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage as Lang) ?? "en";
  if (!person) return null;
  const loc = localized(person, lang);
  const brief = person.personBrief
    ? (lang === "zh-CN" ? person.personBrief.zh : person.personBrief.en)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[13px] font-mono uppercase tracking-[0.18em] text-muted-foreground font-normal">
            {t("intro.public_profile_title")}
          </SheetTitle>
        </SheetHeader>

        {/* Identity */}
        <div className="mt-4 flex items-start gap-4">
          <img
            src={avatarUrl(person.id)}
            alt={loc.name}
            className="w-20 h-20 rounded-full border border-border bg-secondary shrink-0"
          />
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
                {loc.name}
              </h2>
              <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                {person.age}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {loc.occupation} · {loc.city}
            </p>
          </div>
        </div>

        {/* Portrait */}
        <p className="mt-5 text-[13.5px] text-foreground/85 leading-relaxed italic">
          {loc.portrait}
        </p>

        {/* About them (brief) */}
        {brief && (
          <div className="mt-6">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("intro.about_them")}
            </div>
            <p className="text-[13.5px] text-foreground leading-relaxed">{brief}</p>
          </div>
        )}

        {/* Signals */}
        {person.signals.length > 0 && (
          <div className="mt-6">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("intro.signals_label")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.signals.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center px-2 py-0.5 rounded-full border border-border bg-secondary text-[11px] text-foreground/85"
                >
                  {t(`signal.${s}`, { defaultValue: s })}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Moments */}
        {person.moments.length > 0 && (
          <div className="mt-6">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-3">
              {t("moment.about_them", { name: loc.name })}
            </div>
            <div className="space-y-4">
              {person.moments.map((m) => {
                const prompt = getMomentPromptById(m.promptId);
                return (
                  <article key={m.id} className="border-l-2 border-border pl-3">
                    {prompt && (
                      <div className="text-[11px] text-muted-foreground italic leading-snug mb-1">
                        {localizedMomentPrompt(prompt, lang)}
                      </div>
                    )}
                    <p className="text-[14px] leading-[1.65] text-foreground">
                      {lang === "zh-CN" ? m.answer_zh : m.answer}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* Favorites */}
        {person.favorites && person.favorites.length > 0 && (
          <div className="mt-6">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("intro.favorites_label")}
            </div>
            <ul className="space-y-2.5">
              {person.favorites.map((w, i) => (
                <li key={i} className="text-[13.5px] leading-snug">
                  <div className="text-foreground">
                    <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mr-1.5">
                      {t(`profile.kind.${w.kind}`)}
                    </span>
                    <span className="font-medium">
                      {lang === "zh-CN" && w.title_zh ? w.title_zh : w.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
                    {lang === "zh-CN" ? w.why_zh : w.why}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Activities */}
        {person.activities.length > 0 && (
          <div className="mt-6 mb-2">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
              {t("intro.what_they_do")}
            </div>
            <ul className="space-y-2">
              {person.activities.map((a, i) => (
                <li
                  key={i}
                  className="text-[12.5px] text-foreground/85 leading-snug flex flex-wrap gap-x-2"
                >
                  <span className="font-medium text-foreground">
                    {t(`activity.kind.${a.kind}`, { defaultValue: a.kind })}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span>{t(`activity.level.${a.level}`)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{lang === "zh-CN" ? a.area_zh : a.area}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
