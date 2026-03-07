export interface Roadmap {
  id: string;
  markdown: string;
  generatedAt: number;
}

export interface Source {
  id: string;
  type: "text" | "url" | "file";
  reference: string;
  snapshot: string;
  ingestedAt: number;
  language: string;
  roadmap: Roadmap | null;
}

export interface Workspace {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sources: Source[];
}

export interface WorkspaceListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sourceCount: number;
  generatedCount: number;
}
