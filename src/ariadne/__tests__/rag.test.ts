import { describe, it, expect } from "vitest";
import { splitText } from "../rag.js";

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
