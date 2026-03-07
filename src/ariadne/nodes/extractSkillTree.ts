import { getModel } from "../config.js";
import { SkillTreeOutputSchema } from "../types.js";
import type { RoadbookState } from "../types.js";

function buildSystemPrompt(language: string): string {
  return `You are Ariadne, a professional technical skill tree analysis engine.

Your task is to extract a structured skill tree from the user's input text. Apply different strategies based on input type:

- **JD (Job Description)**: Extract core required skills and nice-to-haves, ranked by priority
- **Resume/Project**: Identify the tech stack involved, find knowledge gaps that need review
- **Technical Article**: Extract core concepts and prerequisite knowledge dependencies
- **Concept**: Expand a knowledge graph centered on that concept

For each skill node:
1. Provide a clear category (e.g. Language, Framework, Infrastructure, Design Pattern, AI/ML, etc.)
2. List 2-5 sub-skills
3. List 2-3 related concepts
4. Assess learning priority (high/medium/low)
5. Write a brief 1-2 sentence description

Output 6-15 skill nodes covering the core knowledge areas of the input.

IMPORTANT: Write all text fields (title, category, description, subSkills, relatedConcepts) in **${language}**. Keep technical proper nouns (library names, API names, acronyms) in their original English form.

Output must be valid JSON with this structure:
{
  "inputType": "jd" | "article" | "resume" | "concept",
  "title": "roadbook title in ${language}",
  "skillTree": [
    {
      "name": "skill name (keep English technical terms)",
      "category": "category in ${language}",
      "subSkills": ["sub-skill in ${language}"],
      "relatedConcepts": ["concept in ${language}"],
      "priority": "high" | "medium" | "low",
      "description": "description in ${language}"
    }
  ]
}`;
}

export async function extractSkillTree(
  state: Pick<RoadbookState, "input" | "inputType" | "language">,
): Promise<Partial<RoadbookState>> {
  const model = getModel();
  const structured = model.withStructuredOutput(SkillTreeOutputSchema, {
    method: "jsonMode",
  });

  const result = await structured.invoke([
    { role: "system", content: buildSystemPrompt(state.language ?? "English") },
    {
      role: "user",
      content: `Input type: ${state.inputType}\n\n---\n\n${state.input}`,
    },
  ]);

  return {
    inputType: result.inputType,
    title: result.title,
    skillTree: result.skillTree,
  };
}
