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
    expect(ws.roadmap!.skillTree).toHaveLength(1);
    expect(ws.sources).toHaveLength(1);
    expect(ws.insights).toHaveLength(1);
    expect(ws.researchTodos).toHaveLength(1);
    expect(ws.skillProgress.React).toBe("mastered");

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
