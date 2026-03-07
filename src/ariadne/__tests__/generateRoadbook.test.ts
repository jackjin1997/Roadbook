import { describe, it, expect } from "vitest";
import { generateRoadbookMarkdown } from "../nodes/generateRoadbook.js";
import type { SkillNode, ResearchResult } from "../types.js";

const mockSkills: SkillNode[] = [
  {
    name: "LangGraph.js",
    category: "框架",
    subSkills: ["StateGraph", "Annotation", "Edges"],
    relatedConcepts: ["LangChain", "Agent Orchestration"],
    priority: "high",
    description: "基于状态机的 AI 工作流编排框架",
  },
  {
    name: "TypeScript",
    category: "编程语言",
    subSkills: ["Generics", "Type Guards", "Decorators"],
    relatedConcepts: ["JavaScript", "Static Typing"],
    priority: "medium",
    description: "带类型系统的 JavaScript 超集",
  },
  {
    name: "Docker",
    category: "基础设施",
    subSkills: ["Dockerfile", "Compose", "Networking"],
    relatedConcepts: ["Kubernetes", "Containerization"],
    priority: "low",
    description: "容器化部署工具",
  },
];

const mockResearch: ResearchResult[] = [
  {
    skillName: "LangGraph.js",
    resources: [
      {
        title: "LangGraph.js Official Docs",
        url: "https://langchain-ai.github.io/langgraphjs/",
        snippet: "Build stateful, multi-actor applications with LLMs.",
      },
    ],
  },
];

describe("generateRoadbookMarkdown", () => {
  it("returns roadbookMarkdown in result", () => {
    const result = generateRoadbookMarkdown({
      title: "测试路书",
      skillTree: mockSkills,
      researchResults: [],
    });
    expect(result).toHaveProperty("roadbookMarkdown");
    expect(typeof result.roadbookMarkdown).toBe("string");
  });

  it("includes the title as H1 heading", () => {
    const result = generateRoadbookMarkdown({
      title: "AI 工程师路书",
      skillTree: mockSkills,
      researchResults: [],
    });
    expect(result.roadbookMarkdown).toContain("# AI 工程师路书");
  });

  it("includes mermaid mindmap block", () => {
    const result = generateRoadbookMarkdown({
      title: "测试",
      skillTree: mockSkills,
      researchResults: [],
    });
    expect(result.roadbookMarkdown).toContain("```mermaid");
    expect(result.roadbookMarkdown).toContain("mindmap");
    expect(result.roadbookMarkdown).toContain("root((测试))");
  });

  it("sorts skills by priority: high → medium → low", () => {
    const result = generateRoadbookMarkdown({
      title: "排序测试",
      skillTree: mockSkills,
      researchResults: [],
    });
    const md = result.roadbookMarkdown!;
    const highIdx = md.indexOf("LangGraph.js");
    const medIdx = md.indexOf("TypeScript");
    const lowIdx = md.indexOf("Docker");
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it("includes priority badges in skill sections", () => {
    const result = generateRoadbookMarkdown({
      title: "徽章测试",
      skillTree: mockSkills,
      researchResults: [],
    });
    expect(result.roadbookMarkdown).toContain("🔴 高优先级");
    expect(result.roadbookMarkdown).toContain("🟡 中优先级");
    expect(result.roadbookMarkdown).toContain("🟢 低优先级");
  });

  it("includes sub-skills as list items", () => {
    const result = generateRoadbookMarkdown({
      title: "子技能测试",
      skillTree: [mockSkills[0]!],
      researchResults: [],
    });
    expect(result.roadbookMarkdown).toContain("- StateGraph");
    expect(result.roadbookMarkdown).toContain("- Annotation");
  });

  it("includes research resources when available", () => {
    const result = generateRoadbookMarkdown({
      title: "资源测试",
      skillTree: mockSkills,
      researchResults: mockResearch,
    });
    expect(result.roadbookMarkdown).toContain("推荐资源");
    expect(result.roadbookMarkdown).toContain("[LangGraph.js Official Docs]");
    expect(result.roadbookMarkdown).toContain("https://langchain-ai.github.io/langgraphjs/");
  });

  it("skips resource section when research is empty", () => {
    const result = generateRoadbookMarkdown({
      title: "无资源测试",
      skillTree: [mockSkills[1]!],
      researchResults: [],
    });
    expect(result.roadbookMarkdown).not.toContain("推荐资源");
  });

  it("groups skills by category in mindmap", () => {
    const result = generateRoadbookMarkdown({
      title: "分类测试",
      skillTree: mockSkills,
      researchResults: [],
    });
    expect(result.roadbookMarkdown).toContain("框架");
    expect(result.roadbookMarkdown).toContain("编程语言");
    expect(result.roadbookMarkdown).toContain("基础设施");
  });

  it("handles empty skill tree gracefully", () => {
    const result = generateRoadbookMarkdown({
      title: "空技能树",
      skillTree: [],
      researchResults: [],
    });
    expect(result.roadbookMarkdown).toContain("共 0 个技能节点");
  });
});
