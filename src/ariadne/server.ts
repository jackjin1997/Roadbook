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
import { chatStream, extractRoadbookUpdate, stripRoadbookBlock } from "./chat.js";
import type { ChatMessage } from "./chat.js";
import { setModelConfig, inferProvider, getModel } from "./config.js";
import type { ModelProvider } from "./config.js";
import { logTracingStatus } from "./tracing.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Roadmap {
  id: string;
  markdown: string;
  skillTree?: import("./types.js").SkillNode[];
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

export type SkillStatus = "not_started" | "learning" | "mastered";

export interface Workspace {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  roadmap: Roadmap | null;
  sources: Source[];
  insights: Insight[];
  researchTodos: ResearchTodo[];
  skillProgress: Record<string, SkillStatus>;
}

// ── Store ────────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.ARIADNE_DATA_DIR ?? join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "workspaces.json");

function loadStore(): Workspace[] {
  try {
    if (!existsSync(STORE_FILE)) return [];
    const raw = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Workspace[];
    // Migrate old data: fill in missing fields
    return raw.map((w) => ({
      ...w,
      roadmap: w.roadmap ?? null,
      insights: w.insights ?? [],
      researchTodos: w.researchTodos ?? [],
      skillProgress: w.skillProgress ?? {},
      sources: w.sources.map((s) => ({
        ...s,
        origin: s.origin ?? ("external" as const),
        digestedSegmentIds: s.digestedSegmentIds ?? [],
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

// Job boards and SPAs that require a headless renderer to extract content
const SPA_PATTERNS = [
  /zhipin\.com/,       // BOSS直聘
  /linkedin\.com/,     // LinkedIn
  /lagou\.com/,        // 拉勾
  /maimai\.cn/,        // 脉脉
  /liepin\.com/,       // 猎聘
  /51job\.com/,        // 前程无忧
  /zhaopin\.com/,      // 智联招聘
];

async function fetchViaJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      "Accept": "text/plain",
      "User-Agent": "Mozilla/5.0 (compatible; Ariadne/1.0)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Jina Reader failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("Could not extract content via Jina Reader");
  return text.replace(/\s+/g, " ").trim();
}

async function fetchUrlSnapshot(url: string): Promise<string> {
  // Route known SPA / job-board URLs directly through Jina Reader
  if (SPA_PATTERNS.some((p) => p.test(url))) {
    return fetchViaJina(url);
  }

  // Standard fetch + Readability for regular pages
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Ariadne/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";

  // Fallback to Jina if content is suspiciously thin (likely an SPA)
  if (text.length < 200) {
    return fetchViaJina(url);
  }

  return text;
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
  const list = all.map(({ id, title, createdAt, updatedAt, sources, roadmap, skillProgress }) => {
    const skillNames = new Set<string>();
    for (const node of roadmap?.skillTree ?? []) skillNames.add(node.name);
    for (const s of sources) for (const node of s.roadmap?.skillTree ?? []) skillNames.add(node.name);
    const mastered = [...skillNames].filter((n) => skillProgress[n] === "mastered").length;
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
    id: uid(),
    title: title?.trim() || "New Journey",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    roadmap: null,
    sources: [],
    insights: [],
    researchTodos: [],
    skillProgress: {},
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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const snapshots = selected.map((s) => ({ text: s.snapshot, language: s.language }));
    const output = await generateJourneyRoadbook(snapshots, (evt) => send({ type: "progress", ...evt }));
    workspace.roadmap = { id: workspace.roadmap?.id ?? uid(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() };

    if (workspace.title === "New Journey") {
      const titleMatch = output.markdown.match(/^#\s+(.+)$/m);
      if (titleMatch) workspace.title = titleMatch[1].trim();
    }

    updateWorkspace(workspace);
    send({ type: "done", roadmap: workspace.roadmap, workspaceTitle: workspace.title, failedSkills: output.failedSkills });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", error: message });
  } finally {
    res.end();
    setModelConfig({ provider: "gemini", modelName: "gemini-3.1-pro-low" });
  }
});

// ── Chat SSE stream ───────────────────────────────────────────────────────────

app.post("/workspaces/:id/chat/stream", async (req, res) => {
  const workspace = findWorkspace(req.params.id as string);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }

  const { messages, sourceIds } = req.body as { messages: ChatMessage[]; sourceIds?: string[] };
  if (!messages?.length) { res.status(400).json({ error: "messages required" }); return; }

  // Resolve sources: explicit list → all workspace sources
  const activeSources = sourceIds?.length
    ? workspace.sources.filter((s) => sourceIds.includes(s.id))
    : workspace.sources;

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
      journeyRoadmap: workspace.roadmap?.markdown ?? null,
      sources: activeSources.map((s) => ({
        reference: s.reference,
        snapshot: s.snapshot,
        roadmapMarkdown: s.roadmap?.markdown ?? null,
      })),
      insights: workspace.insights.map((i) => i.content),
      history,
      userMessage,
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
      targetSource.roadmap = { id: targetSource.roadmap?.id ?? uid(), markdown: roadbookUpdate, generatedAt: Date.now() };
      updateWorkspace(workspace);
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
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const source = workspace.sources.find((s) => s.id === req.params.sourceId);
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }

  const { model } = req.body as { provider?: ModelProvider; model?: string };
  if (model) setModelConfig({ provider: inferProvider(model), modelName: model });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const output = await generateRoadbook(source.snapshot, source.language, (evt) => send({ type: "progress", ...evt }));
    source.roadmap = { id: uid(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() };

    if (workspace.title === "New Journey") {
      const titleMatch = output.markdown.match(/^#\s+(.+)$/m);
      if (titleMatch) workspace.title = titleMatch[1].trim();
    }

    updateWorkspace(workspace);
    send({ type: "done", roadmap: source.roadmap, workspaceTitle: workspace.title, failedSkills: output.failedSkills });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Generation failed:", message);
    send({ type: "error", error: message });
  } finally {
    res.end();
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
    const output = await generateRoadbook(
      `Research topic: ${todo.topic}\n\n${todo.description ?? ""}`,
      "Chinese",
    );
    const source: Source = {
      id: uid(), type: "text", origin: "research",
      reference: todo.topic,
      snapshot: `Research: ${todo.topic}\n\n${todo.description ?? ""}`,
      ingestedAt: Date.now(),
      language: "Chinese",
      roadmap: { id: uid(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() },
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

// ── Skill Progress (T17) ─────────────────────────────────────────────────────

app.patch("/workspaces/:id/skill-progress", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { skillName, status } = req.body as { skillName?: string; status?: SkillStatus };
  if (!skillName || !status || !["not_started", "learning", "mastered"].includes(status)) {
    res.status(400).json({ error: "skillName and valid status required" }); return;
  }
  if (status === "not_started") {
    delete workspace.skillProgress[skillName];
  } else {
    workspace.skillProgress[skillName] = status;
  }
  updateWorkspace(workspace);
  res.json({ skillProgress: workspace.skillProgress });
});

// ── Global Skill Index ─────────────────────────────────────────────────────

app.get("/skill-index", (_req, res) => {
  const workspaces = loadStore();
  const skillMap = new Map<string, {
    name: string;
    category: string;
    priority: string;
    workspaces: { id: string; title: string }[];
    status: SkillStatus | "not_started";
  }>();

  for (const ws of workspaces) {
    const trees = [
      ...(ws.roadmap?.skillTree ?? []),
      ...ws.sources.flatMap((s) => s.roadmap?.skillTree ?? []),
    ];
    for (const node of trees) {
      const existing = skillMap.get(node.name);
      if (existing) {
        if (!existing.workspaces.some((w) => w.id === ws.id)) {
          existing.workspaces.push({ id: ws.id, title: ws.title });
        }
      } else {
        skillMap.set(node.name, {
          name: node.name,
          category: node.category,
          priority: node.priority,
          workspaces: [{ id: ws.id, title: ws.title }],
          status: ws.skillProgress[node.name] ?? "not_started",
        });
      }
    }
  }

  res.json({ skills: [...skillMap.values()] });
});

export { app };

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n🧶 Ariadne engine running at http://localhost:${PORT}`);
    logTracingStatus();
    console.log();
  });
}
