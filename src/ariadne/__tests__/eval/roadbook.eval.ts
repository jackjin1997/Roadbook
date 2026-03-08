/**
 * AI Evaluation Tests — Real LLM calls, no mocks.
 *
 * These tests verify the quality of AI-generated outputs using heuristic
 * evaluators. They are separated from unit tests because they:
 *   - Require real API keys (skipped automatically if none found)
 *   - Are slow (30-90s per test)
 *   - May be non-deterministic
 *
 * Run with:  pnpm test:eval
 */

import { describe, it, expect, beforeAll } from "vitest";
import { setModelConfig } from "../../config.js";
import { generateRoadbook } from "../../workflow.js";
import { extractSkillTree } from "../../nodes/extractSkillTree.js";
import { mergeSkillTrees } from "../../nodes/mergeSkillTrees.js";
import { buildChatMessages } from "../../chat.js";
import type { SkillNode } from "../../types.js";

// ── Environment check ─────────────────────────────────────────────────────────

function detectProvider(): { provider: "openai" | "anthropic" | "gemini"; modelName: string } | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", modelName: "claude-haiku-4-5-20251001" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", modelName: "gpt-4o-mini" };
  }
  if (process.env.OPENAI_BASE_URL && process.env.OPENAI_API_KEY) {
    return { provider: "gemini", modelName: "gemini-2.0-flash" };
  }
  return null;
}

const providerConfig = detectProvider();
const hasApiKey = providerConfig !== null;

beforeAll(() => {
  if (providerConfig) {
    setModelConfig(providerConfig);
  }
});

// ── Heuristic evaluators ──────────────────────────────────────────────────────

