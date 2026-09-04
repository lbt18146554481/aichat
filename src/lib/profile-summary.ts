import type { Profile } from "./profile-shape";
import { facetLabels } from "./person-facets";

export type ProfileSummaryLang = "en" | "zh-CN";

function momentSnippet(profile: Profile): string {
  const m = profile.moments?.find((x) => x.answer.trim());
  const text = m?.answer.trim() ?? "";
  if (!text) return "";
  return text.length > 72 ? `${text.slice(0, 70)}…` : text;
}

/** One-line summary of the logged-in user's profile (for LLM context). */
export function profileSummary(profile: Profile, lang: ProfileSummaryLang): string {
  const zh = lang === "zh-CN";
  const parts: string[] = [];

  const name = profile.name?.trim();
  const city = profile.city?.trim();
  const job = profile.occupation?.trim();
  if (name) parts.push(zh ? `叫${name}` : `name ${name}`);
  if (profile.age != null) parts.push(zh ? `${profile.age}岁` : `age ${profile.age}`);
  if (city) parts.push(zh ? `在${city}` : `in ${city}`);
  if (job) parts.push(zh ? `职业${job}` : `works as ${job}`);

  const traits = profile.traits?.length
    ? facetLabels(profile.traits, lang)
    : [];
  const interests = profile.interests?.length
    ? facetLabels(profile.interests, lang)
    : [];
  if (traits.length) {
    parts.push(zh ? `性格：${traits.join("、")}` : `traits: ${traits.join(", ")}`);
  }
  if (interests.length) {
    parts.push(zh ? `兴趣：${interests.join("、")}` : `interests: ${interests.join(", ")}`);
  }

  if (profile.mbti?.trim()) {
    parts.push(zh ? `MBTI ${profile.mbti.trim()}` : `MBTI ${profile.mbti.trim()}`);
  }

  const moment = momentSnippet(profile);
  if (moment) {
    parts.push(zh ? `近况：${moment}` : `moment: ${moment}`);
  }

  if (parts.length === 0) {
    return zh ? "（资料较少）" : "(sparse)";
  }
  return parts.join(zh ? "；" : "; ");
}

/** Labeled block for agent system prompts. */
export function profileSummaryForPrompt(profile: Profile, lang: ProfileSummaryLang): string {
  const zh = lang === "zh-CN";
  const summary = profileSummary(profile, lang);
  if (summary === "(sparse)" || summary === "（资料较少）") {
    return zh
      ? "用户资料：较少（姓名/城市等未填全）。不要盘问填资料，除非用户主动问。"
      : "User profile: sparse (name/city etc. not filled). Don't interrogate them to complete it unless they ask.";
  }
  return zh
    ? `用户资料（本人，不是想找的对象）：${summary}。可自然带入城市等上下文，不要重复盘问基本情况。`
    : `User profile (themselves — not who they want to meet): ${summary}. You may weave in city etc. naturally; don't re-interview basics.`;
}
