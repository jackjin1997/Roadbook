/**
 * SQLite-backed workspace store with WAL mode and JSON blob storage.
 * Drop-in replacement for the previous JSON file store.
 * Supports automatic migration from workspaces.json.
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

import type { Workspace, SkillProgressEntry, SkillStatus, SkillEvent } from "./types.js";
export type { Workspace };

// ── Database setup ───────────────────────────────────────────────────────────

const DATA_DIR = process.env.ARIADNE_DATA_DIR ?? join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "roadbook.db");
const OLD_JSON = join(DATA_DIR, "workspaces.json");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS skill_events (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      workspace_id TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  // Create indexes (IF NOT EXISTS not supported for indexes in all SQLite versions, so use try/catch)
  try {
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON skill_events(timestamp DESC)`);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_events_skill ON skill_events(skill_name)`);
  } catch {
    // Indexes already exist
  }

  // Migrate from JSON if needed
  migrateFromJson(_db);

  return _db;
}

// ── Migration from workspaces.json ──────────────────────────────────────────

function migrateFromJson(db: Database.Database) {
  if (!existsSync(OLD_JSON)) return;

  // Check if already migrated (table has rows)
  const count = db.prepare("SELECT COUNT(*) as c FROM workspaces").get() as { c: number };
  if (count.c > 0) return;

  try {
    const raw = JSON.parse(readFileSync(OLD_JSON, "utf-8")) as Workspace[];
    const insert = db.prepare(
      "INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)"
    );

    const tx = db.transaction(() => {
      for (const w of raw) {
        const migrated = migrateWorkspace(w);
        insert.run(migrated.id, migrated.title, migrated.createdAt, migrated.updatedAt, JSON.stringify(migrated));
      }
    });
    tx();

    // Rename old file so we don't re-migrate
    renameSync(OLD_JSON, OLD_JSON + ".bak");
    console.log(`Migrated ${raw.length} workspace(s) from JSON to SQLite`);
  } catch (err) {
    console.error("JSON migration failed:", err);
  }
}

/**
 * Helper: resolve a skillProgress entry to its SkillStatus string.
 * Handles both old format (plain string) and new format (SkillProgressEntry object).
 */
export function resolveSkillStatus(
  entry: SkillStatus | SkillProgressEntry | undefined,
): SkillStatus {
  if (!entry) return "not_started";
  if (typeof entry === "string") return entry;
  return entry.status;
}

/**
 * Migrate skillProgress from old string format to SkillProgressEntry objects.
 * Idempotent: already-migrated entries are left unchanged.
 */
export function migrateSkillProgress(
  raw: Record<string, SkillStatus | SkillProgressEntry>,
  fallbackTimestamp: number,
): Record<string, SkillProgressEntry> {
  const result: Record<string, SkillProgressEntry> = {};
  for (const [name, val] of Object.entries(raw)) {
    if (typeof val === "string") {
      result[name] = {
        status: val as SkillStatus,
        lastActiveAt: fallbackTimestamp,
        firstSeenAt: fallbackTimestamp,
      };
    } else {
      result[name] = val;
    }
  }
  return result;
}

function migrateWorkspace(w: Workspace): Workspace {
  const fallbackTs = w.updatedAt || w.createdAt || Date.now();
  return {
    ...w,
    roadmap: w.roadmap ?? null,
    insights: w.insights ?? [],
    researchTodos: w.researchTodos ?? [],
    skillProgress: migrateSkillProgress(w.skillProgress ?? {}, fallbackTs),
    sources: (w.sources ?? []).map((s) => ({
      ...s,
      origin: s.origin ?? ("external" as const),
      digestedSegmentIds: s.digestedSegmentIds ?? [],
    })),
  };
}

// ── CRUD operations ──────────────────────────────────────────────────────────

export function loadAll(): Workspace[] {
  const db = getDb();
  const rows = db.prepare("SELECT data FROM workspaces ORDER BY updated_at DESC").all() as { data: string }[];
  return rows.map((r) => migrateWorkspace(JSON.parse(r.data)));
}

export function findById(id: string): Workspace | undefined {
  const db = getDb();
  const row = db.prepare("SELECT data FROM workspaces WHERE id = ?").get(id) as { data: string } | undefined;
  if (!row) return undefined;
  return migrateWorkspace(JSON.parse(row.data));
}

export function insertWorkspace(workspace: Workspace): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO workspaces (id, title, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)"
  ).run(workspace.id, workspace.title, workspace.createdAt, workspace.updatedAt, JSON.stringify(workspace));
}

export function updateWorkspace(workspace: Workspace): boolean {
  workspace.updatedAt = Date.now();
  const db = getDb();
  const result = db.prepare(
    "UPDATE workspaces SET title = ?, updated_at = ?, data = ? WHERE id = ?"
  ).run(workspace.title, workspace.updatedAt, JSON.stringify(workspace), workspace.id);
  return result.changes > 0;
}

export function deleteWorkspace(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Skill Events CRUD ─────────────────────────────────────────────────────────

export function insertSkillEvent(event: SkillEvent): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO skill_events (id, skill_name, from_status, to_status, source, timestamp, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(event.id, event.skillName, event.fromStatus, event.toStatus, event.source, event.timestamp, event.workspaceId ?? null);
}

export interface SkillEventFilters {
  limit?: number;
  skillName?: string;
  workspaceId?: string;
}

export function getSkillEvents(filters: SkillEventFilters = {}): SkillEvent[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.skillName) {
    conditions.push("skill_name = ?");
    params.push(filters.skillName);
  }
  if (filters.workspaceId) {
    conditions.push("workspace_id = ?");
    params.push(filters.workspaceId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;

  const rows = db.prepare(
    `SELECT id, skill_name, from_status, to_status, source, timestamp, workspace_id FROM skill_events ${where} ORDER BY timestamp DESC LIMIT ?`
  ).all(...params, limit) as Array<{
    id: string;
    skill_name: string;
    from_status: string | null;
    to_status: string;
    source: string;
    timestamp: number;
    workspace_id: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    skillName: r.skill_name,
    fromStatus: r.from_status as SkillStatus | null,
    toStatus: r.to_status as SkillStatus,
    source: r.source as "manual" | "generation" | "chat",
    timestamp: r.timestamp,
    workspaceId: r.workspace_id ?? undefined,
  }));
}

export function deleteSkillEventsByWorkspace(workspaceId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM skill_events WHERE workspace_id = ?").run(workspaceId);
}

/**
 * Close the database connection (for tests / cleanup).
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * For tests: reset the module-level db reference (e.g., after changing DATA_DIR).
 */
export function resetDb(): void {
  closeDb();
}