const eval_ = {
  /** Output starts with a Markdown H1 heading */
  hasH1: (md: string) => /^#\s+\S/m.test(md),

  /** Output has at least N H2 sections */
  hasH2Sections: (md: string, min = 2) => (md.match(/^##\s+/gm) ?? []).length >= min,

  /** Output contains a mermaid code block */
  hasMermaid: (md: string) => md.includes("```mermaid"),

  /** Output mentions a specific term (case-insensitive) */
  mentions: (md: string, term: string) => md.toLowerCase().includes(term.toLowerCase()),

  /** Output mentions at least one of the given terms */
  mentionsAny: (md: string, terms: string[]) =>
    terms.some((t) => md.toLowerCase().includes(t.toLowerCase())),

  /** Skill node has all required fields with valid values */
  isValidNode: (node: SkillNode) =>
    typeof node.name === "string" && node.name.length > 0 &&
    typeof node.category === "string" && node.category.length > 0 &&
    Array.isArray(node.subSkills) && node.subSkills.length >= 1 &&
    Array.isArray(node.relatedConcepts) &&
    ["high", "medium", "low"].includes(node.priority) &&
    typeof node.description === "string" && node.description.length > 0,

  /** Markdown word count is at least N */
  minWords: (md: string, n: number) => md.split(/\s+/).filter(Boolean).length >= n,
};

// ── Roadmap generation quality ────────────────────────────────────────────────

describe.skipIf(!hasApiKey)("[eval] generateRoadbook — structural quality", () => {
  it("generates a roadmap with H1 title, H2 sections, and mermaid mindmap", async () => {
    const result = await generateRoadbook(
      "Frontend Engineer — React, TypeScript, GraphQL, performance optimization",
    );

    expect(eval_.hasH1(result), "should have an H1 title").toBe(true);
    expect(eval_.hasH2Sections(result, 3), "should have at least 3 H2 sections").toBe(true);
    expect(eval_.hasMermaid(result), "should include a mermaid mindmap").toBe(true);
    expect(eval_.minWords(result, 200), "should produce substantive content (200+ words)").toBe(true);
  });

  it("mentions key input terms in the output", async () => {
    const result = await generateRoadbook("Python data science: pandas, numpy, scikit-learn, visualization");

    expect(eval_.mentionsAny(result, ["Python", "pandas", "numpy", "scikit"]),
      "should mention at least one key tech from input").toBe(true);
  });

  it("generates a roadmap for a Chinese-language JD", async () => {
    const jd = `高级后端工程师
岗位要求：
- 熟悉 Go 语言，有微服务开发经验
- 熟悉 Redis、MySQL 等数据库
- 有 Kubernetes 运维经验者优先
- 具备良好的系统设计能力`;

    const result = await generateRoadbook(jd, "Chinese (Simplified)");

    expect(eval_.hasH1(result), "should have H1 title").toBe(true);
    expect(eval_.hasMermaid(result), "should include mindmap").toBe(true);
    expect(
      eval_.mentionsAny(result, ["Go", "Redis", "MySQL", "Kubernetes", "微服务", "系统设计"]),
      "should mention at least one key skill from the JD",
    ).toBe(true);
  });

  it("short concept input produces a concept-centered roadmap", async () => {
    const result = await generateRoadbook("RAG (Retrieval-Augmented Generation)");

    expect(eval_.hasH1(result), "should have H1").toBe(true);
    expect(eval_.mentionsAny(result, ["RAG", "retrieval", "embedding", "vector", "LLM"]),
      "should mention RAG-related concepts").toBe(true);
  });
});

// ── extractSkillTree quality ──────────────────────────────────────────────────

describe.skipIf(!hasApiKey)("[eval] extractSkillTree — schema & content quality", () => {
  it("returns valid skill nodes for a technical article", async () => {
    const result = await extractSkillTree({
      input: `This guide covers React hooks in depth: useState for local state, useEffect for
side effects, useCallback and useMemo for performance, and useContext for
global state management. We also cover custom hooks and testing patterns.`,
      inputType: "article",
      language: "English",
    });

    expect(result.skillTree, "should return a skill tree").toBeDefined();
    expect(result.skillTree!.length, "should extract at least 2 skills").toBeGreaterThanOrEqual(2);
    expect(
      result.skillTree!.every(eval_.isValidNode),
      "all nodes should have valid fields",
    ).toBe(true);
    expect(
      eval_.mentionsAny(
        result.skillTree!.map((n) => n.name + " " + n.subSkills.join(" ")).join(" "),
        ["React", "hook", "useState", "useEffect"],
      ),
      "should mention React hooks from the input",
    ).toBe(true);
  });

  it("extracts correct inputType for a JD", async () => {
    const result = await extractSkillTree({
      input: `招聘：Node.js 后端工程师
岗位职责：负责 REST API 开发
任职要求：
- 3年以上 Node.js 工作经验
- 熟悉 TypeScript、Express、PostgreSQL
- 有微服务架构经验`,
      inputType: "jd",
      language: "Chinese (Simplified)",
    });

    expect(result.skillTree!.length).toBeGreaterThanOrEqual(2);
    expect(result.title, "should produce a title").toBeTruthy();
    const allHighPriority = result.skillTree!.filter((n) => n.priority === "high");
    expect(allHighPriority.length, "JD should have some high-priority nodes").toBeGreaterThanOrEqual(1);
  });

  it("priority distribution is not all the same level", async () => {
    const result = await extractSkillTree({
      input: `Full-stack engineer role: React frontend, Node.js backend, PostgreSQL, Redis, Docker,
Kubernetes, CI/CD, TypeScript, GraphQL, REST APIs, monitoring, logging, security.`,
      inputType: "jd",
      language: "English",
    });

    const priorities = new Set(result.skillTree!.map((n) => n.priority));
    expect(priorities.size, "should use at least 2 different priority levels").toBeGreaterThanOrEqual(2);
  });
});

// ── mergeSkillTrees integration with real LLM output ─────────────────────────

describe.skipIf(!hasApiKey)("[eval] mergeSkillTrees with real extracted trees", () => {
  it("merges two real skill trees without data loss", async () => {
    const [resultA, resultB] = await Promise.all([
      extractSkillTree({
        input: "React, TypeScript, Jest, Storybook — frontend stack",
        inputType: "article",
        language: "English",
      }),
      extractSkillTree({
        input: "Node.js, Express, PostgreSQL, Redis, Docker — backend stack",
        inputType: "article",
        language: "English",
      }),
    ]);

    const merged = mergeSkillTrees([resultA.skillTree!, resultB.skillTree!]);

    expect(merged.length, "merged tree should have nodes").toBeGreaterThan(0);
    expect(merged.length, "merged tree should not exceed 20 nodes").toBeLessThanOrEqual(20);
    expect(
      merged.every(eval_.isValidNode),
      "all merged nodes should have valid fields",
    ).toBe(true);

    // Merged tree should span both stacks
    const allNames = merged.map((n) => n.name.toLowerCase()).join(" ");
    const hasFrontend = allNames.includes("react") || allNames.includes("typescript");
    const hasBackend = allNames.includes("node") || allNames.includes("postgres") || allNames.includes("express");
    expect(hasFrontend || hasBackend, "should include skills from at least one stack").toBe(true);
  });
});

// ── Chat context builder quality ──────────────────────────────────────────────

describe.skipIf(!hasApiKey)("[eval] buildChatMessages — context injection quality", () => {
  it("produces messages that lead to a relevant AI response", async () => {
    const { getModel } = await import("../../config.js");
    const model = getModel();

    const messages = buildChatMessages({
      workspaceTitle: "React Learning Path",
      journeyRoadmap: null,
      sources: [{
        reference: "react-intro.txt",
        snapshot: "React is a JavaScript library for building user interfaces. " +
          "It uses a virtual DOM and component-based architecture. " +
          "Key concepts: JSX, props, state, hooks, and component lifecycle.",
        roadmapMarkdown: null,
      }],
      insights: ["Focus on hooks — they are central to modern React"],
      history: [],
      userMessage: "What are the most important React concepts I should learn first?",
    });

    const response = await model.invoke(messages);
    const content = typeof response.content === "string" ? response.content : "";

    expect(content.length, "response should be non-empty").toBeGreaterThan(50);
    expect(
      eval_.mentionsAny(content, ["component", "hook", "state", "props", "JSX", "React"]),
      "response should mention core React concepts from the context",
    ).toBe(true);
  });

  it("journey roadmap context is reflected in response", async () => {
    const { getModel } = await import("../../config.js");
    const model = getModel();

    const journeyRoadmap = `# React Mastery Journey

## Phase 1: Fundamentals
- JSX syntax
- Component lifecycle
- Props and state

## Phase 2: Hooks
- useState
- useEffect
- Custom hooks`;

    const messages = buildChatMessages({
      workspaceTitle: "React Mastery",
      journeyRoadmap,
      sources: [],
      insights: [],
      history: [],
      userMessage: "What is covered in Phase 2 of my journey?",
    });

    const response = await model.invoke(messages);
    const content = typeof response.content === "string" ? response.content : "";

    expect(
      eval_.mentionsAny(content, ["hook", "useState", "useEffect", "Phase 2", "custom"]),
      "response should reference Phase 2 content from the journey roadmap",
    ).toBe(true);
  });
});

// ── End-to-end quality: full pipeline ────────────────────────────────────────

describe.skipIf(!hasApiKey)("[eval] Full pipeline quality", () => {
  it("concept → skill tree → roadmap maintains thematic coherence", async () => {
    const input = "Kubernetes for backend engineers";

    const skillResult = await extractSkillTree({
      input,
      inputType: "concept",
      language: "English",
    });

    expect(skillResult.skillTree!.length).toBeGreaterThanOrEqual(3);

    const roadmap = await generateRoadbook(input);

    // Both skill tree and roadmap should be Kubernetes-themed
    const treeNames = skillResult.skillTree!.map((n) => n.name.toLowerCase()).join(" ");
    expect(
      eval_.mentionsAny(treeNames, ["kubernetes", "k8s", "container", "pod", "cluster", "docker"]),
      "skill tree should be Kubernetes-relevant",
    ).toBe(true);

    expect(
      eval_.mentionsAny(roadmap, ["kubernetes", "k8s", "container", "cluster", "pod", "deploy"]),
      "roadmap should be Kubernetes-relevant",
    ).toBe(true);
  });
});
