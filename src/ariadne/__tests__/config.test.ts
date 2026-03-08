import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must use regular functions (not arrow functions) to support `new` operator
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function (opts: Record<string, unknown>) {
    return { _tag: "openai", ...opts };
  }),
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(function (opts: Record<string, unknown>) {
    return { _tag: "anthropic", ...opts };
  }),
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn(function (opts: Record<string, unknown>) {
    return { _tag: "gemini", ...opts };
  }),
}));

import { getModel, setModelConfig } from "../config.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

beforeEach(() => {
  vi.clearAllMocks();
  setModelConfig({ provider: "openai", modelName: "gpt-4o" });
});

describe("setModelConfig / getModel", () => {
  it("returns an OpenAI model by default", () => {
    const model = getModel() as unknown as { _tag: string };
    expect(model._tag).toBe("openai");
  });

  it("switches to Anthropic provider", () => {
    setModelConfig({ provider: "anthropic" });
    const model = getModel() as unknown as { _tag: string };
    expect(model._tag).toBe("anthropic");
  });

  // Gemini routes through ChatOpenAI (proxy mode)
  it("switches to Gemini provider — routes through ChatOpenAI", () => {
    setModelConfig({ provider: "gemini" });
    const model = getModel() as unknown as { _tag: string };
    expect(model._tag).toBe("openai");
  });

  it("applies custom modelName to OpenAI", () => {
    setModelConfig({ provider: "openai", modelName: "gpt-4-turbo" });
    getModel();
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ modelName: "gpt-4-turbo" }),
    );
  });

  it("applies custom modelName to Anthropic", () => {
    setModelConfig({ provider: "anthropic", modelName: "claude-3-haiku-20240307" });
    getModel();
    expect(ChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ modelName: "claude-3-haiku-20240307" }),
    );
  });

  it("applies custom modelName to Gemini — routes through ChatOpenAI with modelName", () => {
    setModelConfig({ provider: "gemini", modelName: "gemini-1.5-pro" });
    getModel();
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ modelName: "gemini-1.5-pro" }),
    );
  });

  it("partial update preserves existing provider", () => {
    setModelConfig({ provider: "gemini" });
    setModelConfig({ modelName: "gemini-1.5-pro" });
    const model = getModel() as unknown as { _tag: string };
    expect(model._tag).toBe("openai"); // gemini routes through OpenAI proxy
  });

  it("throws for unknown provider", () => {
    // @ts-expect-error testing invalid input
    setModelConfig({ provider: "unknown" });
    expect(() => getModel()).toThrow("Unknown provider: unknown");
  });
});
