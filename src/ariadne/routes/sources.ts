import { Router } from "express";
import { generateRoadbook } from "../workflow.js";
import type { ModelOverride } from "../workflow.js";
import { removeSource } from "../rag.js";
import * as store from "../store.js";
import { inferProvider } from "../config.js";
import { getModel } from "../config.js";
import type { ModelProvider } from "../config.js";
import { fetchUrlSnapshot, extractFileText } from "../content-extractor.js";
import type { Source } from "../types.js";
import { setupSSE, upload } from "./helpers.js";

const router = Router();

// Add source
router.post("/:id/sources", (req, res) => {
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
router.post("/:id/sources/url", async (req, res) => {
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
router.post("/:id/sources/file", upload.single("file"), async (req, res) => {
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
router.delete("/:id/sources/:sourceId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const removed = workspace.sources.find((s) => s.id === req.params.sourceId);
  workspace.sources = workspace.sources.filter((s) => s.id !== req.params.sourceId);
  if (removed) removeSource(workspace.id, removed.reference);
  store.updateWorkspace(workspace);
  res.json({ ok: true });
});

// Generate roadmap for a single source
router.post("/:id/sources/:sourceId/generate", async (req, res) => {
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

// Digest (T03)
router.post("/:id/digest", async (req, res) => {
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

export default router;
