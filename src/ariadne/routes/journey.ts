import { Router } from "express";
import { generateJourneyRoadbook } from "../workflow.js";
import type { ModelOverride } from "../workflow.js";
import * as store from "../store.js";
import { inferProvider } from "../config.js";
import { setupSSE } from "./helpers.js";
import { withWorkspaceLock } from "./workspace-lock.js";

const router = Router();

// Generate journey roadmap (multi-source merge)
router.post("/:id/generate-journey", async (req, res) => {
  // Fast-path validation returns JSON (not SSE) so clients can distinguish
  // 400/404 from in-stream errors.
  const preCheck = store.findById(req.params.id);
  if (!preCheck) { res.status(404).json({ error: "Not found" }); return; }

  const { sourceIds, model } = req.body as { sourceIds?: string[]; model?: string };
  const preSelected = sourceIds?.length
    ? preCheck.sources.filter((s) => sourceIds.includes(s.id))
    : preCheck.sources;
  if (preSelected.length === 0) { res.status(400).json({ error: "No sources selected" }); return; }

  const modelOverride: ModelOverride | undefined = model
    ? { provider: inferProvider(model), modelName: model }
    : undefined;

  const sse = setupSSE(req, res);

  try {
    await withWorkspaceLock(req.params.id, async () => {
      const workspace = store.findById(req.params.id);
      if (!workspace) throw new Error("Workspace vanished");

      const selected = sourceIds?.length
        ? workspace.sources.filter((s) => sourceIds.includes(s.id))
        : workspace.sources;
      if (selected.length === 0) throw new Error("No sources selected");

      const snapshots = selected.map((s) => ({ text: s.snapshot, language: s.language }));
      const output = await generateJourneyRoadbook(snapshots, {
        onProgress: (evt) => sse.send({ type: "progress", ...evt }),
        modelOverride,
        signal: sse.signal,
      });
      if (sse.closed()) return;
      workspace.roadmap = { id: workspace.roadmap?.id ?? crypto.randomUUID(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() };

      if (workspace.title === "New Journey") {
        const titleMatch = output.markdown.match(/^#\s+(.+)$/m);
        if (titleMatch) workspace.title = titleMatch[1].trim();
      }

      store.updateWorkspace(workspace);
      sse.send({ type: "done", roadmap: workspace.roadmap, workspaceTitle: workspace.title, failedSkills: output.failedSkills });
    });
  } catch (err) {
    if (sse.closed()) return;
    const message = err instanceof Error ? err.message : String(err);
    sse.send({ type: "error", error: message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

export default router;
