import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "roadbook-store-test-"));
  vi.stubEnv("ARIADNE_DATA_DIR", tmpDir);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("SQLite store", () => {
  // Dynamic import to pick up ARIADNE_DATA_DIR
  let store: typeof import("../store.js");

  beforeAll(async () => {
    store = await import("../store.js");
  });

  afterAll(() => {
    store.closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    const all = store.loadAll();
    expect(all).toEqual([]);
  });

  it("inserts a workspace", () => {
    store.insertWorkspace({
      id: "ws1",
      title: "Test Workspace",
      createdAt: 1000,
      updatedAt: 1000,
      roadmap: null,
      sources: [],
      insights: [],
      researchTodos: [],
      skillProgress: {},
    });
    const all = store.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("ws1");
    expect(all[0].title).toBe("Test Workspace");
  });

  it("finds by id", () => {
    const ws = store.findById("ws1");
    expect(ws).toBeDefined();
    expect(ws!.title).toBe("Test Workspace");
  });

  it("returns undefined for unknown id", () => {
    expect(store.findById("nonexistent")).toBeUndefined();
  });

  it("updates a workspace", () => {
    const ws = store.findById("ws1")!;
    ws.title = "Updated Title";
    const result = store.updateWorkspace(ws);
    expect(result).toBe(true);

    const updated = store.findById("ws1")!;
    expect(updated.title).toBe("Updated Title");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(ws.updatedAt);
  });

  it("update returns false for unknown id", () => {
    const result = store.updateWorkspace({
      id: "nonexistent",
      title: "Ghost",
      createdAt: 0,
      updatedAt: 0,
      roadmap: null,
      sources: [],
      insights: [],
      researchTodos: [],
      skillProgress: {},
    });
    expect(result).toBe(false);
  });

  it("deletes a workspace", () => {
    const result = store.deleteWorkspace("ws1");
    expect(result).toBe(true);
    expect(store.findById("ws1")).toBeUndefined();
    expect(store.loadAll()).toHaveLength(0);
  });

  it("delete returns false for unknown id", () => {
    expect(store.deleteWorkspace("nonexistent")).toBe(false);
  });

  it("persists complex workspace data", () => {
    store.insertWorkspace({
      id: "ws2",
      title: "Complex WS",
      createdAt: 2000,
      updatedAt: 2000,
      roadmap: { id: "r1", markdown: "# Test", generatedAt: 2000, skillTree: [{ name: "React", category: "FE", subSkills: [], relatedConcepts: [], priority: "high", description: "UI" }] },
      sources: [{ id: "s1", type: "text", origin: "external", reference: "ref", snapshot: "content", ingestedAt: 2000, language: "en", roadmap: null, digestedSegmentIds: [] }],
      insights: [{ id: "i1", content: "test insight", createdAt: 2000 }],
      researchTodos: [{ id: "t1", topic: "research", status: "pending", createdAt: 2000 }],
      skillProgress: { React: "mastered" },
    });

    const ws = store.findById("ws2")!;
    expect(ws.roadmap).toBeDefined();
    expect((ws.roadmap as { skillTree: unknown[] }).skillTree).toHaveLength(1);
    expect(ws.sources).toHaveLength(1);
    expect(ws.insights).toHaveLength(1);
    expect(ws.researchTodos).toHaveLength(1);
    // skillProgress is migrated to SkillProgressEntry objects
    expect(ws.skillProgress.React).toEqual({
      status: "mastered",
      lastActiveAt: 2000,
      firstSeenAt: 2000,
    });

    // Cleanup
    store.deleteWorkspace("ws2");
  });

  it("loadAll returns sorted by updatedAt DESC", () => {
    store.insertWorkspace({ id: "a", title: "A", createdAt: 100, updatedAt: 100, roadmap: null, sources: [], insights: [], researchTodos: [], skillProgress: {} });
    store.insertWorkspace({ id: "b", title: "B", createdAt: 200, updatedAt: 200, roadmap: null, sources: [], insights: [], researchTodos: [], skillProgress: {} });
    store.insertWorkspace({ id: "c", title: "C", createdAt: 300, updatedAt: 300, roadmap: null, sources: [], insights: [], researchTodos: [], skillProgress: {} });

    const all = store.loadAll();
    expect(all[0].id).toBe("c");
    expect(all[2].id).toBe("a");

    store.deleteWorkspace("a");
    store.deleteWorkspace("b");
    store.deleteWorkspace("c");
  });
});

