import { PEOPLE } from "./people";
import type { Person } from "./types";

// Map a signal to a short, prose "resonance" sentence template.
// Picks a person-specific line when possible, otherwise a generic one.
const RESONANCE_LINES: Record<string, (p: Person) => string> = {
  reading: (p) => `${p.name} keeps a list of bookstores in every city she passes through.`,
  music: (p) => `${p.name} writes music nobody asked for, and means every note.`,
  film: (p) => `${p.name} watches films the way most people read poems.`,
  art: (p) => `${p.name} makes things with her hands and doesn't post most of them.`,
  writing: (p) => `${p.name} keeps a notebook of overheard sentences.`,
  travel: (p) => `${p.name} measures cities by their bookstores and bakeries.`,
  outdoors: (p) => `${p.name} feels most herself a few miles from any road.`,
  cooking: (p) => `${p.name} thinks dinner is a small love letter you can eat.`,
  coffee: (p) => `${p.name} treats morning coffee like a small ceremony — but shares it quickly.`,
  quiet: (p) => `${p.name} doesn't fill silences.`,
  curious: (p) => `${p.name} asks the question you weren't quite ready to answer.`,
  funny: (p) => `${p.name} laughs at her own jokes before finishing them.`,
  kind: (p) => `${p.name} is patient with people, impatient with bad design.`,
  brave: (p) => `${p.name} is honest in a way that takes a minute to get used to.`,
  ambitious: (p) => `${p.name} cares about the world without making it feel heavy.`,
  city: (p) => `${p.name} walks home the long way, most nights.`,
  animals: (p) => `${p.name} talks to the dog like it understands. It mostly does.`,
  rain: (p) => `${p.name} keeps the window cracked when it rains.`,
  morning: (p) => `${p.name} wakes before the city does.`,
  night: (p) => `${p.name} lights candles at midnight, for no occasion.`,
};

export interface Resonance {
  person: Person;
  shared: string[];
  line: string;
}

export function findResonant(seekerSignals: string[]): Resonance[] {
  if (seekerSignals.length === 0) {
    // No signals: surface a quiet default selection.
    return PEOPLE.slice(0, 6).map((person) => ({
      person,
      shared: [],
      line: `${person.name} is the kind of person who notices things.`,
    }));
  }

  const scored = PEOPLE.map((person) => {
    const shared = person.signals.filter((s) => seekerSignals.includes(s));
    return { person, shared };
  })
    .filter((r) => r.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length);

  const chosen = scored.length >= 4 ? scored : [
    ...scored,
    ...PEOPLE
      .filter((p) => !scored.some((s) => s.person.id === p.id))
      .slice(0, 6 - scored.length)
      .map((p) => ({ person: p, shared: [] as string[] })),
  ];

  return chosen.slice(0, 8).map(({ person, shared }) => {
    const key = shared[0];
    const line = key && RESONANCE_LINES[key]
      ? RESONANCE_LINES[key](person)
      : `${person.name} feels close to the person you described.`;
    return { person, shared, line };
  });
}
