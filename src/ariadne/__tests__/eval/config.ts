/**
 * Eval pipeline shared config — model setup, judge builder, shared types.
 */

import type { Run, Example } from "langsmith";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { setModelConfig } from "../../config.js";

// ── Agent under test ───────────────────────────────────────────────────────

if (process.env.ANTHROPIC_API_KEY) {
  setModelConfig({ provider: "anthropic", modelName: "claude-haiku-4-5-20251001" });
} else {
  setModelConfig({ provider: "openai", modelName: "gpt-4o-mini" });
}

// ── Judge ──────────────────────────────────────────────────────────────────

export const JUDGE_MODEL = process.env.ANTHROPIC_API_KEY
  ? "anthropic:claude-haiku-4-5-20251001"
  : "openai:gpt-4o-mini";

export function buildJudge() {
  if (process.env.ANTHROPIC_API_KEY) {
    return new ChatAnthropic({
      modelName: "claude-haiku-4-5-20251001",
      temperature: 0,
      ...(process.env.ANTHROPIC_BASE_URL
        ? { anthropicApiUrl: process.env.ANTHROPIC_BASE_URL }
        : {}),
    });
  }
  return new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
}

export const JudgeSchema = z.object({
  reasoning: z.string().describe("Brief explanation for the score"),
  score: z.number().min(0).max(1).describe("Score from 0 to 1"),
});

// ── Shared types ───────────────────────────────────────────────────────────

export type EvalArgs = {
  run: Run;
  example: Example;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

export type SummaryArgs = {
  runs: Run[];
  examples: Example[];
};

// ── Regression thresholds ──────────────────────────────────────────────────

export const REGRESSION_THRESHOLDS: Record<string, number> = {
  structural_quality: 0.75,
  mermaid_syntax: 0.80,
  markdown_hygiene: 0.70,
  relevance: 0.60,
  completeness: 0.60,
  skill_coverage: 0.40,
  pedagogical_quality: 0.50,
};