describe("skillProgress migration", () => {
  let migStore: typeof import("../store.js");
  let migDir: string;

  beforeAll(async () => {
    migDir = mkdtempSync(join(tmpdir(), "roadbook-skill-mig-test-"));
    vi.stubEnv("ARIADNE_DATA_DIR", migDir);
    vi.resetModules();
    migStore = await import("../store.js");
  });

  afterAll(() => {
    migStore.closeDb();
    rmSync(migDir, { recursive: true, force: true });
  });

  it("converts old string format to SkillProgressEntry", () => {
    const result = migStore.migrateSkillProgress(
      { React: "mastered", TypeScript: "learning" } as Record<string, any>,
      5000,
    );
    expect(result.React).toEqual({ status: "mastered", lastActiveAt: 5000, firstSeenAt: 5000 });
    expect(result.TypeScript).toEqual({ status: "learning", lastActiveAt: 5000, firstSeenAt: 5000 });
  });

  it("leaves already-migrated entries unchanged", () => {
    const existing = { status: "mastered" as const, lastActiveAt: 9999, firstSeenAt: 1111 };
    const result = migStore.migrateSkillProgress({ React: existing }, 5000);
    expect(result.React).toEqual(existing);
  });

  it("handles empty skillProgress", () => {
    const result = migStore.migrateSkillProgress({}, 5000);
    expect(result).toEqual({});
  });

  it("is idempotent — running twice produces same result", () => {
    const first = migStore.migrateSkillProgress({ React: "mastered" } as Record<string, any>, 5000);
    const second = migStore.migrateSkillProgress(first, 5000);
    expect(second).toEqual(first);
  });

  it("auto-migrates old skillProgress when loading workspace from DB", () => {
    migStore.insertWorkspace({
      id: "old-format-ws",
      title: "Old Format",
      createdAt: 3000,
      updatedAt: 3000,
      roadmap: null,
      sources: [],
      insights: [],
      researchTodos: [],
      skillProgress: { Vue: "learning" } as Record<string, any>,
    });

    const ws = migStore.findById("old-format-ws")!;
    expect(ws.skillProgress.Vue).toEqual({
      status: "learning",
      lastActiveAt: 3000,
      firstSeenAt: 3000,
    });
    migStore.deleteWorkspace("old-format-ws");
  });
});

describe("skill_events CRUD", () => {
  let evStore: typeof import("../store.js");
  let evDir: string;

  beforeAll(async () => {
    evDir = mkdtempSync(join(tmpdir(), "roadbook-events-test-"));
    vi.stubEnv("ARIADNE_DATA_DIR", evDir);
    vi.resetModules();
    evStore = await import("../store.js");
  });

  afterAll(() => {
    evStore.closeDb();
    rmSync(evDir, { recursive: true, force: true });
  });

  it("inserts and retrieves skill events", () => {
    // Need a workspace for FK
    evStore.insertWorkspace({
      id: "ev-ws", title: "Event WS", createdAt: 1000, updatedAt: 1000,
      roadmap: null, sources: [], insights: [], researchTodos: [], skillProgress: {},
    });

    evStore.insertSkillEvent({
      id: "ev1", skillName: "React", fromStatus: null, toStatus: "learning",
      source: "manual", timestamp: 1000, workspaceId: "ev-ws",
    });
    evStore.insertSkillEvent({
      id: "ev2", skillName: "React", fromStatus: "learning", toStatus: "mastered",
      source: "manual", timestamp: 2000, workspaceId: "ev-ws",
    });
    evStore.insertSkillEvent({
      id: "ev3", skillName: "TypeScript", fromStatus: null, toStatus: "learning",
      source: "generation", timestamp: 3000, workspaceId: "ev-ws",
    });

    const all = evStore.getSkillEvents({});
    expect(all).toHaveLength(3);
    // Sorted by timestamp DESC
    expect(all[0].id).toBe("ev3");
    expect(all[2].id).toBe("ev1");
  });

  it("filters by skillName", () => {
    const events = evStore.getSkillEvents({ skillName: "React" });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.skillName === "React")).toBe(true);
  });

  it("filters by workspaceId", () => {
    const events = evStore.getSkillEvents({ workspaceId: "ev-ws" });
    expect(events).toHaveLength(3);
  });

  it("respects limit", () => {
    const events = evStore.getSkillEvents({ limit: 1 });
    expect(events).toHaveLength(1);
  });

  it("deletes events by workspace", () => {
    evStore.deleteSkillEventsByWorkspace("ev-ws");
    const events = evStore.getSkillEvents({});
    expect(events).toHaveLength(0);
  });

  it("cascade deletes events when workspace is deleted", () => {
    evStore.insertSkillEvent({
      id: "cascade-ev1", skillName: "Node.js", fromStatus: null, toStatus: "learning",
      source: "chat", timestamp: 4000, workspaceId: "ev-ws",
    });
    expect(evStore.getSkillEvents({})).toHaveLength(1);

    evStore.deleteWorkspace("ev-ws");
    expect(evStore.getSkillEvents({})).toHaveLength(0);
  });
});

