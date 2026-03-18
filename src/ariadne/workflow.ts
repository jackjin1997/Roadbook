import { roadbookGraph, journeyGraph } from "./graph.js";
import type { SkillNode, ProgressCallback } from "./types.js";

export interface ModelOverride {
  provider: string;
  modelName: string;
}

export interface GenerationOutput {
  markdown: string;
  skillTree: SkillNode[];
  failedSkills: string[];
}

export async function generateRoadbook(
  input: string,
  language = "English",
  onProgress?: ProgressCallback,
  modelOverride?: ModelOverride,
): Promise<GenerationOutput> {
  const finalState = await roadbookGraph.invoke({
    input,
    language,
    onProgress,
    modelOverride,
  });

  return {
    markdown: finalState.roadbookMarkdown,
    skillTree: finalState.skillTree,
    failedSkills: finalState.failedSkills,
  };
}

/**
 * Generate a journey roadmap by merging skill trees from multiple snapshots.
 * Each snapshot is processed in parallel through extractSkillTree,
 * then merged and passed through research + generate.
 */
export async function generateJourneyRoadbook(
  snapshots: { text: string; language: string }[],
  onProgress?: ProgressCallback,
  modelOverride?: ModelOverride,
): Promise<GenerationOutput> {
  if (snapshots.length === 0) throw new Error("No snapshots provided");

  const finalState = await journeyGraph.invoke({
    snapshots,
    language: snapshots[0].language,
    onProgress,
    modelOverride,
  });

  return {
    markdown: finalState.roadbookMarkdown,
    skillTree: finalState.skillTree,
    failedSkills: finalState.failedSkills,
  };
}
