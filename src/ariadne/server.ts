import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

import multer from "multer";
import { generateRoadbook, generateJourneyRoadbook } from "./workflow.js";
import type { ModelOverride } from "./workflow.js";
import { ingestSource, retrieve, removeSource, clearStore } from "./rag.js";
import * as store from "./store.js";
import { chatStream, extractRoadbookUpdate, stripRoadbookBlock } from "./chat.js";
import type { ChatMessage } from "./chat.js";
import { inferProvider, getModel } from "./config.js";
import type { ModelProvider } from "./config.js";
import { logTracingStatus } from "./tracing.js";
import { fetchUrlSnapshot, extractFileText } from "./content-extractor.js";
import type { Workspace, Source, Insight, ResearchTodo, SkillStatus, SkillProgressEntry } from "./types.js";
import { resolveSkillStatus } from "./store.js";
import skillRoutes from "./routes/skills.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

function setupSSE(res: express.Response): (data: object) => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  return (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
const PORT = Number(process.env.ARIADNE_PORT) || 3001;

const CORS_ORIGIN = process.env.CORS_ORIGIN;
app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN.split(",") } : undefined));
app.use(express.json({ limit: "2mb" }));

// Mount skill routes (skill-events, skill-index)
app.use("/", skillRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", engine: "ariadne" });
});

// List available models from the OpenAI-compatible proxy
app.get("/models", async (_req, res) => {
  const models: string[] = [];

  // Gemini models (direct Google API) — only expose cheap flash models in production
  if (process.env.GOOGLE_API_KEY) {
    models.push("gemini-2.5-flash", "gemini-3-flash-preview");
  }

  // Try OpenAI-compatible proxy if configured
  if (process.env.OPENAI_BASE_URL) {
    try {
      const base = process.env.OPENAI_BASE_URL;
      const r = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data = await r.json() as { data: { id: string }[] };
        for (const m of data.data) {
          if (!models.includes(m.id)) models.push(m.id);
        }
      }
    } catch { /* proxy unavailable, skip */ }
  }

  if (models.length === 0) models.push("gemini-3-flash-preview");
  res.json({ models });
});

// ── Workspace endpoints ───────────────────────────────────────────────────────

// List workspaces (metadata only)
app.get("/workspaces", (_req, res) => {
  const all = store.loadAll();
  const list = all.map(({ id, title, createdAt, updatedAt, sources, roadmap, skillProgress }) => {
    const skillNames = new Set<string>();
    for (const node of roadmap?.skillTree ?? []) skillNames.add(node.name);
    for (const s of sources) for (const node of s.roadmap?.skillTree ?? []) skillNames.add(node.name);
    const mastered = [...skillNames].filter((n) => resolveSkillStatus(skillProgress[n]) === "mastered").length;
    return {
      id,
      title,
      createdAt,
      updatedAt,
      sourceCount: sources.length,
      generatedCount: sources.filter((s) => s.roadmap !== null).length,
      skillCount: skillNames.size,
      masteredCount: mastered,
    };
  });
  res.json(list);
});

// Create workspace
app.post("/workspaces", (req, res) => {
  const { title } = req.body as { title?: string };
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    title: title?.trim() || "New Journey",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    roadmap: null,
    sources: [],
    insights: [],
    researchTodos: [],
    skillProgress: {},
  };
  store.insertWorkspace(workspace);
  res.status(201).json(workspace);
});

// Get workspace (full)
app.get("/workspaces/:id", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  res.json(workspace);
});

// Update workspace (rename)
app.patch("/workspaces/:id", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { title } = req.body as { title?: string };
  if (title?.trim()) workspace.title = title.trim();
  store.updateWorkspace(workspace);
  res.json(workspace);
});

// Delete workspace
app.delete("/workspaces/:id", (req, res) => {
  clearStore(req.params.id);
  store.deleteWorkspace(req.params.id);
  res.json({ ok: true });
});

