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

export const deleteSource = (workspaceId: string, sourceId: string) =>
  req<{ ok: boolean }>(`/workspaces/${workspaceId}/sources/${sourceId}`, { method: "DELETE" });

// Generate
export const generateRoadmap = (workspaceId: string, sourceId: string) =>
  req<{ roadmap: Roadmap; workspaceTitle: string }>(
    `/workspaces/${workspaceId}/sources/${sourceId}/generate`,
    { method: "POST", body: JSON.stringify({}) },
  );
