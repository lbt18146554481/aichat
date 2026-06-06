import type { Seeker } from "./types";

export interface FollowUp {
  q: string;
}

export const FOLLOW_UPS: FollowUp[] = [
  { q: "What would a slow Sunday with them feel like?" },
  { q: "What's a small thing about them that would make you smile, even on a hard day?" },
  { q: "What's something you'd want them to be unafraid of?" },
];

export const OPENING = {
  intro:
    "Hi — I'm Bloom 🌷  Tell me about the person you hope to meet. No checklist, no specs — just the shape of them, in your own words.",
  placeholder:
    "Someone who notices small things. Quietly funny. Loves walking nowhere in particular...",
};

export const CLOSING =
  "Lovely. Give me a moment — I'm gathering your words into a portrait.";

const SIGNAL_VOCAB: Record<string, string[]> = {
  reading: ["read", "books", "novel", "library", "bookstore"],
  music: ["music", "vinyl", "concert", "song", "guitar", "piano"],
  film: ["film", "movie", "cinema", "director"],
  art: ["art", "museum", "gallery", "painting", "draw"],
  writing: ["write", "writing", "poem", "journal"],
  travel: ["travel", "trip", "abroad", "wander", "road"],
  outdoors: ["hike", "mountain", "trail", "forest", "ocean", "sea", "river"],
  cooking: ["cook", "kitchen", "food", "bake", "dinner"],
  coffee: ["coffee", "espresso", "cafe", "café"],
  quiet: ["quiet", "silence", "calm", "still", "soft"],
  curious: ["curious", "question", "wonder", "learn"],
  funny: ["funny", "humor", "humour", "laugh", "joke"],
  kind: ["kind", "warm", "gentle", "care", "caring"],
  brave: ["brave", "honest", "open", "vulnerable"],
  ambitious: ["ambitious", "driven", "work", "career"],
  city: ["city", "subway", "neighborhood", "street"],
  animals: ["dog", "cat", "animal"],
  rain: ["rain", "rainy", "storm"],
  morning: ["morning", "sunrise", "early"],
  night: ["night", "midnight", "late"],
};

export function extractSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [signal, keywords] of Object.entries(SIGNAL_VOCAB)) {
    if (keywords.some((k) => lower.includes(k))) found.add(signal);
  }
  return Array.from(found);
}

export function collectSignals(seeker: Seeker): string[] {
  const all = [
    seeker.rawDescription,
    ...seeker.followUps.map((f) => f.a),
  ].join(" ");
  return extractSignals(all);
}
