import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { parseInput } from "./nodes/parseInput.js";
import { extractSkillTree } from "./nodes/extractSkillTree.js";
import { researchSkills } from "./nodes/researchNode.js";
import { generateRoadbookMarkdown } from "./nodes/generateRoadbook.js";
import { mergeSkillTrees } from "./nodes/mergeSkillTrees.js";
import type { SkillNode, InputType, ResearchResult } from "./types.js";

const RoadbookAnnotation = Annotation.Root({
  input: Annotation<string>,
  inputType: Annotation<InputType>({
    reducer: (_prev, next) => next,
    default: () => "concept" as InputType,
  }),
  language: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "English",
  }),
  title: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  skillTree: Annotation<SkillNode[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  researchResults: Annotation<ResearchResult[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  roadbookMarkdown: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

type RoadbookState = typeof RoadbookAnnotation.State;

function buildWorkflow() {
  const workflow = new StateGraph(RoadbookAnnotation)
    .addNode("parseInput", (state: RoadbookState) => {
      return parseInput(state);
    })
    .addNode("extractSkillTree", async (state: RoadbookState) => {
      return await extractSkillTree(state);
    })
    .addNode("researchSkills", async (state: RoadbookState) => {
      return await researchSkills(state);
    })
    .addNode("generateRoadbook", (state: RoadbookState) => {
      return generateRoadbookMarkdown(state);
    })
    .addEdge(START, "parseInput")
    .addEdge("parseInput", "extractSkillTree")
    .addEdge("extractSkillTree", "researchSkills")
    .addEdge("researchSkills", "generateRoadbook")
    .addEdge("generateRoadbook", END);

  return workflow.compile();
}

const graph = buildWorkflow();

export async function generateRoadbook(input: string, language = "English"): Promise<string> {
  const result = await graph.invoke({ input, language });
  return result.roadbookMarkdown;
}

/**
 * Generate a journey roadmap by merging skill trees from multiple snapshots.
 * Each snapshot is processed in parallel through extractSkillTree,
 * then merged and passed through research + generate.
 */
export async function generateJourneyRoadbook(
  snapshots: { text: string; language: string }[],
): Promise<string> {
  if (snapshots.length === 0) throw new Error("No snapshots provided");

  // Use the most common language, fallback to first
  const language = snapshots[0].language;

  // Parallel extractSkillTree for each snapshot
  const skillTrees = await Promise.all(
    snapshots.map((s) =>
      extractSkillTree({ input: s.text, inputType: "article", language: s.language })
        .then((r) => r.skillTree ?? [])
    )
  );

  const merged = mergeSkillTrees(skillTrees);

  // Run research + generate on merged tree via a minimal state
  const state = {
    input: snapshots.map((s) => s.text).join("\n\n---\n\n").slice(0, 2000),
    inputType: "article" as InputType,
    language,
    title: "",
    skillTree: merged,
    researchResults: [] as ResearchResult[],
    roadbookMarkdown: "",
  };

  const researched = await researchSkills(state);
  const final = generateRoadbookMarkdown({ ...state, ...researched });
  return (final as { roadbookMarkdown: string }).roadbookMarkdown;
}
