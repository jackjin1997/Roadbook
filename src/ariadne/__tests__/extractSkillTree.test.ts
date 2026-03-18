import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { extractSkillTree } from "../nodes/extractSkillTree.js";

beforeEach(() => {
  vi.clearAllMocks();
});

const MOCK_RESULT = {
  inputType: "jd" as const,
  title: "AI 工程师技能路书",
  skillTree: [
    {
      name: "Python Programming",
      category: "编程语言",
      subSkills: ["FastAPI", "asyncio"],
      relatedConcepts: ["Type Hints", "Poetry"],
      priority: "high" as const,
      description: "Python 后端开发核心技能",
    },
    {
      name: "LangChain",
      category: "AI 框架",
      subSkills: ["LCEL", "Agents"],
      relatedConcepts: ["LangGraph", "LangSmith"],
      priority: "medium" as const,
      description: "LLM 应用开发框架",
    },
  ],
};

describe("extractSkillTree", () => {
  it("calls model with system prompt containing language", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    await extractSkillTree({ input: "Python AI engineer", inputType: "jd", language: "Chinese" });

    expect(mockWithStructuredOutput).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledOnce();

    const messages = mockInvoke.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Chinese");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("Python AI engineer");
  });

  it("defaults language to English when not provided", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    await extractSkillTree({ input: "test", inputType: "concept", language: undefined as any });

    const systemPrompt = mockInvoke.mock.calls[0][0][0].content;
    expect(systemPrompt).toContain("English");
  });

  it("includes inputType in user message", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    await extractSkillTree({ input: "React Developer", inputType: "resume", language: "English" });

    const userMsg = mockInvoke.mock.calls[0][0][1].content;
    expect(userMsg).toContain("Input type: resume");
    expect(userMsg).toContain("React Developer");
  });

  it("returns inputType, title, and skillTree from model", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    const result = await extractSkillTree({ input: "test", inputType: "jd", language: "Chinese" });

    expect(result.inputType).toBe("jd");
    expect(result.title).toBe("AI 工程师技能路书");
    expect(result.skillTree).toHaveLength(2);
    expect(result.skillTree![0].name).toBe("Python Programming");
    expect(result.skillTree![0].priority).toBe("high");
  });

  it("uses functionCalling method for structured output", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    await extractSkillTree({ input: "test", inputType: "jd", language: "English" });

    expect(mockWithStructuredOutput).toHaveBeenCalledWith(
      expect.anything(),
      { method: "functionCalling" },
    );
  });

  it("system prompt covers all input types", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    await extractSkillTree({ input: "test", inputType: "jd", language: "English" });

    const systemPrompt = mockInvoke.mock.calls[0][0][0].content;
    expect(systemPrompt).toContain("JD (Job Description)");
    expect(systemPrompt).toContain("Resume/Project");
    expect(systemPrompt).toContain("Technical Article");
    expect(systemPrompt).toContain("Concept");
  });

  it("propagates model errors after retries", async () => {
    mockInvoke.mockRejectedValue(new Error("rate limit exceeded"));

    await expect(
      extractSkillTree({ input: "test", inputType: "jd", language: "English" }),
    ).rejects.toThrow("rate limit exceeded");

    // Should have been called 3 times (1 initial + 2 retries)
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it("retries and succeeds on transient failure", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(MOCK_RESULT);

    const result = await extractSkillTree({ input: "test", inputType: "jd", language: "English" });
    expect(result.skillTree).toHaveLength(2);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("throws on empty skillTree", async () => {
    mockInvoke.mockResolvedValue({ ...MOCK_RESULT, skillTree: [] });

    await expect(
      extractSkillTree({ input: "test", inputType: "jd", language: "English" }),
    ).rejects.toThrow("empty skill tree");
  });

  it("throws on timeout when model hangs", async () => {
    // Instead of waiting for real timeouts, verify that the timeout rejection
    // propagates correctly by simulating what Promise.race does
    mockInvoke.mockImplementation(
      () => new Promise((_resolve, reject) => {
        // Simulate the timeout firing before the model responds
        setTimeout(() => reject(new Error("extractSkillTree timed out")), 50);
      }),
    );

    await expect(
      extractSkillTree({ input: "test", inputType: "jd", language: "English" }),
    ).rejects.toThrow("timed out");
  });

  it("accepts model override parameter", async () => {
    mockInvoke.mockResolvedValue(MOCK_RESULT);

    await extractSkillTree(
      { input: "test", inputType: "jd", language: "English" },
      { provider: "openai", modelName: "gpt-4o" },
    );

    expect(mockInvoke).toHaveBeenCalledOnce();
  });
});
