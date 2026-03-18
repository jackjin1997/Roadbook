import { TavilySearchAPIWrapper } from "@langchain/tavily";
import type { RoadbookState, ResearchResult, ProgressCallback } from "../types.js";
import { withRetry } from "../utils.js";

const TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const MAX_SKILLS = 5;

/**
 * Research each skill node via Tavily Search.
 * Processes high/medium priority skills first, capped at MAX_SKILLS.
 * Retries failed searches up to MAX_RETRIES times with exponential backoff.
 * Returns { researchResults, failedSkills } — failedSkills lists names that got 0 resources.
 */
export async function researchSkills(
  state: Pick<RoadbookState, "skillTree">,
  onProgress?: ProgressCallback,
): Promise<Pick<RoadbookState, "researchResults" | "failedSkills">> {
  if (!process.env.TAVILY_API_KEY) {
    console.warn("TAVILY_API_KEY not set — skipping research phase");
    return {
      researchResults: state.skillTree.map((s) => ({
        skillName: s.name,
        resources: [],
      })),
      failedSkills: state.skillTree.map((s) => s.name),
    };
  }

  const tavily = new TavilySearchAPIWrapper({});

  const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
  const prioritized = [...state.skillTree]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, MAX_SKILLS);

  let researched = 0;
  const total = prioritized.length;

  const settled = await Promise.allSettled(
    prioritized.map(async (skill) => {
      const query = `${skill.name} tutorial best practices learning resources`;
      const search = () => {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
        );
        return Promise.race([
          tavily.rawResults({ query, max_results: 3 }),
          timeoutPromise,
        ]);
      };

      const response = await withRetry(search, MAX_RETRIES);
      researched++;
      onProgress?.({ stage: "researchSkills", progress: Math.round((researched / total) * 100), detail: `${researched}/${total}: ${skill.name}` });
      return {
        skillName: skill.name,
        resources: response.results.slice(0, 3).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 200),
        })),
      };
    })
  );

  const failedSkills: string[] = [];
  const results: ResearchResult[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`Research failed for "${prioritized[i]!.name}" after ${MAX_RETRIES + 1} attempts:`, r.reason);
    failedSkills.push(prioritized[i]!.name);
    return { skillName: prioritized[i]!.name, resources: [] };
  });

  return { researchResults: results, failedSkills };
}
