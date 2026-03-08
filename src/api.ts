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
  sourceId: string | undefined,
  onChunk: (chunk: string) => void,
): Promise<{ reply: string; roadbookUpdated: boolean; roadmap: import("./types").Roadmap | null }> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(`${API}/workspaces/${workspaceId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, sourceId }),
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
          if (data.error) { reject(new Error(data.error)); return; }
          if (data.chunk) onChunk(data.chunk);
          if (data.done) resolve({ reply: data.reply, roadbookUpdated: data.roadbookUpdated, roadmap: data.roadmap });
        }
      }
    } catch (e) {
      reject(e);
    }
  });
}

// Generate
export const generateRoadmap = (workspaceId: string, sourceId: string, model?: string) =>
  req<{ roadmap: Roadmap; workspaceTitle: string }>(
    `/workspaces/${workspaceId}/sources/${sourceId}/generate`,
    { method: "POST", body: JSON.stringify(model ? { model } : {}) },
  );
