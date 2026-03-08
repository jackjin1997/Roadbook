import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import multer from "multer";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createRequire } from "module";
import mammoth from "mammoth";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
import { generateRoadbook, generateJourneyRoadbook } from "./workflow.js";
import { chat, chatStream, extractRoadbookUpdate, stripRoadbookBlock } from "./chat.js";
import type { ChatMessage } from "./chat.js";
import { setModelConfig, inferProvider, getModel } from "./config.js";
import type { ModelProvider } from "./config.js";
import { logTracingStatus } from "./tracing.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Roadmap {
  id: string;
  markdown: string;
  generatedAt: number;
}

export interface Source {
  id: string;
  type: "text" | "url" | "file";
  origin: "external" | "research";
  reference: string;
  snapshot: string;
  ingestedAt: number;
  language: string;
  roadmap: Roadmap | null;
  digestedSegmentIds: string[];
}

export interface Insight {
  id: string;
  content: string;
  sourceRef?: { sourceId: string; segment?: string };
  createdAt: number;
}

export interface ResearchTodo {
  id: string;
  topic: string;
  description?: string;
  status: "pending" | "in-progress" | "done";
  linkedSkillNode?: string;
  resultSourceId?: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  roadmap: Roadmap | null;
  sources: Source[];
  insights: Insight[];
  researchTodos: ResearchTodo[];
}

// ── Store ────────────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "workspaces.json");

function loadStore(): Workspace[] {
  try {
    if (!existsSync(STORE_FILE)) return [];
    const raw = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Workspace[];
    // Migrate old data: fill in missing fields
    return raw.map((w) => ({
      roadmap: null,
      insights: [],
      researchTodos: [],
      ...w,
      sources: w.sources.map((s) => ({
        origin: "external" as const,
        digestedSegmentIds: [],
        ...s,
      })),
    }));
  } catch {
    return [];
  }
}

function saveStore(workspaces: Workspace[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(workspaces, null, 2), "utf-8");
}

function findWorkspace(id: string): Workspace | undefined {
  return loadStore().find((w) => w.id === id);
}

function updateWorkspace(updated: Workspace) {
  const all = loadStore();
  const idx = all.findIndex((w) => w.id === updated.id);
  if (idx === -1) return false;
  updated.updatedAt = Date.now();
  all[idx] = updated;
  saveStore(all);
  return true;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── App ──────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchUrlSnapshot(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Ariadne/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article?.textContent) throw new Error("Could not extract readable content from URL");
  return article.textContent.replace(/\s+/g, " ").trim();
}

async function extractFileText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  // Plain text
  if (mimeType === "text/plain" || filename.endsWith(".txt") || filename.endsWith(".md")) {
    return buffer.toString("utf-8").trim();
  }
  // PDF
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    if (!data.text.trim()) throw new Error("Could not extract text from PDF");
    return data.text.trim();
  }
  // DOCX
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) throw new Error("Could not extract text from DOCX");
    return result.value.trim();
  }
  // Image → Claude OCR
  if (mimeType.startsWith("image/")) {
    const model = new ChatAnthropic({ model: "claude-haiku-4-5-20251001", maxTokens: 4096 });
    const b64 = buffer.toString("base64");
    const res = await model.invoke([
      new HumanMessage({
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
          { type: "text", text: "Extract all text from this image verbatim. Return only the extracted text, no commentary." },
        ],
      }),
    ]);
    return (res.content as string).trim();
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
const PORT = Number(process.env.ARIADNE_PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", engine: "ariadne" });
});

