import { describe, it, expect } from "vitest";
import { mergeSkillTrees } from "../nodes/mergeSkillTrees.js";
import type { SkillNode } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(
  name: string,
  priority: "high" | "medium" | "low",
  subSkills: string[] = [],
  relatedConcepts: string[] = [],
): SkillNode {
  return { name, category: "test", subSkills, relatedConcepts, priority, description: `${name} desc` };
}

// ── mergeSkillTrees ───────────────────────────────────────────────────────────

describe("mergeSkillTrees", () => {
  describe("empty / trivial inputs", () => {
    it("returns empty array for no trees", () => {
      expect(mergeSkillTrees([])).toEqual([]);
    });

    it("returns empty array for a single empty tree", () => {
      expect(mergeSkillTrees([[]])).toEqual([]);
    });

    it("passes through a single tree unchanged", () => {
      const tree = [node("React", "high"), node("TypeScript", "medium")];
      const result = mergeSkillTrees([tree]);
      expect(result).toHaveLength(2);
      expect(result.map((n) => n.name)).toContain("React");
      expect(result.map((n) => n.name)).toContain("TypeScript");
    });
  });

  describe("deduplication", () => {
    it("merges duplicate nodes with the same name", () => {
      const treeA = [node("React", "high")];
      const treeB = [node("React", "medium")];
      const result = mergeSkillTrees([treeA, treeB]);
      expect(result).toHaveLength(1);
    });

    it("deduplicates case-insensitively", () => {
      const treeA = [node("React", "high")];
      const treeB = [node("react", "high")];
      const treeC = [node("REACT", "high")];
      const result = mergeSkillTrees([treeA, treeB, treeC]);
      expect(result).toHaveLength(1);
    });

    it("strips whitespace when matching names", () => {
      const result = mergeSkillTrees([[node("React ", "high")], [node(" react", "high")]]);
      expect(result).toHaveLength(1);
    });
  });

  describe("priority upgrade", () => {
    it("upgrades priority when a duplicate has higher priority", () => {
      const result = mergeSkillTrees([[node("React", "low")], [node("React", "high")]]);
      expect(result[0]!.priority).toBe("high");
    });

    it("does not downgrade priority (high stays high)", () => {
      const result = mergeSkillTrees([[node("React", "high")], [node("React", "low")]]);
      expect(result[0]!.priority).toBe("high");
    });

    it("upgrades medium to high but not low to medium", () => {
      // low + medium → medium; medium + high → high
      const result = mergeSkillTrees([
        [node("A", "low")],
        [node("A", "medium")],
      ]);
      expect(result[0]!.priority).toBe("medium");
    });
  });

  describe("subSkills merging", () => {
    it("unions subSkills from both occurrences", () => {
      const treeA = [node("React", "high", ["Hooks", "Context"])];
      const treeB = [node("React", "high", ["Redux", "Zustand"])];
      const result = mergeSkillTrees([treeA, treeB]);
      const skills = result[0]!.subSkills;
      expect(skills).toContain("Hooks");
      expect(skills).toContain("Context");
      expect(skills).toContain("Redux");
      expect(skills).toContain("Zustand");
    });

    it("deduplicates subSkills across occurrences", () => {
      const treeA = [node("React", "high", ["Hooks", "Context"])];
      const treeB = [node("React", "high", ["Hooks", "Redux"])];
      const result = mergeSkillTrees([treeA, treeB]);
      const count = result[0]!.subSkills.filter((s) => s === "Hooks").length;
      expect(count).toBe(1);
    });

    it("caps subSkills at 6", () => {
      const treeA = [node("React", "high", ["a", "b", "c", "d"])];
      const treeB = [node("React", "high", ["e", "f", "g", "h"])];
      const result = mergeSkillTrees([treeA, treeB]);
      expect(result[0]!.subSkills.length).toBeLessThanOrEqual(6);
    });
  });

  describe("relatedConcepts merging", () => {
    it("unions relatedConcepts from both occurrences", () => {
      const treeA = [node("React", "high", [], ["Vue", "Angular"])];
      const treeB = [node("React", "high", [], ["Svelte"])];
      const result = mergeSkillTrees([treeA, treeB]);
      const concepts = result[0]!.relatedConcepts;
      expect(concepts).toContain("Vue");
      expect(concepts).toContain("Angular");
      expect(concepts).toContain("Svelte");
    });

    it("deduplicates relatedConcepts", () => {
      const treeA = [node("React", "high", [], ["Vue", "Angular"])];
      const treeB = [node("React", "high", [], ["Vue", "Svelte"])];
      const result = mergeSkillTrees([treeA, treeB]);
      const count = result[0]!.relatedConcepts.filter((c) => c === "Vue").length;
      expect(count).toBe(1);
    });

    it("caps relatedConcepts at 5", () => {
      const treeA = [node("React", "high", [], ["a", "b", "c"])];
      const treeB = [node("React", "high", [], ["d", "e", "f"])];
      const result = mergeSkillTrees([treeA, treeB]);
      expect(result[0]!.relatedConcepts.length).toBeLessThanOrEqual(5);
    });
  });

  describe("sorting", () => {
    it("sorts by priority: high → medium → low", () => {
      const tree = [node("Low", "low"), node("High", "high"), node("Med", "medium")];
      const result = mergeSkillTrees([tree]);
      expect(result[0]!.priority).toBe("high");
      expect(result[1]!.priority).toBe("medium");
      expect(result[2]!.priority).toBe("low");
    });

    it("within same priority, ranks more-frequent nodes first", () => {
      // "Common" appears in 2 trees, "Rare" in 1
      const treeA = [node("Common", "high"), node("Rare", "high")];
      const treeB = [node("Common", "high")];
      const result = mergeSkillTrees([treeA, treeB]);
      const names = result.map((n) => n.name.toLowerCase());
      expect(names.indexOf("common")).toBeLessThan(names.indexOf("rare"));
    });

    it("preserves priority order even when frequency differs", () => {
      // "Low" appears 3 times but is still after "High" (appears once)
      const treeA = [node("Low", "low"), node("Low", "low"), node("High", "high")];
      const treeB = [node("Low", "low")];
      const result = mergeSkillTrees([treeA, treeB]);
      expect(result[0]!.priority).toBe("high");
    });
  });

  describe("output limit", () => {
    it("caps output at 20 nodes", () => {
      const bigTree = Array.from({ length: 25 }, (_, i) => node(`Skill${i}`, "high"));
      const result = mergeSkillTrees([bigTree]);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it("selects highest-priority nodes when capping", () => {
      const highNodes = Array.from({ length: 15 }, (_, i) => node(`High${i}`, "high"));
      const lowNodes = Array.from({ length: 10 }, (_, i) => node(`Low${i}`, "low"));
      const result = mergeSkillTrees([[...highNodes, ...lowNodes]]);
      expect(result.length).toBeLessThanOrEqual(20);
      // All high-priority nodes should be included
      const highCount = result.filter((n) => n.priority === "high").length;
      expect(highCount).toBe(15);
    });
  });

  describe("multi-tree scenarios", () => {
    it("merges three trees correctly", () => {
      const treeA = [node("React", "high"), node("Docker", "low")];
      const treeB = [node("TypeScript", "high"), node("React", "medium")];
      const treeC = [node("Docker", "high"), node("Kubernetes", "medium")];
      const result = mergeSkillTrees([treeA, treeB, treeC]);
      const names = result.map((n) => n.name.toLowerCase());
      expect(names).toContain("react");
      expect(names).toContain("docker");
      expect(names).toContain("typescript");
      expect(names).toContain("kubernetes");
      // Docker: merged low + high → high
      const docker = result.find((n) => n.name.toLowerCase() === "docker");
      expect(docker!.priority).toBe("high");
    });

    it("handles empty trees in the list without crashing", () => {
      const tree = [node("React", "high")];
      const result = mergeSkillTrees([[], tree, []]);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("React");
    });
  });
});
