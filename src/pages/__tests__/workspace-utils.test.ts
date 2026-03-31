import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatDate,
  sanitizeFilename,
  downloadMarkdown,
  downloadObsidianVault,
  parseMarkdownSections,
} from "../workspace-utils";
import type { SkillNode } from "../../types";

// ── formatDate ──────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a timestamp to M/D HH:MM", () => {
    // 2026-03-15 09:05:00 UTC
    const ts = new Date(2026, 2, 15, 9, 5, 0).getTime();
    expect(formatDate(ts)).toBe("3/15 09:05");
  });

  it("pads hours and minutes with zeros", () => {
    const ts = new Date(2026, 0, 1, 0, 0, 0).getTime();
    expect(formatDate(ts)).toBe("1/1 00:00");
  });

  it("handles afternoon times", () => {
    const ts = new Date(2026, 11, 25, 23, 59, 0).getTime();
    expect(formatDate(ts)).toBe("12/25 23:59");
  });
});

// ── sanitizeFilename ────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("preserves alphanumeric, Chinese, underscore, dash", () => {
    expect(sanitizeFilename("hello-world_你好")).toBe("hello-world_你好");
  });

  it("replaces special chars with underscore", () => {
    expect(sanitizeFilename("my file (v2).doc")).toBe("my_file__v2__doc");
  });

  it("handles empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });
});

// ── downloadMarkdown ────────────────────────────────────────────────────────

describe("downloadMarkdown", () => {
  let mockClick: ReturnType<typeof vi.fn>;
  let createdUrl: string;

  beforeEach(() => {
    mockClick = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_v: string) { /* noop */ },
      set download(v: string) { (this as any)._download = v; },
      get download() { return (this as any)._download; },
      click: mockClick,
    } as any);
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      createdUrl = "blob:mock";
      return createdUrl;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("creates a blob and triggers download with sanitized filename", () => {
    downloadMarkdown("# Hello", "My Roadbook!");
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(mockClick).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});

// ── downloadObsidianVault ───────────────────────────────────────────────────

describe("downloadObsidianVault", () => {
  let mockClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClick = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_v: string) { /* noop */ },
      set download(v: string) { (this as any)._download = v; },
      get download() { return (this as any)._download; },
      click: mockClick,
    } as any);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:vault");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("generates a zip and triggers download", async () => {
    const skillTree: SkillNode[] = [
      {
        name: "TypeScript",
        category: "Language",
        subSkills: ["Generics", "Decorators"],
        relatedConcepts: ["JavaScript"],
        priority: "high",
        description: "A typed superset of JavaScript",
      },
      {
        name: "JavaScript",
        category: "Language",
        subSkills: [],
        relatedConcepts: ["TypeScript"],
        priority: "medium",
        description: "",
      },
    ];

    await downloadObsidianVault("My Journey", "# Journey content", skillTree);

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(mockClick).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:vault");
  });

  it("works without skillTree", async () => {
    await downloadObsidianVault("Empty", "# No skills");
    expect(mockClick).toHaveBeenCalled();
  });
});

// ── parseMarkdownSections ───────────────────────────────────────────────────

describe("parseMarkdownSections", () => {
  it("parses h2 sections", () => {
    const md = `## Introduction
Some intro text

## Getting Started
Step 1
Step 2`;
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Introduction");
    expect(sections[0].level).toBe(2);
    expect(sections[0].content).toContain("Some intro text");
    expect(sections[1].heading).toBe("Getting Started");
    expect(sections[1].level).toBe(2);
  });

  it("parses h3 sections as level 3", () => {
    const md = `## Parent
### Child
Child content`;
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Parent");
    expect(sections[0].level).toBe(2);
    expect(sections[1].heading).toBe("Child");
    expect(sections[1].level).toBe(3);
  });

  it("ignores content before first heading", () => {
    const md = `This is a preamble
## First Section
Content here`;
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("First Section");
  });

  it("returns empty array for no headings", () => {
    expect(parseMarkdownSections("Just some text")).toEqual([]);
  });

  it("handles empty markdown", () => {
    expect(parseMarkdownSections("")).toEqual([]);
  });

  it("strips heading markers from heading text", () => {
    const md = `## My Heading`;
    const sections = parseMarkdownSections(md);
    expect(sections[0].heading).toBe("My Heading");
  });

  it("uses heading as id", () => {
    const md = `## Unique Section`;
    const sections = parseMarkdownSections(md);
    expect(sections[0].id).toBe("Unique Section");
  });
});