// List available models from the OpenAI-compatible proxy
app.get("/models", async (_req, res) => {
  try {
    const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) { res.json({ models: [] }); return; }
    const data = await r.json() as { data: { id: string }[] };
    const all = data.data.map((m) => m.id);

    // Priority-ordered curated list — first match wins per slot
    const CURATED = [
      /claude-sonnet-4-6/,
      /claude-sonnet-4-5/,
      /claude-opus-4/,
      /claude-haiku-4-5/,
      /claude-3-7-sonnet/,
      /claude-3-5-sonnet/,
      /claude-3-5-haiku/,
      /^gpt-4o$/,
      /^gpt-4o-mini$/,
      /^gemini-2\.0-flash/,
    ];

    const curated: string[] = [];
    for (const pattern of CURATED) {
      const match = all.find((m) => pattern.test(m));
      if (match && !curated.includes(match)) curated.push(match);
    }
    const models = curated.length > 0 ? curated : all.slice(0, 8);

    // Append native models (not via proxy) if not already listed
    const NATIVE = ["gemini-3.1-pro-low", "gemini-2.0-flash"];
    for (const m of NATIVE) {
      if (!models.includes(m)) models.push(m);
    }

    res.json({ models });
  } catch {
    res.json({ models: [] });
  }
});

// ── Workspace endpoints ───────────────────────────────────────────────────────

// List workspaces (metadata only)
app.get("/workspaces", (_req, res) => {
  const all = loadStore();
  const list = all.map(({ id, title, createdAt, updatedAt, sources }) => ({
    id,
    title,
    createdAt,
    updatedAt,
    sourceCount: sources.length,
    generatedCount: sources.filter((s) => s.roadmap !== null).length,
  }));
  res.json(list);
});

// Create workspace
app.post("/workspaces", (req, res) => {
  const { title } = req.body as { title?: string };
  const workspace: Workspace = {
    id: uid(),
    title: title?.trim() || "New Journey",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    roadmap: null,
    sources: [],
    insights: [],
    researchTodos: [],
  };
  const all = loadStore();
  saveStore([workspace, ...all]);
  res.status(201).json(workspace);
});

// Get workspace (full)
app.get("/workspaces/:id", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  res.json(workspace);
});

// Update workspace (rename)
app.patch("/workspaces/:id", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { title } = req.body as { title?: string };
  if (title?.trim()) workspace.title = title.trim();
  updateWorkspace(workspace);
  res.json(workspace);
});

// Delete workspace
app.delete("/workspaces/:id", (req, res) => {
  const all = loadStore().filter((w) => w.id !== req.params.id);
  saveStore(all);
  res.json({ ok: true });
});

// ── Source endpoints ──────────────────────────────────────────────────────────

// Add source
app.post("/workspaces/:id/sources", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { text, language } = req.body as { text?: string; language?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }
  const source: Source = {
    id: uid(),
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
  updateWorkspace(workspace);
  res.status(201).json(source);
});

// Add URL source
app.post("/workspaces/:id/sources/url", async (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { url, language } = req.body as { url?: string; language?: string };
  if (!url?.trim()) { res.status(400).json({ error: "url is required" }); return; }
  try {
    const snapshot = await fetchUrlSnapshot(url.trim());
    const source: Source = {
      id: uid(), type: "url", origin: "external",
      reference: url.trim(),
      snapshot,
      ingestedAt: Date.now(),
      language: language ?? "English",
      roadmap: null,
      digestedSegmentIds: [],
    };
    workspace.sources.push(source);
    updateWorkspace(workspace);
    res.status(201).json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: message });
  }
});

// Add file source (PDF / DOCX / TXT / image)
app.post("/workspaces/:id/sources/file", upload.single("file"), async (req, res) => {
  const workspace = findWorkspace(req.params.id as string);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  if (!req.file) { res.status(400).json({ error: "file is required" }); return; }
  const language = (req.body as { language?: string }).language ?? "English";
  try {
    const snapshot = await extractFileText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const source: Source = {
      id: uid(), type: "file", origin: "external",
      reference: req.file.originalname,
      snapshot,
      ingestedAt: Date.now(),
      language,
      roadmap: null,
      digestedSegmentIds: [],
    };
    workspace.sources.push(source);
    updateWorkspace(workspace);
    res.status(201).json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: message });
  }
});

// Delete source
app.delete("/workspaces/:id/sources/:sourceId", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.sources = workspace.sources.filter((s) => s.id !== req.params.sourceId);
  updateWorkspace(workspace);
  res.json({ ok: true });
});

// ── Chat ──────────────────────────────────────────────────────────────────────

