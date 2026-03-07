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
  provider: "anthropic",
  modelName: "claude-sonnet-4-6",
};

let currentConfig: ModelConfig = { ...DEFAULT_CONFIG };

export function setModelConfig(config: Partial<ModelConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

export function getModel(): BaseChatModel {
  switch (currentConfig.provider) {
    case "openai":
      return new ChatOpenAI({
        modelName: currentConfig.modelName ?? "gpt-4o",
        temperature: 0.3,
        streaming: true,
      });
    case "anthropic":
      return new ChatAnthropic({
        modelName: currentConfig.modelName ?? "claude-sonnet-4-20250514",
        temperature: 0.3,
      });
    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: currentConfig.modelName ?? "gemini-2.0-flash",
        temperature: 0.3,
      });
    default:
      throw new Error(`Unknown provider: ${currentConfig.provider}`);
  }
}
