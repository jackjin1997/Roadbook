import { Router } from "express";
import { generateJourneyRoadbook } from "../workflow.js";
import type { ModelOverride } from "../workflow.js";
import * as store from "../store.js";
import { inferProvider } from "../config.js";
import { setupSSE } from "./helpers.js";

const router = Router();

// Generate journey roadmap (multi-source merge)
router.post("/:id/generate-journey", async (req, res) => {
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

export default router;
