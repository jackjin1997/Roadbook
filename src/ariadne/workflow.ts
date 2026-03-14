import { parseInput } from "./nodes/parseInput.js";
import { extractSkillTree } from "./nodes/extractSkillTree.js";
import { researchSkills } from "./nodes/researchNode.js";
import { generateRoadbookMarkdown } from "./nodes/generateRoadbook.js";
import { mergeSkillTrees } from "./nodes/mergeSkillTrees.js";
import type { InputType, ResearchResult, ProgressCallback } from "./types.js";

export async function generateRoadbook(
  input: string,
  language = "English",
  onProgress?: ProgressCallback,
): Promise<string> {
  // 1. Parse input
  onProgress?.({ stage: "parseInput", progress: 0, detail: "Classifying input…" });
  const parsed = parseInput({ input });
  const inputType = parsed.inputType ?? "concept";
  onProgress?.({ stage: "parseInput", progress: 100 });

  // 2. Extract skill tree
  onProgress?.({ stage: "extractSkillTree", progress: 0, detail: "Extracting skill tree…" });
  const extracted = await extractSkillTree({ input, inputType, language });
  const skillTree = extracted.skillTree ?? [];
  const title = extracted.title ?? "";
  onProgress?.({ stage: "extractSkillTree", progress: 100, detail: `${skillTree.length} nodes` });

  // 3. Research skills
  onProgress?.({ stage: "researchSkills", progress: 0, detail: "Researching…" });
  const researched = await researchSkills({ skillTree }, onProgress);
  onProgress?.({ stage: "researchSkills", progress: 100 });

  // 4. Generate roadbook markdown
  onProgress?.({ stage: "generateRoadbook", progress: 0, detail: "Generating roadbook…" });
  const result = generateRoadbookMarkdown({
    title,
    skillTree,
    researchResults: researched.researchResults ?? [],
    language,
  });
  onProgress?.({ stage: "generateRoadbook", progress: 100 });

  return (result as { roadbookMarkdown: string }).roadbookMarkdown;
}

/**
 * Generate a journey roadmap by merging skill trees from multiple snapshots.
 * Each snapshot is processed in parallel through extractSkillTree,
 * then merged and passed through research + generate.
 */
export async function generateJourneyRoadbook(
  snapshots: { text: string; language: string }[],
  onProgress?: ProgressCallback,
): Promise<string> {
  if (snapshots.length === 0) throw new Error("No snapshots provided");

  const language = snapshots[0].language;

  // Parallel extractSkillTree for each snapshot
  onProgress?.({ stage: "extractSkillTree", progress: 0, detail: `0/${snapshots.length} sources` });
  let completed = 0;
  const total = snapshots.length;

  const skillTrees = await Promise.all(
    snapshots.map((s) =>
      extractSkillTree({ input: s.text, inputType: "article", language: s.language })
        .then((r) => {
          completed++;
          onProgress?.({ stage: "extractSkillTree", progress: Math.round((completed / total) * 100), detail: `${completed}/${total} sources` });
          return r.skillTree ?? [];
        })
    )
  );

  // Merge
  onProgress?.({ stage: "mergeSkillTrees", progress: 0, detail: "Merging skill trees…" });
  const merged = mergeSkillTrees(skillTrees);
  onProgress?.({ stage: "mergeSkillTrees", progress: 100, detail: `${merged.length} nodes` });

  // Research
  onProgress?.({ stage: "researchSkills", progress: 0, detail: "Researching…" });
  const state = {
    input: snapshots.map((s) => s.text).join("\n\n---\n\n").slice(0, 2000),
    inputType: "article" as InputType,
    language,
    title: "",
    skillTree: merged,
    researchResults: [] as ResearchResult[],
    roadbookMarkdown: "",
  };
  const researched = await researchSkills(state, onProgress);
  onProgress?.({ stage: "researchSkills", progress: 100 });

  // Generate
  onProgress?.({ stage: "generateRoadbook", progress: 0, detail: "Generating roadbook…" });
  const final = generateRoadbookMarkdown({ ...state, ...researched });
  onProgress?.({ stage: "generateRoadbook", progress: 100 });

  return (final as { roadbookMarkdown: string }).roadbookMarkdown;
}
