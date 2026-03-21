import { Router } from "express";
import * as store from "../store.js";
import { resolveSkillStatus } from "../store.js";
import { clearStore } from "../rag.js";
import type { Workspace } from "../types.js";

const router = Router();

// List workspaces (metadata only)
router.get("/", (_req, res) => {
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
router.post("/", (req, res) => {
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
router.get("/:id", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  res.json(workspace);
});

// Update workspace (rename)
router.patch("/:id", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { title } = req.body as { title?: string };
  if (title?.trim()) workspace.title = title.trim();
  store.updateWorkspace(workspace);
  res.json(workspace);
});

// Delete workspace
router.delete("/:id", (req, res) => {
  clearStore(req.params.id);
  store.deleteWorkspace(req.params.id);
  res.json({ ok: true });
});

export default router;
