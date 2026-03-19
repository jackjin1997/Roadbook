import { Router } from "express";
import * as store from "../store.js";
import { resolveSkillStatus } from "../store.js";
import type { SkillStatus, SkillProgressEntry } from "../types.js";

const router = Router();

// ── GET /skill-events ─────────────────────────────────────────────────────────

router.get("/skill-events", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const skillName = typeof req.query.skillName === "string" ? req.query.skillName : undefined;
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;

  const events = store.getSkillEvents({ limit, skillName, workspaceId });
  res.json({ events });
});

// ── GET /skill-index (moved from server.ts, enriched with lastActiveAt) ──────

router.get("/skill-index", (_req, res) => {
  const workspaces = store.loadAll();
  const skillMap = new Map<string, {
    name: string;
    category: string;
    priority: string;
    workspaces: { id: string; title: string }[];
    status: SkillStatus;
    lastActiveAt: number | null;
  }>();

  for (const ws of workspaces) {
    const trees = [
      ...(ws.roadmap?.skillTree ?? []),
      ...ws.sources.flatMap((s) => s.roadmap?.skillTree ?? []),
    ];
    for (const node of trees) {
      const entry = ws.skillProgress[node.name] as SkillStatus | SkillProgressEntry | undefined;
      const status = resolveSkillStatus(entry);
      const lastActiveAt = entry && typeof entry === "object" ? entry.lastActiveAt : null;

      const existing = skillMap.get(node.name);
      if (existing) {
        if (!existing.workspaces.some((w) => w.id === ws.id)) {
          existing.workspaces.push({ id: ws.id, title: ws.title });
        }
        // Keep the most recent lastActiveAt across workspaces
        if (lastActiveAt && (!existing.lastActiveAt || lastActiveAt > existing.lastActiveAt)) {
          existing.lastActiveAt = lastActiveAt;
        }
        // Upgrade status: mastered > learning > not_started
        const rank = { mastered: 2, learning: 1, not_started: 0 };
        if (rank[status] > rank[existing.status]) {
          existing.status = status;
        }
      } else {
        skillMap.set(node.name, {
          name: node.name,
          category: node.category,
          priority: node.priority,
          workspaces: [{ id: ws.id, title: ws.title }],
          status,
          lastActiveAt,
        });
      }
    }
  }

  res.json({ skills: [...skillMap.values()] });
});

export default router;
