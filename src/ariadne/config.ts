import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ModelProvider = "openai" | "anthropic" | "gemini";

interface ModelConfig {
  provider: ModelProvider;
  modelName?: string;
}

const DEFAULT_CONFIG: ModelConfig = {
  provider: "gemini",
  modelName: "gemini-2.5-flash",
};

let currentConfig: ModelConfig = { ...DEFAULT_CONFIG };

/**
 * Infer provider from model name.
 */
export function inferProvider(modelName: string): ModelProvider {
  if (modelName.startsWith("claude")) return "anthropic";
  if (modelName.startsWith("gemini")) return "gemini";
  return "openai";
}

export function setModelConfig(config: Partial<ModelConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

export function getModel(): BaseChatModel {
  switch (currentConfig.provider) {
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: currentConfig.modelName ?? "gemini-2.5-flash",
        temperature: 0.3,
        apiKey: process.env.GOOGLE_API_KEY,
      });
    case "openai":
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
