import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { getModel } from "./config.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SourceContext {
  reference: string;
  snapshot: string;
  roadmapMarkdown: string | null;
}

interface BuildOptions {
  workspaceTitle: string;
  journeyRoadmap: string | null;
  sources: SourceContext[];          // ordered by priority (caller decides)
  insights: string[];
  history: ChatMessage[];
  userMessage: string;
  language?: string;
}

const BUDGET = 60_000;
const JOURNEY_ROADMAP_BUDGET = 8_000;
const SOURCE_ROADMAP_BUDGET = 6_000;
const INSIGHTS_BUDGET = 2_000;
const MIN_REMAINING = 200;

/**
 * Progressively fill the system context up to BUDGET chars.
 * Priority: journey roadmap → source roadmaps → insights → source snapshots
 */
function buildContext(
  journeyRoadmap: string | null,
  sources: SourceContext[],
  insights: string[],
): string {
  let ctx = "";

  // P1: journey roadmap
  if (journeyRoadmap) {
    ctx += `## Journey Roadmap\n${journeyRoadmap.slice(0, JOURNEY_ROADMAP_BUDGET)}\n\n`;
  }

  // P2: source roadmaps
  for (const s of sources) {
    if (!s.roadmapMarkdown) continue;
    const remaining = BUDGET - ctx.length;
    if (remaining < MIN_REMAINING) break;
    ctx += `## Roadmap: ${s.reference}\n${s.roadmapMarkdown.slice(0, Math.min(SOURCE_ROADMAP_BUDGET, remaining))}\n\n`;
  }

  // P3: insights
  if (insights.length > 0) {
    const insightsBlock = `## Insights\n${insights.map((ins) => `- ${ins}`).join("\n")}`;
    const remaining = BUDGET - ctx.length;
    if (remaining > MIN_REMAINING) ctx += insightsBlock.slice(0, Math.min(INSIGHTS_BUDGET, remaining)) + "\n\n";
  }

  // P4: source snapshots (split remaining budget evenly)
  const snapSources = sources.filter((s) => s.snapshot);
  const perSource = Math.floor((BUDGET - ctx.length) / Math.max(snapSources.length, 1));
  for (const s of snapSources) {
    const remaining = BUDGET - ctx.length;
    if (remaining < MIN_REMAINING) {
      ctx += `[Source: ${s.reference} — content exceeds context limit]\n\n`;
      continue;
    }
    ctx += `## Source: ${s.reference}\n${s.snapshot.slice(0, Math.min(perSource, remaining))}\n\n`;
  }

  return ctx.trim();
}

export function buildChatMessages(opts: BuildOptions): BaseMessage[] {
  const { workspaceTitle, journeyRoadmap, sources, insights, history, userMessage, language } = opts;

  const context = buildContext(journeyRoadmap, sources, insights);

  const lang = language || "English";

  let system = `You are Ariadne, an AI assistant embedded in Roadbook — a learning roadmap generator.
You are helping the user with their journey: "${workspaceTitle}".

You can:
- Answer questions about the source material or roadbook
- Suggest improvements or additions to the roadbook
- Generate an updated roadbook when asked

If the user asks you to update or rewrite the roadbook, output the full updated Markdown wrapped in <roadbook>...</roadbook> tags. Otherwise reply normally.

IMPORTANT: Always respond in **${lang}**. Match the user's language.`;

  if (context) system += `\n\n${context}`;

  const messages: BaseMessage[] = [new SystemMessage(system)];
  for (const msg of history) {
    messages.push(msg.role === "user" ? new HumanMessage(msg.content) : new AIMessage(msg.content));
  }
  messages.push(new HumanMessage(userMessage));
  return messages;
}

const ROADBOOK_RE = /<roadbook>([\s\S]*?)<\/roadbook>/;

export function extractRoadbookUpdate(reply: string): string | null {
  const match = reply.match(ROADBOOK_RE);
  return match ? match[1].trim() : null;
}

export function stripRoadbookBlock(reply: string): string {
  return reply.replace(ROADBOOK_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export async function* chatStream(opts: BuildOptions): AsyncGenerator<string> {
  const messages = buildChatMessages(opts);
  const model = getModel();
  const stream = await model.stream(messages);
  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (text) yield text;
  }
}
