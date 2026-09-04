/**
 * Semantic text similarity for soft matching (client + server safe).
 * Uses facet alias expansion so 安静 / 恬静 / quiet map to the same trait.
 */

import {
  allFacetAliasPhrases,
  expandedFacetTerms,
  resolveFacetId,
} from "./person-facets";

const FACET_TERMS = expandedFacetTerms();
const ALIAS_PHRASES = allFacetAliasPhrases();

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Token bag with facet canonical keys + raw tokens. */
export function semanticTermBag(text: string): Map<string, number> {
  const bag = new Map<string, number>();
  const add = (term: string, w = 1) => {
    const t = term.trim();
    if (!t) return;
    bag.set(t, (bag.get(t) ?? 0) + w);
  };

  const raw = text.trim();
  if (!raw) return bag;

  // Multi-char aliases first (恬静, 安静, …).
  let rest = raw;
  for (const phrase of ALIAS_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(rest)) {
      const facet = resolveFacetId(phrase);
      if (facet) add(`${facet.kind}:${facet.id}`, 2);
      rest = rest.replace(re, " ");
    }
  }

  const tokens = rest
    .toLowerCase()
    .replace(/[,.，。;；!?！？、/\\|]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  for (const tok of tokens) {
    const facet = resolveFacetId(tok);
    if (facet) {
      add(`${facet.kind}:${facet.id}`, 2);
      const aliases = FACET_TERMS.get(`${facet.kind}:${facet.id}`) ?? [];
      for (const a of aliases) add(a, 0.5);
    } else if (tok.length > 1) {
      add(tok, 1);
    }
  }

  const cjk = raw.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const seg of cjk) {
    if (seg.length === 1) add(seg, 0.5);
    for (let i = 0; i < seg.length - 1; i++) {
      add(seg.slice(i, i + 2), 0.35);
    }
  }

  return bag;
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  const smaller = a.size < b.size ? a : b;
  const larger = a.size < b.size ? b : a;
  for (const [k, v] of smaller) {
    const w = larger.get(k);
    if (w) dot += v * w;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 0..1 similarity between preference text and person profileText. */
export function semanticSimilarity(query: string, document: string): number {
  const q = normalize(query);
  const d = normalize(document);
  if (!q || !d) return 0;
  return cosineSimilarity(semanticTermBag(q), semanticTermBag(d));
}
