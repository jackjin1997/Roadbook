import { describe, it, expect } from "vitest";
import {
  structuralEvaluator,
  mermaidSyntaxEvaluator,
  markdownHygieneEvaluator,
  sectionBalanceEvaluator,
  skillCoverageEvaluator,
  resourceDensityEvaluator,
  priorityDistributionEvaluator,
  wordEfficiencyEvaluator,
} from "./heuristic.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EvalFn = (args: any) => { key: string; score: number; comment: string };

function evalArgs(output: string, input = ""): any {
  return { run: {}, example: {}, inputs: { input }, outputs: { output } };
}

// Cast evaluators to callable — they're functions, but EvaluatorT is a union with RunEvaluator class
const structural = structuralEvaluator as EvalFn;
const mermaidSyntax = mermaidSyntaxEvaluator as EvalFn;
const markdownHygiene = markdownHygieneEvaluator as EvalFn;
const sectionBalance = sectionBalanceEvaluator as EvalFn;
const skillCoverage = skillCoverageEvaluator as EvalFn;
const resourceDensity = resourceDensityEvaluator as EvalFn;
const priorityDistribution = priorityDistributionEvaluator as EvalFn;
const wordEfficiency = wordEfficiencyEvaluator as EvalFn;

/** Generate a string with approximately n words. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

// ---------------------------------------------------------------------------
// 1. structuralEvaluator
// ---------------------------------------------------------------------------
describe("structuralEvaluator", () => {
  it("scores 1.0 when H1 + 2 H2s + mermaid + 200 words present", () => {
    const md = `# Title\n\n## Section One\n\n## Section Two\n\n\`\`\`mermaid\nmindmap\n\`\`\`\n\n${words(200)}`;
    const result = structural(evalArgs(md));
    expect(result).toMatchObject({ key: "structural_quality", score: 1.0 });
  });

  it("scores 0.75 when mermaid is missing", () => {
    const md = `# Title\n\n## Section One\n\n## Section Two\n\n${words(200)}`;
    const result = structural(evalArgs(md));
    expect(result).toMatchObject({ key: "structural_quality", score: 0.75 });
  });

  it("scores 0 for empty string", () => {
    const result = structural(evalArgs(""));
    expect(result).toMatchObject({ key: "structural_quality", score: 0 });
  });

  it("gives partial credit for 1 H2 and 100+ words but no mermaid/H1", () => {
    const md = `## Only Section\n\n${words(120)}`;
    const result = structural(evalArgs(md));
    // 1 H2 = 0.1, 100+ words = 0.1
    expect(result.score).toBeCloseTo(0.2);
  });
});

// ---------------------------------------------------------------------------
// 2. mermaidSyntaxEvaluator
// ---------------------------------------------------------------------------
describe("mermaidSyntaxEvaluator", () => {
  it("scores 1.0 for a valid mindmap block", () => {
    const md = [
      "```mermaid",
      "mindmap",
      "  root(Skills)",
      "    Frontend",
      "      React",
      "```",
    ].join("\n");
    const result = mermaidSyntax(evalArgs(md));
    expect(result).toMatchObject({ key: "mermaid_syntax", score: 1.0 });
  });

  it("scores 0 when there are no mermaid blocks", () => {
    const result = mermaidSyntax(evalArgs("# Just markdown\n\nNo diagrams."));
    expect(result).toMatchObject({ key: "mermaid_syntax", score: 0 });
  });

  it("scores <1.0 for an invalid block missing diagram type", () => {
    const md = [
      "```mermaid",
      "  root(Skills)",
      "    Frontend",
      "      React",
      "```",
    ].join("\n");
    const result = mermaidSyntax(evalArgs(md));
    expect(result.score).toBeLessThan(1.0);
    expect(result.comment).toContain("missing diagram type");
  });

  it("scores 0.5 when one of two blocks is invalid", () => {
    const valid = "```mermaid\nmindmap\n  root(A)\n    B\n      C\n```";
    const invalid = "```mermaid\nno-type\n```";
    const result = mermaidSyntax(evalArgs(`${valid}\n\n${invalid}`));
    expect(result.score).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// 3. markdownHygieneEvaluator
// ---------------------------------------------------------------------------
describe("markdownHygieneEvaluator", () => {
  it("scores 1.0 for clean markdown", () => {
    const md = "# Title\n\n## Section\n\nSome text.";
    const result = markdownHygiene(evalArgs(md));
    expect(result).toMatchObject({ key: "markdown_hygiene", score: 1.0, comment: "clean" });
  });

  it("deducts 0.2 for empty links", () => {
    const md = "# Title\n\n## Section\n\n[click here]()";
    const result = markdownHygiene(evalArgs(md));
    expect(result.score).toBeCloseTo(0.8);
    expect(result.comment).toContain("empty link");
  });

  it("deducts 0.15 for heading skip", () => {
    const md = "# Title\n\n### Skipped H2";
    const result = markdownHygiene(evalArgs(md));
    expect(result.score).toBeCloseTo(0.85);
    expect(result.comment).toContain("heading skip");
  });

  it("deducts 0.3 for unclosed code fence", () => {
    const md = "# Title\n\n## Section\n\n```\ncode here";
    const result = markdownHygiene(evalArgs(md));
    expect(result.score).toBeCloseTo(0.7);
    expect(result.comment).toContain("unclosed code fence");
  });

  it("deducts 0.15 for empty heading", () => {
    const md = "# Title\n\n## \n\nSome text.";
    const result = markdownHygiene(evalArgs(md));
    expect(result.score).toBeCloseTo(0.85);
    expect(result.comment).toContain("empty heading");
  });

  it("deducts 0.1 for duplicate H2", () => {
    const md = "# Title\n\n## Resources\n\nText\n\n## Resources\n\nMore text";
    const result = markdownHygiene(evalArgs(md));
    expect(result.score).toBeCloseTo(0.9);
    expect(result.comment).toContain("duplicate H2");
  });

  it("score stays non-negative when multiple issues stack up", () => {
    // empty link (-0.2), heading skip (-0.15), unclosed fence (-0.3), empty heading (-0.15), duplicate H2 (-0.1)
    // Total penalties ≤ 0.9 → Math.max(0, ...) ensures score ≥ 0
    const md = [
      "# Title",
      "### Skipped",       // heading skip H1->H3
      "## ",               // empty heading
      "## Dup",
      "## Dup",            // duplicate H2
      "[bad]()",           // empty link
      "```",               // unclosed fence
    ].join("\n");
    const result = markdownHygiene(evalArgs(md));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(0.3);
  });
});

// ---------------------------------------------------------------------------
// 4. sectionBalanceEvaluator
// ---------------------------------------------------------------------------
describe("sectionBalanceEvaluator", () => {
  it("scores 0.1 when fewer than 2 H2 sections", () => {
    const md = "## Only one section\n\nSome text.";
    const result = sectionBalance(evalArgs(md));
    expect(result).toMatchObject({ key: "section_balance", score: 0.1 });
  });

  it("gives high score for balanced sections", () => {
    const md = `## A\n\n${words(50)}\n\n## B\n\n${words(50)}\n\n## C\n\n${words(50)}`;
    const result = sectionBalance(evalArgs(md));
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("gives low score for extremely unbalanced sections", () => {
    const md = `## Tiny\n\nhi\n\n## Huge\n\n${words(500)}`;
    const result = sectionBalance(evalArgs(md));
    expect(result.score).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// 5. skillCoverageEvaluator
// ---------------------------------------------------------------------------
describe("skillCoverageEvaluator", () => {
  it("scores 1.0 when all input terms appear in output", () => {
    const input = "React, TypeScript, Node.js";
    const output = "Learn React and TypeScript. Build with Node.js.";
    const result = skillCoverage(evalArgs(output, input));
    expect(result).toMatchObject({ key: "skill_coverage", score: 1.0 });
  });

  it("scores < 1.0 when some terms are missing", () => {
    const input = "React, TypeScript, Rust";
    const output = "Learn React framework.";
    const result = skillCoverage(evalArgs(output, input));
    expect(result.score).toBeLessThan(1.0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("scores 1.0 when there are no valid terms to check", () => {
    // All terms are filtered out (stop words or too short)
    const input = "a, or, an";
    const output = "Anything here.";
    const result = skillCoverage(evalArgs(output, input));
    expect(result).toMatchObject({ key: "skill_coverage", score: 1 });
  });
});

// ---------------------------------------------------------------------------
// 6. resourceDensityEvaluator
// ---------------------------------------------------------------------------
describe("resourceDensityEvaluator", () => {
  it("scores 0 when there are no H3 sections", () => {
    const md = "# Title\n\n## Section\n\nNo sub-sections.";
    const result = resourceDensity(evalArgs(md));
    expect(result).toMatchObject({ key: "resource_density", score: 0 });
  });

  it("scores 1.0 when every H3 has 2+ links", () => {
    const md = [
      "### React",
      "[docs](https://react.dev) [tutorial](https://react.dev/learn)",
      "### TypeScript",
      "[handbook](https://typescriptlang.org) [playground](https://typescriptlang.org/play)",
    ].join("\n");
    const result = resourceDensity(evalArgs(md));
    expect(result).toMatchObject({ key: "resource_density", score: 1.0 });
  });

  it("scores 0 when H3 sections have no links", () => {
    const md = "### React\n\nNo links here.\n\n### TypeScript\n\nStill nothing.";
    const result = resourceDensity(evalArgs(md));
    expect(result).toMatchObject({ key: "resource_density", score: 0 });
  });

  it("scores 0.5 when density is 1 link per section (half of target 2)", () => {
    const md = [
      "### React",
      "[docs](https://react.dev)",
      "### TypeScript",
      "[handbook](https://typescriptlang.org)",
    ].join("\n");
    const result = resourceDensity(evalArgs(md));
    expect(result.score).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// 7. priorityDistributionEvaluator
// ---------------------------------------------------------------------------
describe("priorityDistributionEvaluator", () => {
  it("scores 1.0 when all three priority levels present", () => {
    const md = "🔴 High\n🟡 Medium\n🟢 Low";
    const result = priorityDistribution(evalArgs(md));
    expect(result).toMatchObject({ key: "priority_distribution", score: 1.0 });
  });

  it("scores 0.8 for two balanced levels", () => {
    // 3 high, 3 medium => 2 levels, maxPct = 0.5 < 0.8
    const md = "🔴🔴🔴🟡🟡🟡";
    const result = priorityDistribution(evalArgs(md));
    expect(result.score).toBe(0.8);
  });

  it("scores 0.6 for two skewed levels", () => {
    // 9 high, 1 medium => 2 levels, maxPct = 0.9 >= 0.8
    const md = "🔴🔴🔴🔴🔴🔴🔴🔴🔴🟡";
    const result = priorityDistribution(evalArgs(md));
    expect(result.score).toBe(0.6);
  });

  it("scores 0.3 for a single level", () => {
    const md = "🔴🔴🔴";
    const result = priorityDistribution(evalArgs(md));
    expect(result.score).toBe(0.3);
  });

  it("scores 0 when no priority badges found", () => {
    const md = "No badges here.";
    const result = priorityDistribution(evalArgs(md));
    expect(result).toMatchObject({ key: "priority_distribution", score: 0 });
  });
});

// ---------------------------------------------------------------------------
// 8. wordEfficiencyEvaluator
// ---------------------------------------------------------------------------
describe("wordEfficiencyEvaluator", () => {
  it("scores 0.1 for < 100 words", () => {
    const result = wordEfficiency(evalArgs(words(50)));
    expect(result).toMatchObject({ key: "word_efficiency", score: 0.1 });
  });

  it("scores 0.4 for 100-199 words", () => {
    const result = wordEfficiency(evalArgs(words(150)));
    expect(result.score).toBe(0.4);
  });

  it("scores 0.7 for 200-299 words", () => {
    const result = wordEfficiency(evalArgs(words(250)));
    expect(result.score).toBe(0.7);
  });

  it("scores 1.0 for 300-1500 words", () => {
    const result = wordEfficiency(evalArgs(words(500)));
    expect(result.score).toBe(1.0);
  });

  it("scores 0.8 for 1501-2500 words", () => {
    const result = wordEfficiency(evalArgs(words(2000)));
    expect(result.score).toBe(0.8);
  });

  it("scores 0.5 for > 2500 words", () => {
    const result = wordEfficiency(evalArgs(words(3000)));
    expect(result.score).toBe(0.5);
  });
});
