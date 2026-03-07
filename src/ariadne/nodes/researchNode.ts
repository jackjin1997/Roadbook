import { TavilySearchAPIWrapper } from "@langchain/tavily";
import type { RoadbookState, ResearchResult } from "../types.js";

/**
 * Research each skill node via Tavily Search.
 * Processes high/medium priority skills first, capped at 8 to control API cost.
 * Gracefully degrades: if Tavily key is missing or a search fails, returns empty resources.
 */
export async function researchSkills(
  state: Pick<RoadbookState, "skillTree">,
): Promise<Partial<RoadbookState>> {
  if (!process.env.TAVILY_API_KEY) {
    console.warn("TAVILY_API_KEY not set — skipping research phase");
    return {
      researchResults: state.skillTree.map((s) => ({
        skillName: s.name,
        resources: [],
      })),
    };
  }

  const tavily = new TavilySearchAPIWrapper({});
  const results: ResearchResult[] = [];

  const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
  const prioritized = [...state.skillTree]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, 8);

  for (const skill of prioritized) {
    const query = `${skill.name} tutorial best practices learning resources`;
    try {
      const response = await tavily.rawResults({
        query,
        max_results: 3,
      });
      results.push({
        skillName: skill.name,
        resources: response.results.slice(0, 3).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.slice(0, 200),
        })),
      });
    } catch (err) {
      console.warn(`Research failed for "${skill.name}":`, err);
      results.push({ skillName: skill.name, resources: [] });
    }
  }

  return { researchResults: results };
}
