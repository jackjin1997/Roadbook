import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock LLM ──────────────────────────────────────────────────────────────────
const mockInvoke = vi.fn();
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function () { return { invoke: mockInvoke }; }),
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(function () { return { invoke: mockInvoke }; }),
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn(function () { return { invoke: mockInvoke }; }),
}));

import { buildChatMessages, extractRoadbookUpdate, stripRoadbookBlock } from "../chat.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue({ content: "Here is my response." });
});

const baseOpts = {
  workspaceTitle: "AI 面试备战",
  journeyRoadmap: null,
  sources: [],
  insights: [],
  history: [],
  userMessage: "你好",
};

// ── buildChatMessages ─────────────────────────────────────────────────────────

describe("buildChatMessages", () => {
  it("includes workspace title in system prompt", () => {
    const msgs = buildChatMessages(baseOpts);
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("AI 面试备战");
  });

  it("includes journey roadmap when provided", () => {
    const msgs = buildChatMessages({ ...baseOpts, journeyRoadmap: "# Journey\n\n- Node.js" });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("Journey Roadmap");
    expect(system?.content).toContain("Node.js");
  });

  it("includes source roadmap and snapshot", () => {
    const msgs = buildChatMessages({
      ...baseOpts,
      sources: [{ reference: "jd.txt", snapshot: "Senior Engineer JD", roadmapMarkdown: "# Roadmap\n\n- React" }],
    });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("Roadmap: jd.txt");
    expect(system?.content).toContain("React");
    expect(system?.content).toContain("Senior Engineer JD");
  });

  it("includes insights", () => {
    const msgs = buildChatMessages({ ...baseOpts, insights: ["GraphQL is important for this role"] });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("Insights");
    expect(system?.content).toContain("GraphQL is important for this role");
  });

  it("multi-source: includes all source roadmaps", () => {
    const msgs = buildChatMessages({
      ...baseOpts,
      sources: [
        { reference: "src-a", snapshot: "snapshot a", roadmapMarkdown: "# Roadmap A" },
        { reference: "src-b", snapshot: "snapshot b", roadmapMarkdown: "# Roadmap B" },
      ],
    });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("Roadmap: src-a");
    expect(system?.content).toContain("Roadmap: src-b");
  });

  it("appends conversation history", () => {
    const msgs = buildChatMessages({
      ...baseOpts,
      history: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
      ],
      userMessage: "follow up",
    });
    const contents = msgs.map((m) => m.content);
    expect(contents).toContain("first question");
    expect(contents).toContain("first answer");
    expect(contents).toContain("follow up");
  });

  it("ends with the user message as human message", () => {
    const msgs = buildChatMessages({ ...baseOpts, userMessage: "update the roadbook" });
    const last = msgs[msgs.length - 1];
    expect(last._getType()).toBe("human");
    expect(last.content).toBe("update the roadbook");
  });

  it("includes language instruction in system prompt", () => {
    const msgs = buildChatMessages({ ...baseOpts, language: "Chinese" });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("Chinese");
    expect(system?.content).toContain("Always respond in");
  });

  it("defaults language to English when not provided", () => {
    const msgs = buildChatMessages(baseOpts);
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("English");
  });

  it("respects budget: does not exceed 60k chars in system prompt", () => {
    const bigSnapshot = "x".repeat(30_000);
    const msgs = buildChatMessages({
      ...baseOpts,
      sources: [
        { reference: "a", snapshot: bigSnapshot, roadmapMarkdown: null },
        { reference: "b", snapshot: bigSnapshot, roadmapMarkdown: null },
        { reference: "c", snapshot: bigSnapshot, roadmapMarkdown: null },
      ],
    });
    const system = msgs.find((m) => m._getType() === "system");
    expect((system?.content as string).length).toBeLessThanOrEqual(70_000); // system prompt overhead
  });
});

// ── extractRoadbookUpdate ─────────────────────────────────────────────────────

describe("extractRoadbookUpdate", () => {
  it("returns null when no roadbook block present", () => {
    expect(extractRoadbookUpdate("Just a normal reply.")).toBeNull();
  });

  it("extracts roadbook markdown from tagged block", () => {
    const reply = `Sure!\n\n<roadbook>\n# Updated Title\n\n- Step 1\n</roadbook>\n\nDone.`;
    expect(extractRoadbookUpdate(reply)).toBe("# Updated Title\n\n- Step 1");
  });
});

// ── stripRoadbookBlock ────────────────────────────────────────────────────────

describe("stripRoadbookBlock", () => {
  it("removes roadbook tags and content from reply", () => {
    const reply = `Here you go.\n\n<roadbook>\n# Title\n</roadbook>\n\nDone!`;
    const stripped = stripRoadbookBlock(reply);
    expect(stripped).not.toContain("<roadbook>");
    expect(stripped).toContain("Here you go.");
    expect(stripped).toContain("Done!");
  });

  it("collapses multiple blank lines", () => {
    const reply = `Before\n\n\n\n<roadbook># x</roadbook>\n\n\n\nAfter`;
    const stripped = stripRoadbookBlock(reply);
    expect(stripped).not.toMatch(/\n{3,}/);
  });
});
