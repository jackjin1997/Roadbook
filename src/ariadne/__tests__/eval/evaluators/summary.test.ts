import { describe, it, expect } from "vitest";
import { crossTopicConsistency, overallQuality } from "./summary.js";
import type { Run, Example } from "langsmith";

/** Helper to build a minimal Run with feedback_stats. */
function makeRun(
  feedbackStats?: Record<string, number | { avg: number }>,
): Run {
  return { feedback_stats: feedbackStats } as unknown as Run;
}

const NO_EXAMPLES: Example[] = [];

// ── crossTopicConsistency ────────────────────────────────────────────────────

describe("crossTopicConsistency", () => {
  it("returns score=1 when fewer than 2 runs have structural_quality", () => {
    const result = crossTopicConsistency({
      runs: [makeRun({ structural_quality: 0.8 })],
      examples: NO_EXAMPLES,
    });
    expect(result.key).toBe("cross_topic_consistency");
    expect(result.score).toBe(1);
    expect(result.comment).toBe("Not enough data");
  });

  it("returns score=1 for zero runs", () => {
    const result = crossTopicConsistency({ runs: [], examples: NO_EXAMPLES });
    expect(result.score).toBe(1);
  });

  it("returns a high score when all structural_quality scores are identical", () => {
    const runs = [
      makeRun({ structural_quality: 0.9 }),
      makeRun({ structural_quality: 0.9 }),
      makeRun({ structural_quality: 0.9 }),
    ];
    const result = crossTopicConsistency({ runs, examples: NO_EXAMPLES });
    expect(result.score).toBe(1); // CV=0 → score=1
  });

  it("returns a low score when structural_quality scores vary widely", () => {
    const runs = [
      makeRun({ structural_quality: 0.1 }),
      makeRun({ structural_quality: 0.9 }),
    ];
    const result = crossTopicConsistency({ runs, examples: NO_EXAMPLES });
    // mean=0.5, variance=0.16, stddev=0.4, CV=0.8 → score≈0.2
    expect(result.score).toBeLessThan(0.5);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("handles the { avg: number } format for feedback_stats values", () => {
    const runs = [
      makeRun({ structural_quality: { avg: 0.8 } }),
      makeRun({ structural_quality: { avg: 0.8 } }),
    ];
    const result = crossTopicConsistency({ runs, examples: NO_EXAMPLES });
    expect(result.score).toBe(1);
  });
});

// ── overallQuality ───────────────────────────────────────────────────────────

describe("overallQuality", () => {
  it("returns score=0 when there are no runs", () => {
    const result = overallQuality({ runs: [], examples: NO_EXAMPLES });
    expect(result.key).toBe("overall_quality");
    expect(result.score).toBe(0);
  });

  it("computes a weighted average for a single run with all metrics", () => {
    const allMetrics: Record<string, number> = {
      structural_quality: 0.9,
      mermaid_syntax: 0.8,
      markdown_hygiene: 0.7,
      section_balance: 0.6,
      skill_coverage: 0.9,
      priority_distribution: 0.5,
      word_efficiency: 0.8,
      resource_density: 0.7,
      relevance: 1.0,
      completeness: 0.9,
      pedagogical_quality: 0.85,
      diagram_coherence: 0.75,
      conciseness: 0.8,
      hallucination_free: 1.0,
    };

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

    let expectedWeightedSum = 0;
    let expectedTotalWeight = 0;
    for (const [metric, weight] of Object.entries(weights)) {
      expectedWeightedSum += allMetrics[metric] * weight;
      expectedTotalWeight += weight;
    }
    const expectedScore = expectedWeightedSum / expectedTotalWeight;

    const result = overallQuality({
      runs: [makeRun(allMetrics)],
      examples: NO_EXAMPLES,
    });

    expect(result.score).toBeCloseTo(expectedScore, 6);
  });

  it("skips missing metrics and adjusts total weight accordingly", () => {
    // Only provide two metrics
    const partialMetrics: Record<string, number> = {
      relevance: 0.8,
      completeness: 0.6,
    };

    const result = overallQuality({
      runs: [makeRun(partialMetrics)],
      examples: NO_EXAMPLES,
    });

    // relevance weight=0.15, completeness weight=0.15 → totalWeight=0.30
    // weightedSum = 0.8*0.15 + 0.6*0.15 = 0.12 + 0.09 = 0.21
    // score = 0.21 / 0.30 = 0.7
    expect(result.score).toBeCloseTo(0.7, 6);
    expect(result.comment).toContain("relevance=");
    expect(result.comment).toContain("completeness=");
    expect(result.comment).not.toContain("structural_quality=");
  });
});
