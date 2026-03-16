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

import { splitText, ingestSource, retrieve, removeSource, clearStore, isIndexed } from "../rag.js";

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
