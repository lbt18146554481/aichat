import { useTranslation } from "react-i18next";
import { localized } from "@/lib/people";
import { pickLocaleText, type AppLang } from "@/lib/lang";
import { getMomentPromptById, localizedMomentPrompt } from "@/lib/questions";
import { facetLabels } from "@/lib/person-facets";
import type { Person } from "@/lib/types";

interface Props {
  person: Person;
  lang: AppLang;
  className?: string;
}

/** Full public profile body — hard facts, traits, bio, moments, favorites. */
export function PersonPublicDetail({ person, lang, className }: Props) {
  const { t } = useTranslation();
  const loc = localized(person, lang);
  const traitLabels = facetLabels(person.traits ?? [], lang);
  const interestLabels = facetLabels(person.interests ?? [], lang);
  const softLabels = [...new Set([...traitLabels, ...interestLabels])];
  const favorites = person.favorites ?? [];
  const bio = pickLocaleText(lang, person.bio ?? person.portrait, person.bio_zh ?? person.portrait_zh);

  return (
    <section className={className ?? "mt-5 space-y-5 text-left"}>
      <div>
        <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
          {t("intro.hard_facts")}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <div>
            <dt className="text-muted-foreground">{t("profile.f.age")}</dt>
            <dd className="text-foreground">{person.age}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("profile.f.gender")}</dt>
            <dd className="text-foreground">{t(`profile.gender.${person.gender}`)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("profile.f.city")}</dt>
            <dd className="text-foreground">{loc.city}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("profile.f.occupation")}</dt>
            <dd className="text-foreground">{loc.occupation}</dd>
          </div>
          {person.education && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">{t("intro.education_label")}</dt>
              <dd className="text-foreground">
                {pickLocaleText(lang, person.education, person.education_zh)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {softLabels.length > 0 && (
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
            {t("intro.soft_traits")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {softLabels.map((label) => (
              <span
                key={label}
                className="inline-flex px-2.5 py-1 rounded-full border border-border bg-card text-[12px] text-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {bio?.trim() && (
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
            {t("intro.about_them")}
          </div>
          <p className="text-[13.5px] leading-relaxed text-foreground">{bio}</p>
        </div>
      )}

      {person.moments.length > 0 && (
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-3">
            {t("profile_public.answers")}
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
                    {pickLocaleText(lang, m.answer, m.answer_zh)}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {favorites.length > 0 && (
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
            {t("intro.favorites_label")}
          </div>
          <ul className="space-y-2.5">
            {favorites.map((w, i) => (
              <li key={i} className="text-[13.5px] leading-snug">
                <div className="text-foreground">
                  <span className="text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground mr-1.5">
                    {t(`profile.kind.${w.kind}`)}
                  </span>
                  <span className="font-medium">
                    {pickLocaleText(lang, w.title, w.title_zh)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
                  {pickLocaleText(lang, w.why, w.why_zh)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
