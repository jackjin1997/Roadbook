/**
 * LangGraph StateGraph definitions for Roadbook generation workflows.
 *
 * Two compiled graphs:
 *   - roadbookGraph: single-source flow (parseInput → extractSkillTree → researchSkills → generateRoadbook)
 *   - journeyGraph: multi-source flow (extractAndMerge → researchSkills → generateRoadbook)
 *
 * Node logic remains in nodes/ — these are thin adapters.
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { parseInput } from "./nodes/parseInput.js";
import { extractSkillTree } from "./nodes/extractSkillTree.js";
import { researchSkills } from "./nodes/researchNode.js";
import { generateRoadbookMarkdown } from "./nodes/generateRoadbook.js";
import { mergeSkillTrees } from "./nodes/mergeSkillTrees.js";
import type { SkillNode, ResearchResult, InputType, ProgressCallback } from "./types.js";

// ── State Annotations ────────────────────────────────────────────────────────

export const RoadbookAnnotation = Annotation.Root({
  // Inputs
  input: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  inputType: Annotation<InputType>({ reducer: (_, b) => b, default: () => "concept" as InputType }),
  language: Annotation<string>({ reducer: (_, b) => b, default: () => "English" }),

  // Intermediate + output
  title: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  skillTree: Annotation<SkillNode[]>({ reducer: (_, b) => b, default: () => [] }),
  researchResults: Annotation<ResearchResult[]>({ reducer: (_, b) => b, default: () => [] }),
  failedSkills: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
  roadbookMarkdown: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),

  // Pass-through config (not part of graph logic, but carried in state)
  modelOverride: Annotation<{ provider: string; modelName: string } | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
  onProgress: Annotation<ProgressCallback | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),

  // Journey-specific: multiple snapshots
  snapshots: Annotation<{ text: string; language: string }[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
});

type RoadbookState = typeof RoadbookAnnotation.State;

// ── Node adapters ────────────────────────────────────────────────────────────

async function parseInputNode(state: RoadbookState) {
  state.onProgress?.({ stage: "parseInput", progress: 0, detail: "Classifying input…" });
  const parsed = parseInput({ input: state.input });
  state.onProgress?.({ stage: "parseInput", progress: 100 });
  return { inputType: parsed.inputType ?? "concept" };
}

async function extractSkillTreeNode(state: RoadbookState) {
  state.onProgress?.({ stage: "extractSkillTree", progress: 0, detail: "Extracting skill tree…" });
  const extracted = await extractSkillTree(
    { input: state.input, inputType: state.inputType, language: state.language },
    state.modelOverride,
  );
  const skillTree = extracted.skillTree ?? [];
  state.onProgress?.({ stage: "extractSkillTree", progress: 100, detail: `${skillTree.length} nodes` });
  return {
    title: extracted.title ?? "",
    skillTree,
  };
}

async function researchSkillsNode(state: RoadbookState) {
  state.onProgress?.({ stage: "researchSkills", progress: 0, detail: "Researching…" });
  const researched = await researchSkills({ skillTree: state.skillTree }, state.onProgress);
  if (researched.failedSkills.length > 0) {
    state.onProgress?.({ stage: "researchSkills", progress: 100, detail: `${researched.failedSkills.length} skill(s) failed` });
  } else {
    state.onProgress?.({ stage: "researchSkills", progress: 100 });
  }
  return {
    researchResults: researched.researchResults,
    failedSkills: researched.failedSkills,
  };
}

async function generateRoadbookNode(state: RoadbookState) {
  state.onProgress?.({ stage: "generateRoadbook", progress: 0, detail: "Generating roadbook…" });
  const result = generateRoadbookMarkdown({
    title: state.title,
    skillTree: state.skillTree,
    researchResults: state.researchResults,
    language: state.language,
  });
  state.onProgress?.({ stage: "generateRoadbook", progress: 100 });
  return {
    roadbookMarkdown: (result as { roadbookMarkdown: string }).roadbookMarkdown,
  };
}

/**
 * Journey-specific node: parallel extractSkillTree for each snapshot, then merge.
 */
async function extractAndMergeNode(state: RoadbookState) {
  const snapshots = state.snapshots;
  const onProgress = state.onProgress;

  onProgress?.({ stage: "extractSkillTree", progress: 0, detail: `0/${snapshots.length} sources` });
  let completed = 0;
  const total = snapshots.length;

  const skillTrees = await Promise.all(
    snapshots.map((s) =>
      extractSkillTree(
        { input: s.text, inputType: "article" as InputType, language: s.language },
        state.modelOverride,
      ).then((r) => {
        completed++;
        onProgress?.({ stage: "extractSkillTree", progress: Math.round((completed / total) * 100), detail: `${completed}/${total} sources` });
        return r.skillTree ?? [];
      })
    )
  );

  onProgress?.({ stage: "mergeSkillTrees", progress: 0, detail: "Merging skill trees…" });
  const merged = mergeSkillTrees(skillTrees);
  onProgress?.({ stage: "mergeSkillTrees", progress: 100, detail: `${merged.length} nodes` });

  return {
    skillTree: merged,
    language: snapshots[0]?.language ?? "English",
  };
}

// ── Graph definitions ────────────────────────────────────────────────────────

export const roadbookGraph = new StateGraph(RoadbookAnnotation)
  .addNode("parseInput", parseInputNode)
  .addNode("extractSkillTree", extractSkillTreeNode)
  .addNode("researchSkills", researchSkillsNode)
  .addNode("generateRoadbook", generateRoadbookNode)
  .addEdge(START, "parseInput")
  .addEdge("parseInput", "extractSkillTree")
  .addEdge("extractSkillTree", "researchSkills")
  .addEdge("researchSkills", "generateRoadbook")
  .addEdge("generateRoadbook", END)
  .compile();

export const journeyGraph = new StateGraph(RoadbookAnnotation)
  .addNode("extractAndMerge", extractAndMergeNode)
  .addNode("researchSkills", researchSkillsNode)
  .addNode("generateRoadbook", generateRoadbookNode)
  .addEdge(START, "extractAndMerge")
  .addEdge("extractAndMerge", "researchSkills")
  .addEdge("researchSkills", "generateRoadbook")
  .addEdge("generateRoadbook", END)
  .compile();
