import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Server } from "http";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

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
    markdown: "# Mock Roadbook\n\n## Core Skills\n- React\n- TypeScript",
    skillTree: [{ name: "React", category: "Framework", subSkills: ["Hooks"], relatedConcepts: ["TypeScript"], priority: "high", description: "UI library" }],
  })),
  generateJourneyRoadbook: vi.fn(async () => ({
    markdown: "# Mock Journey Roadmap\n\n## Phase 1\n- Foundations",
    skillTree: [{ name: "Foundations", category: "Core", subSkills: ["Basics"], relatedConcepts: [], priority: "medium", description: "Core foundations" }],
  })),
}));

vi.mock("../chat.js", () => ({
  chat: vi.fn(async () => ({ reply: "Mock chat reply", roadbookUpdate: null })),
  chatStream: vi.fn(async function* () { yield "Mock "; yield "response"; }),
  buildChatMessages: vi.fn(() => []),
  extractRoadbookUpdate: vi.fn(() => null),
  stripRoadbookBlock: vi.fn((s: string) => s),
}));

vi.mock("../config.js", () => ({
  setModelConfig: vi.fn(),
  inferProvider: vi.fn(() => "openai" as const),
  getModel: vi.fn(() => ({
    invoke: vi.fn(async () => ({ content: "# Digested Journey Roadmap\n\n## Skills\n- Merged" })),
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

// ── Test server setup ─────────────────────────────────────────────────────────

let baseUrl: string;
let server: Server;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "roadbook-server-test-"));
  vi.stubEnv("ARIADNE_DATA_DIR", tmpDir);
  vi.stubEnv("NODE_ENV", "test");

  // Dynamic import AFTER env is stubbed so module-level DATA_DIR picks up tmpDir
  const { app } = await import("../server.js");
  await new Promise<void>((resolve) => {
    server = (app as any).listen(0, () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  // Close SQLite before removing tmpDir
  const storeModule = await import("../store.js");
  storeModule.closeDb();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
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

/** Parse an SSE response and return the last "done" event's data. */
async function ssePost<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // Parse SSE lines and find the "done" event
  let result: T | undefined;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = JSON.parse(line.slice(6));
    if (data.type === "done") result = data as T;
    if (data.type === "error") throw new Error(data.error);
  }
  if (!result) throw new Error(`No done event in SSE response: ${text.slice(0, 200)}`);
  return { status: res.status, data: result };
}

const get = <T>(path: string) => api<T>("GET", path);
const post = <T>(path: string, body?: unknown) => api<T>("POST", path, body);
const patch = <T>(path: string, body: unknown) => api<T>("PATCH", path, body);
const del = <T>(path: string) => api<T>("DELETE", path);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns ok status", async () => {
    const { status, data } = await get<{ status: string }>("/health");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
  });
});

describe("Workspace CRUD", () => {
  let workspaceId: string;

  it("POST /workspaces creates a new workspace", async () => {
    const { status, data } = await post<{ id: string; title: string }>("/workspaces", { title: "Test Journey" });
    expect(status).toBe(201);
    expect(data.title).toBe("Test Journey");
    expect(data.id).toBeTruthy();
    workspaceId = data.id;
  });

  it("POST /workspaces uses default title when omitted", async () => {
    const { status, data } = await post<{ title: string }>("/workspaces");
    expect(status).toBe(201);
    expect(data.title).toBe("New Journey");
  });

  it("GET /workspaces lists all workspaces", async () => {
    const { status, data } = await get<Array<{ id: string }>>("/workspaces");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /workspaces/:id returns full workspace", async () => {
    const { status, data } = await get<{ id: string; title: string; sources: unknown[] }>(`/workspaces/${workspaceId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(workspaceId);
    expect(data.title).toBe("Test Journey");
    expect(Array.isArray(data.sources)).toBe(true);
  });

  it("GET /workspaces/:id returns 404 for unknown id", async () => {
    const { status } = await get("/workspaces/does-not-exist");
    expect(status).toBe(404);
  });

  it("PATCH /workspaces/:id renames the workspace", async () => {
    const { status, data } = await patch<{ title: string }>(`/workspaces/${workspaceId}`, { title: "Renamed Journey" });
    expect(status).toBe(200);
    expect(data.title).toBe("Renamed Journey");
  });

  it("PATCH /workspaces/:id ignores blank title", async () => {
    const { status, data } = await patch<{ title: string }>(`/workspaces/${workspaceId}`, { title: "   " });
    // title unchanged
    expect(status).toBe(200);
    expect(data.title).toBe("Renamed Journey");
  });

  it("DELETE /workspaces/:id removes workspace", async () => {
    const { data: newWs } = await post<{ id: string }>("/workspaces", { title: "To Delete" });
    const { status } = await del(`/workspaces/${newWs.id}`);
    expect(status).toBe(200);
    const { status: getStatus } = await get(`/workspaces/${newWs.id}`);
    expect(getStatus).toBe(404);
  });

  it("GET /workspaces returns skillCount and masteredCount", async () => {
    const { data: ws } = await post<{ id: string }>("/workspaces", { title: "Skills List Test" });
    // Add source + generate to get skill tree
    await post(`/workspaces/${ws.id}/sources`, { text: "Learn React", language: "English" });
    const { data: list } = await get<{ id: string; skillCount: number; masteredCount: number }[]>("/workspaces");
    const item = list.find((w) => w.id === ws.id);
    expect(item).toBeDefined();
    expect(typeof item!.skillCount).toBe("number");
    expect(typeof item!.masteredCount).toBe("number");
  });

  it("GET /workspaces returns sourceCount and generatedCount", async () => {
    const { data } = await get<Array<{ id: string; sourceCount: number; generatedCount: number }>>("/workspaces");
    const ws = data.find((w) => w.id === workspaceId);
    expect(ws).toBeDefined();
    expect(typeof ws!.sourceCount).toBe("number");
    expect(typeof ws!.generatedCount).toBe("number");
  });
});

describe("Source CRUD", () => {
  let workspaceId: string;
  let sourceId: string;

  beforeAll(async () => {
    const { data } = await post<{ id: string }>("/workspaces", { title: "Source Test WS" });
    workspaceId = data.id;
  });

  it("POST /workspaces/:id/sources adds a text source", async () => {
    const { status, data } = await post<{ id: string; snapshot: string; type: string; origin: string }>(
      `/workspaces/${workspaceId}/sources`,
      { text: "React is a JavaScript library for building UIs.", language: "English" },
    );
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    expect(data.type).toBe("text");
    expect(data.origin).toBe("external");
    expect(data.snapshot).toContain("React");
    sourceId = data.id;
  });

  it("POST /workspaces/:id/sources returns 400 when text is missing", async () => {
    const { status } = await post(`/workspaces/${workspaceId}/sources`, {});
    expect(status).toBe(400);
  });

  it("added source appears in workspace", async () => {
    const { data } = await get<{ sources: Array<{ id: string }> }>(`/workspaces/${workspaceId}`);
    expect(data.sources.some((s) => s.id === sourceId)).toBe(true);
  });

  it("DELETE /workspaces/:id/sources/:sourceId removes source", async () => {
    const { status } = await del(`/workspaces/${workspaceId}/sources/${sourceId}`);
    expect(status).toBe(200);
    const { data } = await get<{ sources: Array<{ id: string }> }>(`/workspaces/${workspaceId}`);
    expect(data.sources.some((s) => s.id === sourceId)).toBe(false);
  });

  it("source roadmap starts as null", async () => {
    const { data: src } = await post<{ id: string; roadmap: null }>(
      `/workspaces/${workspaceId}/sources`,
      { text: "TypeScript generics deep dive." },
    );
    expect(src.roadmap).toBeNull();
  });
});

describe("Generate source roadmap", () => {
  let workspaceId: string;
  let sourceId: string;

  beforeAll(async () => {
    const { data: ws } = await post<{ id: string }>("/workspaces", { title: "Generate Test WS" });
    workspaceId = ws.id;
    const { data: src } = await post<{ id: string }>(
      `/workspaces/${workspaceId}/sources`,
      { text: "Node.js backend development patterns." },
    );
    sourceId = src.id;
  });

  it("POST /workspaces/:id/sources/:sourceId/generate returns roadmap markdown", async () => {
    const { status, data } = await ssePost<{ roadmap: { markdown: string }; workspaceTitle: string }>(
      `/workspaces/${workspaceId}/sources/${sourceId}/generate`,
      {},
    );
    expect(status).toBe(200);
    expect(data.roadmap.markdown).toContain("# Mock Roadbook");
    expect(data.workspaceTitle).toBeTruthy();
  });

  it("generate updates workspace title from roadmap H1 when still default", async () => {
    const { data: ws } = await post<{ id: string }>("/workspaces", {});
    const { data: src } = await post<{ id: string }>(
      `/workspaces/${ws.id}/sources`,
      { text: "Kubernetes orchestration guide." },
    );
    const { data } = await ssePost<{ workspaceTitle: string }>(
      `/workspaces/${ws.id}/sources/${src.id}/generate`,
      {},
    );
    // Mock roadbook has title "# Mock Roadbook" → "Mock Roadbook"
    expect(data.workspaceTitle).toBe("Mock Roadbook");
  });

  it("generate returns 404 for unknown source", async () => {
    const { status } = await post(`/workspaces/${workspaceId}/sources/no-such-source/generate`, {});
    expect(status).toBe(404);
  });
});

describe("Generate journey roadmap", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const { data: ws } = await post<{ id: string }>("/workspaces", { title: "Journey Test WS" });
    workspaceId = ws.id;
    await post(`/workspaces/${workspaceId}/sources`, { text: "Source A content." });
    await post(`/workspaces/${workspaceId}/sources`, { text: "Source B content." });
  });

  it("POST /workspaces/:id/generate-journey returns journey roadmap", async () => {
    const { status, data } = await ssePost<{ roadmap: { markdown: string } }>(
      `/workspaces/${workspaceId}/generate-journey`,
      {},
    );
    expect(status).toBe(200);
    expect(data.roadmap.markdown).toContain("# Mock Journey Roadmap");
  });

  it("returns 400 when workspace has no sources and none selected", async () => {
    const { data: empty } = await post<{ id: string }>("/workspaces", { title: "Empty" });
    const { status } = await post(`/workspaces/${empty.id}/generate-journey`, { sourceIds: [] });
    expect(status).toBe(400);
  });
});

describe("Digest", () => {
  let workspaceId: string;
  let sourceId: string;

  beforeAll(async () => {
    const { data: ws } = await post<{ id: string }>("/workspaces", { title: "Digest Test WS" });
    workspaceId = ws.id;
    const { data: src } = await post<{ id: string }>(
      `/workspaces/${workspaceId}/sources`,
      { text: "React hooks overview." },
    );
    sourceId = src.id;
  });

  it("POST /workspaces/:id/digest returns updated journey roadmap", async () => {
    const { status, data } = await post<{ roadmap: { markdown: string } }>(
      `/workspaces/${workspaceId}/digest`,
      { sourceId, segmentIds: ["Hooks"], segments: ["## Hooks\nUseState and useEffect"] },
    );
    expect(status).toBe(200);
    expect(data.roadmap.markdown).toBeTruthy();
  });

  it("returns 400 when segments are missing", async () => {
    const { status } = await post(`/workspaces/${workspaceId}/digest`, { sourceId });
    expect(status).toBe(400);
  });

  it("updates digestedSegmentIds on source after digest", async () => {
    await post(`/workspaces/${workspaceId}/digest`, {
      sourceId,
      segmentIds: ["Core Concepts"],
      segments: ["## Core Concepts\nVirtual DOM"],
    });
    const { data } = await get<{ sources: Array<{ id: string; digestedSegmentIds: string[] }> }>(
      `/workspaces/${workspaceId}`,
    );
    const src = data.sources.find((s) => s.id === sourceId);
    expect(src!.digestedSegmentIds).toContain("Core Concepts");
  });
});

describe("Insights CRUD", () => {
  let workspaceId: string;
  let insightId: string;

  beforeAll(async () => {
    const { data } = await post<{ id: string }>("/workspaces", { title: "Insight Test WS" });
    workspaceId = data.id;
  });

  it("POST /workspaces/:id/insights creates insight", async () => {
    const { status, data } = await post<{ id: string; content: string }>(
      `/workspaces/${workspaceId}/insights`,
      { content: "GraphQL is critical for this role" },
    );
    expect(status).toBe(201);
    expect(data.content).toBe("GraphQL is critical for this role");
    expect(data.id).toBeTruthy();
    insightId = data.id;
  });

  it("returns 400 when content is empty", async () => {
    const { status } = await post(`/workspaces/${workspaceId}/insights`, { content: "  " });
    expect(status).toBe(400);
  });

  it("insight appears in workspace response", async () => {
    const { data } = await get<{ insights: Array<{ id: string }> }>(`/workspaces/${workspaceId}`);
    expect(data.insights.some((i) => i.id === insightId)).toBe(true);
  });

  it("DELETE /workspaces/:id/insights/:insightId removes insight", async () => {
    const { status } = await del(`/workspaces/${workspaceId}/insights/${insightId}`);
    expect(status).toBe(200);
    const { data } = await get<{ insights: Array<{ id: string }> }>(`/workspaces/${workspaceId}`);
    expect(data.insights.some((i) => i.id === insightId)).toBe(false);
  });
});

describe("Research Todos CRUD", () => {
  let workspaceId: string;
  let todoId: string;

  beforeAll(async () => {
    const { data } = await post<{ id: string }>("/workspaces", { title: "Todo Test WS" });
    workspaceId = data.id;
  });

  it("POST /workspaces/:id/research-todos creates todo", async () => {
    const { status, data } = await post<{ id: string; topic: string; status: string }>(
      `/workspaces/${workspaceId}/research-todos`,
      { topic: "LangGraph state management", description: "Understand Annotation and reducers" },
    );
    expect(status).toBe(201);
    expect(data.topic).toBe("LangGraph state management");
    expect(data.status).toBe("pending");
    todoId = data.id;
  });

  it("returns 400 when topic is empty", async () => {
    const { status } = await post(`/workspaces/${workspaceId}/research-todos`, { topic: "" });
    expect(status).toBe(400);
  });

  it("PATCH /workspaces/:id/research-todos/:todoId updates status", async () => {
    const { status, data } = await patch<{ status: string }>(
      `/workspaces/${workspaceId}/research-todos/${todoId}`,
      { status: "in-progress" },
    );
    expect(status).toBe(200);
    expect(data.status).toBe("in-progress");
  });

  it("todo appears in workspace response", async () => {
    const { data } = await get<{ researchTodos: Array<{ id: string }> }>(`/workspaces/${workspaceId}`);
    expect(data.researchTodos.some((t) => t.id === todoId)).toBe(true);
  });

  it("DELETE /workspaces/:id/research-todos/:todoId removes todo", async () => {
    const { status } = await del(`/workspaces/${workspaceId}/research-todos/${todoId}`);
    expect(status).toBe(200);
    const { data } = await get<{ researchTodos: Array<{ id: string }> }>(`/workspaces/${workspaceId}`);
    expect(data.researchTodos.some((t) => t.id === todoId)).toBe(false);
  });

  it("PATCH returns 404 for unknown todo", async () => {
    const { status } = await patch(`/workspaces/${workspaceId}/research-todos/no-such`, { status: "done" });
    expect(status).toBe(404);
  });
});

describe("Skill Progress", () => {
  let workspaceId: string;

  beforeAll(async () => {
    const { data } = await post<{ id: string }>("/workspaces", { title: "Progress Test WS" });
    workspaceId = data.id;
  });

  it("PATCH /workspaces/:id/skill-progress updates skill status", async () => {
    const { status, data } = await patch<{ skillProgress: Record<string, string> }>(
      `/workspaces/${workspaceId}/skill-progress`,
      { skillName: "React", status: "learning" },
    );
    expect(status).toBe(200);
    expect(data.skillProgress.React).toBe("learning");
  });

  it("skill progress persists in workspace", async () => {
    const { data } = await get<{ skillProgress: Record<string, string> }>(`/workspaces/${workspaceId}`);
    expect(data.skillProgress.React).toBe("learning");
  });

  it("setting not_started removes the entry", async () => {
    await patch(`/workspaces/${workspaceId}/skill-progress`, { skillName: "React", status: "not_started" });
    const { data } = await get<{ skillProgress: Record<string, string> }>(`/workspaces/${workspaceId}`);
    expect(data.skillProgress.React).toBeUndefined();
  });

  it("returns 400 for invalid status", async () => {
    const { status } = await patch(`/workspaces/${workspaceId}/skill-progress`, { skillName: "React", status: "invalid" });
    expect(status).toBe(400);
  });

  it("returns 400 when skillName is missing", async () => {
    const { status } = await patch(`/workspaces/${workspaceId}/skill-progress`, { status: "learning" });
    expect(status).toBe(400);
  });
});

describe("Global Skill Index", () => {
  let wsId: string;

  it("GET /skill-index returns empty skills when no roadmaps exist", async () => {
    const { data } = await get<{ skills: unknown[] }>("/skill-index");
    expect(Array.isArray(data.skills)).toBe(true);
  });

  it("GET /skill-index returns skills after generation", async () => {
    const { data: ws } = await post<{ id: string }>("/workspaces", { title: "Skill Index Test" });
    wsId = ws.id;
    const { data: source } = await post<{ id: string }>(`/workspaces/${wsId}/sources`, { text: "Learn React", language: "English" });
    await ssePost(`/workspaces/${wsId}/sources/${source.id}/generate`);

    const { data } = await get<{ skills: { name: string; category: string; workspaces: { id: string }[] }[] }>("/skill-index");
    expect(data.skills.length).toBeGreaterThan(0);
    const reactSkill = data.skills.find((s) => s.name === "React");
    expect(reactSkill).toBeDefined();
    expect(reactSkill!.workspaces.some((w) => w.id === wsId)).toBe(true);
  });

  it("skill-index reflects skill progress status", async () => {
    await patch(`/workspaces/${wsId}/skill-progress`, { skillName: "React", status: "mastered" });
    const { data } = await get<{ skills: { name: string; status: string }[] }>("/skill-index");
    const reactSkill = data.skills.find((s) => s.name === "React");
    expect(reactSkill?.status).toBe("mastered");
  });

  it("skill-index includes priority field", async () => {
    const { data } = await get<{ skills: { name: string; priority: string }[] }>("/skill-index");
    const reactSkill = data.skills.find((s) => s.name === "React");
    expect(reactSkill?.priority).toBe("high");
  });

  it("workspace list reflects skillCount after generation", async () => {
    const { data: list } = await get<{ id: string; skillCount: number; masteredCount: number }[]>("/workspaces");
    const item = list.find((w) => w.id === wsId);
    expect(item).toBeDefined();
    expect(item!.skillCount).toBeGreaterThan(0);
    expect(item!.masteredCount).toBe(1); // "React" was set to mastered above
  });
});

describe("Data migration (old workspaces)", () => {
  it("workspace response always includes insights, researchTodos, and skillProgress", async () => {
    const { data } = await post<{ id: string }>("/workspaces", { title: "Migration Test" });
    const { data: ws } = await get<{ insights: unknown[]; researchTodos: unknown[]; roadmap: null; skillProgress: Record<string, unknown> }>(
      `/workspaces/${data.id}`,
    );
    expect(Array.isArray(ws.insights)).toBe(true);
    expect(Array.isArray(ws.researchTodos)).toBe(true);
    expect(ws.roadmap).toBeNull();
    expect(typeof ws.skillProgress).toBe("object");
  });
});

describe("Concurrent generate requests", () => {
  it("concurrent generates do not interfere with each other", async () => {
    // Create two separate workspaces with sources
    const { data: ws1 } = await post<{ id: string }>("/workspaces", { title: "Concurrent A" });
    const { data: ws2 } = await post<{ id: string }>("/workspaces", { title: "Concurrent B" });
    const { data: src1 } = await post<{ id: string }>(`/workspaces/${ws1.id}/sources`, { text: "React guide" });
    const { data: src2 } = await post<{ id: string }>(`/workspaces/${ws2.id}/sources`, { text: "Vue guide" });

    // Fire both generate requests concurrently with different models
    const [res1, res2] = await Promise.all([
      ssePost<{ roadmap: { markdown: string } }>(
        `/workspaces/${ws1.id}/sources/${src1.id}/generate`,
        { model: "gemini-2.5-flash" },
      ),
      ssePost<{ roadmap: { markdown: string } }>(
        `/workspaces/${ws2.id}/sources/${src2.id}/generate`,
        { model: "gemini-3-flash-preview" },
      ),
    ]);

    // Both should succeed independently
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.data.roadmap.markdown).toBeTruthy();
    expect(res2.data.roadmap.markdown).toBeTruthy();
  });
});
