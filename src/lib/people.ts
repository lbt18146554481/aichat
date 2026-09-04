import { pickLocaleText } from "./lang";
import { getPersonById, getPeoplePool, setPeopleCache, clearPeopleCache } from "./people-client";
export { getPersonById, getPeoplePool, setPeopleCache, clearPeopleCache };
export { isAiSeedPerson, isSeedPersonId, SEED_PERSON_IDS } from "./people-seed.ids";
export type { SeedPersonId } from "./people-seed.ids";
export type { Person } from "./types";

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=F4F4F5,E5E5E5,EFEFEF,FAFAFA&radius=50`;
}

type Lang = "en" | "zh-CN";

export function localized(person: import("./types").Person, lang: Lang) {
  return {
    name: pickLocaleText(lang, person.name, person.name_zh),
    city: pickLocaleText(lang, person.city, person.city_zh),
    occupation: pickLocaleText(lang, person.occupation, person.occupation_zh),
    portrait: pickLocaleText(lang, person.portrait, person.portrait_zh),
    bio: pickLocaleText(lang, person.bio ?? "", person.bio_zh ?? ""),
  };
}

export function localizedAngle(angleText: string, angleTextZh: string, lang: Lang) {
  return pickLocaleText(lang, angleText, angleTextZh);
}
