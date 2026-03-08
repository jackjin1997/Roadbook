import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ModelProvider = "openai" | "anthropic" | "gemini";

interface ModelConfig {
  provider: ModelProvider;
  modelName?: string;
}

const DEFAULT_CONFIG: ModelConfig = {
  provider: "gemini",
  modelName: "gemini-3.1-pro-low",
};

let currentConfig: ModelConfig = { ...DEFAULT_CONFIG };

/**
 * Infer native provider from model name, used only when no OpenAI-compatible proxy is set.
 * When OPENAI_BASE_URL is configured, all models route through ChatOpenAI regardless.
 */
export function inferProvider(modelName: string): ModelProvider {
  if (modelName.startsWith("claude")) return "anthropic";
  return "openai"; // gemini-* and gpt-* all go through OpenAI-compatible proxy
}

export function setModelConfig(config: Partial<ModelConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

export function getModel(): BaseChatModel {
  switch (currentConfig.provider) {
    case "openai":
    case "gemini":
      return new ChatOpenAI({
        modelName: currentConfig.modelName ?? "gpt-4o",
        temperature: 0.3,
        timeout: 60000,
      });
    case "anthropic":
      return new ChatAnthropic({
        modelName: currentConfig.modelName ?? "claude-sonnet-4-6",
        temperature: 0.3,
        ...(process.env.ANTHROPIC_BASE_URL ? { anthropicApiUrl: process.env.ANTHROPIC_BASE_URL } : {}),
      });
    default:
      throw new Error(`Unknown provider: ${currentConfig.provider}`);
  }
}
