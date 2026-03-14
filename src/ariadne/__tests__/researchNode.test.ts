import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock Tavily ──────────────────────────────────────────────────────────────

const mockRawResults = vi.fn();
vi.mock("@langchain/tavily", () => ({
  TavilySearchAPIWrapper: vi.fn(function () { this.rawResults = mockRawResults; }),
}));

import { researchSkills } from "../nodes/researchNode.js";
import type { SkillNode } from "../types.js";

const makeSkill = (name: string, priority: "high" | "medium" | "low" = "medium"): SkillNode => ({
  name, category: "Test", subSkills: [], relatedConcepts: [],
  priority, description: `${name} skill`,
});

const tavilyResult = (title: string) => ({
  results: [
    { title, url: `https://example.com/${title.toLowerCase()}`, content: "A".repeat(300) },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  process.env.TAVILY_API_KEY = "test-key";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TAVILY_API_KEY;
});

describe("researchSkills", () => {
  it("skips research when TAVILY_API_KEY is not set", async () => {
    delete process.env.TAVILY_API_KEY;

    const result = await researchSkills({
      skillTree: [makeSkill("TypeScript")],
    });

    expect(result.researchResults).toHaveLength(1);
    expect(result.researchResults![0].resources).toHaveLength(0);
    expect(result.failedSkills).toEqual(["TypeScript"]);
    expect(mockRawResults).not.toHaveBeenCalled();
  });

  it("researches skills and returns resources", async () => {
    mockRawResults.mockResolvedValue(tavilyResult("TypeScript Guide"));

    const result = await researchSkills({
      skillTree: [makeSkill("TypeScript", "high")],
    });

    expect(result.researchResults).toHaveLength(1);
    expect(result.researchResults![0].skillName).toBe("TypeScript");
    expect(result.researchResults![0].resources).toHaveLength(1);
    expect(result.researchResults![0].resources[0].title).toBe("TypeScript Guide");
    expect(result.failedSkills).toBeUndefined();
  });

  it("prioritizes high > medium > low and caps at MAX_SKILLS=5", async () => {
    mockRawResults.mockResolvedValue(tavilyResult("Result"));

    const skills = [
      makeSkill("low1", "low"),
      makeSkill("high1", "high"),
      makeSkill("med1", "medium"),
      makeSkill("high2", "high"),
      makeSkill("low2", "low"),
      makeSkill("med2", "medium"),
      makeSkill("low3", "low"),
      makeSkill("med3", "medium"),
    ];

    const result = await researchSkills({ skillTree: skills });

    // Should only research 5 skills, prioritized
    expect(result.researchResults).toHaveLength(5);
    const names = result.researchResults!.map((r) => r.skillName);
    // high first, then medium, then low
    expect(names[0]).toBe("high1");
    expect(names[1]).toBe("high2");
  });

  it("truncates snippet to 200 chars", async () => {
    mockRawResults.mockResolvedValue({
      results: [{ title: "Long", url: "https://example.com", content: "B".repeat(500) }],
    });

    const result = await researchSkills({ skillTree: [makeSkill("Test", "high")] });

    expect(result.researchResults![0].resources[0].snippet).toHaveLength(200);
  });

  it("reports failed skills when search throws", async () => {
    mockRawResults.mockRejectedValue(new Error("API error"));

    const result = await researchSkills({
      skillTree: [makeSkill("Failing", "high")],
    });

    expect(result.researchResults).toHaveLength(1);
    expect(result.researchResults![0].resources).toHaveLength(0);
    expect(result.failedSkills).toEqual(["Failing"]);
  });

  it("calls onProgress callback", async () => {
    mockRawResults.mockResolvedValue(tavilyResult("Result"));
    const onProgress = vi.fn();

    await researchSkills(
      { skillTree: [makeSkill("Skill1", "high"), makeSkill("Skill2", "medium")] },
      onProgress,
    );

    expect(onProgress).toHaveBeenCalled();
    const calls = onProgress.mock.calls;
    expect(calls.some(([p]: any) => p.stage === "researchSkills")).toBe(true);
  });

  it("limits results to 3 per skill", async () => {
    mockRawResults.mockResolvedValue({
      results: Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i}`, url: `https://example.com/${i}`, content: "content",
      })),
    });

    const result = await researchSkills({ skillTree: [makeSkill("Many", "high")] });

    expect(result.researchResults![0].resources).toHaveLength(3);
  });

  it("handles mixed success and failure", async () => {
    let callCount = 0;
    mockRawResults.mockImplementation(() => {
      callCount++;
      if (callCount <= 3) return Promise.resolve(tavilyResult("OK")); // skill 1 succeeds (may have retries)
      return Promise.reject(new Error("fail"));
    });

    const result = await researchSkills({
      skillTree: [makeSkill("OK Skill", "high"), makeSkill("Bad Skill", "medium")],
    });

    expect(result.researchResults).toHaveLength(2);
    // At least one should have succeeded
    const succeeded = result.researchResults!.filter((r) => r.resources.length > 0);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
  });
});
