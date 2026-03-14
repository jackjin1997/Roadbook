import type { Workspace, WorkspaceListItem, Source, Roadmap } from "./types";

const API = "http://localhost:3001";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Workspaces
export const listWorkspaces = () =>
  req<WorkspaceListItem[]>("/workspaces");

export const createWorkspace = (title?: string) =>
  req<Workspace>("/workspaces", { method: "POST", body: JSON.stringify({ title }) });

export const getWorkspace = (id: string) =>
  req<Workspace>(`/workspaces/${id}`);

export const renameWorkspace = (id: string, title: string) =>
  req<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });

export const deleteWorkspace = (id: string) =>
  req<{ ok: boolean }>(`/workspaces/${id}`, { method: "DELETE" });

// Sources
export const addSource = (workspaceId: string, text: string, language: string) =>
  req<Source>(`/workspaces/${workspaceId}/sources`, {
    method: "POST",
    body: JSON.stringify({ text, language }),
  });

export const addUrlSource = (workspaceId: string, url: string, language: string) =>
  req<Source>(`/workspaces/${workspaceId}/sources/url`, {
    method: "POST",
    body: JSON.stringify({ url, language }),
  });

export const addFileSource = async (workspaceId: string, file: File, language: string): Promise<Source> => {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  const res = await fetch(`${API}/workspaces/${workspaceId}/sources/file`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export const deleteSource = (workspaceId: string, sourceId: string) =>
  req<{ ok: boolean }>(`/workspaces/${workspaceId}/sources/${sourceId}`, { method: "DELETE" });

// Models
export const listModels = () =>
  req<{ models: string[] }>("/models");

// Chat
export interface ChatMessage { role: "user" | "assistant"; content: string; }
export const sendChatMessage = (
  workspaceId: string,
  messages: ChatMessage[],
  sourceId?: string,
) =>
  req<{ reply: string; roadbookUpdated: boolean; roadmap: import("./types").Roadmap | null }>(
    `/workspaces/${workspaceId}/chat`,
    { method: "POST", body: JSON.stringify({ messages, sourceId }) },
  );

export function streamChatMessage(
  workspaceId: string,
  messages: ChatMessage[],
  sourceIds: string[] | undefined,
  onChunk: (chunk: string) => void,
  language?: string,
): Promise<{ reply: string; roadbookUpdated: boolean; roadmap: import("./types").Roadmap | null }> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, sourceIds, language }),
      });
      if (!res.ok || !res.body) { reject(new Error(`HTTP ${res.status}`)); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resolved = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { reject(new Error(data.error)); return; }
            if (data.chunk) onChunk(data.chunk);
            if (data.done) { resolved = true; resolve({ reply: data.reply, roadbookUpdated: data.roadbookUpdated, roadmap: data.roadmap }); }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
      if (!resolved) reject(new Error("Stream ended without done event"));
    } catch (e) {
      reject(e);
    }
  });
}

// ── Generation progress streaming ──────────────────────────────────────────

export interface GenerationProgress {
  stage: string;
  progress?: number;
  detail?: string;
}

type GenerationResult = { roadmap: Roadmap; workspaceTitle: string; failedSkills?: string[] };

/** SSE reader shared by both generation streams. */
function readGenerationStream(
  url: string,
  body: object,
  onProgress: (event: GenerationProgress) => void,
): Promise<GenerationResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) { reject(new Error(`HTTP ${res.status}`)); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === "error") { reject(new Error(data.error)); return; }
          if (data.type === "progress") onProgress({ stage: data.stage, progress: data.progress, detail: data.detail });
          if (data.type === "done") resolve({ roadmap: data.roadmap, workspaceTitle: data.workspaceTitle, failedSkills: data.failedSkills });
        }
      }
    } catch (e) {
      reject(e);
    }
  });
}

// Generate source roadmap (SSE with progress)
export function generateRoadmap(
  workspaceId: string,
  sourceId: string,
  model?: string,
  onProgress?: (event: GenerationProgress) => void,
): Promise<GenerationResult> {
  return readGenerationStream(
    `${API}/workspaces/${workspaceId}/sources/${sourceId}/generate`,
    model ? { model } : {},
    onProgress ?? (() => {}),
  );
}

// Generate journey roadmap (SSE with progress)
export function generateJourney(
  workspaceId: string,
  sourceIds: string[],
  model?: string,
  onProgress?: (event: GenerationProgress) => void,
): Promise<GenerationResult> {
  return readGenerationStream(
    `${API}/workspaces/${workspaceId}/generate-journey`,
    { sourceIds, ...(model ? { model } : {}) },
    onProgress ?? (() => {}),
  );
}

// Digest selected segments into journey roadmap
export const digestSource = (
  workspaceId: string,
  sourceId: string,
  segmentIds: string[],
  segments: string[],
) =>
  req<{ roadmap: Roadmap }>(
    `/workspaces/${workspaceId}/digest`,
    { method: "POST", body: JSON.stringify({ sourceId, segmentIds, segments }) },
  );

// Insights
export const addInsight = (
  workspaceId: string,
  content: string,
  sourceRef?: import("./types").Insight["sourceRef"],
) =>
  req<import("./types").Insight>(
    `/workspaces/${workspaceId}/insights`,
    { method: "POST", body: JSON.stringify({ content, sourceRef }) },
  );

export const deleteInsight = (workspaceId: string, insightId: string) =>
  req<{ ok: boolean }>(`/workspaces/${workspaceId}/insights/${insightId}`, { method: "DELETE" });

// Research todos
export const addResearchTodo = (workspaceId: string, topic: string, description?: string) =>
  req<import("./types").ResearchTodo>(
    `/workspaces/${workspaceId}/research-todos`,
    { method: "POST", body: JSON.stringify({ topic, description }) },
  );

export const updateResearchTodo = (
  workspaceId: string,
  todoId: string,
  patch: { status?: import("./types").ResearchTodo["status"]; description?: string },
) =>
  req<import("./types").ResearchTodo>(
    `/workspaces/${workspaceId}/research-todos/${todoId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );

export const deleteResearchTodo = (workspaceId: string, todoId: string) =>
  req<{ ok: boolean }>(`/workspaces/${workspaceId}/research-todos/${todoId}`, { method: "DELETE" });

export const runResearchTodo = (workspaceId: string, todoId: string) =>
  req<{ todo: import("./types").ResearchTodo; source: import("./types").Source }>(
    `/workspaces/${workspaceId}/research-todos/${todoId}/run`,
    { method: "POST", body: JSON.stringify({}) },
  );

// Global skill index
export interface SkillIndexEntry {
  name: string;
  category: string;
  priority: string;
  workspaces: { id: string; title: string }[];
  status: import("./types").SkillStatus;
}

export const getSkillIndex = () =>
  req<{ skills: SkillIndexEntry[] }>("/skill-index");

// Skill progress
export const updateSkillProgress = (
  workspaceId: string,
  skillName: string,
  status: import("./types").SkillStatus,
) =>
  req<{ skillProgress: Record<string, import("./types").SkillStatus> }>(
    `/workspaces/${workspaceId}/skill-progress`,
    { method: "PATCH", body: JSON.stringify({ skillName, status }) },
  );
