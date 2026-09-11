/**
 * Optional embedding API (OpenAI-compatible).
 * Default provider: DashScope Qwen (`qwen3.7-text-embedding-flash`).
 * When unavailable, match-recall falls back to text-similarity.ts.
 */

import OpenAI from "openai";
import { getServerConfig } from "./config.server";
import { log } from "./logger.server";
import { cosineSimilarity, semanticSimilarity } from "./text-similarity";
import {
  EMBED_MIX_WEIGHT,
  LEXICAL_MIX_WEIGHT,
  mixEmbeddingLexical,
} from "./similarity-mix";

export { EMBED_MIX_WEIGHT, LEXICAL_MIX_WEIGHT, mixEmbeddingLexical };

/** DashScope Qwen flash batch limit is 20 texts per request. */
const EMBED_BATCH_SIZE = 20;

let client: OpenAI | null = null;
let clientKey = "";
const cache = new Map<string, number[]>();

function getEmbeddingClient(): OpenAI | null {
  const cfg = getServerConfig();
  const apiKey = cfg.embeddingApiKey;
  if (!apiKey) return null;
  const baseURL = cfg.embeddingBaseUrl;
  const key = `${baseURL}::${apiKey}`;
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey, baseURL });
    clientKey = key;
  }
  return client;
}

function embeddingModel(): string {
  return getServerConfig().embeddingModel;
}

/** Embed text; returns null when API unavailable. */
export async function embedText(text: string): Promise<number[] | null> {
  const t = text.trim();
  if (!t) return null;
  const cached = cache.get(t);
  if (cached) return cached;

  const c = getEmbeddingClient();
  if (!c) return null;

  try {
    const res = await c.embeddings.create({
      model: embeddingModel(),
      input: t,
    });
    const vec = res.data[0]?.embedding;
    if (!vec?.length) return null;
    cache.set(t, vec);
    return vec;
  } catch (err) {
    log.warn("embeddings", "embed failed — using lexical fallback", { err });
    return null;
  }
}

/**
 * Batch embed; preserves order. Cached texts skip the API.
 * Chunks requests to EMBED_BATCH_SIZE (DashScope Qwen flash max 20).
 */
export async function embedMany(texts: string[]): Promise<Array<number[] | null>> {
  if (texts.length === 0) return [];
  const out: Array<number[] | null> = texts.map(() => null);
  const missing: { index: number; text: string }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]!.trim();
    if (!t) continue;
    const cached = cache.get(t);
    if (cached) {
      out[i] = cached;
    } else {
      missing.push({ index: i, text: t });
    }
  }

  if (missing.length === 0) return out;

  const c = getEmbeddingClient();
  if (!c) return out;

  const model = embeddingModel();
  try {
    for (let start = 0; start < missing.length; start += EMBED_BATCH_SIZE) {
      const chunk = missing.slice(start, start + EMBED_BATCH_SIZE);
      const res = await c.embeddings.create({
        model,
        input: chunk.map((m) => m.text),
      });
      for (let j = 0; j < chunk.length; j++) {
        const vec = res.data[j]?.embedding;
        if (!vec?.length) continue;
        const { index, text } = chunk[j]!;
        cache.set(text, vec);
        out[index] = vec;
      }
    }
  } catch (err) {
    log.warn("embeddings", "embedMany failed — lexical fallback", { err, n: missing.length });
  }

  return out;
}

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

/** Dense similarity when embeddings exist; otherwise null. */
export async function embeddingSimilarity(
  query: string,
  document: string,
): Promise<number | null> {
  const [qVec, dVec] = await Promise.all([embedText(query), embedText(document)]);
  if (!qVec || !dVec) return null;
  return vectorCosine(qVec, dVec);
}

/**
 * Prefer embedding cosine mixed with lexical; falls back to lexical alone.
 * Optional precomputed vectors avoid repeat API calls in batch recall.
 */
export async function similarityMix(
  query: string,
  document: string,
  precomputed?: { queryVec?: number[] | null; docVec?: number[] | null },
): Promise<number> {
  const lexical = semanticSimilarity(query, document);
  let embed: number | null = null;
  const qVec = precomputed?.queryVec ?? (await embedText(query));
  const dVec = precomputed?.docVec ?? (await embedText(document));
  if (qVec && dVec) embed = vectorCosine(qVec, dVec);
  return mixEmbeddingLexical(embed, lexical);
}

/** Map embedding vector to sparse bag for reuse of cosine helper (tests). */
export function denseToBag(vec: number[]): Map<string, number> {
  const bag = new Map<string, number>();
  vec.forEach((v, i) => {
    if (v !== 0) bag.set(`d${i}`, v);
  });
  return bag;
}

export function denseCosine(a: number[], b: number[]): number {
  return cosineSimilarity(denseToBag(a), denseToBag(b));
}