app.post("/workspaces/:id/chat", async (req, res) => {
  const workspace = findWorkspace(req.params.id as string);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { messages, sourceId } = req.body as {
    messages: ChatMessage[];
    sourceId?: string;
  };
  if (!messages?.length) { res.status(400).json({ error: "messages required" }); return; }

  const source = sourceId ? workspace.sources.find((s) => s.id === sourceId) : null;
  const userMessage = messages[messages.length - 1].content;
  const history = messages.slice(0, -1);

  try {
    const result = await chat({
      workspaceTitle: workspace.title,
      sourceSnapshot: source?.snapshot ?? null,
      roadbookMarkdown: source?.roadmap?.markdown ?? null,
      history,
      userMessage,
    });

    // Apply roadbook update if AI produced one
    if (result.roadbookUpdate && source) {
      source.roadmap = {
        id: source.roadmap?.id ?? uid(),
        markdown: result.roadbookUpdate,
        generatedAt: Date.now(),
      };
      updateWorkspace(workspace);
    }

    res.json({
      reply: result.reply,
      roadbookUpdated: !!result.roadbookUpdate,
      roadmap: source?.roadmap ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Generate journey roadmap (multi-source merge) ─────────────────────────────

app.post("/workspaces/:id/generate-journey", async (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { sourceIds, model } = req.body as { sourceIds?: string[]; model?: string };
  const selected = sourceIds?.length
    ? workspace.sources.filter((s) => sourceIds.includes(s.id))
    : workspace.sources;
  if (selected.length === 0) { res.status(400).json({ error: "No sources selected" }); return; }

  if (model) setModelConfig({ provider: inferProvider(model), modelName: model });

  try {
    const snapshots = selected.map((s) => ({ text: s.snapshot, language: s.language }));
    const markdown = await generateJourneyRoadbook(snapshots);
    workspace.roadmap = { id: workspace.roadmap?.id ?? uid(), markdown, generatedAt: Date.now() };

    if (workspace.title === "New Journey") {
      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      if (titleMatch) workspace.title = titleMatch[1].trim();
    }

    updateWorkspace(workspace);
    res.json({ roadmap: workspace.roadmap, workspaceTitle: workspace.title });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  } finally {
    setModelConfig({ provider: "gemini", modelName: "gemini-3.1-pro-low" });
  }
});

// ── Chat SSE stream ───────────────────────────────────────────────────────────

app.post("/workspaces/:id/chat/stream", async (req, res) => {
  const workspace = findWorkspace(req.params.id as string);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { messages, sourceId } = req.body as { messages: ChatMessage[]; sourceId?: string };
  if (!messages?.length) { res.status(400).json({ error: "messages required" }); return; }

  const source = sourceId ? workspace.sources.find((s) => s.id === sourceId) : null;
  const userMessage = messages[messages.length - 1].content;
  const history = messages.slice(0, -1);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    let full = "";
    for await (const chunk of chatStream({
      workspaceTitle: workspace.title,
      sourceSnapshot: source?.snapshot ?? null,
      roadbookMarkdown: source?.roadmap?.markdown ?? null,
      history,
      userMessage,
    })) {
      full += chunk;
      send({ chunk });
    }

    const roadbookUpdate = extractRoadbookUpdate(full);
    const reply = roadbookUpdate ? stripRoadbookBlock(full) : full;

    if (roadbookUpdate && source) {
      source.roadmap = { id: source.roadmap?.id ?? uid(), markdown: roadbookUpdate, generatedAt: Date.now() };
      updateWorkspace(workspace);
    }

    send({ done: true, reply, roadbookUpdated: !!roadbookUpdate, roadmap: source?.roadmap ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ error: message });
  } finally {
    res.end();
  }
});

// ── Generate roadmap ──────────────────────────────────────────────────────────

app.post("/workspaces/:id/sources/:sourceId/generate", async (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const source = workspace.sources.find((s) => s.id === req.params.sourceId);
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }

  const { model } = req.body as { provider?: ModelProvider; model?: string };
  if (model) setModelConfig({ provider: inferProvider(model), modelName: model });

  try {
    const markdown = await generateRoadbook(source.snapshot, source.language);
    source.roadmap = { id: uid(), markdown, generatedAt: Date.now() };

    // Auto-title workspace from first roadmap if still default
    if (workspace.title === "New Journey") {
      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      if (titleMatch) workspace.title = titleMatch[1].trim();
    }

    updateWorkspace(workspace);
    res.json({ roadmap: source.roadmap, workspaceTitle: workspace.title });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Generation failed:", message);
    res.status(500).json({ error: message });
  } finally {
    // Reset to default so one request's model choice doesn't leak into subsequent requests
    setModelConfig({ provider: "gemini", modelName: "gemini-3.1-pro-low" });
  }
});

// ── Digest (T03) ──────────────────────────────────────────────────────────────

app.post("/workspaces/:id/digest", async (req, res) => {
  const workspace = findWorkspace(req.params.id);
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
      id: workspace.roadmap?.id ?? uid(),
      markdown,
      generatedAt: Date.now(),
    };
    source.digestedSegmentIds = [
      ...new Set([...source.digestedSegmentIds, ...segmentIds]),
    ];
    updateWorkspace(workspace);
    res.json({ roadmap: workspace.roadmap });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Insights (T04) ────────────────────────────────────────────────────────────

app.post("/workspaces/:id/insights", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { content, sourceRef } = req.body as { content?: string; sourceRef?: Insight["sourceRef"] };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }
  const insight: Insight = { id: uid(), content: content.trim(), sourceRef, createdAt: Date.now() };
  workspace.insights.push(insight);
  updateWorkspace(workspace);
  res.status(201).json(insight);
});

app.delete("/workspaces/:id/insights/:insightId", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.insights = workspace.insights.filter((i) => i.id !== req.params.insightId);
  updateWorkspace(workspace);
  res.json({ ok: true });
});

// ── Research Todos (T05) ──────────────────────────────────────────────────────

app.post("/workspaces/:id/research-todos", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { topic, description, linkedSkillNode } = req.body as Partial<ResearchTodo>;
  if (!topic?.trim()) { res.status(400).json({ error: "topic is required" }); return; }
  const todo: ResearchTodo = {
    id: uid(), topic: topic.trim(), description, linkedSkillNode,
    status: "pending", createdAt: Date.now(),
  };
  workspace.researchTodos.push(todo);
  updateWorkspace(workspace);
  res.status(201).json(todo);
});

