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

/**
 * Set default model config. Used as fallback when no override is passed.
 */
export function setModelConfig(config: Partial<ModelConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Create a chat model instance.
 * If `override` is provided, it takes priority over the global currentConfig.
 * This avoids concurrency race conditions when multiple requests set different models.
 */
export function getModel(override?: { provider?: string; modelName?: string }): BaseChatModel {
  const provider = (override?.provider as ModelProvider) ?? currentConfig.provider;
  const modelName = override?.modelName ?? currentConfig.modelName;

  switch (provider) {
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: modelName ?? "gemini-2.5-flash",
        temperature: 0.3,
        apiKey: process.env.GOOGLE_API_KEY,
      });
    case "openai":
      return new ChatOpenAI({
        modelName: modelName ?? "gpt-4o",
        temperature: 0.3,
        timeout: 60000,
      });
    case "anthropic":
      return new ChatAnthropic({
        modelName: modelName ?? "claude-sonnet-4-6",
        temperature: 0.3,
        ...(process.env.ANTHROPIC_BASE_URL ? { anthropicApiUrl: process.env.ANTHROPIC_BASE_URL } : {}),
      });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
