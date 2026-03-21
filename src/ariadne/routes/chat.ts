import { Router } from "express";
import * as store from "../store.js";
import { ingestSource, retrieve } from "../rag.js";
import { chatStream, extractRoadbookUpdate, stripRoadbookBlock } from "../chat.js";
import type { ChatMessage } from "../chat.js";
import { setupSSE } from "./helpers.js";

const router = Router();

// Chat SSE stream
router.post("/:id/chat/stream", async (req, res) => {
  const workspace = store.findById(req.params.id as string);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { messages, sourceIds, language } = req.body as { messages: ChatMessage[]; sourceIds?: string[]; language?: string };
  if (!messages?.length) { res.status(400).json({ error: "messages required" }); return; }

  // Resolve sources: explicit list → all workspace sources
  const activeSources = sourceIds?.length
    ? workspace.sources.filter((s) => sourceIds.includes(s.id))
    : workspace.sources;

  const userMessage = messages[messages.length - 1].content;
  const history = messages.slice(0, -1);

  const send = setupSSE(res);

  try {
    // RAG: lazily ingest sources, then retrieve relevant chunks
    let ragContext = "";
    try {
      await Promise.all(
        activeSources.map((s) => ingestSource(workspace.id, s.reference, s.snapshot))
      );
      const chunks = await retrieve(workspace.id, userMessage, 5);
      if (chunks.length > 0) {
        ragContext = "\n\n## Relevant Excerpts (RAG)\n" +
          chunks.map((c) => `### From: ${c.sourceRef}\n${c.text}`).join("\n\n");
      }
    } catch {
      // RAG is best-effort — fall back to static context if embeddings fail
    }

    let full = "";
    for await (const chunk of chatStream({
      workspaceTitle: workspace.title,
      journeyRoadmap: workspace.roadmap?.markdown ?? null,
      sources: activeSources.map((s) => ({
        reference: s.reference,
        snapshot: s.snapshot,
        roadmapMarkdown: s.roadmap?.markdown ?? null,
      })),
      insights: [...workspace.insights.map((i) => i.content), ...(ragContext ? [ragContext] : [])],
      history,
      userMessage,
      language: language || activeSources[0]?.language || "English",
    })) {
      full += chunk;
      send({ chunk });
    }

    const roadbookUpdate = extractRoadbookUpdate(full);
    const reply = roadbookUpdate ? stripRoadbookBlock(full) : full;

    // Apply roadbook update to the first active source that has a roadmap (or the only one)
    const targetSource = activeSources.length === 1
      ? activeSources[0]
      : activeSources.find((s) => s.roadmap) ?? null;

    if (roadbookUpdate && targetSource) {
      targetSource.roadmap = { id: targetSource.roadmap?.id ?? crypto.randomUUID(), markdown: roadbookUpdate, generatedAt: Date.now() };
      store.updateWorkspace(workspace);
    }

    send({ done: true, reply, roadbookUpdated: !!roadbookUpdate, roadmap: targetSource?.roadmap ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ error: message });
  } finally {
    res.end();
  }
});

export default router;
