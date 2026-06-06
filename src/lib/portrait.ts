import type { Seeker } from "./types";

// Compose a prose portrait from the seeker's raw description and follow-up
// answers. Intentionally written by hand (no LLM) — concatenates with
// connective tissue to feel like a single paragraph.
export function composePortrait(seeker: Seeker): string {
  const raw = seeker.rawDescription.trim();
  const answers = seeker.followUps
    .map((f) => f.a.trim())
    .filter((a) => a.length > 0);

  const opening = raw
    ? `Someone, in your words: ${trimSentence(raw)}`
    : "Someone you haven't quite met yet.";

  const middles: string[] = [];
  if (answers[0]) {
    middles.push(`On a slow Sunday, ${lowerFirst(trimSentence(answers[0]))}`);
  }
  if (answers[1]) {
    middles.push(`The small thing that would make you smile — ${lowerFirst(trimSentence(answers[1]))}`);
  }
  if (answers[2]) {
    middles.push(`And you'd want them unafraid of ${lowerFirst(trimSentence(answers[2]))}`);
  }

  const closing = "Not a checklist. A shape of a person.";

  return [opening, ...middles, closing]
    .filter(Boolean)
    .join(" ");
}

function trimSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : t + ".";
}

function lowerFirst(s: string): string {
  if (!s) return s;
  return s[0].toLowerCase() + s.slice(1);
}
