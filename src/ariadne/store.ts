/**
 * SQLite-backed workspace store with WAL mode and JSON blob storage.
 * Drop-in replacement for the previous JSON file store.
 * Supports automatic migration from workspaces.json.
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

// Workspace type — mirrors server.ts to avoid circular import.
// Uses SkillNode from types.ts for priority union type compatibility.
import type { SkillNode } from "./types.js";

interface Roadmap {
  id: string;
  markdown: string;
  skillTree?: SkillNode[];
  generatedAt: number;
}

interface Source {
  id: string;
  type: "text" | "url" | "file";
  origin: "external" | "research";
  reference: string;
  snapshot: string;
  ingestedAt: number;
  language: string;
  roadmap: Roadmap | null;
  digestedSegmentIds: string[];
}

interface Insight {
  id: string;
  content: string;
  sourceRef?: { sourceId: string; segment?: string };
  createdAt: number;
}

interface ResearchTodo {
  id: string;
  topic: string;
  description?: string;
  status: "pending" | "in-progress" | "done";
  linkedSkillNode?: string;
  resultSourceId?: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  roadmap: Roadmap | null;
  sources: Source[];
  insights: Insight[];
  researchTodos: ResearchTodo[];
  skillProgress: Record<string, "not_started" | "learning" | "mastered">;
}

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

  // Create table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `);

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

function migrateWorkspace(w: Workspace): Workspace {
  return {
    ...w,
    roadmap: w.roadmap ?? null,
    insights: w.insights ?? [],
    researchTodos: w.researchTodos ?? [],
    skillProgress: w.skillProgress ?? {},
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
