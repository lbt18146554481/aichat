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
