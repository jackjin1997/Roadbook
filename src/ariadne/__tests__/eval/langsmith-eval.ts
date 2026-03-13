/**
 * LangSmith Comprehensive Evaluation Pipeline — Roadbook Generation Quality
 *
 * Evaluates generateRoadbook() against a seeded LangSmith dataset using:
 *
 *   ┌─ Heuristic (fast, deterministic, no LLM) ────────────────────────┐
 *   │  structural_quality   — H1, H2, Mermaid, word count              │
 *   │  mermaid_syntax       — Mermaid block well-formedness             │
 *   │  markdown_hygiene     — heading hierarchy, link integrity, fences │
 *   │  section_balance      — variance across H2 section lengths        │
 *   │  skill_coverage       — input terms reflected in output           │
 *   │  resource_density     — external links per skill node             │
 *   │  priority_distribution — spread of high/medium/low priorities     │
 *   │  word_efficiency      — words per H2 section (not bloated)        │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   ┌─ LLM-as-Judge (semantic quality) ────────────────────────────────┐
 *   │  relevance            — topic alignment (custom)                  │
 *   │  completeness         — key skills coverage (custom)              │
 *   │  pedagogical_quality  — learning progression & actionability      │
 *   │  diagram_coherence    — Mermaid ↔ prose alignment                 │
 *   │  conciseness          — openevals prebuilt prompt                  │
 *   │  hallucination        — factual grounding (openevals)             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   ┌─ Summary (dataset-level aggregates) ─────────────────────────────┐
 *   │  cross_topic_consistency — coefficient of variation               │
 *   │  overall_quality         — weighted average across all metrics    │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Setup:
 *   LANGSMITH_API_KEY=...
 *   ANTHROPIC_API_KEY=... (or OPENAI_API_KEY with OPENAI_BASE_URL)
 *   LANGSMITH_TRACING=true  (optional, enables tracing)
 *
 * Run:
 *   pnpm eval:langsmith
 *   pnpm eval:langsmith:ci   (with regression threshold assertions)
 */

import { Client } from "langsmith";
import { evaluate, type EvaluatorT } from "langsmith/evaluation";
import type { Run, Example } from "langsmith";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  createLLMAsJudge,
  CONCISENESS_PROMPT,
  HALLUCINATION_PROMPT,
} from "openevals";
import { generateRoadbook } from "../../workflow.js";
import { setModelConfig } from "../../config.js";

// ── Config ─────────────────────────────────────────────────────────────────

const DATASET_NAME = "Roadbook Quality Eval v2";
const EXPERIMENT_PREFIX = "roadbook";
const CI_MODE = process.argv.includes("--ci");

// Use a fast/cheap model for the agent under test
if (process.env.ANTHROPIC_API_KEY) {
  setModelConfig({ provider: "anthropic", modelName: "claude-haiku-4-5-20251001" });
} else {
  setModelConfig({ provider: "openai", modelName: "gpt-4o-mini" });
}

// Judge model for LLM-as-Judge evaluators
const JUDGE_MODEL = process.env.ANTHROPIC_API_KEY
  ? "anthropic:claude-haiku-4-5-20251001"
  : "openai:gpt-4o-mini";

// ── Dataset ────────────────────────────────────────────────────────────────

