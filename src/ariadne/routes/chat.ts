import { Router } from "express";
import * as store from "../store.js";
import { ingestSource, retrieve } from "../rag.js";
import { chatStream, extractRoadbookUpdate, stripRoadbookBlock } from "../chat.js";
import type { ChatMessage } from "../chat.js";
import type { Source } from "../types.js";
import { setupSSE } from "./helpers.js";
import { withWorkspaceLock } from "./workspace-lock.js";

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

  const sse = setupSSE(req, res);

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
    }, sse.signal)) {
      if (sse.closed()) break;
      full += chunk;
      sse.send({ chunk });
    }

    if (sse.closed()) return;

    const roadbookUpdate = extractRoadbookUpdate(full);
    const reply = roadbookUpdate ? stripRoadbookBlock(full) : full;

    // Apply roadbook update atomically under the workspace lock. Re-read the
    // workspace so we don't clobber writes that happened during the LLM stream.
    let committedRoadmap: Source["roadmap"] | null = null;
    if (roadbookUpdate) {
      await withWorkspaceLock(req.params.id as string, async () => {
        const fresh = store.findById(req.params.id as string);
        if (!fresh) return;
        const srcIds = new Set(activeSources.map((s) => s.id));
        const freshActive = fresh.sources.filter((s) => srcIds.has(s.id));
        const target = freshActive.length === 1
          ? freshActive[0]
          : freshActive.find((s) => s.roadmap) ?? null;
        if (!target) return;
        target.roadmap = { id: target.roadmap?.id ?? crypto.randomUUID(), markdown: roadbookUpdate, generatedAt: Date.now() };
        store.updateWorkspace(fresh);
        committedRoadmap = target.roadmap;
      });
    }

    sse.send({ done: true, reply, roadbookUpdated: !!roadbookUpdate, roadmap: committedRoadmap });
  } catch (err) {
    if (sse.closed()) return;
    const message = err instanceof Error ? err.message : String(err);
    sse.send({ error: message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

export default router;
