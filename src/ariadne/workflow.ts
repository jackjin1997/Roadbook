import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { parseInput } from "./nodes/parseInput.js";
import { extractSkillTree } from "./nodes/extractSkillTree.js";
import { researchSkills } from "./nodes/researchNode.js";
import { generateRoadbookMarkdown } from "./nodes/generateRoadbook.js";
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
