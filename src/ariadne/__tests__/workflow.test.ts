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
});
