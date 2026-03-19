import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Server } from "http";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

const mockExtractSkillTree = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(function () { return { invoke: vi.fn(), stream: vi.fn() }; }),
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(function () {
    return { invoke: vi.fn(async () => ({ content: "OCR extracted text" })) };
  }),
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: vi.fn(function () { return { invoke: vi.fn() }; }),
}));
vi.mock("@langchain/tavily", () => ({
  TavilySearchAPIWrapper: vi.fn(function () { return { rawResults: vi.fn() }; }),
}));

vi.mock("../workflow.js", () => ({
  generateRoadbook: vi.fn(async () => ({
    markdown: "# Mock", skillTree: [],
  })),
  generateJourneyRoadbook: vi.fn(async () => ({
    markdown: "# Mock Journey", skillTree: [],
  })),
}));

vi.mock("../chat.js", () => ({
  chat: vi.fn(async () => ({ reply: "Mock", roadbookUpdate: null })),
  chatStream: vi.fn(async function* () { yield "Mock"; }),
  buildChatMessages: vi.fn(() => []),
  extractRoadbookUpdate: vi.fn(() => null),
  stripRoadbookBlock: vi.fn((s: string) => s),
}));

vi.mock("../config.js", () => ({
  setModelConfig: vi.fn(),
  inferProvider: vi.fn(() => "openai" as const),
  getModel: vi.fn(() => ({
    invoke: vi.fn(async () => ({ content: "mock" })),
    stream: vi.fn(),
    withStructuredOutput: vi.fn().mockReturnValue({ invoke: vi.fn() }),
  })),
}));

vi.mock("../tracing.js", () => ({
  logTracingStatus: vi.fn(),
  isTracingEnabled: vi.fn(() => false),
  getTracingStatus: vi.fn(() => ({ enabled: false, hasApiKey: false, project: "default" })),
}));

vi.mock("../rag.js", () => ({
  ingestSource: vi.fn(async () => 0),
  retrieve: vi.fn(async () => []),
  removeSource: vi.fn(),
  clearStore: vi.fn(),
}));

vi.mock("../content-extractor.js", () => ({
  fetchUrlSnapshot: vi.fn(async () => "mock snapshot"),
  extractFileText: vi.fn(async () => "mock text"),
}));

vi.mock("../nodes/extractSkillTree.js", () => ({
  extractSkillTree: mockExtractSkillTree,
}));

// ── Test server setup ─────────────────────────────────────────────────────────

