import type { SkillNode } from "../types.js";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * Merge multiple skill trees into one unified tree.
 * - Nodes with the same name (case-insensitive) are merged
 * - Priority: take the highest across all occurrences
 * - subSkills / relatedConcepts: union, deduped, capped at 6/5
 * - Max 20 output nodes, sorted by priority then frequency
 */
export function mergeSkillTrees(skillTrees: SkillNode[][]): SkillNode[] {
  const map = new Map<string, { node: SkillNode; count: number }>();

  for (const tree of skillTrees) {
    for (const node of tree) {
      const key = node.name.toLowerCase().trim();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { node: { ...node }, count: 1 });
      } else {
        const e = existing.node;
        // Upgrade priority if higher
        if (PRIORITY_RANK[node.priority] < PRIORITY_RANK[e.priority]) {
          e.priority = node.priority;
        }
        // Union subSkills
        const subSet = new Set([...e.subSkills, ...node.subSkills]);
        e.subSkills = [...subSet].slice(0, 6);
        // Union relatedConcepts
        const relSet = new Set([...e.relatedConcepts, ...node.relatedConcepts]);
        e.relatedConcepts = [...relSet].slice(0, 5);
        existing.count += 1;
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      const pd = PRIORITY_RANK[a.node.priority] - PRIORITY_RANK[b.node.priority];
      return pd !== 0 ? pd : b.count - a.count;
    })
    .slice(0, 20)
    .map((e) => e.node);
}
