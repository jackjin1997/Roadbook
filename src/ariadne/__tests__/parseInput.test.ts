import { describe, it, expect } from "vitest";
import { parseInput } from "../nodes/parseInput.js";

describe("parseInput / classifyInput", () => {
  describe("JD classification", () => {
    it("classifies text with 3+ JD signals as jd", () => {
      const input = "Senior Node.js 工程师 职位 岗位要求 全职 remote 工作经验 5年 薪资面议";
      const result = parseInput({ input });
      expect(result.inputType).toBe("jd");
    });

    it("classifies English JD as jd", () => {
      const input =
        "Software Engineer position. responsibilities include building APIs. requirements: " +
        "5 years of experience. qualifications include TypeScript. full-time remote job. salary negotiable.";
      const result = parseInput({ input });
      expect(result.inputType).toBe("jd");
    });
  });

  describe("Resume classification", () => {
    it("classifies text with 3+ resume signals as resume", () => {
      const input =
        "简历 工作经历 2020-2023 负责后端架构 参与微服务改造 主导性能优化 优化了QPS提升30%";
      const result = parseInput({ input });
      expect(result.inputType).toBe("resume");
    });

    it("classifies English resume as resume", () => {
      const input =
        "resume education Bachelor's Degree. work history: led backend team. " +
        "负责 cloud infrastructure. 参与 microservices migration. 实现了 10x performance boost.";
      const result = parseInput({ input });
      expect(result.inputType).toBe("resume");
    });
  });

  describe("Concept classification", () => {
    it("classifies short text (<= 20 words) as concept", () => {
      const input = "LangGraph.js";
      const result = parseInput({ input });
      expect(result.inputType).toBe("concept");
    });

    it("classifies short phrase as concept", () => {
      const input = "RAG vs Fine-tuning tradeoffs";
      const result = parseInput({ input });
      expect(result.inputType).toBe("concept");
    });
  });

  describe("Article classification", () => {
    it("classifies long text without JD/resume signals as article", () => {
      const input =
        "LangGraph provides a powerful abstraction for building stateful multi-agent workflows. " +
        "Unlike simple chain-of-thought approaches, it models the execution as a directed graph " +
        "where each node represents a processing step. The state is passed between nodes and " +
        "can be modified at each step. This enables complex patterns like branching, looping, " +
        "and parallel execution that are difficult to express with linear chains.";
      const result = parseInput({ input });
      expect(result.inputType).toBe("article");
    });
  });

  describe("edge cases", () => {
    it("returns inputType key in result", () => {
      const result = parseInput({ input: "React" });
      expect(result).toHaveProperty("inputType");
    });

    it("does not modify state — only returns inputType", () => {
      const result = parseInput({ input: "React hooks patterns" });
      expect(Object.keys(result)).toEqual(["inputType"]);
    });
  });
});
