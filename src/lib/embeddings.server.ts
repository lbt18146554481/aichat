/**
 * Optional embedding API (DeepSeek / OpenAI-compatible).
 * When unavailable, match-recall falls back to text-similarity.ts.
 */

import OpenAI from "openai";
import process from "node:process";
import { getServerConfig } from "./config.server";
import { log } from "./logger.server";
import { cosineSimilarity } from "./text-similarity";

let client: OpenAI | null = null;
const cache = new Map<string, number[]>();

function getEmbeddingClient(): OpenAI | null {
  const cfg = getServerConfig();
  if (!cfg.deepseekApiKey) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: cfg.deepseekApiKey,
      baseURL: cfg.deepseekBaseUrl,
    });
  }
  return client;
}

function embeddingModel(): string {
  return process.env.DEEPSEEK_EMBEDDING_MODEL ?? "text-embedding-3-small";
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
