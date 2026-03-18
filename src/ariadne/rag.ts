/**
 * Lightweight RAG module: chunk sources, embed with OpenAI, retrieve by cosine similarity.
 * No external vector store dependency — embeddings cached in memory per workspace.
 */

import { OpenAIEmbeddings } from "@langchain/openai";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Chunk {
  id: string;
  sourceRef: string;
  text: string;
}

interface VectorEntry {
  chunk: Chunk;
  embedding: number[];
}

// ── In-memory store keyed by workspaceId ─────────────────────────────────────

const stores = new Map<string, VectorEntry[]>();

let embeddings: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddings) {
    embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 256,
    });
  }
  return embeddings;
}

// ── Simple recursive text splitter ───────────────────────────────────────────

const SEPARATORS = ["\n## ", "\n### ", "\n\n", "\n", ". "];
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export function splitText(text: string): string[] {
  return splitRecursive(text, SEPARATORS);
}

function splitRecursive(text: string, seps: string[]): string[] {
  if (text.length <= CHUNK_SIZE) return text.trim() ? [text.trim()] : [];

  const sep = seps.find((s) => text.includes(s));
  if (!sep) {
    // No separator found — hard split
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const slice = text.slice(i, i + CHUNK_SIZE).trim();
      if (slice) chunks.push(slice);
    }
    return chunks;
  }

  const parts = text.split(sep);
  const chunks: string[] = [];
  let buffer = "";

  for (const part of parts) {
    const candidate = buffer ? buffer + sep + part : part;
    if (candidate.length <= CHUNK_SIZE) {
      buffer = candidate;
    } else {
      if (buffer.trim()) chunks.push(...splitRecursive(buffer.trim(), seps.slice(seps.indexOf(sep) + 1)));
      buffer = part;
    }
  }
  if (buffer.trim()) chunks.push(...splitRecursive(buffer.trim(), seps.slice(seps.indexOf(sep) + 1)));

  return chunks;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ingest source text: chunk → embed → store.
 * Skips if sourceRef already indexed for this workspace.
 */
export async function ingestSource(
  workspaceId: string,
  sourceRef: string,
  text: string,
): Promise<number> {
  const store = stores.get(workspaceId) ?? [];
  // Skip if already indexed
  if (store.some((e) => e.chunk.sourceRef === sourceRef)) return 0;

  const chunks = splitText(text);
  if (chunks.length === 0) return 0;

  const emb = getEmbeddings();
  const vectors = await emb.embedDocuments(chunks);

  const entries: VectorEntry[] = chunks.map((t, i) => ({
    chunk: {
      id: `${sourceRef}::${i}`,
      sourceRef,
      text: t,
    },
    embedding: vectors[i],
  }));

  store.push(...entries);
  stores.set(workspaceId, store);
  return entries.length;
}

/**
 * Remove all chunks for a given source from the store.
 */
export function removeSource(workspaceId: string, sourceRef: string): void {
  const store = stores.get(workspaceId);
  if (!store) return;
  stores.set(workspaceId, store.filter((e) => e.chunk.sourceRef !== sourceRef));
}

/**
 * Retrieve top-k chunks most similar to the query.
 */
export async function retrieve(
  workspaceId: string,
  query: string,
  topK = 5,
): Promise<Chunk[]> {
  const store = stores.get(workspaceId);
  if (!store || store.length === 0) return [];

  const emb = getEmbeddings();
  const queryVec = await emb.embedQuery(query);

  const scored = store.map((entry) => ({
    chunk: entry.chunk,
    score: cosineSimilarity(queryVec, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.chunk);
}

/**
 * Clear the entire store for a workspace.
 */
export function clearStore(workspaceId: string): void {
  stores.delete(workspaceId);
}

/**
 * Check if a source is already indexed.
 */
export function isIndexed(workspaceId: string, sourceRef: string): boolean {
  const store = stores.get(workspaceId);
  return store ? store.some((e) => e.chunk.sourceRef === sourceRef) : false;
}

/**
 * Get stats about the vector store for a workspace (for observability).
 */
export function getStoreStats(workspaceId: string): {
  chunkCount: number;
  sourceCount: number;
  sources: string[];
} {
  const store = stores.get(workspaceId);
  if (!store) return { chunkCount: 0, sourceCount: 0, sources: [] };
  const sources = [...new Set(store.map((e) => e.chunk.sourceRef))];
  return { chunkCount: store.length, sourceCount: sources.length, sources };
}

// ── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
