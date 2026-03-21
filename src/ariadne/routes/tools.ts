import { Router } from "express";
import { generateRoadbook } from "../workflow.js";
import * as store from "../store.js";
import { resolveSkillStatus } from "../store.js";
import type { Insight, ResearchTodo, Source, SkillStatus, SkillProgressEntry } from "../types.js";

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