app.patch("/workspaces/:id/research-todos/:todoId", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const todo = workspace.researchTodos.find((t) => t.id === req.params.todoId);
  if (!todo) { res.status(404).json({ error: "Todo not found" }); return; }
  const { status, description } = req.body as Partial<ResearchTodo>;
  if (status) todo.status = status;
  if (description !== undefined) todo.description = description;
  updateWorkspace(workspace);
  res.json(todo);
});

app.delete("/workspaces/:id/research-todos/:todoId", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.researchTodos = workspace.researchTodos.filter((t) => t.id !== req.params.todoId);
  updateWorkspace(workspace);
  res.json({ ok: true });
});

app.post("/workspaces/:id/research-todos/:todoId/run", async (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const todo = workspace.researchTodos.find((t) => t.id === req.params.todoId);
  if (!todo) { res.status(404).json({ error: "Todo not found" }); return; }

  todo.status = "in-progress";
  updateWorkspace(workspace);

  try {
    const markdown = await generateRoadbook(
      `Research topic: ${todo.topic}\n\n${todo.description ?? ""}`,
      "Chinese",
    );
    const source: Source = {
      id: uid(), type: "text", origin: "research",
      reference: todo.topic,
      snapshot: `Research: ${todo.topic}\n\n${todo.description ?? ""}`,
      ingestedAt: Date.now(),
      language: "Chinese",
      roadmap: { id: uid(), markdown, generatedAt: Date.now() },
      digestedSegmentIds: [],
    };
    workspace.sources.push(source);
    todo.status = "done";
    todo.resultSourceId = source.id;
    updateWorkspace(workspace);
    res.json({ todo, source });
  } catch (err) {
    todo.status = "pending";
    updateWorkspace(workspace);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🧶 Ariadne engine running at http://localhost:${PORT}`);
  logTracingStatus();
  console.log();
});
