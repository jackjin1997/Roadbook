import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock OpenAI Embeddings ──────────────────────────────────────────────────

const mockEmbedDocuments = vi.fn();
const mockEmbedQuery = vi.fn();

vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: vi.fn(function (this: Record<string, unknown>) {
    this.embedDocuments = mockEmbedDocuments;
    this.embedQuery = mockEmbedQuery;
  }),
}));

import { splitText, ingestSource, retrieve, removeSource, clearStore, isIndexed, getStoreStats } from "../rag.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearStore("test-ws");
  // Default mock: return simple vectors
  mockEmbedDocuments.mockImplementation((texts: string[]) =>
    Promise.resolve(texts.map((_, i) => [i, 1, 0])),
  );
  mockEmbedQuery.mockResolvedValue([0, 1, 0]);
});

describe("splitText", () => {
  it("returns single chunk for short text", () => {
    const chunks = splitText("Hello world");
    expect(chunks).toEqual(["Hello world"]);
  });

  it("returns empty for empty text", () => {
    const chunks = splitText("");
    expect(chunks).toEqual([]);
  });

  it("returns empty for whitespace-only text", () => {
    const chunks = splitText("   \n\n  ");
    expect(chunks).toEqual([]);
  });

  it("splits long text into multiple chunks", () => {
    const text = Array(20).fill("This is a sentence that takes up some space in the document.").join("\n\n");
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(850); // chunk size + tolerance
    }
  });

  it("splits on heading separators when present", () => {
    const text = "# Title\n\n## Section One\nContent for section one that is reasonably long.\n\n## Section Two\nContent for section two.\n\n## Section Three\nMore content here.";
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All original content should be preserved
    const joined = chunks.join(" ");
    expect(joined).toContain("Section One");
    expect(joined).toContain("Section Two");
  });

  it("preserves content across chunks", () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} with some padding text to fill space.`);
    const text = sentences.join("\n\n");
    const chunks = splitText(text);
    // Every sentence should appear in at least one chunk
    for (const sentence of sentences) {
      expect(chunks.some((c) => c.includes(sentence))).toBe(true);
    }
  });

  it("handles text with mixed separators", () => {
    const text = "## Heading\nParagraph one.\n\nParagraph two.\n\n### Sub-heading\nMore text. Even more text. And yet more text.";
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("hard-splits when no separator matches", () => {
    // Long string with no separators
    const text = "x".repeat(2000);
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ── ingestSource ────────────────────────────────────────────────────────────

describe("ingestSource", () => {
  it("ingests text and returns chunk count", async () => {
    const count = await ingestSource("test-ws", "doc.txt", "Hello world");
    expect(count).toBe(1);
    expect(mockEmbedDocuments).toHaveBeenCalledOnce();
  });

  it("skips if source already indexed", async () => {
    await ingestSource("test-ws", "doc.txt", "Hello world");
    const count = await ingestSource("test-ws", "doc.txt", "Hello world again");
    expect(count).toBe(0);
    expect(mockEmbedDocuments).toHaveBeenCalledTimes(1); // only first call
  });

  it("returns 0 for empty text", async () => {
    const count = await ingestSource("test-ws", "empty.txt", "   ");
    expect(count).toBe(0);
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });
});

// ── isIndexed ───────────────────────────────────────────────────────────────

describe("isIndexed", () => {
  it("returns false for unknown workspace", () => {
    expect(isIndexed("unknown", "doc.txt")).toBe(false);
  });

  it("returns true after ingestion", async () => {
    await ingestSource("test-ws", "doc.txt", "content");
    expect(isIndexed("test-ws", "doc.txt")).toBe(true);
    expect(isIndexed("test-ws", "other.txt")).toBe(false);
  });
});

// ── removeSource ────────────────────────────────────────────────────────────

describe("removeSource", () => {
  it("removes indexed source", async () => {
    await ingestSource("test-ws", "doc.txt", "content");
    expect(isIndexed("test-ws", "doc.txt")).toBe(true);
    removeSource("test-ws", "doc.txt");
    expect(isIndexed("test-ws", "doc.txt")).toBe(false);
  });

  it("no-ops for unknown workspace", () => {
    expect(() => removeSource("unknown", "doc.txt")).not.toThrow();
  });
});

// ── retrieve ────────────────────────────────────────────────────────────────

describe("retrieve", () => {
  it("returns empty for empty store", async () => {
    const results = await retrieve("test-ws", "query");
    expect(results).toEqual([]);
  });

  it("retrieves top-k chunks by similarity", async () => {
    // Ingest two separate sources so we get 2 separate chunks for sure
    mockEmbedDocuments
      .mockResolvedValueOnce([[1, 0, 0]])   // chunk from source-a
      .mockResolvedValueOnce([[0, 1, 0]]);  // chunk from source-b — closest to query
    mockEmbedQuery.mockResolvedValue([0, 1, 0]);

    await ingestSource("test-ws", "source-a", "content about topic A");
    await ingestSource("test-ws", "source-b", "content about topic B");
    const results = await retrieve("test-ws", "query", 2);

    expect(results).toHaveLength(2);
    // Most similar chunk (source-b) should be first
    expect(results[0].sourceRef).toBe("source-b");
  });

  it("respects topK parameter", async () => {
    mockEmbedDocuments.mockResolvedValue([[1, 0], [0, 1], [0.5, 0.5]]);
    mockEmbedQuery.mockResolvedValue([1, 0]);

    await ingestSource("test-ws", "src", "a\n\nb\n\nc");
    const results = await retrieve("test-ws", "q", 1);
    expect(results).toHaveLength(1);
  });
});

// ── clearStore ──────────────────────────────────────────────────────────────

describe("clearStore", () => {
  it("clears all data for workspace", async () => {
    await ingestSource("test-ws", "doc.txt", "content");
    clearStore("test-ws");
    expect(isIndexed("test-ws", "doc.txt")).toBe(false);
    const results = await retrieve("test-ws", "query");
    expect(results).toEqual([]);
  });
});

// ── getStoreStats ──────────────────────────────────────────────────────────

describe("getStoreStats", () => {
  it("returns zeros for unknown workspace", () => {
    const stats = getStoreStats("unknown-ws");
    expect(stats).toEqual({ chunkCount: 0, sourceCount: 0, sources: [] });
  });

  it("returns correct stats after ingestion", async () => {
    await ingestSource("test-ws", "doc-a.txt", "Hello world");
    await ingestSource("test-ws", "doc-b.txt", "Another document");
    const stats = getStoreStats("test-ws");
    expect(stats.chunkCount).toBe(2);
    expect(stats.sourceCount).toBe(2);
    expect(stats.sources).toContain("doc-a.txt");
    expect(stats.sources).toContain("doc-b.txt");
  });

  it("reflects removal", async () => {
    await ingestSource("test-ws", "to-remove.txt", "content");
    removeSource("test-ws", "to-remove.txt");
    const stats = getStoreStats("test-ws");
    expect(stats.sources).not.toContain("to-remove.txt");
  });
});

// ── retrieve edge cases ────────────────────────────────────────────────────

describe("splitText edge cases", () => {
  it("filters out empty chunks after trim", () => {
    // Text with pure whitespace paragraphs
    const text = "Content A\n\n   \n\n   \n\nContent B";
    const chunks = splitText(text);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it("recursively splits when buffer exceeds CHUNK_SIZE with next separator", () => {
    // Create text with ## sections where each section > 800 chars
    const longParagraph = "Word ".repeat(200); // ~1000 chars
    const text = `## Section A\n${longParagraph}\n\n## Section B\n${longParagraph}\n\n## Section C\n${longParagraph}`;
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be within size limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(850);
    }
  });
});

describe("cosine similarity edge cases", () => {
  it("returns 0 for zero vectors", async () => {
    // Mock embeddings to return zero vectors
    mockEmbedDocuments.mockResolvedValue([[0, 0, 0]]);
    mockEmbedQuery.mockResolvedValue([0, 0, 0]);

    await ingestSource("test-ws", "zero-doc", "content");
    const results = await retrieve("test-ws", "query", 1);
    // Should not crash; zero vector gives cosine similarity = 0
    expect(results).toHaveLength(1);
  });
});

describe("retrieve edge cases", () => {
  it("handles empty query string", async () => {
    mockEmbedDocuments.mockResolvedValue([[1, 0, 0]]);
    mockEmbedQuery.mockResolvedValue([1, 0, 0]);
    await ingestSource("test-ws", "doc.txt", "some content");
    const results = await retrieve("test-ws", "", 5);
    // Should still return results (cosine similarity computed against empty-query embedding)
    expect(results).toHaveLength(1);
  });
});
