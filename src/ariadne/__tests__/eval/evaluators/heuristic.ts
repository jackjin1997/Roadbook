/**
 * Heuristic evaluators — fast, deterministic, no LLM call.
 */

import type { EvaluatorT } from "langsmith/evaluation";
import type { EvalArgs } from "../config.js";

/** 1. Structural quality — H1, H2 sections, Mermaid, word count. */
export const structuralEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
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

/** 2. Mermaid syntax validation — checks block well-formedness. */
export const mermaidSyntaxEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
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

/** 3. Markdown hygiene — heading hierarchy, empty links, unclosed fences. */
export const markdownHygieneEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  let score = 1.0;
  const issues: string[] = [];

  const emptyLinks = md.match(/\[.*?\]\(\s*\)/g);
  if (emptyLinks) {
    score -= 0.2;
    issues.push(`${emptyLinks.length} empty link(s)`);
  }

  const headings = [...md.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1) {
      score -= 0.15;
      issues.push(`heading skip: H${headings[i - 1]}→H${headings[i]}`);
      break;
    }
  }

  const fenceCount = (md.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) {
    score -= 0.3;
    issues.push("unclosed code fence");
  }

  const emptyHeadings = md.match(/^#{1,6}\s*$/gm);
  if (emptyHeadings) {
    score -= 0.15;
    issues.push(`${emptyHeadings.length} empty heading(s)`);
  }

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

/** 4. Section balance — variance in H2 section word counts. */
export const sectionBalanceEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
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

  const score = Math.max(0, Math.min(1, 1 - cv * 0.7));

  return {
    key: "section_balance",
    score,
    comment: `${h2Sections.length} sections, words=[${lengths.join(",")}], CV=${cv.toFixed(2)}`,
  };
};

/** 5. Skill coverage — checks that key terms from the input appear in the output. */
export const skillCoverageEvaluator: EvaluatorT = ({ inputs, outputs }: EvalArgs) => {
  const md = ((outputs?.output as string) ?? "").toLowerCase();
  const input = ((inputs?.input as string) ?? "").toLowerCase();

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

/** 6. Resource density — average external links per skill section. */
export const resourceDensityEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const h3Count = (md.match(/^### /gm) ?? []).length;
  const linkCount = (md.match(/\[.+?\]\(https?:\/\/.+?\)/g) ?? []).length;

  if (h3Count === 0) {
    return { key: "resource_density", score: 0, comment: "No H3 skill sections" };
  }

  const density = linkCount / h3Count;
  const score = Math.min(1, density / 2);

  return {
    key: "resource_density",
    score,
    comment: `${linkCount} links across ${h3Count} sections (${density.toFixed(1)}/section)`,
  };
};

/** 7. Priority distribution — checks that skills aren't all same priority. */
export const priorityDistributionEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";

  const high = (md.match(/🔴/g) ?? []).length;
  const medium = (md.match(/🟡/g) ?? []).length;
  const low = (md.match(/🟢/g) ?? []).length;
  const total = high + medium + low;

  if (total === 0) {
    return { key: "priority_distribution", score: 0, comment: "No priority badges found" };
  }

  const levels = [high, medium, low].filter((n) => n > 0).length;
  const maxPct = Math.max(high, medium, low) / total;
  const score = levels >= 3 ? 1.0 : levels === 2 ? (maxPct < 0.8 ? 0.8 : 0.6) : 0.3;

  return {
    key: "priority_distribution",
    score,
    comment: `🔴=${high} 🟡=${medium} 🟢=${low} (${levels} levels, max=${(maxPct * 100).toFixed(0)}%)`,
  };
};

/** 8. Word efficiency — penalizes overly bloated or too-terse outputs. */
export const wordEfficiencyEvaluator: EvaluatorT = ({ outputs }: EvalArgs) => {
  const md = (outputs?.output as string) ?? "";
  const wordCount = md.split(/\s+/).filter(Boolean).length;

  let score: number;
  if (wordCount < 100) score = 0.1;
  else if (wordCount < 200) score = 0.4;
  else if (wordCount < 300) score = 0.7;
  else if (wordCount <= 1500) score = 1.0;
  else if (wordCount <= 2500) score = 0.8;
  else score = 0.5;

  return {
    key: "word_efficiency",
    score,
    comment: `${wordCount} words (sweet spot: 300-1500)`,
  };
};