describe("resolveSkillStatus", () => {
  let resolveStore: typeof import("../store.js");
  let resolveDir: string;

  beforeAll(async () => {
    resolveDir = mkdtempSync(join(tmpdir(), "roadbook-resolve-test-"));
    vi.stubEnv("ARIADNE_DATA_DIR", resolveDir);
    vi.resetModules();
    resolveStore = await import("../store.js");
  });

  afterAll(() => {
    resolveStore.closeDb();
    rmSync(resolveDir, { recursive: true, force: true });
  });

  it("returns not_started for undefined", () => {
    expect(resolveStore.resolveSkillStatus(undefined)).toBe("not_started");
  });

  it("returns the string directly for old format", () => {
    expect(resolveStore.resolveSkillStatus("mastered")).toBe("mastered");
    expect(resolveStore.resolveSkillStatus("learning")).toBe("learning");
  });

  it("extracts status from SkillProgressEntry", () => {
    expect(resolveStore.resolveSkillStatus({ status: "mastered", lastActiveAt: 1000, firstSeenAt: 500 })).toBe("mastered");
  });
});

describe("resetDb", () => {
  let resetDir: string;
  let resetStore: typeof import("../store.js");

  beforeAll(async () => {
    resetDir = mkdtempSync(join(tmpdir(), "roadbook-reset-test-"));
    vi.stubEnv("ARIADNE_DATA_DIR", resetDir);
    vi.resetModules();
    resetStore = await import("../store.js");
  });

  afterAll(() => {
    resetStore.closeDb();
    rmSync(resetDir, { recursive: true, force: true });
  });

  it("closes and reinitializes the database", () => {
    resetStore.insertWorkspace({
      id: "reset-ws", title: "Reset Test", createdAt: 1000, updatedAt: 1000,
      roadmap: null, sources: [], insights: [], researchTodos: [], skillProgress: {},
    });
    expect(resetStore.loadAll()).toHaveLength(1);

    resetStore.resetDb();

    // After reset, loadAll should still work (reinitializes db)
    const all = resetStore.loadAll();
    expect(all).toHaveLength(1); // data persisted in SQLite
    resetStore.deleteWorkspace("reset-ws");
  });
});

describe("JSON migration", () => {
  let migDir: string;
  let store2: typeof import("../store.js");

  beforeAll(async () => {
    migDir = mkdtempSync(join(tmpdir(), "roadbook-mig-test-"));
    // Write a legacy JSON file
    const legacy = [{
      id: "legacy1",
      title: "Legacy WS",
      createdAt: 500,
      updatedAt: 500,
      sources: [{ id: "s1", type: "text", reference: "ref", snapshot: "snap", ingestedAt: 500, language: "en", roadmap: null }],
    }];
    writeFileSync(join(migDir, "workspaces.json"), JSON.stringify(legacy));

    vi.stubEnv("ARIADNE_DATA_DIR", migDir);
    // Need fresh module for the new DATA_DIR
    vi.resetModules();
    store2 = await import("../store.js");
  });

  afterAll(() => {
    store2.closeDb();
    rmSync(migDir, { recursive: true, force: true });
  });

  it("handles invalid JSON gracefully during migration", async () => {
    const badDir = mkdtempSync(join(tmpdir(), "roadbook-badjson-test-"));
    writeFileSync(join(badDir, "workspaces.json"), "NOT VALID JSON {{{");
    vi.stubEnv("ARIADNE_DATA_DIR", badDir);
    vi.resetModules();

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const badStore = await import("../store.js");
    // Should not throw — catch block handles it
    const all = badStore.loadAll();
    expect(all).toEqual([]);
    expect(spy).toHaveBeenCalledWith("JSON migration failed:", expect.anything());
    spy.mockRestore();
    badStore.closeDb();
    rmSync(badDir, { recursive: true, force: true });
  });

  it("migrates legacy JSON to SQLite", () => {
    const all = store2.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("legacy1");
    expect(all[0].title).toBe("Legacy WS");
    // Should have migrated missing fields
    expect(all[0].insights).toEqual([]);
    expect(all[0].researchTodos).toEqual([]);
    expect(all[0].skillProgress).toEqual({});
    expect(all[0].sources[0].origin).toBe("external");
    expect(all[0].sources[0].digestedSegmentIds).toEqual([]);
  });
});
