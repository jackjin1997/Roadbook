import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock LLM ──────────────────────────────────────────────────────────────────
const mockInvoke = vi.fn();
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function () {
    return { invoke: mockInvoke };
  }),
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(function () {
    return { invoke: mockInvoke };
  }),
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn(function () {
    return { invoke: mockInvoke };
  }),
}));

import { buildChatMessages, extractRoadbookUpdate } from "../chat.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockResolvedValue({ content: "Here is my response." });
});

// ── buildChatMessages ─────────────────────────────────────────────────────────

describe("buildChatMessages", () => {
  it("includes a system prompt with workspace title", () => {
    const msgs = buildChatMessages({
      workspaceTitle: "AI 面试备战",
      sourceSnapshot: null,
      roadbookMarkdown: null,
      history: [],
      userMessage: "你好",
    });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("AI 面试备战");
  });

  it("includes source snapshot in system prompt when provided", () => {
    const msgs = buildChatMessages({
      workspaceTitle: "test",
      sourceSnapshot: "JD content here",
      roadbookMarkdown: null,
      history: [],
      userMessage: "hi",
    });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("JD content here");
  });

  it("includes roadbook in system prompt when provided", () => {
    const msgs = buildChatMessages({
      workspaceTitle: "test",
      sourceSnapshot: null,
      roadbookMarkdown: "# My Roadbook\n\n- Step 1",
      history: [],
      userMessage: "hi",
    });
    const system = msgs.find((m) => m._getType() === "system");
    expect(system?.content).toContain("# My Roadbook");
  });

  it("appends conversation history", () => {
    const msgs = buildChatMessages({
      workspaceTitle: "test",
      sourceSnapshot: null,
      roadbookMarkdown: null,
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

  it("ends with the user message", () => {
    const msgs = buildChatMessages({
      workspaceTitle: "test",
      sourceSnapshot: null,
      roadbookMarkdown: null,
      history: [],
      userMessage: "update the roadbook",
    });
    const last = msgs[msgs.length - 1];
    expect(last._getType()).toBe("human");
    expect(last.content).toBe("update the roadbook");
  });
});

// ── extractRoadbookUpdate ─────────────────────────────────────────────────────

describe("extractRoadbookUpdate", () => {
  it("returns null when no roadbook block present", () => {
    const result = extractRoadbookUpdate("Just a normal reply.");
    expect(result).toBeNull();
  });

  it("extracts roadbook markdown from tagged block", () => {
    const reply = `Sure! Here's the updated roadbook:\n\n<roadbook>\n# Updated Title\n\n- Step 1\n</roadbook>\n\nLet me know if you need changes.`;
    const result = extractRoadbookUpdate(reply);
    expect(result).toBe("# Updated Title\n\n- Step 1");
  });

  it("strips the roadbook block from the visible reply", () => {
    const reply = `Here you go.\n\n<roadbook>\n# Title\n</roadbook>\n\nDone!`;
    const { visibleReply } = extractRoadbookUpdate(reply) !== null
      ? { visibleReply: reply.replace(/<roadbook>[\s\S]*?<\/roadbook>/g, "").trim() }
      : { visibleReply: reply };
    expect(visibleReply).not.toContain("<roadbook>");
    expect(visibleReply).toContain("Here you go.");
    expect(visibleReply).toContain("Done!");
  });
});
