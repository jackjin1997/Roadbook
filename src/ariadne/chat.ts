import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { getModel } from "./config.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface BuildOptions {
  workspaceTitle: string;
  sourceSnapshot: string | null;
  roadbookMarkdown: string | null;
  history: ChatMessage[];
  userMessage: string;
}

export function buildChatMessages(opts: BuildOptions): BaseMessage[] {
  const { workspaceTitle, sourceSnapshot, roadbookMarkdown, history, userMessage } = opts;

  let system = `You are Ariadne, an AI assistant embedded in Roadbook — a learning roadmap generator.
You are helping the user with their journey: "${workspaceTitle}".

You can:
- Answer questions about the source material or roadbook
- Suggest improvements or additions to the roadbook
- Generate an updated roadbook when asked

If the user asks you to update or rewrite the roadbook, output the full updated Markdown wrapped in <roadbook>...</roadbook> tags. Otherwise reply normally.`;

  if (sourceSnapshot) {
    system += `\n\n## Source Material\n\`\`\`\n${sourceSnapshot.slice(0, 4000)}\n\`\`\``;
  }

  if (roadbookMarkdown) {
    system += `\n\n## Current Roadbook\n${roadbookMarkdown.slice(0, 6000)}`;
  }

  const messages: BaseMessage[] = [new SystemMessage(system)];

  for (const msg of history) {
    messages.push(
      msg.role === "user"
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content)
    );
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

export async function chat(opts: BuildOptions): Promise<{
  reply: string;
  roadbookUpdate: string | null;
}> {
  const messages = buildChatMessages(opts);
  const model = getModel();
  const res = await model.invoke(messages);
  const raw = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  const roadbookUpdate = extractRoadbookUpdate(raw);
  const reply = roadbookUpdate ? stripRoadbookBlock(raw) : raw;
  return { reply, roadbookUpdate };
}