let baseUrl: string;
let server: Server;
let tmpDir: string;
let storeModule: typeof import("../store.js");
let clearJdCache: () => void;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "roadbook-match-test-"));
  vi.stubEnv("ARIADNE_DATA_DIR", tmpDir);
  vi.stubEnv("NODE_ENV", "test");

  const { app } = await import("../server.js");
  storeModule = await import("../store.js");
  const skillRoutes = await import("../routes/skills.js");
  clearJdCache = skillRoutes.clearJdCache;

  await new Promise<void>((resolve) => {
    server = (app as any).listen(0, () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  storeModule.closeDb();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

beforeEach(() => {
  mockExtractSkillTree.mockReset();
  clearJdCache();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as T;
  return { status: res.status, data };
}

function createWorkspaceWithSkills(
  id: string,
  skills: Record<string, import("../types.js").SkillStatus | import("../types.js").SkillProgressEntry>,
) {
  storeModule.insertWorkspace({
    id,
    title: "Test WS",
    createdAt: 1000,
    updatedAt: 1000,
    roadmap: null,
    sources: [],
    insights: [],
    researchTodos: [],
    skillProgress: skills,
  });
}

// ── normalizeSkillName ────────────────────────────────────────────────────────

describe("normalizeSkillName", () => {
  let normalizeSkillName: (name: string) => string;

  beforeAll(async () => {
    const mod = await import("../routes/skills.js");
    normalizeSkillName = mod.normalizeSkillName;
  });

  it("lowercases skill names", () => {
    expect(normalizeSkillName("React")).toBe("react");
    expect(normalizeSkillName("TypeScript")).toBe("typescript");
  });

  it("strips .js suffix", () => {
    expect(normalizeSkillName("Node.js")).toBe("node");
    expect(normalizeSkillName("Vue.js")).toBe("vue");
  });

  it("strips .ts suffix", () => {
    expect(normalizeSkillName("Deno.ts")).toBe("deno");
  });

  it("removes whitespace", () => {
    expect(normalizeSkillName("Machine Learning")).toBe("machinelearning");
    expect(normalizeSkillName("  React  ")).toBe("react");
  });

  it("handles mixed cases", () => {
    expect(normalizeSkillName("Next.JS")).toBe("next");
  });
});

// ── POST /skill-match ────────────────────────────────────────────────────────

describe("POST /skill-match", () => {
  afterEach(() => {
    // Clean up workspaces
    for (const ws of storeModule.loadAll()) {
      storeModule.deleteWorkspace(ws.id);
    }
  });

  it("returns 400 for empty text", async () => {
    const { status, data } = await api<{ error: string }>("POST", "/skill-match", { text: "" });
    expect(status).toBe(400);
    expect(data.error).toBe("text is required");
  });

  it("returns 400 for missing text", async () => {
    const { status, data } = await api<{ error: string }>("POST", "/skill-match", {});
    expect(status).toBe(400);
    expect(data.error).toBe("text is required");
  });

  it("returns all skills as missing when user has no skills", async () => {
    mockExtractSkillTree.mockResolvedValueOnce({
      inputType: "jd",
      title: "Test JD",
      skillTree: [
        { name: "React", category: "Framework", subSkills: [], relatedConcepts: [], priority: "high", description: "UI" },
        { name: "TypeScript", category: "Language", subSkills: [], relatedConcepts: [], priority: "medium", description: "Types" },
      ],
    });

    const { status, data } = await api<any>("POST", "/skill-match", { text: "Looking for React and TypeScript developer" });
    expect(status).toBe(200);
    expect(data.matched).toEqual([]);
    expect(data.learning).toEqual([]);
    expect(data.missing).toHaveLength(2);
    expect(data.score).toBe(0);
  });

  it("returns full match when all skills are mastered", async () => {
    createWorkspaceWithSkills("match-ws-1", {
      React: { status: "mastered", lastActiveAt: 1000, firstSeenAt: 500 },
      TypeScript: { status: "mastered", lastActiveAt: 1000, firstSeenAt: 500 },
    });

    mockExtractSkillTree.mockResolvedValueOnce({
      inputType: "jd",
      title: "Test JD",
      skillTree: [
        { name: "React", category: "Framework", subSkills: [], relatedConcepts: [], priority: "high", description: "UI" },
        { name: "TypeScript", category: "Language", subSkills: [], relatedConcepts: [], priority: "medium", description: "Types" },
      ],
    });

    const { status, data } = await api<any>("POST", "/skill-match", { text: "Need React and TypeScript" });
    expect(status).toBe(200);
    expect(data.matched).toHaveLength(2);
    expect(data.learning).toEqual([]);
    expect(data.missing).toEqual([]);
    expect(data.score).toBe(100);
  });

  it("returns partial match with mixed statuses", async () => {
    createWorkspaceWithSkills("match-ws-2", {
      React: { status: "mastered", lastActiveAt: 1000, firstSeenAt: 500 },
      GraphQL: { status: "learning", lastActiveAt: 1000, firstSeenAt: 500 },
    });

    mockExtractSkillTree.mockResolvedValueOnce({
      inputType: "jd",
      title: "Test JD",
      skillTree: [
        { name: "React", category: "Framework", subSkills: [], relatedConcepts: [], priority: "high", description: "UI" },
        { name: "GraphQL", category: "API", subSkills: [], relatedConcepts: [], priority: "medium", description: "Query" },
        { name: "K8s", category: "Infra", subSkills: [], relatedConcepts: [], priority: "low", description: "Container" },
      ],
    });

    const { status, data } = await api<any>("POST", "/skill-match", { text: "Need React, GraphQL, K8s" });
    expect(status).toBe(200);
    expect(data.matched).toHaveLength(1);
    expect(data.learning).toHaveLength(1);
    expect(data.missing).toHaveLength(1);
    // (1 * 1 + 1 * 0.5) / 3 * 100 = 50
    expect(data.score).toBe(50);
  });

  it("uses fuzzy matching (case insensitive, .js suffix)", async () => {
    createWorkspaceWithSkills("match-ws-3", {
      "Node.js": { status: "mastered", lastActiveAt: 1000, firstSeenAt: 500 },
    });

    mockExtractSkillTree.mockResolvedValueOnce({
      inputType: "jd",
      title: "Test JD",
      skillTree: [
        { name: "node.js", category: "Runtime", subSkills: [], relatedConcepts: [], priority: "high", description: "Server" },
      ],
    });

    const { status, data } = await api<any>("POST", "/skill-match", { text: "Need Node.js experience" });
    expect(status).toBe(200);
    expect(data.matched).toHaveLength(1);
    expect(data.matched[0].skill).toBe("Node.js");
    expect(data.score).toBe(100);
  });

  it("caches results — extractSkillTree is called only once for same text", async () => {
    mockExtractSkillTree.mockResolvedValue({
      inputType: "jd",
      title: "Test JD",
      skillTree: [
        { name: "Python", category: "Language", subSkills: [], relatedConcepts: [], priority: "high", description: "Language" },
      ],
    });

    const text = "Senior Python developer needed with cache test";
    await api("POST", "/skill-match", { text });
    await api("POST", "/skill-match", { text });

    expect(mockExtractSkillTree).toHaveBeenCalledTimes(1);
  });

  it("handles LLM errors gracefully", async () => {
    mockExtractSkillTree.mockRejectedValueOnce(new Error("LLM timeout"));

    const { status, data } = await api<{ error: string }>("POST", "/skill-match", { text: "Some JD text" });
    expect(status).toBe(500);
    expect(data.error).toContain("Skill extraction failed");
    expect(data.error).toContain("LLM timeout");
  });

  it("returns empty results when skill tree extraction returns empty", async () => {
    mockExtractSkillTree.mockResolvedValueOnce({
      inputType: "jd",
      title: "Test",
      skillTree: [],
    });

    const { status, data } = await api<any>("POST", "/skill-match", { text: "vague text with no skills" });
    expect(status).toBe(200);
    expect(data.matched).toEqual([]);
    expect(data.learning).toEqual([]);
    expect(data.missing).toEqual([]);
    expect(data.score).toBe(0);
  });
});
