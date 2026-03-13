/**
 * LangSmith Comprehensive Evaluation Pipeline — Roadbook Generation Quality
 *
 * 8 heuristic + 6 LLM-as-judge + 2 summary evaluators.
 * See evaluators/ for implementations, dataset.ts for test cases.
 *
 * Run:
 *   pnpm eval:langsmith
 *   pnpm eval:langsmith:ci   (with regression threshold assertions)
 */

import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { generateRoadbook } from "../../workflow.js";
import { JUDGE_MODEL, REGRESSION_THRESHOLDS } from "./config.js";
import { DATASET_NAME, TEST_CASES, ensureDataset } from "./dataset.js";
import {
  structuralEvaluator,
  mermaidSyntaxEvaluator,
  markdownHygieneEvaluator,
  sectionBalanceEvaluator,
  skillCoverageEvaluator,
  resourceDensityEvaluator,
  priorityDistributionEvaluator,
  wordEfficiencyEvaluator,
} from "./evaluators/heuristic.js";
import {
  relevanceEvaluator,
  completenessEvaluator,
  pedagogicalEvaluator,
  diagramCoherenceEvaluator,
  concisenessEvaluator,
  hallucinationEvaluator,
} from "./evaluators/llm-judge.js";
import { crossTopicConsistency, overallQuality } from "./evaluators/summary.js";

const CI_MODE = process.argv.includes("--ci");
const EXPERIMENT_PREFIX = "roadbook";

// ── Run function ───────────────────────────────────────────────────────────

async function runRoadbook(inputs: Record<string, string>) {
  const output = await generateRoadbook(inputs.input, inputs.language ?? "English");
  return { output };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function renderBar(score: number): string {
  const width = 20;
  const filled = Math.round(score * width);
  const empty = width - filled;
  const color = score >= 0.8 ? "🟩" : score >= 0.5 ? "🟨" : "🟥";
  return `${color.repeat(filled)}${"⬜".repeat(empty)}`;
}

async function getGitSha(): Promise<string> {
  try {
    const { execSync } = await import("child_process");
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.LANGSMITH_API_KEY) {
    console.error("Error: LANGSMITH_API_KEY is required");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY or OPENAI_API_KEY is required");
    process.exit(1);
  }

  const client = new Client();
  await ensureDataset(client);

  const gitSha = await getGitSha();

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Roadbook Comprehensive Evaluation Pipeline                 ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Dataset:    ${DATASET_NAME.padEnd(45)}║`);
  console.log(`║  Examples:   ${String(TEST_CASES.length).padEnd(45)}║`);
  console.log(`║  Evaluators: 8 heuristic + 6 LLM-as-judge + 2 summary      ║`);
  console.log(`║  Judge:      ${JUDGE_MODEL.padEnd(45)}║`);
  console.log(`║  Commit:     ${gitSha.padEnd(45)}║`);
  console.log(`║  CI Mode:    ${String(CI_MODE).padEnd(45)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const results = await evaluate(runRoadbook, {
    data: DATASET_NAME,
    evaluators: [
      structuralEvaluator,
      mermaidSyntaxEvaluator,
      markdownHygieneEvaluator,
      sectionBalanceEvaluator,
      skillCoverageEvaluator,
      resourceDensityEvaluator,
      priorityDistributionEvaluator,
      wordEfficiencyEvaluator,
      relevanceEvaluator,
      completenessEvaluator,
      pedagogicalEvaluator,
      diagramCoherenceEvaluator,
      concisenessEvaluator,
      hallucinationEvaluator,
    ],
    summaryEvaluators: [crossTopicConsistency, overallQuality],
    experimentPrefix: EXPERIMENT_PREFIX,
    description: `Comprehensive eval — ${gitSha} — ${new Date().toISOString().slice(0, 10)}`,
    metadata: {
      model: JUDGE_MODEL,
      commit: gitSha,
      date: new Date().toISOString(),
      ciMode: CI_MODE,
      evaluatorCount: 14,
      datasetSize: TEST_CASES.length,
    },
    maxConcurrency: 2,
    client,
  });

  // ── Print results ───────────────────────────────────────────────────────

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  Experiment: ${results.experimentName}`);
  console.log(`  Examples evaluated: ${results.results.length}`);
  console.log(`${"═".repeat(70)}\n`);

  const metricAverages = new Map<string, number[]>();

  for (const row of results.results) {
    const evalResults = row.evaluationResults?.results ?? [];
    const inputPreview = String(row.example?.inputs?.input ?? "").slice(0, 55);
    console.log(`  ┌─ "${inputPreview}..."`);

    for (const r of evalResults) {
      const scoreStr = typeof r.score === "number" ? r.score.toFixed(2) : String(r.score);
      const bar = typeof r.score === "number" ? renderBar(r.score) : "";
      console.log(`  │  ${(r.key ?? "?").padEnd(25)} ${scoreStr.padStart(5)}  ${bar}`);

      if (typeof r.score === "number" && r.key) {
        if (!metricAverages.has(r.key)) metricAverages.set(r.key, []);
        metricAverages.get(r.key)!.push(r.score);
      }
    }
    console.log("  └");
  }

  // Averages
  console.log(`\n${"─".repeat(70)}`);
  console.log("  METRIC AVERAGES");
  console.log(`${"─".repeat(70)}`);

  const regressionFailures: string[] = [];

  for (const [metric, scores] of [...metricAverages.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bar = renderBar(avg);
    const threshold = REGRESSION_THRESHOLDS[metric];
    const status = threshold != null
      ? (avg >= threshold ? "  ✓" : "  ✗ REGRESSED")
      : "";

    if (threshold != null && avg < threshold) {
      regressionFailures.push(`${metric}: ${avg.toFixed(3)} < ${threshold}`);
    }

    console.log(`  ${metric.padEnd(25)} ${avg.toFixed(3).padStart(6)}  ${bar}${status}`);
  }

  // Summary evaluators
  if (results.summaryResults) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("  SUMMARY EVALUATORS");
    console.log(`${"─".repeat(70)}`);

    for (const s of results.summaryResults.results) {
      const scoreStr = typeof s.score === "number" ? s.score.toFixed(3) : String(s.score);
      console.log(`  ${(s.key ?? "?").padEnd(25)} ${scoreStr.padStart(6)}  ${s.comment ?? ""}`);
    }
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  View full results: https://smith.langchain.com`);
  console.log(`${"═".repeat(70)}\n`);

  // CI regression gate
  if (CI_MODE && regressionFailures.length > 0) {
    console.error("\n❌ REGRESSION DETECTED — the following metrics fell below thresholds:\n");
    for (const f of regressionFailures) {
      console.error(`   • ${f}`);
    }
    console.error("");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
