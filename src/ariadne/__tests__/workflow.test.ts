import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillNode } from "../types.js";

// Regular functions required for `new` operator compatibility in LangChain
const mockInvoke = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function () {
    return {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };
  }),
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(function () {
    return {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };
  }),
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn(function () {
    return {
      withStructuredOutput: vi.fn().mockReturnValue({ invoke: mockInvoke }),
    };
  }),
}));

vi.mock("@langchain/tavily", () => ({
  TavilySearchAPIWrapper: vi.fn(function () {
    return {
      rawResults: vi.fn().mockResolvedValue({
        results: [
          {
            title: "Mock Tutorial",
            url: "https://example.com/tutorial",
            content: "A great tutorial about this topic.",
          },
        ],
      }),
    };
  }),
}));

const mockSkillTree: SkillNode[] = [
  {
    name: "LangGraph.js",
    category: "框架",
    subSkills: ["StateGraph", "Annotation"],
    relatedConcepts: ["LangChain"],
    priority: "high",
    description: "工作流编排框架",
  },
];

const mockLLMResponse = {
  inputType: "concept" as const,
  title: "LangGraph.js 学习路书",
  skillTree: mockSkillTree,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue(mockLLMResponse);
  process.env.TAVILY_API_KEY = "test-tavily-key";
});

describe("generateRoadbook (full workflow integration)", () => {
  it("returns a non-empty markdown string", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    const result = await generateRoadbook("LangGraph.js");
    expect(typeof result.markdown).toBe("string");
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(Array.isArray(result.skillTree)).toBe(true);
  });

  it("markdown includes the LLM-provided title", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    const result = await generateRoadbook("LangGraph.js");
    expect(result.markdown).toContain("# LangGraph.js 学习路书");
  });

  it("markdown includes the skill name from extracted tree", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    const result = await generateRoadbook("LangGraph.js");
    expect(result.markdown).toContain("LangGraph.js");
  });

  it("markdown includes mermaid mindmap", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    const result = await generateRoadbook("LangGraph.js");
    expect(result.markdown).toContain("```mermaid");
    expect(result.markdown).toContain("mindmap");
  });

  it("markdown includes research resources from Tavily", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    const result = await generateRoadbook("LangGraph.js", "Chinese (Simplified)");
    expect(result.markdown).toContain("推荐资源");
    expect(result.markdown).toContain("[Mock Tutorial]");
  });

  it("calls LLM extractSkillTree with user input", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    await generateRoadbook("TypeScript generics");
    const userMsg = mockInvoke.mock.calls
      .flatMap((call) => call[0] as Array<{ role: string; content: string }>)
      .find((m) => m.role === "user");
    expect(userMsg?.content).toContain("TypeScript generics");
  });

  it("calls onProgress for each stage", async () => {
    const { generateRoadbook } = await import("../workflow.js");
    const onProgress = vi.fn();
    await generateRoadbook("test", "English", onProgress);
    const stages = onProgress.mock.calls.map(([p]: any) => p.stage);
    expect(stages).toContain("parseInput");
    expect(stages).toContain("extractSkillTree");
    expect(stages).toContain("researchSkills");
    expect(stages).toContain("generateRoadbook");
  });

  it("returns failedSkills when research partially fails", async () => {
    // Override Tavily mock to fail
    const tavilyModule = await import("@langchain/tavily");
    (tavilyModule.TavilySearchAPIWrapper as any).mockImplementation(function (this: any) {
      this.rawResults = vi.fn().mockRejectedValue(new Error("search failed"));
    });

    const { generateRoadbook } = await import("../workflow.js");
    const result = await generateRoadbook("test");
    expect(result.failedSkills).toBeDefined();
    expect(result.failedSkills!.length).toBeGreaterThan(0);
  });
});

describe("generateJourneyRoadbook (multi-source)", () => {
  it("returns markdown and merged skill tree", async () => {
    const { generateJourneyRoadbook } = await import("../workflow.js");
    const result = await generateJourneyRoadbook([
      { text: "React developer JD", language: "English" },
      { text: "Node.js backend JD", language: "English" },
    ]);
    expect(typeof result.markdown).toBe("string");
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(Array.isArray(result.skillTree)).toBe(true);
  });

  it("throws for empty snapshots", async () => {
    const { generateJourneyRoadbook } = await import("../workflow.js");
    await expect(generateJourneyRoadbook([])).rejects.toThrow("No snapshots");
  });

  it("calls onProgress for all stages", async () => {
    const { generateJourneyRoadbook } = await import("../workflow.js");
    const onProgress = vi.fn();
    await generateJourneyRoadbook(
      [{ text: "test source", language: "Chinese" }],
      onProgress,
    );
    const stages = onProgress.mock.calls.map(([p]: any) => p.stage);
    expect(stages).toContain("extractSkillTree");
    expect(stages).toContain("mergeSkillTrees");
    expect(stages).toContain("researchSkills");
    expect(stages).toContain("generateRoadbook");
  });

  it("produces valid markdown output", async () => {
    const { generateJourneyRoadbook } = await import("../workflow.js");
    const result = await generateJourneyRoadbook([
      { text: "content about AI", language: "English" },
    ]);
    expect(result.markdown).toContain("# ");
    expect(result.markdown).toContain("LangGraph.js");
  });
});