const TEST_CASES = [
  // Standard cases — different input types
  {
    inputs: {
      input: "Frontend Engineer — React, TypeScript, GraphQL, performance optimization",
      language: "English",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  {
    inputs: {
      input: "Python data science: pandas, numpy, scikit-learn, visualization",
      language: "English",
    },
    metadata: { category: "article", difficulty: "standard" },
  },
  {
    inputs: {
      input: "高级后端工程师 — Go, Redis, MySQL, Kubernetes 微服务架构",
      language: "Chinese (Simplified)",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  {
    inputs: {
      input: "RAG (Retrieval-Augmented Generation)",
      language: "English",
    },
    metadata: { category: "concept", difficulty: "standard" },
  },
  {
    inputs: {
      input: "DevOps Engineer: Docker, Kubernetes, CI/CD, Terraform, observability",
      language: "English",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  // Multi-language cases
  {
    inputs: {
      input: "フルスタックエンジニア — React, Node.js, AWS, TypeScript",
      language: "Japanese",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  {
    inputs: {
      input: "Ingeniero de Machine Learning — PyTorch, TensorFlow, MLOps, feature engineering",
      language: "Spanish",
    },
    metadata: { category: "jd", difficulty: "standard" },
  },
  // Edge cases
  {
    inputs: {
      input: "Machine Learning",
      language: "English",
    },
    metadata: { category: "concept", difficulty: "broad" },
  },
  {
    inputs: {
      input: "Quantum Error Correction with Topological Codes using ZX-Calculus",
      language: "English",
    },
    metadata: { category: "concept", difficulty: "niche" },
  },
  {
    inputs: {
      input: `Senior Backend Engineer
Requirements:
- 5+ years Go or Rust experience
- Distributed systems (Raft, Paxos, CRDTs)
- Database internals (B-trees, LSM trees, WAL)
- Observability (OpenTelemetry, Prometheus, Grafana)
- Container orchestration (Kubernetes, Istio)
- Event-driven architecture (Kafka, NATS)
- Performance profiling and optimization
- System design for 10M+ DAU scale`,
      language: "English",
    },
    metadata: { category: "jd", difficulty: "complex" },
  },
];

async function ensureDataset(client: Client) {
  try {
    const existing = await client.readDataset({ datasetName: DATASET_NAME });
    console.log(`✓ Using existing dataset: "${DATASET_NAME}" (${existing.id})`);
    return existing;
  } catch {
    console.log(`Creating dataset: "${DATASET_NAME}"...`);
    const dataset = await client.createDataset(DATASET_NAME, {
      description: "Comprehensive test cases for Roadbook Markdown generation quality — standard, multi-language, edge cases",
    });
    await client.createExamples({
      datasetId: dataset.id,
      inputs: TEST_CASES.map((tc) => tc.inputs),
      metadata: TEST_CASES.map((tc) => tc.metadata),
    });
    console.log(`✓ Dataset created with ${TEST_CASES.length} examples`);
    return dataset;
  }
}

// ── Run Function ───────────────────────────────────────────────────────────

async function runRoadbook(inputs: Record<string, string>) {
  const output = await generateRoadbook(
    inputs.input,
    inputs.language ?? "English",
  );
  return { output };
}

// ── LLM Judge Setup ────────────────────────────────────────────────────────

function buildJudge() {
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

// ── Evaluator args type ────────────────────────────────────────────────────

type EvalArgs = {
  run: Run;
  example: Example;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

// ════════════════════════════════════════════════════════════════════════════
// HEURISTIC EVALUATORS (fast, deterministic, no LLM call)
// ════════════════════════════════════════════════════════════════════════════

/**
 * 1. Structural quality — H1, H2 sections, Mermaid, word count.
 */
const structuralEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const hasH1 = /^#\s+\S/m.test(md);
  const h2Count = (md.match(/^##\s+/gm) ?? []).length;
  const hasMermaid = md.includes("```mermaid");
  const wordCount = md.split(/\s+/).filter(Boolean).length;

  const score =
    (hasH1 ? 0.25 : 0) +
    (h2Count >= 2 ? 0.25 : h2Count >= 1 ? 0.1 : 0) +
    (hasMermaid ? 0.25 : 0) +
    (wordCount >= 200 ? 0.25 : wordCount >= 100 ? 0.1 : 0);

  return {
    key: "structural_quality",
    score,
    comment: `H1=${hasH1} H2s=${h2Count} Mermaid=${hasMermaid} Words=${wordCount}`,
  };
};

/**
 * 2. Mermaid syntax validation — checks block well-formedness.
 */
const mermaidSyntaxEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const mermaidBlocks = md.match(/```mermaid\n([\s\S]*?)```/g) ?? [];

  if (mermaidBlocks.length === 0) {
    return { key: "mermaid_syntax", score: 0, comment: "No mermaid blocks found" };
  }

  let validCount = 0;
  const issues: string[] = [];

  for (const block of mermaidBlocks) {
    const content = block.replace(/```mermaid\n/, "").replace(/```$/, "");
    const hasType = /^(graph|flowchart|mindmap|sequenceDiagram|classDiagram|gantt|pie|erDiagram|stateDiagram)/m.test(content);
    const hasRoot = /root\(/.test(content);
    const hasIndentedNodes = /^\s{4,}\S/m.test(content);
    const lineCount = content.trim().split("\n").length;

    if (hasType && (hasRoot || hasIndentedNodes) && lineCount >= 3) {
      validCount++;
    } else {
      if (!hasType) issues.push("missing diagram type");
      if (!hasRoot && !hasIndentedNodes) issues.push("no nodes found");
      if (lineCount < 3) issues.push("too short");
    }
  }

  return {
    key: "mermaid_syntax",
    score: validCount / mermaidBlocks.length,
    comment: issues.length > 0
      ? `${validCount}/${mermaidBlocks.length} valid — issues: ${issues.join(", ")}`
      : `${validCount}/${mermaidBlocks.length} blocks valid`,
  };
};

/**
 * 3. Markdown hygiene — heading hierarchy, empty links, unclosed fences.
 */
const markdownHygieneEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  let score = 1.0;
  const issues: string[] = [];

  // Check for empty links [text]()
  const emptyLinks = md.match(/\[.*?\]\(\s*\)/g);
  if (emptyLinks) {
    score -= 0.2;
    issues.push(`${emptyLinks.length} empty link(s)`);
  }

  // Check heading hierarchy — no skipping levels (e.g., H1 → H3 without H2)
  const headings = [...md.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) {
      score -= 0.15;
      issues.push(`heading skip: H${headings[i - 1]}→H${headings[i]}`);
      break;
    }
  }

  // Check for unclosed code fences
  const fenceCount = (md.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) {
    score -= 0.3;
    issues.push("unclosed code fence");
  }

  // Check for broken markdown (consecutive blank H2/H3)
  const emptyHeadings = md.match(/^#{1,6}\s*$/gm);
  if (emptyHeadings) {
    score -= 0.15;
    issues.push(`${emptyHeadings.length} empty heading(s)`);
  }

  // Check for duplicate H2 headings
  const h2s = [...md.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase());
  const dupes = h2s.filter((h, i) => h2s.indexOf(h) !== i);
  if (dupes.length > 0) {
    score -= 0.1;
    issues.push(`duplicate H2: "${dupes[0]}"`);
  }

  return {
    key: "markdown_hygiene",
    score: Math.max(0, score),
    comment: issues.length > 0 ? issues.join("; ") : "clean",
  };
};

/**
 * 4. Section balance — variance in H2 section word counts.
 *    Penalizes roadbooks where one section is much longer/shorter than others.
 */
const sectionBalanceEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const h2Sections = md.split(/^## /m).slice(1);

  if (h2Sections.length < 2) {
    return { key: "section_balance", score: 0.1, comment: `Only ${h2Sections.length} H2 section(s)` };
  }

  const lengths = h2Sections.map((s) => s.split(/\s+/).filter(Boolean).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const cv = avg > 0
    ? Math.sqrt(lengths.reduce((acc, l) => acc + (l - avg) ** 2, 0) / lengths.length) / avg
    : 1;

  // CV < 0.3 = well-balanced, CV > 1.0 = very unbalanced
  const score = Math.max(0, Math.min(1, 1 - cv * 0.7));

  return {
    key: "section_balance",
    score,
    comment: `${h2Sections.length} sections, words=[${lengths.join(",")}], CV=${cv.toFixed(2)}`,
  };
};

/**
 * 5. Skill coverage — checks that key terms from the input appear in the output.
 */
const skillCoverageEvaluator: EvaluatorT = ({ inputs, outputs }: EvalArgs) => {
  const md = ((outputs?.output as string) ?? "").toLowerCase();
  const input = ((inputs?.input as string) ?? "").toLowerCase();

  // Extract likely technical terms (capitalized words, known tech patterns)
  const terms = input
    .split(/[\s,;—\-|·：:]+/)
    .map((t) => t.trim().replace(/[()（）]/g, ""))
    .filter((t) => t.length >= 2 && !/^(and|the|for|with|or|a|an|in|of|to|is|are|experience|years?|senior|junior|engineer|developer|要求|经验|熟悉|优先|具备|良好|能力|以上|岗位|职责|工作)$/i.test(t));

  if (terms.length === 0) {
    return { key: "skill_coverage", score: 1, comment: "No terms to check" };
  }

  const found = terms.filter((t) => md.includes(t));
  const score = found.length / terms.length;

  return {
    key: "skill_coverage",
    score,
    comment: `${found.length}/${terms.length} input terms found in output`,
  };
};

/**
 * 6. Resource density — average external links per skill section.
 */
const resourceDensityEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const h3Count = (md.match(/^### /gm) ?? []).length;
  const linkCount = (md.match(/\[.+?\]\(https?:\/\/.+?\)/g) ?? []).length;

  if (h3Count === 0) {
    return { key: "resource_density", score: 0, comment: "No H3 skill sections" };
  }

  const density = linkCount / h3Count;
  // 2+ links per section = perfect, 1 = ok, 0 = bad
  const score = Math.min(1, density / 2);

  return {
    key: "resource_density",
    score,
    comment: `${linkCount} links across ${h3Count} sections (${density.toFixed(1)}/section)`,
  };
};

/**
 * 7. Priority distribution — checks that skills aren't all same priority.
 */
const priorityDistributionEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";

  const high = (md.match(/🔴/g) ?? []).length;
  const medium = (md.match(/🟡/g) ?? []).length;
  const low = (md.match(/🟢/g) ?? []).length;
  const total = high + medium + low;

  if (total === 0) {
    return { key: "priority_distribution", score: 0, comment: "No priority badges found" };
  }

  // Good distribution: at least 2 levels used, no single level > 80%
  const levels = [high, medium, low].filter((n) => n > 0).length;
  const maxPct = Math.max(high, medium, low) / total;
  const score = levels >= 3 ? 1.0 : levels === 2 ? (maxPct < 0.8 ? 0.8 : 0.6) : 0.3;

  return {
    key: "priority_distribution",
    score,
    comment: `🔴=${high} 🟡=${medium} 🟢=${low} (${levels} levels, max=${(maxPct * 100).toFixed(0)}%)`,
  };
};

/**
 * 8. Word efficiency — penalizes overly bloated or too-terse outputs.
 *    Sweet spot: 300-1500 words.
 */
const wordEfficiencyEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const wordCount = md.split(/\s+/).filter(Boolean).length;

  let score: number;
  if (wordCount < 100) score = 0.1;
  else if (wordCount < 200) score = 0.4;
  else if (wordCount < 300) score = 0.7;
  else if (wordCount <= 1500) score = 1.0;
  else if (wordCount <= 2500) score = 0.8;
  else score = 0.5; // too verbose

  return {
    key: "word_efficiency",
    score,
    comment: `${wordCount} words (sweet spot: 300-1500)`,
  };
};

// ════════════════════════════════════════════════════════════════════════════
// LLM-AS-JUDGE EVALUATORS (semantic quality)
// ════════════════════════════════════════════════════════════════════════════

const JudgeSchema = z.object({
  reasoning: z.string().describe("Brief explanation for the score"),
  score: z.number().min(0).max(1).describe("Score from 0 to 1"),
});

const judge = buildJudge();
const scoringJudge = judge.withStructuredOutput(JudgeSchema);

/**
 * 9. Relevance — does the roadbook match the input topic?
 */
const relevanceEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const topic = (inputs?.input as string) ?? "";

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Evaluate this AI-generated learning roadbook for topic relevance.

Input topic: "${topic}"

Roadbook (first 1500 chars):
${md.slice(0, 1500)}

Score 1.0 = covers the right domain and technologies
Score 0.5 = partially relevant, some drift
Score 0.0 = completely off-topic or empty`,
    },
  ]);

  return { key: "relevance", score: grade.score, comment: grade.reasoning };
};

/**
 * 10. Completeness — does the roadbook cover the key skills implied by the input?
 */
const completenessEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const topic = (inputs?.input as string) ?? "";

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Evaluate this AI-generated learning roadbook for content completeness.

Input topic: "${topic}"

Roadbook (first 2000 chars):
${md.slice(0, 2000)}

Does the roadbook address the key skills, tools, and concepts implied by the input?
Score 1.0 = comprehensive coverage
Score 0.5 = covers some areas but notable gaps
Score 0.0 = missing most expected content`,
    },
  ]);

  return { key: "completeness", score: grade.score, comment: grade.reasoning };
};

/**
 * 11. Pedagogical quality — learning progression, prerequisite ordering,
 *     actionability, and milestone structure.
 */
const pedagogicalEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const topic = (inputs?.input as string) ?? "";

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Evaluate this AI-generated learning roadbook for PEDAGOGICAL quality.

Topic: "${topic}"
Content (first 3000 chars):
${md.slice(0, 3000)}

Consider:
- Does it sequence learning from foundational to advanced? (prerequisite ordering)
- Are there actionable milestones or checkpoints the learner can follow?
- Does it suggest concrete resources, projects, or exercises?
- Is the difficulty progression reasonable for the topic?
- Is the content structured to aid retention and understanding?

Score 1.0 = excellent learning design with clear progression
Score 0.5 = adequate but could be structured better
Score 0.0 = poor pedagogical design or random ordering`,
    },
  ]);

  return { key: "pedagogical_quality", score: grade.score, comment: grade.reasoning };
};

/**
 * 12. Diagram-prose coherence — does the Mermaid diagram match the prose?
 */
const diagramCoherenceEvaluator: EvaluatorT = async ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const mermaidBlock = md.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? "";
  const prosePreview = md.replace(/```mermaid[\s\S]*?```/g, "").slice(0, 2000);

  if (!mermaidBlock) {
    return { key: "diagram_coherence", score: 0, comment: "No Mermaid diagram found" };
  }

  const grade = await scoringJudge.invoke([
    {
      role: "user",
      content: `Compare this Mermaid diagram against the prose sections of a learning roadbook.

Mermaid diagram:
${mermaidBlock.slice(0, 1500)}

Prose sections (first 2000 chars):
${prosePreview}

Do the skills/categories in the diagram match what's described in the prose?

Score 1.0 = diagram accurately reflects the learning path described in prose
Score 0.5 = partial alignment, some nodes missing or extra
Score 0.0 = diagram and prose describe completely different things`,
    },
  ]);

  return { key: "diagram_coherence", score: grade.score, comment: grade.reasoning };
};

/**
 * 13. Conciseness — uses openevals prebuilt prompt.
 *     Adapted for roadbook context (we expect detail, but not filler).
 */
const concisenessEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const evaluator = createLLMAsJudge({
    prompt: CONCISENESS_PROMPT,
    feedbackKey: "conciseness",
    judge,
    continuous: true,
    useReasoning: true,
  });

  const result = await evaluator({
    inputs: inputs?.input as string,
    outputs: ((outputs?.output as string) ?? "").slice(0, 3000),
  });

  return {
    key: "conciseness",
    score: typeof result.score === "number" ? result.score : (result.score ? 1 : 0),
    comment: (result.comment as string) ?? "",
  };
};

/**
 * 14. Hallucination — uses openevals prebuilt prompt.
 *     Checks if the roadbook fabricates technologies, tools, or facts
 *     not grounded in the input.
 */
const hallucinationEvaluator: EvaluatorT = async ({ inputs, outputs }: EvalArgs) => {
  const evaluator = createLLMAsJudge({
    prompt: HALLUCINATION_PROMPT,
    feedbackKey: "hallucination_free",
    judge,
    continuous: true,
    useReasoning: true,
  });

  const result = await evaluator({
    inputs: inputs?.input as string,
    outputs: ((outputs?.output as string) ?? "").slice(0, 3000),
    context: `The user provided a topic/JD and the system generated a learning roadbook. The roadbook should recommend real technologies, tools, and resources that exist and are relevant to the input topic. It is acceptable to include widely-known related technologies not explicitly mentioned in the input.`,
  });

  return {
    key: "hallucination_free",
    score: typeof result.score === "number" ? result.score : (result.score ? 1 : 0),
    comment: (result.comment as string) ?? "",
  };
};

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY EVALUATORS (dataset-level aggregates)
// ════════════════════════════════════════════════════════════════════════════

type SummaryArgs = {
  runs: Run[];
  examples: Example[];
};

/**
 * Cross-topic consistency — measures how stable quality is across different inputs.
 * Low coefficient of variation = consistent quality.
 */
function crossTopicConsistency({ runs }: SummaryArgs) {
  const structuralScores = runs
    .flatMap((r) => r.feedback_stats ? Object.entries(r.feedback_stats) : [])
    .filter(([key]) => key === "structural_quality")
    .map(([, val]) => (typeof val === "number" ? val : (val as { avg: number }).avg));

  if (structuralScores.length < 2) {
    return { key: "cross_topic_consistency", score: 1, comment: "Not enough data" };
  }

  const mean = structuralScores.reduce((a, b) => a + b, 0) / structuralScores.length;
  const variance = structuralScores.reduce((a, b) => a + (b - mean) ** 2, 0) / structuralScores.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const score = Math.max(0, Math.min(1, 1 - cv));

  return {
    key: "cross_topic_consistency",
    score,
    comment: `CV=${cv.toFixed(3)}, mean=${mean.toFixed(3)}, n=${structuralScores.length}`,
  };
}

/**
 * Overall quality — weighted average across key metrics from all runs.
 */
function overallQuality({ runs }: SummaryArgs) {
  const weights: Record<string, number> = {
    structural_quality: 0.10,
    mermaid_syntax: 0.05,
    markdown_hygiene: 0.05,
    section_balance: 0.05,
    skill_coverage: 0.10,
    priority_distribution: 0.05,
    word_efficiency: 0.05,
    resource_density: 0.05,
    relevance: 0.15,
    completeness: 0.15,
    pedagogical_quality: 0.10,
    diagram_coherence: 0.05,
    conciseness: 0.025,
    hallucination_free: 0.025,
  };

  // Collect scores per metric across runs
  const metricScores = new Map<string, number[]>();
  for (const run of runs) {
    if (!run.feedback_stats) continue;
    for (const [key, val] of Object.entries(run.feedback_stats)) {
      const score = typeof val === "number" ? val : (val as { avg: number }).avg;
      if (!metricScores.has(key)) metricScores.set(key, []);
      metricScores.get(key)!.push(score);
    }
  }

  let totalWeight = 0;
  let weightedSum = 0;
  const breakdown: string[] = [];

  for (const [metric, weight] of Object.entries(weights)) {
    const scores = metricScores.get(metric);
    if (scores && scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      weightedSum += avg * weight;
      totalWeight += weight;
      breakdown.push(`${metric}=${avg.toFixed(2)}`);
    }
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    key: "overall_quality",
    score,
    comment: breakdown.join(", "),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// REGRESSION THRESHOLDS (for CI mode)
// ════════════════════════════════════════════════════════════════════════════

const REGRESSION_THRESHOLDS: Record<string, number> = {
  structural_quality: 0.75,
  mermaid_syntax: 0.80,
  markdown_hygiene: 0.70,
  relevance: 0.60,
  completeness: 0.60,
  skill_coverage: 0.40,
  pedagogical_quality: 0.50,
};

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

  // Collect git metadata for experiment tracking
  let gitSha = "unknown";
  try {
    const { execSync } = await import("child_process");
    gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch { /* ignore */ }

  const experimentMetadata = {
    model: JUDGE_MODEL,
    commit: gitSha,
    date: new Date().toISOString(),
    ciMode: CI_MODE,
    evaluatorCount: 14,
    datasetSize: TEST_CASES.length,
  };

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
      // Heuristic (fast)
      structuralEvaluator,
      mermaidSyntaxEvaluator,
      markdownHygieneEvaluator,
      sectionBalanceEvaluator,
      skillCoverageEvaluator,
      resourceDensityEvaluator,
      priorityDistributionEvaluator,
      wordEfficiencyEvaluator,
      // LLM-as-Judge (slower, semantic)
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
    metadata: experimentMetadata,
    maxConcurrency: 2,
    client,
  });

  // ── Print detailed results ──────────────────────────────────────────────

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  Experiment: ${results.experimentName}`);
  console.log(`  Examples evaluated: ${results.results.length}`);
  console.log(`${"═".repeat(70)}\n`);

  // Per-example breakdown
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

  // Summary evaluator results
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

/** Render a visual bar for a 0-1 score. */
function renderBar(score: number): string {
  const width = 20;
  const filled = Math.round(score * width);
  const empty = width - filled;
  const color = score >= 0.8 ? "🟩" : score >= 0.5 ? "🟨" : "🟥";
  return `${color.repeat(filled)}${"⬜".repeat(empty)}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