// ── Source endpoints ──────────────────────────────────────────────────────────

// Add source
app.post("/workspaces/:id/sources", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { text, language } = req.body as { text?: string; language?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }
  const source: Source = {
    id: crypto.randomUUID(),
    type: "text",
    origin: "external",
    reference: text.trim(),
    snapshot: text.trim(),
    ingestedAt: Date.now(),
    language: language ?? "English",
    roadmap: null,
    digestedSegmentIds: [],
  };
  workspace.sources.push(source);
  store.updateWorkspace(workspace);
  res.status(201).json(source);
});

// Add URL source
app.post("/workspaces/:id/sources/url", async (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { url, language } = req.body as { url?: string; language?: string };
  if (!url?.trim()) { res.status(400).json({ error: "url is required" }); return; }
  try {
    const snapshot = await fetchUrlSnapshot(url.trim());
    const source: Source = {
      id: crypto.randomUUID(), type: "url", origin: "external",
      reference: url.trim(),
      snapshot,
      ingestedAt: Date.now(),
      language: language ?? "English",
      roadmap: null,
      digestedSegmentIds: [],
    };
    workspace.sources.push(source);
    store.updateWorkspace(workspace);
    res.status(201).json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: message });
  }
});

// Add file source (PDF / DOCX / TXT / image)
app.post("/workspaces/:id/sources/file", upload.single("file"), async (req, res) => {
  const workspace = store.findById(req.params.id as string);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  if (!req.file) { res.status(400).json({ error: "file is required" }); return; }
  const language = (req.body as { language?: string }).language ?? "English";
  try {
    const snapshot = await extractFileText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const source: Source = {
      id: crypto.randomUUID(), type: "file", origin: "external",
      reference: req.file.originalname,
      snapshot,
      ingestedAt: Date.now(),
      language,
      roadmap: null,
      digestedSegmentIds: [],
    };
    workspace.sources.push(source);
    store.updateWorkspace(workspace);
    res.status(201).json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: message });
  }
});

// Delete source
app.delete("/workspaces/:id/sources/:sourceId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const removed = workspace.sources.find((s) => s.id === req.params.sourceId);
  workspace.sources = workspace.sources.filter((s) => s.id !== req.params.sourceId);
  if (removed) removeSource(workspace.id, removed.reference);
  store.updateWorkspace(workspace);
  res.json({ ok: true });
});

// ── Generate journey roadmap (multi-source merge) ─────────────────────────────

