/**
 * Shared dense+lexical mix weights (no network).
 * Used by embeddings.server and sync scoring paths.
 */

/** Embed 0.75 + lexical 0.25 when dense sim is available. */
export const EMBED_MIX_WEIGHT = 0.75;
export const LEXICAL_MIX_WEIGHT = 0.25;

/** Mix dense + lexical; if embed is null, return lexical only. */
export function mixEmbeddingLexical(embed: number | null, lexical: number): number {
  if (embed == null || Number.isNaN(embed)) return lexical;
  return EMBED_MIX_WEIGHT * embed + LEXICAL_MIX_WEIGHT * lexical;
}

/** Pure cosine over dense vectors — safe for client + server. */
export function vectorCosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length !== a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
