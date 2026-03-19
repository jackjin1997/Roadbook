import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillNode } from "../types.js";

// ── Mock LLM ──────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
const mockWithStructuredOutput = vi.fn(() => ({ invoke: mockInvoke }));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function () {
    return { invoke: mockInvoke, withStructuredOutput: mockWithStructuredOutput };
  }),
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(function () {
    return { invoke: mockInvoke, withStructuredOutput: mockWithStructuredOutput };
  }),
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn(function () {
    return { invoke: mockInvoke, withStructuredOutput: mockWithStructuredOutput };
  }),
}));

vi.mock("@langchain/tavily", () => ({
  TavilySearchAPIWrapper: vi.fn(function (this: Record<string, unknown>) {
    this.rawResults = vi.fn().mockResolvedValue({
      results: [
        { title: "Mock Tutorial", url: "https://example.com", content: "A great tutorial" },
      ],
    });
  }),
}));

const mockSkillTree: SkillNode[] = [
  {
    name: "React",
    category: "Framework",
    subSkills: ["Hooks", "Context"],
    relatedConcepts: ["Virtual DOM"],
    priority: "high",
    description: "UI library",
  },
  {
    name: "TypeScript",
    category: "Language",
    subSkills: ["Generics"],
    relatedConcepts: ["Type Safety"],
    priority: "medium",
    description: "Typed JS",
  },
];

const mockLLMResponse = {
  inputType: "concept" as const,
  title: "Test Roadbook",
  skillTree: mockSkillTree,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue(mockLLMResponse);
  process.env.TAVILY_API_KEY = "test-key";
});

describe("roadbookGraph", () => {
  it("executes nodes in order: parseInput → extractSkillTree → researchSkills → generateRoadbook", async () => {
    const { roadbookGraph } = await import("../graph.js");

    const result = await roadbookGraph.invoke({
      input: "Learn React",
      language: "English",
    });

    expect(result.skillTree).toHaveLength(2);
    expect(result.roadbookMarkdown).toContain("# Test Roadbook");
    expect(result.roadbookMarkdown).toContain("React");
    expect(Array.isArray(result.failedSkills)).toBe(true);
  });

  it("propagates state through all nodes", async () => {
    const { roadbookGraph } = await import("../graph.js");

    const result = await roadbookGraph.invoke({
      input: "TypeScript patterns",
      language: "Chinese",
    });

    // extractSkillTree was called with proper language
    const systemPrompt = mockInvoke.mock.calls[0][0][0].content;
    expect(systemPrompt).toContain("Chinese");
    expect(result.roadbookMarkdown.length).toBeGreaterThan(0);
  });

  it("passes onProgress through state for progress tracking", async () => {
    const { roadbookGraph } = await import("../graph.js");
    const onProgress = vi.fn();

    await roadbookGraph.invoke({
      input: "Test",
      language: "English",
      onProgress,
    });

    const stages = onProgress.mock.calls.map(([p]: any) => p.stage);
    expect(stages).toContain("parseInput");
    expect(stages).toContain("extractSkillTree");
    expect(stages).toContain("researchSkills");
    expect(stages).toContain("generateRoadbook");
  });
});

describe("journeyGraph", () => {
  it("executes extractAndMerge → researchSkills → generateRoadbook", async () => {
    const { journeyGraph } = await import("../graph.js");

    const result = await journeyGraph.invoke({
      snapshots: [
        { text: "React docs", language: "English" },
        { text: "TypeScript tutorial", language: "English" },
      ],
      language: "English",
    });

    expect(result.skillTree).toHaveLength(2); // merged tree
    expect(result.roadbookMarkdown).toContain("React");
    expect(result.roadbookMarkdown.length).toBeGreaterThan(0);
  });

  it("parallel-extracts from multiple snapshots", async () => {
    const { journeyGraph } = await import("../graph.js");

    await journeyGraph.invoke({
      snapshots: [
        { text: "Source A", language: "English" },
        { text: "Source B", language: "English" },
        { text: "Source C", language: "English" },
      ],
      language: "English",
    });

    // extractSkillTree called 3 times (once per snapshot)
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it("works without onProgress callback", async () => {
    const { journeyGraph } = await import("../graph.js");

    const result = await journeyGraph.invoke({
      snapshots: [{ text: "Test", language: "English" }],
      language: "English",
      // no onProgress
    });

    expect(result.roadbookMarkdown).toContain("React");
    expect(result.skillTree).toHaveLength(2);
  });

  it("reports progress for all journey stages", async () => {
    const { journeyGraph } = await import("../graph.js");
    const onProgress = vi.fn();

    await journeyGraph.invoke({
      snapshots: [{ text: "Test", language: "Chinese" }],
      language: "Chinese",
      onProgress,
    });

    const stages = onProgress.mock.calls.map(([p]: any) => p.stage);
    expect(stages).toContain("extractSkillTree");
    expect(stages).toContain("mergeSkillTrees");
    expect(stages).toContain("researchSkills");
    expect(stages).toContain("generateRoadbook");
  });
});
