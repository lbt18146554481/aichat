import { CANDIDATES } from "./candidates";
import type { Candidate, UserProfile } from "./types";

export interface MatchResult {
  candidate: Candidate;
  score: number;
  reason: string;
  sharedInterests: string[];
  sharedTraits: string[];
}

export function computeMatches(profile: UserProfile): MatchResult[] {
  return CANDIDATES.map((c) => {
    const sharedInterests = c.interests.filter((i) => profile.interests.includes(i));
    const sharedTraits = c.personalityTags.filter((t) => profile.personalityTags.includes(t));

    const ageDiff = profile.age ? Math.abs(c.age - profile.age) : 8;
    const ageScore = Math.max(0, 20 - ageDiff * 2);
    const cityScore = c.city === profile.city ? 20 : 0;
    const interestScore = sharedInterests.length * 12;
    const traitScore = sharedTraits.length * 9;
    const base = 30;

    const score = Math.min(99, Math.round(base + ageScore + cityScore + interestScore + traitScore));

    const reasonParts: string[] = [];
    if (sharedInterests.length >= 2) {
      reasonParts.push(`你们都喜欢 ${sharedInterests.slice(0, 2).join("、")}`);
    } else if (sharedInterests.length === 1) {
      reasonParts.push(`同样热爱 ${sharedInterests[0]}`);
    }
    if (sharedTraits.length > 0) {
      reasonParts.push(`性格里都有 ${sharedTraits[0]} 的一面`);
    }
    if (cityScore > 0) {
      reasonParts.push(`同在${c.city}`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push(`TA 的${c.personalityTags[0]}也许会让你眼前一亮`);
    }

    return {
      candidate: c,
      score,
      reason: reasonParts.join("，") + "。",
      sharedInterests,
      sharedTraits,
    };
  }).sort((a, b) => b.score - a.score);
}
