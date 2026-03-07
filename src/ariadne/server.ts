import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { generateRoadbook } from "./workflow.js";
import { setModelConfig } from "./config.js";
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
  type: "text";
  reference: string;
  snapshot: string;
  ingestedAt: number;
  language: string;
  roadmap: Roadmap | null;
}

export interface Workspace {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sources: Source[];
}

// ── Store ────────────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "workspaces.json");

function loadStore(): Workspace[] {
  try {
    if (!existsSync(STORE_FILE)) return [];
    return JSON.parse(readFileSync(STORE_FILE, "utf-8"));
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

const app = express();
const PORT = Number(process.env.ARIADNE_PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", engine: "ariadne" });
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
    sources: [],
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
    reference: text.trim(),
    snapshot: text.trim(),
    ingestedAt: Date.now(),
    language: language ?? "English",
    roadmap: null,
  };
  workspace.sources.push(source);
  updateWorkspace(workspace);
  res.status(201).json(source);
});

// Delete source
app.delete("/workspaces/:id/sources/:sourceId", (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.sources = workspace.sources.filter((s) => s.id !== req.params.sourceId);
  updateWorkspace(workspace);
  res.json({ ok: true });
});

// ── Generate roadmap ──────────────────────────────────────────────────────────

app.post("/workspaces/:id/sources/:sourceId/generate", async (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const source = workspace.sources.find((s) => s.id === req.params.sourceId);
  if (!source) { res.status(404).json({ error: "Source not found" }); return; }

  const { provider, model } = req.body as { provider?: ModelProvider; model?: string };
  if (provider || model) setModelConfig({ provider, modelName: model });

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
  }
});

app.listen(PORT, () => {
  console.log(`\n🧶 Ariadne engine running at http://localhost:${PORT}`);
  logTracingStatus();
  console.log();
});
