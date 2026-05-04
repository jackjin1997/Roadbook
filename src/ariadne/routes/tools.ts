import { Router } from "express";
import { generateRoadbook } from "../workflow.js";
import * as store from "../store.js";
import { resolveSkillStatus } from "../store.js";
import type { Insight, ResearchTodo, Source, SkillStatus, SkillProgressEntry } from "../types.js";
import { withWorkspaceLock } from "./workspace-lock.js";

const router = Router();

// ── Insights (T04) ────────────────────────────────────────────────────────────

router.post("/:id/insights", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  const { content, sourceRef } = req.body as { content?: string; sourceRef?: Insight["sourceRef"] };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }
  const insight: Insight = { id: crypto.randomUUID(), content: content.trim(), sourceRef, createdAt: Date.now() };
  workspace.insights.push(insight);
  store.updateWorkspace(workspace);
  res.status(201).json(insight);
});

router.delete("/:id/insights/:insightId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.insights = workspace.insights.filter((i) => i.id !== req.params.insightId);
  store.updateWorkspace(workspace);
  res.json({ ok: true });
});

// ── Research Todos (T05) ──────────────────────────────────────────────────────

router.post("/:id/research-todos", (req, res) => {
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

router.patch("/:id/research-todos/:todoId", (req, res) => {
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

router.delete("/:id/research-todos/:todoId", (req, res) => {
  const workspace = store.findById(req.params.id);
  if (!workspace) { res.status(404).json({ error: "Not found" }); return; }
  workspace.researchTodos = workspace.researchTodos.filter((t) => t.id !== req.params.todoId);
  store.updateWorkspace(workspace);
  res.json({ ok: true });
});

router.post("/:id/research-todos/:todoId/run", async (req, res) => {
  if (!store.findById(req.params.id)) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const result = await withWorkspaceLock(req.params.id, async () => {
      // Phase 1: mark in-progress (short transaction inside the lock)
      const workspace = store.findById(req.params.id);
      if (!workspace) throw new Error("Workspace vanished");
      const todo = workspace.researchTodos.find((t) => t.id === req.params.todoId);
      if (!todo) throw new Error("Todo not found");

      todo.status = "in-progress";
      store.updateWorkspace(workspace);

      try {
        const output = await generateRoadbook(
          `Research topic: ${todo.topic}\n\n${todo.description ?? ""}`,
          "Chinese",
        );
        // Re-read the workspace AFTER the long LLM call — another handler
        // may have mutated other fields concurrently. We still hold the
        // workspace lock so nobody else is writing right now, but this is
        // defensive against future parallel-handler chains.
        const freshWorkspace = store.findById(req.params.id);
        if (!freshWorkspace) throw new Error("Workspace vanished during generation");
        const freshTodo = freshWorkspace.researchTodos.find((t) => t.id === req.params.todoId);
        if (!freshTodo) throw new Error("Todo vanished during generation");

        const source: Source = {
          id: crypto.randomUUID(), type: "text", origin: "research",
          reference: freshTodo.topic,
          snapshot: `Research: ${freshTodo.topic}\n\n${freshTodo.description ?? ""}`,
          ingestedAt: Date.now(),
          language: "Chinese",
          roadmap: { id: crypto.randomUUID(), markdown: output.markdown, skillTree: output.skillTree, generatedAt: Date.now() },
          digestedSegmentIds: [],
        };
        freshWorkspace.sources.push(source);
        freshTodo.status = "done";
        freshTodo.resultSourceId = source.id;
        store.updateWorkspace(freshWorkspace);
        return { todo: freshTodo, source };
      } catch (innerErr) {
        // Roll back status inside the same lock
        const ws = store.findById(req.params.id);
        if (ws) {
          const t = ws.researchTodos.find((t) => t.id === req.params.todoId);
          if (t) { t.status = "pending"; store.updateWorkspace(ws); }
        }
        throw innerErr;
      }
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Skill Progress (T17) ─────────────────────────────────────────────────────

router.patch("/:id/skill-progress", (req, res) => {
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

export default router;