app.post("/workspaces/:id/generate-journey", async (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { sourceIds, model } = req.body as { sourceIds?: string[]; model?: string };
  const selected = sourceIds?.length
    ? workspace.sources.filter((s) => sourceIds.includes(s.id))
    : workspace.sources;
  if (selected.length === 0) { res.status(400).json({ error: "No sources selected" }); return; }

  const modelOverride: ModelOverride | undefined = model
    ? { provider: inferProvider(model), modelName: model }
    : undefined;

  const send = setupSSE(res);

  try {
    const snapshots = selected.map((s) => ({ text: s.snapshot, language: s.language }));
    const output = await generateJourneyRoadbook(snapshots, (evt) => send({ type: "progress", ...evt }), modelOverride);
    workspace.roadmap = { id: workspace.roadmap?.id ?? crypto.randomUUID(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() };

    if (workspace.title === "New Journey") {
      const titleMatch = output.markdown.match(/^#\s+(.+)$/m);
      if (titleMatch) workspace.title = titleMatch[1].trim();
    }

    store.updateWorkspace(workspace);
    send({ type: "done", roadmap: workspace.roadmap, workspaceTitle: workspace.title, failedSkills: output.failedSkills });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", error: message });
  } finally {
    res.end();
  }
});

// ── Chat SSE stream ───────────────────────────────────────────────────────────

app.post("/workspaces/:id/chat/stream", async (req, res) => {
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

// ── Generate roadmap ──────────────────────────────────────────────────────────

app.post("/workspaces/:id/sources/:sourceId/generate", async (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const source = workspace.sources.find((s) => s.id === req.params.sourceId);
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }

  const { model } = req.body as { provider?: ModelProvider; model?: string };
  const genModelOverride: ModelOverride | undefined = model
    ? { provider: inferProvider(model), modelName: model }
    : undefined;

  const send = setupSSE(res);

  try {
    const output = await generateRoadbook(source.snapshot, source.language, (evt) => send({ type: "progress", ...evt }), genModelOverride);
    source.roadmap = { id: crypto.randomUUID(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() };

    if (workspace.title === "New Journey") {
      const titleMatch = output.markdown.match(/^#\s+(.+)$/m);
      if (titleMatch) workspace.title = titleMatch[1].trim();
    }

    store.updateWorkspace(workspace);
    send({ type: "done", roadmap: source.roadmap, workspaceTitle: workspace.title, failedSkills: output.failedSkills });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Generation failed:", message);
    send({ type: "error", error: message });
  } finally {
    res.end();
  }
});

// ── Digest (T03) ──────────────────────────────────────────────────────────────

app.post("/workspaces/:id/digest", async (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { sourceId, segmentIds, segments } = req.body as {
    sourceId: string;
    segmentIds: string[];
    segments: string[];
  };
  if (!sourceId || !segments?.length) {
    res.status(400).json({ error: "sourceId and segments are required" }); return;
  }
  const source = workspace.sources.find((s) => s.id === sourceId);
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }

  try {
    const model = getModel();
    const currentRoadmap = workspace.roadmap?.markdown ?? "";
    const prompt = `You are merging selected knowledge segments into a Journey Roadmap.

${currentRoadmap ? `## Current Journey Roadmap\n${currentRoadmap}\n\n` : ""}## Selected Segments to Digest
${segments.join("\n\n---\n\n")}

## Instructions
- Integrate the selected segments into the Journey Roadmap
- For existing skill nodes: merge subSkills and relatedConcepts, upgrade priority if needed
- For new skill nodes: append them in the appropriate category
- Keep all existing Journey Roadmap content intact
- Output the complete updated Journey Roadmap in Markdown (starting with # heading)
- Do NOT add any explanation outside the Markdown`;

    const { content } = await model.invoke([{ role: "user", content: prompt }]);
    const markdown = typeof content === "string" ? content : JSON.stringify(content);

    workspace.roadmap = {
      id: workspace.roadmap?.id ?? crypto.randomUUID(),
      markdown,
      generatedAt: Date.now(),
    };
    source.digestedSegmentIds = [
      ...new Set([...source.digestedSegmentIds, ...segmentIds]),
    ];
    store.updateWorkspace(workspace);
    res.json({ roadmap: workspace.roadmap });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Insights (T04) ────────────────────────────────────────────────────────────

app.post("/workspaces/:id/insights", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { content, sourceRef } = req.body as { content?: string; sourceRef?: Insight["sourceRef"] };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }
  const insight: Insight = { id: crypto.randomUUID(), content: content.trim(), sourceRef, createdAt: Date.now() };
  workspace.insights.push(insight);
  store.updateWorkspace(workspace);
  res.status(201).json(insight);
});

app.delete("/workspaces/:id/insights/:insightId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.insights = workspace.insights.filter((i) => i.id !== req.params.insightId);
  store.updateWorkspace(workspace);
  res.json({ ok: true });
});

// ── Research Todos (T05) ──────────────────────────────────────────────────────

app.post("/workspaces/:id/research-todos", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { topic, description, linkedSkillNode } = req.body as Partial<ResearchTodo>;
  if (!topic?.trim()) { res.status(400).json({ error: "topic is required" }); return; }
  const todo: ResearchTodo = {
    id: crypto.randomUUID(), topic: topic.trim(), description, linkedSkillNode,
    status: "pending", createdAt: Date.now(),
  };
  workspace.researchTodos.push(todo);
  store.updateWorkspace(workspace);
  res.status(201).json(todo);
});

app.patch("/workspaces/:id/research-todos/:todoId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const todo = workspace.researchTodos.find((t) => t.id === req.params.todoId);
  if (!todo) { res.status(404).json({ error: "Todo not found" }); return; }
  const { status, description } = req.body as Partial<ResearchTodo>;
  if (status) todo.status = status;
  if (description !== undefined) todo.description = description;
  store.updateWorkspace(workspace);
  res.json(todo);
});

app.delete("/workspaces/:id/research-todos/:todoId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.researchTodos = workspace.researchTodos.filter((t) => t.id !== req.params.todoId);
  store.updateWorkspace(workspace);
  res.json({ ok: true });
});

app.post("/workspaces/:id/research-todos/:todoId/run", async (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const todo = workspace.researchTodos.find((t) => t.id === req.params.todoId);
  if (!todo) { res.status(404).json({ error: "Todo not found" }); return; }

  todo.status = "in-progress";
  store.updateWorkspace(workspace);

  try {
    const output = await generateRoadbook(
      `Research topic: ${todo.topic}\n\n${todo.description ?? ""}`,
      "Chinese",
    );
    const source: Source = {
      id: crypto.randomUUID(), type: "text", origin: "research",
      reference: todo.topic,
      snapshot: `Research: ${todo.topic}\n\n${todo.description ?? ""}`,
      ingestedAt: Date.now(),
      language: "Chinese",
      roadmap: { id: crypto.randomUUID(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() },
      digestedSegmentIds: [],
    };
    workspace.sources.push(source);
    todo.status = "done";
    todo.resultSourceId = source.id;
    store.updateWorkspace(workspace);
    res.json({ todo, source });
  } catch (err) {
    todo.status = "pending";
    store.updateWorkspace(workspace);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Skill Progress (T17) ─────────────────────────────────────────────────────

app.patch("/workspaces/:id/skill-progress", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { skillName, status } = req.body as { skillName?: string; status?: SkillStatus };
  if (!skillName || !status || !["not_started", "learning", "mastered"].includes(status)) {
    res.status(400).json({ error: "skillName and valid status required" }); return;
  }

  const now = Date.now();
  const existing = workspace.skillProgress[skillName] as SkillStatus | SkillProgressEntry | undefined;
  const oldStatus = resolveSkillStatus(existing);

  if (status === "not_started") {
    delete workspace.skillProgress[skillName];
  } else {
    const firstSeenAt = existing && typeof existing === "object" ? existing.firstSeenAt : now;
    workspace.skillProgress[skillName] = {
      status,
      lastActiveAt: now,
      firstSeenAt,
    };
  }

  // Record a SkillEvent when the status actually changes
  if (oldStatus !== status) {
    try {
      store.insertSkillEvent({
        id: crypto.randomUUID(),
        skillName,
        fromStatus: oldStatus === "not_started" && !existing ? null : oldStatus,
        toStatus: status,
        source: "manual",
        timestamp: now,
        workspaceId: workspace.id,
      });
    } catch (err) {
      console.error("Failed to insert skill event:", err);
    }
  }

  store.updateWorkspace(workspace);
  res.json({ skillProgress: workspace.skillProgress });
});

// ── Global Skill Index — moved to routes/skills.ts ─────────────────────────

// ── Production: serve frontend static files ──────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../../dist");

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath));
  app.get("{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

export { app };

if (process.env.NODE_ENV !== "test") {
  const HOST = process.env.HOST || "0.0.0.0";
  app.listen(PORT, HOST, () => {
    console.log(`\n🧶 Ariadne engine running at http://${HOST}:${PORT}`);
    logTracingStatus();
    console.log();
  });
}
