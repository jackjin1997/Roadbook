import { createHash } from "crypto";
import { Router } from "express";
import * as store from "../store.js";
import { resolveSkillStatus } from "../store.js";
import { extractSkillTree } from "../nodes/extractSkillTree.js";
import type { SkillStatus, SkillProgressEntry, SkillNode } from "../types.js";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize skill names for fuzzy matching (exported for tests). */
export function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.js$/i, "")
    .replace(/\.ts$/i, "")
    .replace(/\s+/g, "")
    .trim();
}

/** In-memory cache: hash(JD text) → extracted SkillNode[] */
const jdCache = new Map<string, SkillNode[]>();

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Build a global skill map from all workspaces. */
function loadGlobalSkillMap(): Map<string, SkillProgressEntry> {
  const workspaces = store.loadAll();
  const skillMap = new Map<string, SkillProgressEntry>();

  for (const ws of workspaces) {
    for (const [name, entry] of Object.entries(ws.skillProgress)) {
      const resolved: SkillProgressEntry =
        typeof entry === "string"
          ? { status: entry as SkillStatus, lastActiveAt: ws.updatedAt, firstSeenAt: ws.createdAt }
          : entry;

      const existing = skillMap.get(name);
      if (!existing) {
        skillMap.set(name, resolved);
      } else {
        // Keep the highest status rank across workspaces
        const rank: Record<SkillStatus, number> = { mastered: 2, learning: 1, not_started: 0 };
        if (rank[resolved.status] > rank[existing.status]) {
          skillMap.set(name, resolved);
        }
      }
    }
  }

  return skillMap;
}

interface MatchedSkill {
  skill: string;
  priority: "high" | "medium" | "low";
}

interface MatchResult {
  matched: MatchedSkill[];
  learning: MatchedSkill[];
  missing: MatchedSkill[];
  score: number;
}

function compareSkills(
  targetSkills: SkillNode[],
  userSkills: Map<string, SkillProgressEntry>,
): MatchResult {
  const matched: MatchedSkill[] = [];
  const learning: MatchedSkill[] = [];
  const missing: MatchedSkill[] = [];

  for (const target of targetSkills) {
    const normalized = normalizeSkillName(target.name);
    const userEntry = [...userSkills.entries()].find(
      ([name]) => normalizeSkillName(name) === normalized,
    );

    if (userEntry) {
      const [name, entry] = userEntry;
      const item: MatchedSkill = { skill: name, priority: target.priority };
      if (entry.status === "mastered") matched.push(item);
      else if (entry.status === "learning") learning.push(item);
      else missing.push(item);
    } else {
      missing.push({ skill: target.name, priority: target.priority });
    }
  }

  const total = matched.length + learning.length + missing.length;
  const score = total > 0
    ? Math.round(((matched.length + learning.length * 0.5) / total) * 100)
    : 0;

  return { matched, learning, missing, score };
}

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

// ── POST /skill-match ────────────────────────────────────────────────────────

router.post("/skill-match", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const trimmed = text.trim();
  const hash = hashText(trimmed);

  try {
    let targetSkills: SkillNode[];

    // Check cache first
    const cached = jdCache.get(hash);
    if (cached) {
      targetSkills = cached;
    } else {
      const result = await extractSkillTree({
        input: trimmed,
        inputType: "jd",
        language: "English",
      });
      targetSkills = result.skillTree ?? [];
      jdCache.set(hash, targetSkills);
    }

    if (targetSkills.length === 0) {
      res.json({ matched: [], learning: [], missing: [], score: 0 });
      return;
    }

    const userSkills = loadGlobalSkillMap();
    const result = compareSkills(targetSkills, userSkills);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Skill extraction failed: ${message}` });
  }
});

// For testing: clear the JD cache
export function clearJdCache(): void {
  jdCache.clear();
}

export default router;
