import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Profile } from "@/lib/profile-shape";
import { isHidden } from "@/lib/profile-shape";
import type { OwnerSnapshot } from "@/lib/owner-snapshot";
import { resolveOwnerSnapshot } from "@/lib/owner-snapshot";
import type { Intent } from "@/lib/intents";
import type { AppLang } from "@/lib/lang";
import { pickLocaleText, normalizeLang } from "@/lib/lang";

export interface WishPublisherFacts {
  avatar?: string;
  name?: string;
  metaParts: string[];
}

function genderLabel(t: TFunction, gender: string): string | null {
  if (!gender || gender === "prefer_not_to_say") return null;
  return t(`profile.gender.${gender}`);
}

/** Visible publisher facts from the live profile (respects hidden fields). */
export function wishPublisherFactsFromProfile(
  profile: Profile,
  t: TFunction,
): WishPublisherFacts | null {
  const avatar =
    profile.avatar?.trim() && !isHidden(profile, "avatar") ? profile.avatar.trim() : undefined;
  const name = profile.name?.trim() && !isHidden(profile, "name") ? profile.name.trim() : undefined;

  const metaParts: string[] = [];
  if (profile.age != null && !isHidden(profile, "age")) {
    metaParts.push(String(profile.age));
  }
  const gender = !isHidden(profile, "gender") ? genderLabel(t, profile.gender) : null;
  if (gender) metaParts.push(gender);
  if (profile.occupation?.trim()) metaParts.push(profile.occupation.trim());
  if (profile.city?.trim()) metaParts.push(profile.city.trim());

  if (!avatar && !name && metaParts.length === 0) return null;
  return { avatar, name, metaParts };
}

/** Publisher facts stored on a published intent (what others see). */
export function wishPublisherFactsFromIntent(
  intent: Intent,
  lang: AppLang,
  t: TFunction,
): WishPublisherFacts | null {
  const snap = resolveOwnerSnapshot(intent);
  const avatar = snap.avatar?.trim() || undefined;
  const name =
    pickLocaleText(lang, snap.name, snap.name_zh)?.trim() ||
    undefined;
  const metaParts: string[] = [];
  if (snap.age != null) metaParts.push(String(snap.age));
  const gender = genderLabel(t, snap.gender);
  if (gender) metaParts.push(gender);
  if (snap.occupation?.trim()) metaParts.push(snap.occupation.trim());
  const city = pickLocaleText(lang, snap.city, snap.city_zh)?.trim();
  if (city) metaParts.push(city);

  if (!avatar && !name && metaParts.length === 0) return null;
  return { avatar, name, metaParts };
}

export function WishPublisherHeader({
  profile,
  intent,
  lang,
  className,
}: {
  profile?: Profile;
  intent?: Intent;
  lang?: AppLang;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const resolvedLang = lang ?? normalizeLang(i18n.resolvedLanguage);
  const facts = profile
    ? wishPublisherFactsFromProfile(profile, t)
    : intent
      ? wishPublisherFactsFromIntent(intent, resolvedLang, t)
      : null;

  if (!facts) return null;

  return (
    <div
      className={[
        "w-full flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5",
        className ?? "",
      ].join(" ")}
    >
      {facts.avatar ? (
        <img
          src={facts.avatar}
          alt=""
          className="w-11 h-11 rounded-full border border-border shrink-0 object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-foreground">
          {t("intent.publisher_label")}
        </div>
        {facts.name ? (
          <div className="text-[15px] font-medium text-foreground truncate">{facts.name}</div>
        ) : null}
        {facts.metaParts.length > 0 ? (
          <div className="text-[12px] text-muted-foreground leading-snug mt-0.5">
            {facts.metaParts.join(" · ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
