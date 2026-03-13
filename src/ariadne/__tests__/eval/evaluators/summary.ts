/**
 * Summary evaluators — dataset-level aggregates across all runs.
 */

import type { SummaryArgs } from "../config.js";

/** Cross-topic consistency — measures quality stability via coefficient of variation. */
export function crossTopicConsistency({ runs }: SummaryArgs) {
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

/** Overall quality — weighted average across key metrics from all runs. */
export function overallQuality({ runs }: SummaryArgs) {
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
